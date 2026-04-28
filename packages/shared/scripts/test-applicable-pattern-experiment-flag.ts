/**
 * DealIntelligence.getApplicable{Patterns,Experiments,Flags} unit tests
 * — Phase 4 Day 1 Session B.
 *
 * Three sub-suites against fixture deals + fixture rules. Mocks the
 * `sql` parameter via the `{databaseUrl, sql}` injection seam (matches
 * Session A.5's test-build-event-context pattern). No DB; no Claude.
 *
 * Per kickoff Decision 4 (each method composes evaluator + reads +
 * applicability_rejections write) + Decision 3 step 3 (rejection
 * batch is one INSERT after the loop).
 *
 * Usage:
 *   pnpm --filter @nexus/shared test:applicable-pattern-experiment-flag
 */
import type postgres from "postgres";

import { DealIntelligence } from "@nexus/shared";

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

// ── Mock SQL ──────────────────────────────────────────────────────────

interface MockFixtures {
  dealCache?: Map<string, Record<string, unknown>>;
  companyCache?: Map<string, Record<string, unknown>>;
  meddpiccScores?: Map<string, Record<string, unknown>>;
  /** signal_detected events keyed by hubspot_deal_id. */
  signalEvents?: Map<string, Array<{ payload: unknown; source_ref: string | null; created_at: Date }>>;
  /** stage_changed events keyed by hubspot_deal_id (latest first). */
  stageEvents?: Map<string, Array<{ created_at: Date }>>;
  /** Coordinator patterns (deal-specific path: JOIN-via-deal_id). */
  patterns?: Array<Record<string, unknown>>;
  /** Map of pattern_id → hubspot_deal_id list (drives the JOIN). */
  patternDealLinks?: Map<string, string[]>;
  /** Experiments (lifecycle='active' filter applied by mock). */
  experiments?: Array<Record<string, unknown>>;
  /** risk_flag_raised events keyed by hubspot_deal_id (currently raised). */
  riskFlagsRaised?: Map<
    string,
    Array<{ id: string; source_ref: string | null; payload: Record<string, unknown>; created_at: Date }>
  >;
}

interface MockState {
  insertedRejections: Array<{
    rule_id: string;
    rule_description: string | null;
    surface_id: string | null;
    hubspot_deal_id: string;
    reasons: unknown;
    deal_state_snapshot: unknown;
  }>;
}

function makeMockSql(fx: MockFixtures): {
  sql: postgres.Sql;
  state: MockState;
} {
  const state: MockState = { insertedRejections: [] };

  // Helper marker — produced by the column-list helper invocation
  // sql(rows, ...cols) and consumed by the INSERT branch of the
  // tagged-template dispatcher.
  type HelperMarker = {
    __helper: true;
    rows: ReadonlyArray<Record<string, unknown>>;
    cols: readonly string[];
  };

  const fn = ((...args: unknown[]): unknown => {
    // Discriminate tagged-template vs function call: tagged-template
    // first arg is a frozen array with `.raw` on it.
    const first = args[0];
    if (
      Array.isArray(first) &&
      Object.prototype.hasOwnProperty.call(first, "raw")
    ) {
      const strings = first as unknown as TemplateStringsArray;
      const values = args.slice(1);
      const text = strings.join("?");

      // ── deal cache ──
      if (text.includes("FROM hubspot_cache") && text.includes("'deal'")) {
        const id = String(values[0]);
        const payload = fx.dealCache?.get(id);
        return Promise.resolve(payload ? [{ payload }] : []);
      }
      // ── company cache ──
      if (text.includes("FROM hubspot_cache") && text.includes("'company'")) {
        const id = String(values[0]);
        const payload = fx.companyCache?.get(id);
        return Promise.resolve(payload ? [{ payload }] : []);
      }
      // ── meddpicc_scores ──
      if (text.includes("FROM meddpicc_scores")) {
        const id = String(values[0]);
        const row = fx.meddpiccScores?.get(id);
        return Promise.resolve(row ? [row] : []);
      }
      // ── deal_events filtered to signal_detected ──
      if (text.includes("FROM deal_events") && text.includes("'signal_detected'")) {
        const id = String(values[0]);
        const rows = fx.signalEvents?.get(id) ?? [];
        return Promise.resolve(rows);
      }
      // ── deal_events filtered to stage_changed (LIMIT 1) ──
      if (text.includes("FROM deal_events") && text.includes("'stage_changed'")) {
        const id = String(values[0]);
        const rows = fx.stageEvents?.get(id) ?? [];
        return Promise.resolve(rows.slice(0, 1));
      }
      // ── coordinator_patterns deal-specific JOIN path ──
      if (
        text.includes("FROM coordinator_patterns") &&
        text.includes("JOIN coordinator_pattern_deals")
      ) {
        const dealId = String(values[0]);
        // Filter patterns whose patternDealLinks include this dealId.
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
      // ── experiments WHERE lifecycle = 'active' ──
      if (text.includes("FROM experiments") && text.includes("'active'")) {
        const dealVertical = values[0] as string | null;
        const rows = (fx.experiments ?? []).filter((e) => {
          if (e.vertical === null) return true;
          return e.vertical === dealVertical;
        });
        return Promise.resolve(rows);
      }
      // ── deal_events filtered to risk_flag_raised w/ NOT EXISTS subquery ──
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
      // ── INSERT INTO applicability_rejections ──
      if (text.includes("INSERT INTO applicability_rejections")) {
        const helper = values[0] as HelperMarker | undefined;
        if (helper && helper.__helper) {
          for (const row of helper.rows) {
            state.insertedRejections.push(row as MockState["insertedRejections"][number]);
          }
        }
        return Promise.resolve([]);
      }
      throw new Error(`Mock sql: unrecognized query: ${text.slice(0, 120)}`);
    }
    // Helper invocation — sql(rows, ...cols).
    if (Array.isArray(first)) {
      const cols = args.slice(1) as string[];
      const marker: HelperMarker = {
        __helper: true,
        rows: first as ReadonlyArray<Record<string, unknown>>,
        cols,
      };
      return marker;
    }
    throw new Error(
      `Mock sql: unexpected non-template, non-array first arg: ${String(first)}`,
    );
  }) as unknown as postgres.Sql & { json: (v: unknown) => unknown };
  // sql.json — identity for mocks.
  (fn as unknown as { json: (v: unknown) => unknown }).json = (v) => v;
  return { sql: fn as postgres.Sql, state };
}

// ── Shared baseline fixtures (MedVista-shaped discovery deal) ─────────

const BASE_DEAL_ID = "fixture-deal-001";

const baseDealCache = new Map<string, Record<string, unknown>>([
  [
    BASE_DEAL_ID,
    {
      id: BASE_DEAL_ID,
      properties: {
        dealstage: "3544580805", // discovery per pipeline-ids.json
        nexus_vertical: "healthcare",
        amount: "2400000",
        createdate: "2026-04-22T15:00:00Z",
        dealname: "Fixture Deal",
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

// ── Suite 1: getApplicablePatterns ────────────────────────────────────

async function suitePatterns(): Promise<number> {
  let n = 0;

  // [P1] Pattern with empty applicability rule passes.
  n++;
  console.log(`[P${n}] empty-rule pattern passes…`);
  {
    const patterns = [
      {
        id: "pattern-001",
        pattern_key: "test-pattern-001",
        signal_type: "competitive_intel",
        vertical: "healthcare",
        competitor: "Microsoft DAX",
        synthesis: "Test synthesis",
        recommendations: [],
        arr_impact: { aggregate_arr: 1_500_000 },
        score: "85.00",
        reasoning: "Test reasoning",
        applicability: {},
        status: "detected" as const,
        detected_at: new Date("2026-04-26T00:00:00Z"),
        synthesized_at: null,
        deals_affected_count: 3,
      },
    ];
    const { sql, state } = makeMockSql({
      dealCache: baseDealCache,
      companyCache: baseCompanyCache,
      meddpiccScores: baseMeddpicc,
      signalEvents: baseSignals,
      stageEvents: baseStageEvents,
      patterns,
      patternDealLinks: new Map([["pattern-001", [BASE_DEAL_ID]]]),
    });
    const intel = new DealIntelligence({ databaseUrl: "ignored", sql });
    const result = await intel.getApplicablePatterns(BASE_DEAL_ID);
    assertEqual(result.length, 1, "1 pattern admitted");
    assertEqual(result[0]!.id, "pattern-001", "pattern id");
    assertEqual(state.insertedRejections.length, 0, "no rejections");
    await intel.close();
  }
  console.log(`      OK — empty rule → 1 pattern admitted, 0 rejections`);

  // [P2] Pattern with stages-restrictive rule rejects + writes rejection row.
  n++;
  console.log(`[P${n}] stages-restrictive rule rejects + writes diagnostic…`);
  {
    const patterns = [
      {
        id: "pattern-002",
        pattern_key: "test-pattern-002",
        signal_type: "competitive_intel",
        vertical: "healthcare",
        competitor: null,
        synthesis: "Test synthesis 2",
        recommendations: [],
        arr_impact: {},
        score: "70.00",
        reasoning: null,
        applicability: { description: "neg-only", stages: ["negotiation"] },
        status: "detected" as const,
        detected_at: new Date("2026-04-26T00:00:00Z"),
        synthesized_at: null,
        deals_affected_count: 2,
      },
    ];
    const { sql, state } = makeMockSql({
      dealCache: baseDealCache,
      companyCache: baseCompanyCache,
      meddpiccScores: baseMeddpicc,
      signalEvents: baseSignals,
      stageEvents: baseStageEvents,
      patterns,
      patternDealLinks: new Map([["pattern-002", [BASE_DEAL_ID]]]),
    });
    const intel = new DealIntelligence({ databaseUrl: "ignored", sql });
    const result = await intel.getApplicablePatterns(BASE_DEAL_ID, {
      surfaceId: "deal_detail_intelligence",
    });
    assertEqual(result.length, 0, "0 patterns admitted");
    assertEqual(state.insertedRejections.length, 1, "1 rejection written");
    const rej = state.insertedRejections[0]!;
    assertEqual(rej.rule_id, "pattern-002", "rule_id matches pattern id");
    assertEqual(rej.rule_description, "neg-only", "rule_description preserved");
    assertEqual(
      rej.surface_id,
      "deal_detail_intelligence",
      "surface_id propagated",
    );
    assertEqual(rej.hubspot_deal_id, BASE_DEAL_ID, "hubspot_deal_id matches");
    await intel.close();
  }
  console.log(`      OK — stages=[neg] vs deal=discovery → 1 rejection`);

  // [P3] Invalid applicability shape → rule_invalid rejection.
  n++;
  console.log(`[P${n}] invalid applicability shape → rule_invalid rejection…`);
  {
    const patterns = [
      {
        id: "pattern-003",
        pattern_key: "test-pattern-003",
        signal_type: "competitive_intel",
        vertical: "healthcare",
        competitor: null,
        synthesis: "Test 3",
        recommendations: [],
        arr_impact: {},
        score: null,
        reasoning: null,
        applicability: { stages: ["not_a_real_stage"] },
        status: "detected" as const,
        detected_at: new Date("2026-04-26T00:00:00Z"),
        synthesized_at: null,
        deals_affected_count: 1,
      },
    ];
    const { sql, state } = makeMockSql({
      dealCache: baseDealCache,
      companyCache: baseCompanyCache,
      meddpiccScores: baseMeddpicc,
      signalEvents: baseSignals,
      stageEvents: baseStageEvents,
      patterns,
      patternDealLinks: new Map([["pattern-003", [BASE_DEAL_ID]]]),
    });
    const intel = new DealIntelligence({ databaseUrl: "ignored", sql });
    const result = await intel.getApplicablePatterns(BASE_DEAL_ID);
    assertEqual(result.length, 0, "0 admitted");
    assertEqual(state.insertedRejections.length, 1, "1 rejection");
    const rej = state.insertedRejections[0]!;
    const reasonsArr = rej.reasons as string[];
    assert(
      reasonsArr.length === 1 && reasonsArr[0]!.startsWith("rule_invalid:"),
      "reason starts with rule_invalid:",
    );
    await intel.close();
  }
  console.log(`      OK — invalid rule shape → rule_invalid rejection`);

  return n;
}

// ── Suite 2: getApplicableExperiments ─────────────────────────────────

async function suiteExperiments(): Promise<number> {
  let n = 0;

  // [E1] Active vertical-matching experiment passes (empty rule).
  n++;
  console.log(`[E${n}] vertical-matching experiment passes…`);
  {
    const experiments = [
      {
        id: "exp-001",
        title: "TCO comparison test",
        hypothesis: "TCO comparison shifts close rate",
        description: "Test exp 1",
        category: "in_conversation",
        lifecycle: "active" as const,
        vertical: "healthcare",
        applicability: {},
        thresholds: {},
      },
    ];
    const { sql, state } = makeMockSql({
      dealCache: baseDealCache,
      companyCache: baseCompanyCache,
      meddpiccScores: baseMeddpicc,
      signalEvents: baseSignals,
      stageEvents: baseStageEvents,
      experiments,
    });
    const intel = new DealIntelligence({ databaseUrl: "ignored", sql });
    const result = await intel.getApplicableExperiments(BASE_DEAL_ID);
    assertEqual(result.length, 1, "1 experiment admitted");
    assertEqual(result[0]!.id, "exp-001", "experiment id");
    assertEqual(state.insertedRejections.length, 0, "no rejections");
    await intel.close();
  }
  console.log(`      OK — vertical=healthcare matches deal vertical`);

  // [E2] Cross-vertical experiment (vertical IS NULL) passes.
  n++;
  console.log(`[E${n}] cross-vertical experiment passes…`);
  {
    const experiments = [
      {
        id: "exp-002",
        title: "Cross-vertical exp",
        hypothesis: "Universal hypothesis",
        description: null,
        category: "implicit_approach",
        lifecycle: "active" as const,
        vertical: null,
        applicability: {},
        thresholds: {},
      },
    ];
    const { sql } = makeMockSql({
      dealCache: baseDealCache,
      companyCache: baseCompanyCache,
      meddpiccScores: baseMeddpicc,
      signalEvents: baseSignals,
      stageEvents: baseStageEvents,
      experiments,
    });
    const intel = new DealIntelligence({ databaseUrl: "ignored", sql });
    const result = await intel.getApplicableExperiments(BASE_DEAL_ID);
    assertEqual(result.length, 1, "1 experiment admitted");
    await intel.close();
  }
  console.log(`      OK — cross-vertical (vertical=null) matches`);

  // [E3] Active experiment with stage-restrictive rule rejects.
  n++;
  console.log(`[E${n}] stage-restrictive rule rejects + writes diagnostic…`);
  {
    const experiments = [
      {
        id: "exp-003",
        title: "Negotiation-only exp",
        hypothesis: "Hypothesis 3",
        description: null,
        category: "out_of_conversation",
        lifecycle: "active" as const,
        vertical: "healthcare",
        applicability: { description: "neg-only", stages: ["negotiation"] },
        thresholds: {},
      },
    ];
    const { sql, state } = makeMockSql({
      dealCache: baseDealCache,
      companyCache: baseCompanyCache,
      meddpiccScores: baseMeddpicc,
      signalEvents: baseSignals,
      stageEvents: baseStageEvents,
      experiments,
    });
    const intel = new DealIntelligence({ databaseUrl: "ignored", sql });
    const result = await intel.getApplicableExperiments(BASE_DEAL_ID, {
      surfaceId: "call_prep_brief",
    });
    assertEqual(result.length, 0, "0 admitted");
    assertEqual(state.insertedRejections.length, 1, "1 rejection");
    const rej = state.insertedRejections[0]!;
    assertEqual(rej.surface_id, "call_prep_brief", "surface_id threaded");
    assertEqual(rej.rule_description, "neg-only", "description preserved");
    await intel.close();
  }
  console.log(`      OK — stage rejection + surface_id threaded`);

  return n;
}

// ── Suite 3: getApplicableFlags ───────────────────────────────────────

async function suiteFlags(): Promise<number> {
  let n = 0;

  // [F1] Risk flag with empty payload-applicability passes
  // (Decision 4 default — passes everything until Phase 5 Day 1
  // writer specifies per-flag applicability).
  n++;
  console.log(`[F${n}] empty-payload risk flag passes (Decision 4 default)…`);
  {
    const riskFlags = new Map<
      string,
      Array<{ id: string; source_ref: string | null; payload: Record<string, unknown>; created_at: Date }>
    >([
      [
        BASE_DEAL_ID,
        [
          {
            id: "flag-001",
            source_ref: "test:flag:001",
            payload: { kind: "test", note: "no applicability key" },
            created_at: new Date("2026-04-26T00:00:00Z"),
          },
        ],
      ],
    ]);
    const { sql, state } = makeMockSql({
      dealCache: baseDealCache,
      companyCache: baseCompanyCache,
      meddpiccScores: baseMeddpicc,
      signalEvents: baseSignals,
      stageEvents: baseStageEvents,
      riskFlagsRaised: riskFlags,
    });
    const intel = new DealIntelligence({ databaseUrl: "ignored", sql });
    const result = await intel.getApplicableFlags(BASE_DEAL_ID);
    assertEqual(result.length, 1, "1 flag admitted");
    assertEqual(result[0]!.id, "flag-001", "flag id");
    assertEqual(state.insertedRejections.length, 0, "no rejections");
    await intel.close();
  }
  console.log(`      OK — payload without applicability → empty-default rule passes`);

  // [F2] Risk flag with explicit stage-restrictive applicability rejects.
  n++;
  console.log(`[F${n}] explicit stage-restrictive applicability rejects…`);
  {
    const riskFlags = new Map<
      string,
      Array<{ id: string; source_ref: string | null; payload: Record<string, unknown>; created_at: Date }>
    >([
      [
        BASE_DEAL_ID,
        [
          {
            id: "flag-002",
            source_ref: "test:flag:002",
            payload: {
              kind: "test",
              applicability: { description: "neg-only", stages: ["negotiation"] },
            },
            created_at: new Date("2026-04-26T00:00:00Z"),
          },
        ],
      ],
    ]);
    const { sql, state } = makeMockSql({
      dealCache: baseDealCache,
      companyCache: baseCompanyCache,
      meddpiccScores: baseMeddpicc,
      signalEvents: baseSignals,
      stageEvents: baseStageEvents,
      riskFlagsRaised: riskFlags,
    });
    const intel = new DealIntelligence({ databaseUrl: "ignored", sql });
    const result = await intel.getApplicableFlags(BASE_DEAL_ID, {
      surfaceId: "deal_detail_intelligence",
    });
    assertEqual(result.length, 0, "0 admitted");
    assertEqual(state.insertedRejections.length, 1, "1 rejection");
    const rej = state.insertedRejections[0]!;
    assertEqual(rej.rule_id, "flag-002", "rule_id matches flag id");
    assertEqual(
      rej.surface_id,
      "deal_detail_intelligence",
      "surface_id threaded",
    );
    await intel.close();
  }
  console.log(`      OK — payload-side applicability rejection`);

  // [F3] No flags raised → empty result, no queries on missing fixtures.
  n++;
  console.log(`[F${n}] no flags raised → empty result…`);
  {
    const { sql, state } = makeMockSql({
      dealCache: baseDealCache,
      companyCache: baseCompanyCache,
      meddpiccScores: baseMeddpicc,
      signalEvents: baseSignals,
      stageEvents: baseStageEvents,
      riskFlagsRaised: new Map(),
    });
    const intel = new DealIntelligence({ databaseUrl: "ignored", sql });
    const result = await intel.getApplicableFlags(BASE_DEAL_ID);
    assertEqual(result.length, 0, "0 admitted");
    assertEqual(state.insertedRejections.length, 0, "no rejections");
    await intel.close();
  }
  console.log(`      OK — no raised flags → clean empty result`);

  return n;
}

async function main(): Promise<void> {
  console.log(
    "DealIntelligence.getApplicable{Patterns,Experiments,Flags} — Phase 4 Day 1 Session B\n",
  );

  console.log("── Suite 1: getApplicablePatterns ─────────────────────");
  const p = await suitePatterns();
  console.log("");
  console.log("── Suite 2: getApplicableExperiments ──────────────────");
  const e = await suiteExperiments();
  console.log("");
  console.log("── Suite 3: getApplicableFlags ────────────────────────");
  const f = await suiteFlags();
  console.log("");

  const total = p + e + f;
  console.log(
    `getApplicable* methods: ALL ${total}/${total} CASES PASS (P=${p}, E=${e}, F=${f}).`,
  );
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
