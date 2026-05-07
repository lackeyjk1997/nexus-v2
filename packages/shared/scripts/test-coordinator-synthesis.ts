/**
 * coordinator_synthesis handler unit tests — Phase 4 Day 2 Session A.
 *
 * 3 PHASES per kickoff Decision 9:
 *   PHASE 1 — empty signals → 0 patterns + silence-as-feature.
 *             Asserts telemetry trail: coordinator_synthesis_started +
 *             coordinator_synthesis_completed{patterns_emitted=0}. NO
 *             pattern_below_threshold (because no groups existed).
 *
 *   PHASE 2 — 1 vertical + 3-deals same signal → 1 pattern emitted.
 *             Asserts telemetry trail: coordinator_synthesis_started +
 *             pattern_detected + coordinator_synthesis_completed
 *             {patterns_emitted=1}.
 *
 *   PHASE 3 — 1 vertical + 1-deal signal (below threshold) + 1 vertical
 *             + 3-deals same signal → 1 pattern emitted. Telemetry trail
 *             includes BOTH pattern_below_threshold (for the 1-deal group)
 *             AND pattern_detected (for the 3-deal group).
 *
 * No DB; no Claude; deterministic. Mocks both `sql` (via JobHandlerHooks
 * extension) and `callClaude` (via MockClaudeWrapper). Asserts the
 * telemetry contract per Decision 8 — silence-path verification at the
 * unit level mirrors the live exercise's silence-path verification (Item
 * 3) so a "silently bailed without evaluating threshold" failure is
 * detectable in BOTH layers per Decision 10's spirit.
 *
 * Usage:
 *   pnpm --filter @nexus/shared test:coordinator-synthesis
 */
import type postgres from "postgres";

import {
  HANDLERS,
  makeMockCallClaude,
  type CoordinatorSynthesisOutput,
} from "@nexus/shared";
import type { Contact, ContactRole, Deal, HubSpotId } from "@nexus/shared";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERT: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `ASSERT ${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// ── Mock SQL dispatcher ──────────────────────────────────────────────
//
// coordinator_synthesis handler issues these query shapes:
//   (a) SELECT ... FROM deal_events WHERE type='signal_detected' AND ...
//       (the "recent signals" read)
//   (b) INSERT INTO coordinator_patterns ... ON CONFLICT (pattern_key)
//       DO NOTHING RETURNING id
//   (c) INSERT INTO coordinator_pattern_deals ... ON CONFLICT DO NOTHING

interface SignalEventFixture {
  hubspot_deal_id: string;
  vertical: string;
  signal_type: string;
  evidence_quote: string;
  source_speaker: string;
  urgency: string;
  deal_size_band: string;
  created_at: string;
}

interface MockSqlState {
  signalEvents: SignalEventFixture[];
  patternsInserted: Array<{
    id: string;
    pattern_key: string;
    signal_type: string;
    vertical: string;
    synthesis: string;
  }>;
  joinRowsInserted: Array<{ pattern_id: string; hubspot_deal_id: string }>;
  nextPatternId: number;
  // Phase 4 Day 4 fixture seams — empty by default (silence path).
  managerDirectives?: Array<Record<string, unknown>>;
  systemIntelligence?: Array<Record<string, unknown>>;
  experiments?: Array<Record<string, unknown>>;
  priorPatterns?: Array<Record<string, unknown>>;
  meddpiccScores?: Array<Record<string, unknown>>;
}

function makeMockSql(state: MockSqlState): postgres.Sql {
  const fn = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sqlText = strings.join("?");
    if (sqlText.includes("FROM deal_events") && sqlText.includes("signal_detected")) {
      return Promise.resolve(state.signalEvents);
    }
    if (sqlText.includes("INSERT INTO coordinator_patterns")) {
      const patternKey = String(values[0]);
      const signalType = String(values[1]);
      const vertical = String(values[2]);
      const synthesis = String(values[3]);
      // Idempotency check.
      if (state.patternsInserted.some((p) => p.pattern_key === patternKey)) {
        return Promise.resolve([]); // ON CONFLICT DO NOTHING returns empty
      }
      const id = `mock-pattern-${state.nextPatternId++}`;
      state.patternsInserted.push({ id, pattern_key: patternKey, signal_type: signalType, vertical, synthesis });
      return Promise.resolve([{ id }]);
    }
    if (sqlText.includes("SELECT id FROM coordinator_patterns WHERE pattern_key")) {
      const patternKey = String(values[0]);
      const found = state.patternsInserted.find((p) => p.pattern_key === patternKey);
      return Promise.resolve(found ? [{ id: found.id }] : []);
    }
    if (sqlText.includes("INSERT INTO coordinator_pattern_deals")) {
      const patternId = String(values[0]);
      const hubspotDealId = String(values[1]);
      const exists = state.joinRowsInserted.some(
        (r) => r.pattern_id === patternId && r.hubspot_deal_id === hubspotDealId,
      );
      if (!exists) {
        state.joinRowsInserted.push({ pattern_id: patternId, hubspot_deal_id: hubspotDealId });
      }
      return Promise.resolve([]);
    }
    // Phase 4 Day 4: helper-side queries.
    if (sqlText.includes("FROM manager_directives")) {
      return Promise.resolve(state.managerDirectives ?? []);
    }
    if (sqlText.includes("FROM system_intelligence")) {
      return Promise.resolve(state.systemIntelligence ?? []);
    }
    if (sqlText.includes("FROM experiments")) {
      return Promise.resolve(state.experiments ?? []);
    }
    if (
      sqlText.includes("FROM coordinator_patterns") &&
      sqlText.includes("status IN ('synthesized', 'expired')")
    ) {
      return Promise.resolve(state.priorPatterns ?? []);
    }
    if (sqlText.includes("FROM meddpicc_scores")) {
      return Promise.resolve(state.meddpiccScores ?? []);
    }
    throw new Error(`Mock sql: unrecognized query: ${sqlText.slice(0, 200)}`);
  };
  // postgres.js sql.json() passthrough.
  (fn as unknown as { json: (v: unknown) => unknown; unsafe: (v: string) => string }).json = (v) => v;
  (fn as unknown as { unsafe: (v: string) => string }).unsafe = (v) => v;
  return fn as unknown as postgres.Sql;
}

// ── Mock CrmAdapter (Phase 4 Day 4) ──────────────────────────────────
//
// Provides getDeal + listDealContacts + listDeals matching the
// JobHandlerHooks.hubspotAdapter widened Pick. Returns synthesized
// fixture deals/contacts. listDeals returns empty by default (no at-
// risk comparators); fixture seams allow PHASE 3-class assertions if
// needed in future.

function makeFixtureDeal(id: string, name: string): Deal {
  return {
    hubspotId: id,
    name,
    companyId: null,
    primaryContactId: null,
    ownerId: "owner-test",
    bdrOwnerId: null,
    saOwnerId: null,
    stage: "negotiation",
    amount: 1_500_000,
    currency: "USD",
    closeDate: null,
    winProbability: null,
    forecastCategory: null,
    vertical: "healthcare",
    product: null,
    leadSource: null,
    primaryCompetitor: null,
    lossReason: null,
    closeCompetitor: null,
    closeNotes: null,
    closeImprovement: null,
    winTurningPoint: null,
    winReplicable: null,
    closedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    customProperties: {},
  };
}

function makeFixtureContact(
  id: string,
  fullName: string,
): Contact & { role: ContactRole | null; isPrimary: boolean } {
  const [firstName, ...rest] = fullName.split(" ");
  return {
    hubspotId: id,
    firstName: firstName ?? fullName,
    lastName: rest.join(" "),
    email: null,
    phone: null,
    title: "Buyer",
    companyId: null,
    role: "champion",
    isPrimary: true,
    customProperties: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Contact & { role: ContactRole | null; isPrimary: boolean };
}

interface MockAdapterFixtures {
  /** dealId → optional Deal override */
  deals?: Map<string, Deal>;
  /** dealId → contacts override */
  contacts?: Map<string, Array<Contact & { role: ContactRole | null; isPrimary: boolean }>>;
  /** at-risk: deals returned by listDeals(filters) */
  listDealsResult?: Deal[];
}

function makeMockAdapter(fx: MockAdapterFixtures = {}) {
  return {
    async getDeal(id: HubSpotId): Promise<Deal> {
      return fx.deals?.get(id) ?? makeFixtureDeal(id, `Deal ${id}`);
    },
    async listDealContacts(id: HubSpotId) {
      const contacts = fx.contacts?.get(id);
      return contacts ?? [makeFixtureContact(`contact-${id}`, `Stakeholder for ${id}`)];
    },
    async listDeals(_filters?: unknown): Promise<Deal[]> {
      return fx.listDealsResult ?? [];
    },
    async updateDealCustomProperties() {},
    async bulkSyncDeals() { return { synced: 0, failed: 0 }; },
    async bulkSyncContacts() { return { synced: 0, failed: 0 }; },
    async bulkSyncCompanies() { return { synced: 0, failed: 0 }; },
  } as const;
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

// ── Mock claude fixture (reused across phases) ───────────────────────

const claudeFixture: CoordinatorSynthesisOutput = {
  reasoning_trace:
    "Three healthcare deals all surfaced Microsoft DAX pricing pressure within 10 days. Mechanism is Microsoft's quarter-end discount push, not product fit. Lineage: novel — no prior pattern of this type/vertical. Per-deal application: each deal needs a TCO comparison sized to the buyer's specific concern. Portfolio impact: 1 at-risk healthcare deal noted in the at-risk block. Constraint: no active manager directive conflicts.",
  synthesis: {
    headline: "Microsoft DAX Q-end discount pressure across three Healthcare deals.",
    mechanism:
      "Three Healthcare AEs cited Microsoft DAX 25% discount in the past 10 days; all three buyers identified pricing as the gating criterion. Mechanism is commercial urgency from Microsoft's quarter close, not product-fit erosion.",
    lineage: { is_extension_of_prior: false, prior_pattern_id: null, lineage_explanation: null },
  },
  recommendations: [
    {
      target_deal_id: null,
      target_deal_name: null,
      priority: "this_week",
      application: "vertical_wide",
      action: "Deploy the Microsoft price-hold bundle to Healthcare deals citing DAX discounting.",
      cited_signal_quotes: ["they cited Microsoft", "Microsoft's discount"],
    },
  ],
  arr_impact: {
    directly_affected_deals: 3,
    at_risk_comparable_deals: 1,
    multiplier: 1.33,
    calculation: "(3 + 1) / 3 = 1.33",
    confidence: "medium",
  },
  constraint_acknowledgment: {
    conflicts_with_directive: null,
    amplifies_experiment_ids: [],
  },
};

// ── Phase runner helpers ──────────────────────────────────────────────

function freshState(signals: SignalEventFixture[]): MockSqlState {
  return {
    signalEvents: signals,
    patternsInserted: [],
    joinRowsInserted: [],
    nextPatternId: 1,
  };
}

function makeSignal(
  dealId: string,
  vertical: string,
  signalType: string,
  daysAgo: number,
  evidenceQuote = "evidence quote",
  speaker = "Buyer",
): SignalEventFixture {
  const created = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  return {
    hubspot_deal_id: dealId,
    vertical,
    signal_type: signalType,
    evidence_quote: evidenceQuote,
    source_speaker: speaker,
    urgency: "medium",
    deal_size_band: "1m-5m",
    created_at: created,
  };
}

// ── Phases ────────────────────────────────────────────────────────────

async function phase1_empty() {
  console.log("PHASE 1 — empty signals → 0 patterns + silence-as-feature; no helpers called…");
  telemetryEvents = [];
  const state = freshState([]);
  const mockClaude = makeMockCallClaude({
    fixtures: { "04-coordinator-synthesis": claudeFixture },
  });
  const adapter = makeMockAdapter();

  const result = (await HANDLERS.coordinator_synthesis(
    {},
    {
      jobId: "job-phase-1",
      jobType: "coordinator_synthesis",
      hooks: { sql: makeMockSql(state), callClaude: mockClaude.call, hubspotAdapter: adapter },
    },
  )) as { patternsEmitted: number; groupsEvaluated: number; signalsRead: number };

  assertEqual(result.patternsEmitted, 0, "patternsEmitted=0 (silence)");
  assertEqual(result.groupsEvaluated, 0, "groupsEvaluated=0 (no groups)");
  assertEqual(result.signalsRead, 0, "signalsRead=0");
  assertEqual(state.patternsInserted.length, 0, "no DB writes");

  // Telemetry trail check — the SILENCE PATH discipline.
  const startedEvents = eventsOfType("coordinator_synthesis_started");
  const completedEvents = eventsOfType("coordinator_synthesis_completed");
  const belowEvents = eventsOfType("pattern_below_threshold");
  const detectedEvents = eventsOfType("pattern_detected");
  const enrichedEvents = eventsOfType("coordinator_synthesis_context_enriched");
  assertEqual(startedEvents.length, 1, "exactly 1 coordinator_synthesis_started");
  assertEqual(completedEvents.length, 1, "exactly 1 coordinator_synthesis_completed");
  assertEqual(belowEvents.length, 0, "no pattern_below_threshold (no groups existed)");
  assertEqual(detectedEvents.length, 0, "no pattern_detected (silence path)");
  // Phase 4 Day 4: helpers never run on silence path (no qualifying group)
  assertEqual(enrichedEvents.length, 0, "no coordinator_synthesis_context_enriched on silence path");
  assertEqual(completedEvents[0]!.patterns_emitted, 0, "completed.patterns_emitted=0");
  assertEqual(mockClaude.history.length, 0, "no Claude calls (no groups)");
  console.log("      OK — silence-as-feature; no helper enrichment (no qualifying group)");
}

async function phase2_one_pattern() {
  console.log("PHASE 2 — 1 vertical + 3-deals same signal → 1 pattern + empty-fallback enriched blocks…");
  telemetryEvents = [];
  // Three healthcare deals, all with competitive_intel signals.
  const signals: SignalEventFixture[] = [
    makeSignal("deal-A", "healthcare", "competitive_intel", 3, "they cited Microsoft DAX"),
    makeSignal("deal-A", "healthcare", "competitive_intel", 5, "Microsoft pricing pressure"),
    makeSignal("deal-B", "healthcare", "competitive_intel", 4, "DAX is closing Q-end"),
    makeSignal("deal-C", "healthcare", "competitive_intel", 2, "Microsoft 25% discount"),
  ];
  const state = freshState(signals);
  // All helper-side fixtures empty → empty-block fallback strings reach prompt vars.
  const mockClaude = makeMockCallClaude({
    fixtures: { "04-coordinator-synthesis": claudeFixture },
  });
  const adapter = makeMockAdapter();

  const result = (await HANDLERS.coordinator_synthesis(
    {},
    {
      jobId: "job-phase-2",
      jobType: "coordinator_synthesis",
      hooks: { sql: makeMockSql(state), callClaude: mockClaude.call, hubspotAdapter: adapter },
    },
  )) as { patternsEmitted: number; groupsEvaluated: number; signalsRead: number };

  assertEqual(result.patternsEmitted, 1, "patternsEmitted=1");
  assertEqual(result.groupsEvaluated, 1, "groupsEvaluated=1");
  assertEqual(result.signalsRead, 4, "signalsRead=4");
  assertEqual(state.patternsInserted.length, 1, "exactly 1 pattern row inserted");
  assertEqual(state.joinRowsInserted.length, 3, "3 join rows (one per affected deal)");
  assertEqual(mockClaude.history.length, 1, "exactly 1 Claude call");
  assertEqual(mockClaude.history[0]!.input.promptFile, "04-coordinator-synthesis", "promptFile");

  // Phase 4 Day 4 — assert prompt vars carry helper-rendered blocks.
  const promptVars = mockClaude.history[0]!.input.vars as Record<string, string | undefined>;
  const affectedDealsBlock = promptVars.affectedDealsBlock ?? "";
  assertEqual(
    promptVars.priorPatternsBlock,
    "(no prior patterns of this type/vertical in 90 days — this is novel)",
    "priorPatternsBlock empty fallback",
  );
  assertEqual(
    promptVars.atRiskDealsBlock,
    "(no comparable at-risk deals identified)",
    "atRiskDealsBlock empty fallback",
  );
  assertEqual(
    promptVars.relatedExperimentsBlock,
    "(no related experiments active)",
    "relatedExperimentsBlock empty fallback",
  );
  assertEqual(
    promptVars.activeDirectivesBlock,
    "(no active directives)",
    "activeDirectivesBlock empty fallback",
  );
  assertEqual(promptVars.systemIntelligenceBlock, "(none)", "systemIntelligenceBlock empty fallback");
  // affectedDealsBlock SHOULD include enriched fields from the mock adapter.
  assert(
    affectedDealsBlock.includes("Deal deal-A"),
    "affectedDealsBlock includes deal name from mock adapter",
  );
  assert(
    affectedDealsBlock.includes("Stakeholder for deal-A"),
    "affectedDealsBlock includes mocked stakeholder name",
  );
  assert(
    affectedDealsBlock.includes("they cited Microsoft DAX"),
    "affectedDealsBlock includes cited signal quote",
  );

  // Telemetry assertions.
  const detectedEvents = eventsOfType("pattern_detected");
  const completedEvents = eventsOfType("coordinator_synthesis_completed");
  const belowEvents = eventsOfType("pattern_below_threshold");
  const enrichedEvents = eventsOfType("coordinator_synthesis_context_enriched");
  assertEqual(detectedEvents.length, 1, "1 pattern_detected event");
  assertEqual(detectedEvents[0]!.deals_affected, 3, "deals_affected=3");
  assertEqual(detectedEvents[0]!.vertical, "healthcare", "vertical");
  assertEqual(detectedEvents[0]!.signal_type, "competitive_intel", "signal_type");
  assertEqual(belowEvents.length, 0, "no pattern_below_threshold (group cleared)");
  assertEqual(completedEvents[0]!.patterns_emitted, 1, "completed.patterns_emitted=1");
  assertEqual(enrichedEvents.length, 1, "1 coordinator_synthesis_context_enriched event");
  const enrichEvt = enrichedEvents[0]!;
  assertEqual(enrichEvt.prior_patterns_count, 0, "enrichment: 0 prior patterns");
  assertEqual(enrichEvt.at_risk_count, 0, "enrichment: 0 at-risk deals");
  assertEqual(enrichEvt.related_experiments_count, 0, "enrichment: 0 experiments");
  assertEqual(enrichEvt.active_directives_count, 0, "enrichment: 0 directives");
  assertEqual(enrichEvt.system_intelligence_count, 0, "enrichment: 0 system_intel");
  assertEqual(enrichEvt.affected_deals_enriched_count, 3, "enrichment: 3 deals enriched");
  assertEqual(enrichEvt.affected_deals_partial_count, 0, "enrichment: 0 partial");
  // pattern_detected gains enrichment_summary
  assert(detectedEvents[0]!.enrichment_summary !== undefined, "pattern_detected carries enrichment_summary");
  console.log("      OK — pattern emitted; empty-fallback strings + enrichment telemetry verified");
}

async function phase3_mixed() {
  console.log("PHASE 3 — mixed: sub-threshold + qualifying group; populated enriched blocks…");
  telemetryEvents = [];
  // Healthcare/competitive_intel — 3 deals (qualifies)
  // Healthcare/process_friction — 1 deal (below threshold)
  const signals: SignalEventFixture[] = [
    makeSignal("deal-A", "healthcare", "competitive_intel", 3, "Microsoft pricing"),
    makeSignal("deal-B", "healthcare", "competitive_intel", 4, "Microsoft DAX"),
    makeSignal("deal-C", "healthcare", "competitive_intel", 5, "Microsoft discount"),
    makeSignal("deal-D", "healthcare", "process_friction", 2, "security questionnaire"),
  ];
  const state = freshState(signals);
  // Seed populated helper fixtures so the qualifying group's prompt vars
  // include real enriched content.
  state.managerDirectives = [
    {
      id: "dir-mock-1",
      directive_text: "Cap discount on healthcare deals at 12% through Q4.",
      priority: "urgent",
      category: "discount",
      author_id: "user-mock-1",
      created_at: new Date("2026-04-01T00:00:00Z"),
    },
  ];
  state.systemIntelligence = [
    {
      id: "si-mock-1",
      title: "Healthcare Q-end pricing pressure trend",
      insight: "Q4 healthcare buyers cite pricing as primary gating criterion 78% of the time.",
      insight_type: "vertical_trend",
      confidence: "0.85",
      relevance_score: "92.50",
      vertical: "healthcare",
    },
  ];
  state.experiments = [
    {
      id: "exp-mock-1",
      title: "Microsoft DAX 3-year TCO bundle",
      hypothesis: "TCO-anchored bundle closes 20% more healthcare DAX-pressured deals.",
      description: null,
      lifecycle: "active",
      vertical: "healthcare",
    },
  ];
  state.priorPatterns = [
    {
      id: "pat-mock-prior",
      detected_at: new Date("2026-03-01T00:00:00Z"),
      synthesized_at: new Date("2026-03-01T01:00:00Z"),
      synthesis: "Microsoft DAX feature-comparison pressure across 4 healthcare deals.\n\nMechanism:\nMicrosoft shipped same-vertical roadmap; buyers compared feature breadth.",
      status: "synthesized",
    },
  ];
  state.meddpiccScores = [
    {
      hubspot_deal_id: "deal-A",
      metrics_score: 75,
      economic_buyer_score: 50, // gap (<60)
      decision_criteria_score: 70,
      decision_process_score: 65,
      paper_process_score: 60,
      identify_pain_score: 80,
      champion_score: 78,
      competition_score: 55, // gap
      overall_score: 67,
      per_dimension_confidence: { metrics: 0.9 },
      evidence: { metrics: { evidence_text: "$50M ARR target", last_updated: "2026-04-15" } },
    },
  ];

  const mockClaude = makeMockCallClaude({
    fixtures: { "04-coordinator-synthesis": claudeFixture },
  });
  // Adapter: provide a non-empty listDeals result for at-risk comparators.
  const atRiskFixture: Deal = makeFixtureDeal("deal-AT-RISK", "Comparable Healthcare Deal");
  // We need to mark deal-AT-RISK as healthcare and active stage. fixture
  // already returns negotiation + healthcare per makeFixtureDeal default.
  const adapter = makeMockAdapter({ listDealsResult: [atRiskFixture] });

  const result = (await HANDLERS.coordinator_synthesis(
    {},
    {
      jobId: "job-phase-3",
      jobType: "coordinator_synthesis",
      hooks: { sql: makeMockSql(state), callClaude: mockClaude.call, hubspotAdapter: adapter },
    },
  )) as { patternsEmitted: number; groupsEvaluated: number; signalsRead: number };

  assertEqual(result.patternsEmitted, 1, "patternsEmitted=1 (only competitive_intel qualifies)");
  assertEqual(result.groupsEvaluated, 2, "groupsEvaluated=2");
  assertEqual(result.signalsRead, 4, "signalsRead=4");
  assertEqual(state.patternsInserted.length, 1, "exactly 1 pattern row");
  assertEqual(mockClaude.history.length, 1, "1 Claude call (only for qualifying group)");

  // Phase 4 Day 4 — assert populated blocks reach prompt vars.
  const promptVars = mockClaude.history[0]!.input.vars as Record<string, string | undefined>;
  const directives = promptVars.activeDirectivesBlock ?? "";
  const systemIntel = promptVars.systemIntelligenceBlock ?? "";
  const experiments = promptVars.relatedExperimentsBlock ?? "";
  const priorPatterns = promptVars.priorPatternsBlock ?? "";
  const atRisk = promptVars.atRiskDealsBlock ?? "";
  const affected = promptVars.affectedDealsBlock ?? "";
  assert(directives.includes("Cap discount on healthcare"), "activeDirectivesBlock includes seeded directive");
  assert(directives.includes("[urgent]"), "activeDirectivesBlock includes priority bracket");
  assert(systemIntel.includes("Healthcare Q-end pricing pressure"), "systemIntelligenceBlock includes seeded title");
  assert(experiments.includes("Microsoft DAX 3-year TCO"), "relatedExperimentsBlock includes seeded experiment");
  assert(priorPatterns.includes("Microsoft DAX feature-comparison"), "priorPatternsBlock includes seeded prior pattern headline");
  assert(atRisk.includes("Comparable Healthcare Deal"), "atRiskDealsBlock includes adapter-returned at-risk deal");
  assert(affected.includes("Open MEDDPICC gaps"), "affectedDealsBlock includes meddpicc gaps section");
  assert(affected.includes("economic_buyer (50)"), "affectedDealsBlock surfaces economic_buyer dimension as gap (<60)");

  // Telemetry trail must show BOTH below_threshold AND pattern_detected +
  // ONE coordinator_synthesis_context_enriched (only for qualifying group).
  const detectedEvents = eventsOfType("pattern_detected");
  const belowEvents = eventsOfType("pattern_below_threshold");
  const enrichedEvents = eventsOfType("coordinator_synthesis_context_enriched");
  assertEqual(detectedEvents.length, 1, "1 pattern_detected (competitive_intel)");
  assertEqual(belowEvents.length, 1, "1 pattern_below_threshold (process_friction)");
  assertEqual(belowEvents[0]!.signal_type, "process_friction", "below.signal_type");
  assertEqual(belowEvents[0]!.deals_affected, 1, "below.deals_affected=1");
  assertEqual(belowEvents[0]!.threshold, 2, "below.threshold=2 (default)");
  assertEqual(enrichedEvents.length, 1, "1 enrichment event (only qualifying group)");
  const evt = enrichedEvents[0]!;
  assertEqual(evt.active_directives_count, 1, "enrichment.directives count");
  assertEqual(evt.system_intelligence_count, 1, "enrichment.system_intel count");
  assertEqual(evt.related_experiments_count, 1, "enrichment.experiments count");
  assertEqual(evt.prior_patterns_count, 1, "enrichment.prior_patterns count");
  assertEqual(evt.at_risk_count, 1, "enrichment.at_risk count");
  console.log("      OK — populated blocks reach prompt vars; enrichment telemetry counts correct");
}

async function main() {
  captureTelemetry();
  try {
    await phase1_empty();
    await phase2_one_pattern();
    await phase3_mixed();
    console.log("\ncoordinator_synthesis handler: ALL 3/3 PHASES PASS.");
  } finally {
    restoreTelemetry();
  }
}

main().catch((err) => {
  restoreTelemetry();
  console.error("test:coordinator-synthesis FAILED:", err);
  process.exit(1);
});
