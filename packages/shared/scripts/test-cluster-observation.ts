/**
 * observation_cluster handler unit tests — Phase 4 Day 3.
 *
 * 5 cases per kickoff Decision 11:
 *   CASE 1 — empty input (no uncategorized observations) → 0 clusters +
 *            silence-as-feature (per §1.18). Asserts telemetry trail:
 *            observation_cluster_started + observation_cluster_completed
 *            {clusters_emitted=0}. NO observation_cluster_below_threshold
 *            (no signatures generated).
 *
 *   CASE 2 — 1 observation → no cluster (below default threshold of 3).
 *            Telemetry trail includes observation_signature_generated +
 *            observation_cluster_below_threshold + completed{0}.
 *
 *   CASE 3 — 3 observations with same signature → 1 cluster emitted.
 *            Telemetry trail: 3× signature_generated + 1× emitted +
 *            completed{1}. INSERT of cluster row + UPDATE on observations
 *            cluster_id back-link.
 *
 *   CASE 4 — 3 observations with 3 different signatures → 0 clusters
 *            (each group has only 1 member). Telemetry shows 3× below
 *            threshold + completed{0}.
 *
 *   CASE 5 — Mix of high/low confidence. 4 observations with same
 *            signature; 1 has confidence=low → 3 reach grouping; 3
 *            qualifies for cluster emit. Telemetry shows 1× low_confidence
 *            _skipped + 1× emitted + completed{1}.
 *
 * No DB; no Claude; deterministic. Mocks both `sql` (via JobHandlerHooks
 * extension) and `callClaude` (via per-input dispatcher). Asserts the
 * telemetry contract per Decision 10 — silence-path verification at the
 * unit level mirrors the live exercise's silence-path verification so a
 * "silently bailed without evaluating" failure is detectable in BOTH
 * layers per Decision 10's spirit.
 *
 * Usage:
 *   pnpm --filter @nexus/shared test:cluster-observation
 */
import type postgres from "postgres";

import {
  HANDLERS,
  type CallClaudeInput,
  type CallClaudeOutput,
  type ClusterObservationOutput,
} from "@nexus/shared";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `ASSERT ${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// ── Mock SQL dispatcher ──────────────────────────────────────────────
//
// observation_cluster handler issues these query shapes:
//   (a) SELECT ... FROM observations WHERE signal_type IS NULL ...
//   (b) INSERT INTO observation_clusters ... ON CONFLICT (cluster_key)
//       DO UPDATE ... RETURNING id
//   (c) UPDATE observations SET cluster_id = ... WHERE id = ANY(...)
//   (d) SELECT id FROM observation_clusters WHERE cluster_key = ... (rare
//       fallback path; not exercised in tests since INSERT...RETURNING
//       always produces a row)

interface ObsFixture {
  id: string;
  raw_input: string;
  source_context: { vertical?: string } | null;
  observer_id: string;
  observer_role: string | null;
  observer_vertical: string | null;
}

interface MockSqlState {
  observations: ObsFixture[];
  clustersInserted: Array<{
    id: string;
    cluster_key: string;
    title: string;
    normalized_signature: string;
    candidate_category: string;
    confidence: string;
    signature_basis: string;
    vertical: string | null;
    member_count: number;
  }>;
  observationClusterUpdates: Array<{
    cluster_id: string;
    observation_ids: string[];
  }>;
  nextClusterId: number;
}

function makeMockSql(state: MockSqlState): postgres.Sql {
  const fn = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sqlText = strings.join("?");
    if (sqlText.includes("FROM observations o") && sqlText.includes("LEFT JOIN team_members")) {
      return Promise.resolve(state.observations);
    }
    if (sqlText.includes("INSERT INTO observation_clusters")) {
      // Values per the handler's ordering:
      //   title, cluster_key, normalized_signature, candidate_category,
      //   confidence, signature_basis, vertical, member_count
      const title = String(values[0]);
      const clusterKey = String(values[1]);
      const normalizedSignature = String(values[2]);
      const candidateCategory = String(values[3]);
      const confidence = String(values[4]);
      const signatureBasis = String(values[5]);
      const verticalRaw = values[6] as unknown;
      const vertical =
        verticalRaw === null || verticalRaw === undefined ? null : String(verticalRaw);
      const memberCount = Number(values[7]);
      const existing = state.clustersInserted.find((c) => c.cluster_key === clusterKey);
      if (existing) {
        // ON CONFLICT DO UPDATE: refresh member_count + return id.
        existing.member_count = memberCount;
        existing.confidence = confidence;
        existing.signature_basis = signatureBasis;
        return Promise.resolve([{ id: existing.id }]);
      }
      const id = `mock-cluster-${state.nextClusterId++}`;
      state.clustersInserted.push({
        id,
        cluster_key: clusterKey,
        title,
        normalized_signature: normalizedSignature,
        candidate_category: candidateCategory,
        confidence,
        signature_basis: signatureBasis,
        vertical,
        member_count: memberCount,
      });
      return Promise.resolve([{ id }]);
    }
    if (sqlText.includes("UPDATE observations") && sqlText.includes("cluster_id")) {
      const clusterId = String(values[0]);
      const obsIds = values[1] as string[];
      state.observationClusterUpdates.push({
        cluster_id: clusterId,
        observation_ids: obsIds,
      });
      return Promise.resolve([]);
    }
    if (sqlText.includes("SELECT id FROM observation_clusters WHERE cluster_key")) {
      const clusterKey = String(values[0]);
      const found = state.clustersInserted.find((c) => c.cluster_key === clusterKey);
      return Promise.resolve(found ? [{ id: found.id }] : []);
    }
    throw new Error(`Mock sql: unrecognized query: ${sqlText.slice(0, 200)}`);
  };
  (fn as unknown as { json: (v: unknown) => unknown; unsafe: (v: string) => string }).json = (v) => v;
  (fn as unknown as { unsafe: (v: string) => string }).unsafe = (v) => v;
  return fn as unknown as postgres.Sql;
}

// ── Per-call Claude dispatcher ──────────────────────────────────────
//
// The cluster handler calls Claude once per observation. Each call needs
// its own fixture (different signature per raw_input shape). A single
// MockClaudeWrapper fixture won't work — use a dispatcher that maps
// rawInput → fixture.

interface ClaudeCallRecord {
  rawInput: string;
  observationId: string | null;
  vertical: string;
}

function makeClaudeDispatcher(
  fixtureMap: Map<string, ClusterObservationOutput>,
): {
  call: <T = unknown>(input: CallClaudeInput) => Promise<CallClaudeOutput<T>>;
  history: ClaudeCallRecord[];
} {
  const history: ClaudeCallRecord[] = [];
  const call = async <T = unknown>(
    input: CallClaudeInput,
  ): Promise<CallClaudeOutput<T>> => {
    const rawInput = String((input.vars as Record<string, unknown>).rawInput ?? "");
    history.push({
      rawInput,
      observationId: input.anchors?.observationId ?? null,
      vertical: String((input.vars as Record<string, unknown>).vertical ?? "all"),
    });
    const fixture = fixtureMap.get(rawInput);
    if (!fixture) {
      throw new Error(
        `dispatcher: no fixture for rawInput="${rawInput.slice(0, 60)}"`,
      );
    }
    return {
      toolInput: fixture as T,
      stopReason: "tool_use",
      usage: { inputTokens: 0, outputTokens: 0 },
      durationMs: 0,
      attempts: 1,
      model: "mock",
      temperature: 0.2,
      maxTokens: 1500,
      promptVersion: "mock",
      promptFile: input.promptFile,
      toolName: input.tool.name,
    };
  };
  return { call, history };
}

// ── Telemetry capture ─────────────────────────────────────────────────

let telemetryEvents: Array<Record<string, unknown>> = [];
const originalStderrWrite = process.stderr.write.bind(process.stderr);

function captureTelemetry() {
  telemetryEvents = [];
  process.stderr.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
    const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) continue;
      try {
        const event = JSON.parse(trimmed) as Record<string, unknown>;
        if (typeof event.event === "string") telemetryEvents.push(event);
      } catch {
        // not JSON — ignore
      }
    }
    return originalStderrWrite(chunk as never, ...(rest as []));
  }) as typeof process.stderr.write;
}

function restoreTelemetry() {
  process.stderr.write = originalStderrWrite;
}

function eventsOfType(name: string): Array<Record<string, unknown>> {
  return telemetryEvents.filter((e) => e.event === name);
}

// ── Fixture builders ──────────────────────────────────────────────────

function makeObs(
  id: string,
  rawInput: string,
  vertical: string | null = "healthcare",
  observerRole: string | null = "AE",
): ObsFixture {
  return {
    id,
    raw_input: rawInput,
    source_context: vertical ? { vertical } : null,
    observer_id: `observer-${id}`,
    observer_role: observerRole,
    observer_vertical: vertical,
  };
}

function makeFixture(
  signature: string,
  candidateCategory: string,
  confidence: ClusterObservationOutput["confidence"] = "high",
  signatureBasis = "Concrete domain shape identifiable in the observation.",
): ClusterObservationOutput {
  return {
    reasoning_trace:
      "Observed concrete language; identified the underlying shape; chose a snake_case slug that abstracts the specifics; verified determinism.",
    normalized_signature: signature,
    candidate_category: candidateCategory,
    confidence,
    signature_basis: signatureBasis,
  };
}

function freshState(observations: ObsFixture[]): MockSqlState {
  return {
    observations,
    clustersInserted: [],
    observationClusterUpdates: [],
    nextClusterId: 1,
  };
}

// ── Cases ─────────────────────────────────────────────────────────────

async function case1_empty() {
  console.log("CASE 1 — empty observations → 0 clusters + silence-as-feature…");
  telemetryEvents = [];
  const state = freshState([]);
  const dispatcher = makeClaudeDispatcher(new Map());

  const result = (await HANDLERS.observation_cluster(
    {},
    {
      jobId: "job-case-1",
      jobType: "observation_cluster",
      hooks: { sql: makeMockSql(state), callClaude: dispatcher.call },
    },
  )) as {
    clustersEmitted: number;
    observationsRead: number;
    signaturesGenerated: number;
  };

  assertEqual(result.clustersEmitted, 0, "clustersEmitted=0 (silence)");
  assertEqual(result.observationsRead, 0, "observationsRead=0");
  assertEqual(result.signaturesGenerated, 0, "signaturesGenerated=0");
  assertEqual(state.clustersInserted.length, 0, "no DB writes");
  assertEqual(dispatcher.history.length, 0, "no Claude calls");

  const startedEvents = eventsOfType("observation_cluster_started");
  const completedEvents = eventsOfType("observation_cluster_completed");
  const belowEvents = eventsOfType("observation_cluster_below_threshold");
  const emittedEvents = eventsOfType("observation_cluster_emitted");
  assertEqual(startedEvents.length, 1, "exactly 1 observation_cluster_started");
  assertEqual(completedEvents.length, 1, "exactly 1 observation_cluster_completed");
  assertEqual(belowEvents.length, 0, "no below_threshold (no signatures)");
  assertEqual(emittedEvents.length, 0, "no emitted (silence path)");
  assertEqual(completedEvents[0]!.clusters_emitted, 0, "completed.clusters_emitted=0");
  console.log("      OK — silence-as-feature with full telemetry trail");
}

async function case2_one_obs_below_threshold() {
  console.log("CASE 2 — 1 observation → 0 clusters (below default threshold 3)…");
  telemetryEvents = [];
  const obs = [makeObs("obs-1", "MedVista CFO worried about Microsoft pricing.")];
  const fixtures = new Map<string, ClusterObservationOutput>();
  fixtures.set(obs[0]!.raw_input, makeFixture("competitor_pricing_concern", "Competitor Pricing Concern"));
  const state = freshState(obs);
  const dispatcher = makeClaudeDispatcher(fixtures);

  const result = (await HANDLERS.observation_cluster(
    {},
    {
      jobId: "job-case-2",
      jobType: "observation_cluster",
      hooks: { sql: makeMockSql(state), callClaude: dispatcher.call },
    },
  )) as {
    clustersEmitted: number;
    observationsRead: number;
    signaturesGenerated: number;
    belowThreshold: number;
  };

  assertEqual(result.clustersEmitted, 0, "clustersEmitted=0 (1 < 3)");
  assertEqual(result.observationsRead, 1, "observationsRead=1");
  assertEqual(result.signaturesGenerated, 1, "signaturesGenerated=1");
  assertEqual(result.belowThreshold, 1, "belowThreshold=1");
  assertEqual(state.clustersInserted.length, 0, "no cluster written");
  assertEqual(dispatcher.history.length, 1, "1 Claude call");

  const sigEvents = eventsOfType("observation_signature_generated");
  const belowEvents = eventsOfType("observation_cluster_below_threshold");
  assertEqual(sigEvents.length, 1, "1 signature_generated");
  assertEqual(belowEvents.length, 1, "1 below_threshold");
  assertEqual(belowEvents[0]!.member_count, 1, "below.member_count=1");
  assertEqual(belowEvents[0]!.threshold, 3, "below.threshold=3 (default)");
  console.log("      OK — 1 obs sub-threshold; full diagnostic trail");
}

async function case3_three_same_signature() {
  console.log("CASE 3 — 3 observations same signature → 1 cluster emitted…");
  telemetryEvents = [];
  const signature = "implementation_timeline_anxiety";
  const category = "Implementation Timeline Anxiety";
  const obs = [
    makeObs("obs-1", "Buyer worried about Epic integration taking 6 months."),
    makeObs("obs-2", "CMO mentioned past EMR rollout that ran over schedule."),
    makeObs("obs-3", "Hospital wants 90-day Epic integration readiness."),
  ];
  const fixtures = new Map<string, ClusterObservationOutput>();
  for (const o of obs) {
    fixtures.set(o.raw_input, makeFixture(signature, category));
  }
  const state = freshState(obs);
  const dispatcher = makeClaudeDispatcher(fixtures);

  const result = (await HANDLERS.observation_cluster(
    {},
    {
      jobId: "job-case-3",
      jobType: "observation_cluster",
      hooks: { sql: makeMockSql(state), callClaude: dispatcher.call },
    },
  )) as {
    clustersEmitted: number;
    observationsRead: number;
    signaturesGenerated: number;
    belowThreshold: number;
  };

  assertEqual(result.clustersEmitted, 1, "clustersEmitted=1");
  assertEqual(result.observationsRead, 3, "observationsRead=3");
  assertEqual(result.signaturesGenerated, 3, "signaturesGenerated=3");
  assertEqual(state.clustersInserted.length, 1, "1 cluster written");
  assertEqual(state.clustersInserted[0]!.member_count, 3, "member_count=3");
  assertEqual(state.clustersInserted[0]!.normalized_signature, signature, "signature");
  assertEqual(state.clustersInserted[0]!.candidate_category, category, "candidateCategory");
  assertEqual(state.clustersInserted[0]!.vertical, "healthcare", "vertical");
  assertEqual(
    state.observationClusterUpdates.length,
    1,
    "1 batch UPDATE on observations.cluster_id",
  );
  assertEqual(
    state.observationClusterUpdates[0]!.observation_ids.length,
    3,
    "3 observations linked",
  );

  const sigEvents = eventsOfType("observation_signature_generated");
  const emittedEvents = eventsOfType("observation_cluster_emitted");
  const belowEvents = eventsOfType("observation_cluster_below_threshold");
  assertEqual(sigEvents.length, 3, "3 signatures generated");
  assertEqual(emittedEvents.length, 1, "1 cluster emitted event");
  assertEqual(belowEvents.length, 0, "no below_threshold");
  assertEqual(emittedEvents[0]!.member_count, 3, "emitted.member_count=3");
  assertEqual(emittedEvents[0]!.signature, signature, "emitted.signature");
  console.log("      OK — 1 cluster emitted with 3 members + back-link UPDATE");
}

async function case4_three_different_signatures() {
  console.log("CASE 4 — 3 observations 3 different signatures → 0 clusters…");
  telemetryEvents = [];
  const obs = [
    makeObs("obs-1", "Pricing concern signal."),
    makeObs("obs-2", "Integration timeline signal."),
    makeObs("obs-3", "Champion authority signal."),
  ];
  const fixtures = new Map<string, ClusterObservationOutput>();
  fixtures.set(obs[0]!.raw_input, makeFixture("competitor_pricing_concern", "A"));
  fixtures.set(obs[1]!.raw_input, makeFixture("integration_timeline_anxiety", "B"));
  fixtures.set(obs[2]!.raw_input, makeFixture("champion_authority_uncertainty", "C"));
  const state = freshState(obs);
  const dispatcher = makeClaudeDispatcher(fixtures);

  const result = (await HANDLERS.observation_cluster(
    {},
    {
      jobId: "job-case-4",
      jobType: "observation_cluster",
      hooks: { sql: makeMockSql(state), callClaude: dispatcher.call },
    },
  )) as {
    clustersEmitted: number;
    observationsRead: number;
    signaturesGenerated: number;
    belowThreshold: number;
  };

  assertEqual(result.clustersEmitted, 0, "clustersEmitted=0 (each group has 1)");
  assertEqual(result.signaturesGenerated, 3, "signaturesGenerated=3");
  assertEqual(result.belowThreshold, 3, "belowThreshold=3 (3 sub-threshold groups)");
  assertEqual(state.clustersInserted.length, 0, "no cluster written");

  const belowEvents = eventsOfType("observation_cluster_below_threshold");
  const emittedEvents = eventsOfType("observation_cluster_emitted");
  assertEqual(belowEvents.length, 3, "3 below_threshold events");
  assertEqual(emittedEvents.length, 0, "no emitted");
  console.log("      OK — 3 distinct sub-threshold groups; no emit; full trail");
}

async function case5_mixed_confidence() {
  console.log("CASE 5 — mixed high/low confidence → low filtered, high cleared threshold…");
  telemetryEvents = [];
  const signature = "multi_year_contract_resistance";
  const category = "Multi Year Contract Resistance";
  const obs = [
    makeObs("obs-1", "TrustBank rejects 3-year contracts post-layoffs."),
    makeObs("obs-2", "Contract length pushback at finance customer."),
    makeObs("obs-3", "Buyer wants 1-year only after Q-end uncertainty."),
    makeObs("obs-4", "Vague concern about contracts."),
  ];
  const fixtures = new Map<string, ClusterObservationOutput>();
  fixtures.set(obs[0]!.raw_input, makeFixture(signature, category, "high"));
  fixtures.set(obs[1]!.raw_input, makeFixture(signature, category, "medium"));
  fixtures.set(obs[2]!.raw_input, makeFixture(signature, category, "high"));
  // 4th observation: low confidence → must be skipped entirely.
  fixtures.set(obs[3]!.raw_input, makeFixture(signature, category, "low"));
  const state = freshState(obs);
  const dispatcher = makeClaudeDispatcher(fixtures);

  const result = (await HANDLERS.observation_cluster(
    {},
    {
      jobId: "job-case-5",
      jobType: "observation_cluster",
      hooks: { sql: makeMockSql(state), callClaude: dispatcher.call },
    },
  )) as {
    clustersEmitted: number;
    observationsRead: number;
    signaturesGenerated: number;
    lowConfidenceSkipped: number;
  };

  assertEqual(result.clustersEmitted, 1, "clustersEmitted=1 (3 high+medium qualify)");
  assertEqual(result.observationsRead, 4, "observationsRead=4");
  assertEqual(result.signaturesGenerated, 4, "signaturesGenerated=4 (all 4 ran Claude)");
  assertEqual(result.lowConfidenceSkipped, 1, "lowConfidenceSkipped=1");
  assertEqual(state.clustersInserted.length, 1, "1 cluster written");
  assertEqual(state.clustersInserted[0]!.member_count, 3, "member_count=3 (low excluded)");
  assertEqual(
    state.observationClusterUpdates[0]!.observation_ids.length,
    3,
    "3 observations linked (low NOT linked)",
  );

  const lowSkipEvents = eventsOfType("observation_cluster_low_confidence_skipped");
  const emittedEvents = eventsOfType("observation_cluster_emitted");
  assertEqual(lowSkipEvents.length, 1, "1 low_confidence_skipped event");
  assertEqual(emittedEvents.length, 1, "1 emitted event");
  // Confidence escalation per handler: any "high" promotes group to "high".
  assertEqual(emittedEvents[0]!.confidence, "high", "group confidence escalated to high");
  console.log("      OK — low filtered, group confidence escalated, 3 members linked");
}

async function main() {
  captureTelemetry();
  try {
    await case1_empty();
    await case2_one_obs_below_threshold();
    await case3_three_same_signature();
    await case4_three_different_signatures();
    await case5_mixed_confidence();
    console.log("\nobservation_cluster handler: ALL 5/5 CASES PASS.");
  } finally {
    restoreTelemetry();
  }
}

main().catch((err) => {
  restoreTelemetry();
  console.error("test:cluster-observation FAILED:", err);
  process.exit(1);
});
