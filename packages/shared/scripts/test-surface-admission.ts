/**
 * SurfaceAdmission engine unit tests — Phase 4 Day 1 Session B.
 *
 * Admission flow against fixture data covering both surface-kind
 * routes per kickoff Decision 3:
 *   - deal-specific: candidate read paths, applicability rejection
 *     write batches, threshold filtering, dismissal filtering,
 *     maxItems truncation, post-scoring score floor.
 *   - portfolio: pattern-attribute thresholds, dismissal filtering,
 *     no applies() (no DealState).
 *
 * Mocks:
 *   - SQL via the {sql} injection seam (same shape as
 *     test-applicable-pattern-experiment-flag.ts).
 *   - The Claude scoring callback via SurfaceAdmissionOptions.scoreFn
 *     — returns a deterministic per-candidate score so ordering +
 *     truncation are testable without real Claude calls.
 *
 * No DB; no Claude; deterministic.
 *
 * Usage:
 *   pnpm --filter @nexus/shared test:surface-admission
 */
import type postgres from "postgres";

import {
  SurfaceAdmission,
  type AdmissionCandidate,
  type ScoreInsightFn,
} from "@nexus/shared";

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

// ── Mock SQL (extended for portfolio + dismissals queries) ────────────

interface MockFixtures {
  dealCache?: Map<string, Record<string, unknown>>;
  companyCache?: Map<string, Record<string, unknown>>;
  meddpiccScores?: Map<string, Record<string, unknown>>;
  signalEvents?: Map<string, Array<{ payload: unknown; source_ref: string | null; created_at: Date }>>;
  stageEvents?: Map<string, Array<{ created_at: Date }>>;
  /** Coordinator patterns linked to specific deals (deal-specific path). */
  patterns?: Array<Record<string, unknown>>;
  patternDealLinks?: Map<string, string[]>;
  /** Coordinator patterns for portfolio path (no JOIN; status='detected'|'synthesized'). */
  portfolioPatterns?: Array<Record<string, unknown>>;
  experiments?: Array<Record<string, unknown>>;
  riskFlagsRaised?: Map<
    string,
    Array<{ id: string; source_ref: string | null; payload: Record<string, unknown>; created_at: Date }>
  >;
  /** surface_dismissals rows for the testing user. */
  dismissals?: Array<{
    insight_id: string;
    insight_type: string;
    mode: "soft" | "hard";
    resurface_after: Date | null;
  }>;
  /** deal_events generic for getRecentEvents (returns array regardless of type filter). */
  recentEvents?: Map<string, Array<{ type: string; created_at: Date; payload: unknown }>>;
}

interface MockState {
  insertedRejections: Array<Record<string, unknown>>;
  scoringCalls: number;
}

function makeMockSql(fx: MockFixtures): {
  sql: postgres.Sql;
  state: MockState;
} {
  const state: MockState = { insertedRejections: [], scoringCalls: 0 };

  type HelperMarker = {
    __helper: true;
    rows: ReadonlyArray<Record<string, unknown>>;
    cols: readonly string[];
  };

  const fn = ((...args: unknown[]): unknown => {
    const first = args[0];
    if (
      Array.isArray(first) &&
      Object.prototype.hasOwnProperty.call(first, "raw")
    ) {
      const strings = first as unknown as TemplateStringsArray;
      const values = args.slice(1);
      const text = strings.join("?");

      // Empty / whitespace-only fragment — happens when production
      // code uses `sql\`\`` as a no-op interpolation branch
      // (DealIntelligence.getRecentEvents uses this pattern when the
      // optional type filter is absent). Real postgres.js returns a
      // sync fragment that gets inlined; the mock just resolves to
      // an empty array and the outer dispatch's text inspection
      // continues to match on the OUTER strings.
      if (text.trim() === "") {
        return Promise.resolve([]);
      }

      // Deal cache
      if (text.includes("FROM hubspot_cache") && text.includes("'deal'")) {
        const id = String(values[0]);
        const payload = fx.dealCache?.get(id);
        return Promise.resolve(payload ? [{ payload }] : []);
      }
      // Company cache
      if (text.includes("FROM hubspot_cache") && text.includes("'company'")) {
        const id = String(values[0]);
        const payload = fx.companyCache?.get(id);
        return Promise.resolve(payload ? [{ payload }] : []);
      }
      // meddpicc_scores
      if (text.includes("FROM meddpicc_scores")) {
        const id = String(values[0]);
        const row = fx.meddpiccScores?.get(id);
        return Promise.resolve(row ? [row] : []);
      }
      // deal_events: generic recent (with MAKE_INTERVAL filter — used
      // by getRecentEvents). Detect via the presence of "MAKE_INTERVAL".
      if (text.includes("FROM deal_events") && text.includes("MAKE_INTERVAL")) {
        const id = String(values[0]);
        const rows = fx.recentEvents?.get(id) ?? [];
        return Promise.resolve(rows);
      }
      // deal_events filtered to signal_detected
      if (text.includes("FROM deal_events") && text.includes("'signal_detected'")) {
        const id = String(values[0]);
        const rows = fx.signalEvents?.get(id) ?? [];
        return Promise.resolve(rows);
      }
      // deal_events filtered to stage_changed (LIMIT 1)
      if (text.includes("FROM deal_events") && text.includes("'stage_changed'")) {
        const id = String(values[0]);
        const rows = fx.stageEvents?.get(id) ?? [];
        return Promise.resolve(rows.slice(0, 1));
      }
      // deal_events filtered to risk_flag_raised
      if (text.includes("FROM deal_events") && text.includes("'risk_flag_raised'")) {
        const id = String(values[0]);
        const rows = fx.riskFlagsRaised?.get(id) ?? [];
        return Promise.resolve(
          rows.map((r) => ({
            id: r.id,
            hubspot_deal_id: id,
            source_ref: r.source_ref,
            payload: r.payload,
            created_at: r.created_at,
          })),
        );
      }
      // coordinator_patterns deal-specific JOIN
      if (
        text.includes("FROM coordinator_patterns") &&
        text.includes("JOIN coordinator_pattern_deals")
      ) {
        const dealId = String(values[0]);
        const linkedIds = new Set<string>();
        if (fx.patternDealLinks) {
          for (const [patternId, dealIds] of fx.patternDealLinks) {
            if (dealIds.includes(dealId)) linkedIds.add(patternId);
          }
        }
        const rows = (fx.patterns ?? []).filter((p) =>
          linkedIds.has(String(p.id)),
        );
        return Promise.resolve(rows);
      }
      // coordinator_patterns portfolio path (no JOIN, status filter)
      if (
        text.includes("FROM coordinator_patterns") &&
        text.includes("status IN")
      ) {
        return Promise.resolve(fx.portfolioPatterns ?? []);
      }
      // experiments
      if (text.includes("FROM experiments") && text.includes("'active'")) {
        const dealVertical = values[0] as string | null;
        const rows = (fx.experiments ?? []).filter((e) => {
          if (e.vertical === null) return true;
          return e.vertical === dealVertical;
        });
        return Promise.resolve(rows);
      }
      // surface_dismissals
      if (text.includes("FROM surface_dismissals")) {
        const userId = String(values[0]);
        void userId;
        const rows = fx.dismissals ?? [];
        return Promise.resolve(rows);
      }
      // INSERT INTO applicability_rejections
      if (text.includes("INSERT INTO applicability_rejections")) {
        const helper = values[0] as HelperMarker | undefined;
        if (helper && helper.__helper) {
          for (const row of helper.rows) {
            state.insertedRejections.push(row);
          }
        }
        return Promise.resolve([]);
      }
      throw new Error(`Mock sql: unrecognized query: ${text.slice(0, 120)}`);
    }
    if (Array.isArray(first)) {
      const cols = args.slice(1) as string[];
      return {
        __helper: true,
        rows: first as ReadonlyArray<Record<string, unknown>>,
        cols,
      };
    }
    throw new Error(
      `Mock sql: unexpected non-template, non-array first arg: ${String(first)}`,
    );
  }) as unknown as postgres.Sql & { json: (v: unknown) => unknown };
  (fn as unknown as { json: (v: unknown) => unknown }).json = (v) => v;
  return { sql: fn as postgres.Sql, state };
}

// Deterministic scoring stub. Returns a score that varies by candidate
// id so ordering is testable; explanations cite the score.
function makeMockScoreFn(state: MockState, scoreMap: Record<string, number>): ScoreInsightFn {
  return async ({ candidate }) => {
    state.scoringCalls++;
    let id: string;
    switch (candidate.kind) {
      case "pattern":
        id = candidate.pattern.id;
        break;
      case "experiment":
        id = candidate.experiment.id;
        break;
      case "risk_flag":
        id = candidate.riskFlag.id;
        break;
    }
    const score = scoreMap[id] ?? 50;
    return {
      score,
      explanation: `Scored ${score}/100 — fixture score for ${id}`,
      components: undefined,
    };
  };
}

// ── Shared baseline (matches the applicable-* test) ──────────────────

const BASE_DEAL_ID = "fixture-deal-001";
const BASE_USER_ID = "00000000-0000-0000-0000-000000000099";

const baseDealCache = new Map<string, Record<string, unknown>>([
  [
    BASE_DEAL_ID,
    {
      id: BASE_DEAL_ID,
      properties: {
        dealstage: "3544580805",
        nexus_vertical: "healthcare",
        amount: "2400000",
        createdate: "2026-04-22T15:00:00Z",
        dealname: "Fixture",
      },
      associations: { companies: { results: [{ id: "fixture-co-001" }] } },
    },
  ],
]);

const baseCompanyCache = new Map<string, Record<string, unknown>>([
  [
    "fixture-co-001",
    {
      id: "fixture-co-001",
      properties: {
        nexus_vertical: "healthcare",
        numberofemployees: "4500",
        name: "Fixture Co",
      },
    },
  ],
]);

const baseMeddpicc = new Map<string, Record<string, unknown>>([
  [
    BASE_DEAL_ID,
    {
      metrics_score: 60,
      economic_buyer_score: 70,
      decision_criteria_score: 50,
      decision_process_score: 45,
      paper_process_score: 30,
      identify_pain_score: 80,
      champion_score: 65,
      competition_score: 55,
      overall_score: 60,
      per_dimension_confidence: {},
      evidence: {},
    },
  ],
]);

const baseSignals = new Map<
  string,
  Array<{ payload: unknown; source_ref: string | null; created_at: Date }>
>([
  [
    BASE_DEAL_ID,
    [
      {
        payload: { signal: { signal_type: "competitive_intel", summary: "x" } },
        source_ref: "fixture:sig:001",
        created_at: new Date("2026-04-26T00:00:00Z"),
      },
    ],
  ],
]);

const baseStageEvents = new Map<string, Array<{ created_at: Date }>>([
  [BASE_DEAL_ID, [{ created_at: new Date("2026-04-15T00:00:00Z") }]],
]);

const baseRecentEvents = new Map<
  string,
  Array<{ type: string; created_at: Date; payload: unknown }>
>([
  [
    BASE_DEAL_ID,
    [
      {
        type: "signal_detected",
        created_at: new Date("2026-04-26T00:00:00Z"),
        payload: { signal: { signal_type: "competitive_intel", summary: "x" } },
      },
    ],
  ],
]);

// ── Cases ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("SurfaceAdmission — Phase 4 Day 1 Session B\n");
  let n = 0;

  // [1] Deal-specific surface, no candidates → empty admitted set.
  n++;
  console.log(`[${n}] deal_detail_intelligence empty path → empty admitted set…`);
  {
    const { sql, state } = makeMockSql({
      dealCache: baseDealCache,
      companyCache: baseCompanyCache,
      meddpiccScores: baseMeddpicc,
      signalEvents: baseSignals,
      stageEvents: baseStageEvents,
      recentEvents: baseRecentEvents,
    });
    const score = makeMockScoreFn(state, {});
    const engine = new SurfaceAdmission({
      databaseUrl: "ignored",
      sql,
      scoreFn: score,
    });
    const result = await engine.admit({
      surfaceId: "deal_detail_intelligence",
      userId: BASE_USER_ID,
      dealId: BASE_DEAL_ID,
    });
    assertEqual(result.admitted.length, 0, "empty admitted");
    assertEqual(state.scoringCalls, 0, "no scoring calls");
    assertEqual(state.insertedRejections.length, 0, "no rejections");
    await engine.close();
  }
  console.log(`      OK — empty admitted, 0 scoring calls`);

  // [2] Deal-specific surface, 2 patterns admit → ordered by score desc.
  n++;
  console.log(`[${n}] deal_detail_intelligence with 2 patterns → ordered by score…`);
  {
    const patterns = [
      buildPatternRow("pattern-A", { dealsAffected: 3, arr: 1_000_000 }),
      buildPatternRow("pattern-B", { dealsAffected: 5, arr: 2_000_000 }),
    ];
    const { sql, state } = makeMockSql({
      dealCache: baseDealCache,
      companyCache: baseCompanyCache,
      meddpiccScores: baseMeddpicc,
      signalEvents: baseSignals,
      stageEvents: baseStageEvents,
      recentEvents: baseRecentEvents,
      patterns,
      patternDealLinks: new Map([
        ["pattern-A", [BASE_DEAL_ID]],
        ["pattern-B", [BASE_DEAL_ID]],
      ]),
    });
    const score = makeMockScoreFn(state, { "pattern-A": 75, "pattern-B": 90 });
    const engine = new SurfaceAdmission({
      databaseUrl: "ignored",
      sql,
      scoreFn: score,
    });
    const result = await engine.admit({
      surfaceId: "deal_detail_intelligence",
      userId: BASE_USER_ID,
      dealId: BASE_DEAL_ID,
    });
    assertEqual(result.admitted.length, 2, "2 admitted");
    const top = result.admitted[0]!;
    assert(top.kind === "pattern", "top is pattern");
    assertEqual(top.pattern.id, "pattern-B", "B (score=90) ranks first");
    assertEqual(top.score, 90, "top score");
    assertEqual(state.scoringCalls, 2, "2 scoring calls");
    await engine.close();
  }
  console.log(`      OK — sorted desc: pattern-B (90) > pattern-A (75)`);

  // [3] Deal-specific surface, post-scoring minScore floor filters.
  n++;
  console.log(`[${n}] minScore=60 floor filters out a candidate scoring 55…`);
  {
    const patterns = [
      buildPatternRow("pattern-low", { dealsAffected: 2, arr: 600_000 }),
      buildPatternRow("pattern-high", { dealsAffected: 3, arr: 1_000_000 }),
    ];
    const { sql, state } = makeMockSql({
      dealCache: baseDealCache,
      companyCache: baseCompanyCache,
      meddpiccScores: baseMeddpicc,
      signalEvents: baseSignals,
      stageEvents: baseStageEvents,
      recentEvents: baseRecentEvents,
      patterns,
      patternDealLinks: new Map([
        ["pattern-low", [BASE_DEAL_ID]],
        ["pattern-high", [BASE_DEAL_ID]],
      ]),
    });
    const score = makeMockScoreFn(state, {
      "pattern-low": 55,
      "pattern-high": 80,
    });
    const engine = new SurfaceAdmission({
      databaseUrl: "ignored",
      sql,
      scoreFn: score,
    });
    const result = await engine.admit({
      surfaceId: "deal_detail_intelligence", // minScore=60
      userId: BASE_USER_ID,
      dealId: BASE_DEAL_ID,
    });
    assertEqual(result.admitted.length, 1, "1 admitted");
    assertEqual(
      result.admitted[0]!.kind === "pattern" &&
        result.admitted[0]!.pattern.id,
      "pattern-high",
      "only high passed",
    );
    assertEqual(state.scoringCalls, 2, "2 scoring calls (filter post-score)");
    await engine.close();
  }
  console.log(`      OK — score=55 dropped by minScore=60 floor`);

  // [4] Deal-specific surface, dismissal filter excludes candidate.
  n++;
  console.log(`[${n}] active soft-dismissal filters candidate out…`);
  {
    const patterns = [
      buildPatternRow("pattern-dismissed", { dealsAffected: 2, arr: 600_000 }),
      buildPatternRow("pattern-clean", { dealsAffected: 3, arr: 1_000_000 }),
    ];
    const future = new Date(Date.now() + 7 * 86_400_000);
    const { sql, state } = makeMockSql({
      dealCache: baseDealCache,
      companyCache: baseCompanyCache,
      meddpiccScores: baseMeddpicc,
      signalEvents: baseSignals,
      stageEvents: baseStageEvents,
      recentEvents: baseRecentEvents,
      patterns,
      patternDealLinks: new Map([
        ["pattern-dismissed", [BASE_DEAL_ID]],
        ["pattern-clean", [BASE_DEAL_ID]],
      ]),
      dismissals: [
        {
          insight_id: "pattern-dismissed",
          insight_type: "pattern",
          mode: "soft",
          resurface_after: future,
        },
      ],
    });
    const score = makeMockScoreFn(state, {
      "pattern-dismissed": 99,
      "pattern-clean": 80,
    });
    const engine = new SurfaceAdmission({
      databaseUrl: "ignored",
      sql,
      scoreFn: score,
    });
    const result = await engine.admit({
      surfaceId: "deal_detail_intelligence",
      userId: BASE_USER_ID,
      dealId: BASE_DEAL_ID,
    });
    assertEqual(result.admitted.length, 1, "1 admitted");
    assertEqual(
      result.admitted[0]!.kind === "pattern" &&
        result.admitted[0]!.pattern.id,
      "pattern-clean",
      "dismissed pattern excluded",
    );
    // dismissed pattern not scored → 1 scoring call only.
    assertEqual(state.scoringCalls, 1, "1 scoring call (dismissal filtered first)");
    await engine.close();
  }
  console.log(`      OK — soft-dismiss excludes; expired dismissal would re-surface`);

  // [5] call_prep_brief stage filter — wrong stage → empty admitted set.
  n++;
  console.log(`[${n}] call_prep_brief on closed_won deal → empty (stage filter)…`);
  {
    const closedDealCache = new Map<string, Record<string, unknown>>([
      [
        BASE_DEAL_ID,
        {
          id: BASE_DEAL_ID,
          properties: {
            dealstage: "closed_won_id_unknown_to_pipeline_ids",
            nexus_vertical: "healthcare",
            amount: "2400000",
          },
          associations: { companies: { results: [{ id: "fixture-co-001" }] } },
        },
      ],
    ]);
    const patterns = [
      buildPatternRow("pattern-X", { dealsAffected: 3, arr: 1_000_000 }),
    ];
    const { sql, state } = makeMockSql({
      dealCache: closedDealCache,
      companyCache: baseCompanyCache,
      meddpiccScores: baseMeddpicc,
      signalEvents: baseSignals,
      stageEvents: baseStageEvents,
      recentEvents: baseRecentEvents,
      patterns,
      patternDealLinks: new Map([["pattern-X", [BASE_DEAL_ID]]]),
    });
    const score = makeMockScoreFn(state, { "pattern-X": 99 });
    const engine = new SurfaceAdmission({
      databaseUrl: "ignored",
      sql,
      scoreFn: score,
    });
    const result = await engine.admit({
      surfaceId: "call_prep_brief",
      userId: BASE_USER_ID,
      dealId: BASE_DEAL_ID,
    });
    assertEqual(result.admitted.length, 0, "stage filter rejects all");
    assertEqual(state.scoringCalls, 0, "no scoring calls");
    await engine.close();
  }
  console.log(`      OK — stage not in [disc, tv, prop, neg] → empty`);

  // [6] Portfolio surface — patterns route through portfolio path.
  n++;
  console.log(
    `[${n}] intelligence_dashboard_patterns portfolio path with threshold…`,
  );
  {
    const portfolioPatterns = [
      buildPatternRow("pattern-meets", {
        dealsAffected: 5,
        arr: 1_500_000,
      }),
      buildPatternRow("pattern-thin", {
        dealsAffected: 1, // below minDealsAffected=2
        arr: 100_000,
      }),
    ];
    const { sql, state } = makeMockSql({
      portfolioPatterns,
    });
    const score = makeMockScoreFn(state, { "pattern-meets": 80 });
    const engine = new SurfaceAdmission({
      databaseUrl: "ignored",
      sql,
      scoreFn: score,
    });
    const result = await engine.admit({
      surfaceId: "intelligence_dashboard_patterns",
      userId: BASE_USER_ID,
    });
    assertEqual(result.admitted.length, 1, "1 admitted (threshold-passed)");
    assertEqual(
      result.admitted[0]!.kind === "pattern" &&
        result.admitted[0]!.pattern.id,
      "pattern-meets",
      "thin pattern (1 deal, $100K) below threshold",
    );
    // No applicability rejections written (portfolio path skips applies()).
    assertEqual(state.insertedRejections.length, 0, "no rejections");
    assertEqual(state.scoringCalls, 1, "1 scoring call (only threshold-passing)");
    await engine.close();
  }
  console.log(`      OK — minDealsAffected=2 + minAggregateArr=500K filtered correctly`);

  // [7] Deal-specific without dealId → throws.
  n++;
  console.log(`[${n}] deal-specific surface without dealId → throws…`);
  {
    const { sql } = makeMockSql({});
    const engine = new SurfaceAdmission({
      databaseUrl: "ignored",
      sql,
      scoreFn: async () => ({ score: 0, explanation: "" }),
    });
    let caught: Error | null = null;
    try {
      await engine.admit({
        surfaceId: "call_prep_brief",
        userId: BASE_USER_ID,
        // no dealId
      });
    } catch (err) {
      caught = err instanceof Error ? err : new Error(String(err));
    }
    assert(caught !== null, "throws");
    assert(caught.message.includes("call_prep_brief"), "names the surface");
    assert(caught.message.includes("dealId"), "names the missing param");
    await engine.close();
  }
  console.log(`      OK — caller bug surfaces clearly`);

  // [8] Hard-dismissal (mode='hard') excludes regardless of resurface_after.
  n++;
  console.log(`[${n}] hard-dismissal excludes regardless of resurface_after…`);
  {
    const patterns = [
      buildPatternRow("pattern-hard-dismissed", {
        dealsAffected: 3,
        arr: 1_000_000,
      }),
    ];
    const { sql, state } = makeMockSql({
      dealCache: baseDealCache,
      companyCache: baseCompanyCache,
      meddpiccScores: baseMeddpicc,
      signalEvents: baseSignals,
      stageEvents: baseStageEvents,
      recentEvents: baseRecentEvents,
      patterns,
      patternDealLinks: new Map([["pattern-hard-dismissed", [BASE_DEAL_ID]]]),
      dismissals: [
        {
          insight_id: "pattern-hard-dismissed",
          insight_type: "pattern",
          mode: "hard",
          resurface_after: null, // hard = forever
        },
      ],
    });
    const score = makeMockScoreFn(state, { "pattern-hard-dismissed": 99 });
    const engine = new SurfaceAdmission({
      databaseUrl: "ignored",
      sql,
      scoreFn: score,
    });
    const result = await engine.admit({
      surfaceId: "deal_detail_intelligence",
      userId: BASE_USER_ID,
      dealId: BASE_DEAL_ID,
    });
    assertEqual(result.admitted.length, 0, "hard-dismissed excluded");
    assertEqual(state.scoringCalls, 0, "no scoring (filtered before scoring)");
    await engine.close();
  }
  console.log(`      OK — hard-dismiss is permanent regardless of resurface_after`);

  console.log("");
  console.log(`SurfaceAdmission: ALL ${n}/${n} CASES PASS.`);
}

// Pattern row builder — mirrors the schema-row shape the SQL mock returns.
function buildPatternRow(
  id: string,
  opts: { dealsAffected: number; arr: number },
): Record<string, unknown> {
  return {
    id,
    pattern_key: `key-${id}`,
    signal_type: "competitive_intel",
    vertical: "healthcare",
    competitor: null,
    synthesis: `Synthesis for ${id}`,
    recommendations: [],
    arr_impact: { aggregate_arr: opts.arr },
    score: "75.00",
    reasoning: null,
    applicability: {},
    status: "detected",
    detected_at: new Date("2026-04-26T00:00:00Z"),
    synthesized_at: null,
    deals_affected_count: opts.dealsAffected,
  };
}

// Suppress unused-import warning when only types are used in narrow paths.
void (null as unknown as AdmissionCandidate);

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
