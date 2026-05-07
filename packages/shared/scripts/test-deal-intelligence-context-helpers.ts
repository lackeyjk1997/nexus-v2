/**
 * DealIntelligence context-helpers unit tests — Phase 4 Day 4.
 *
 * Covers four helpers feeding the coordinator_synthesis prompt:
 *   - getActiveManagerDirectives  (manager_directives JSONB scope filter +
 *                                  priority CASE ORDER BY)
 *   - getSystemIntelligence       (system_intelligence status='active' +
 *                                  vertical filter; signalType param parked)
 *   - getAtRiskComparableDeals    (through-adapter; vertical + active stage +
 *                                  exclude dealIds)
 *   - getExperimentsForVertical   (lifecycle IN ('active', 'graduated') +
 *                                  vertical filter; reconciles handoff drift)
 *
 * Mocks `sql` via the `{databaseUrl, sql}` injection seam and `adapter` via
 * a captured Pick<CrmAdapter, "listDeals">. Asserts SQL SHAPE (load-bearing
 * filter clauses) + return SHAPE per Decision 11.
 *
 * Usage:
 *   pnpm --filter @nexus/shared test:deal-intelligence-context-helpers
 */
import type postgres from "postgres";

import { DealIntelligence } from "@nexus/shared";
import type { CrmAdapter, Deal } from "@nexus/shared";

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

interface CapturedQuery {
  text: string;
  values: unknown[];
}

interface MockState {
  capturedQueries: CapturedQuery[];
}

function makeCapturingSql(returns: {
  managerDirectives?: unknown[];
  systemIntelligence?: unknown[];
  experiments?: unknown[];
}): { sql: postgres.Sql; state: MockState } {
  const state: MockState = { capturedQueries: [] };
  const fn = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    state.capturedQueries.push({ text, values });
    if (text.includes("FROM manager_directives")) {
      return Promise.resolve(returns.managerDirectives ?? []);
    }
    if (text.includes("FROM system_intelligence")) {
      return Promise.resolve(returns.systemIntelligence ?? []);
    }
    if (text.includes("FROM experiments")) {
      return Promise.resolve(returns.experiments ?? []);
    }
    throw new Error(`Mock sql: unrecognized query: ${text.slice(0, 120)}`);
  }) as unknown as postgres.Sql & { json: (v: unknown) => unknown };
  (fn as unknown as { json: (v: unknown) => unknown }).json = (v) => v;
  return { sql: fn as postgres.Sql, state };
}

function makeCapturingAdapter(deals: Deal[]): {
  adapter: Pick<CrmAdapter, "listDeals">;
  capturedFilters: Array<Parameters<CrmAdapter["listDeals"]>[0]>;
} {
  const capturedFilters: Array<Parameters<CrmAdapter["listDeals"]>[0]> = [];
  return {
    adapter: {
      async listDeals(filters) {
        capturedFilters.push(filters);
        return deals;
      },
    },
    capturedFilters,
  };
}

// ── Cases ─────────────────────────────────────────────────────────────

async function case1_getActiveManagerDirectives_empty() {
  console.log("CASE 1 — getActiveManagerDirectives empty → []; SQL has is_active + scope filter…");
  const { sql, state } = makeCapturingSql({ managerDirectives: [] });
  const di = new DealIntelligence({ databaseUrl: "", sql });
  const result = await di.getActiveManagerDirectives({ vertical: "healthcare" });
  assertEqual(result.length, 0, "empty returns []");
  assertEqual(state.capturedQueries.length, 1, "exactly one query issued");
  const q = state.capturedQueries[0]!.text;
  assert(q.includes("is_active = true"), "SQL filters is_active = true");
  assert(q.includes("scope->>'vertical'"), "SQL reads scope JSONB vertical key");
  assert(q.includes("CASE priority"), "SQL uses CASE on priority for ORDER BY");
  assert(q.includes("'urgent'"), "SQL CASE includes 'urgent' (not 'critical')");
  assert(!q.includes("'critical'"), "SQL CASE does NOT include 'critical' (canonical enum is urgent)");
  console.log("      OK — empty result; SQL shape includes is_active, scope JSONB, priority CASE with 'urgent'");
}

async function case2_getActiveManagerDirectives_vertical_and_orgwide() {
  console.log("CASE 2 — getActiveManagerDirectives surfaces both vertical-scoped + null-vertical (org-wide)…");
  const fixtures = [
    {
      id: "dir-1",
      directive_text: "Healthcare-specific: cap discount at 12%",
      priority: "urgent",
      category: "discount",
      author_id: "user-1",
      created_at: new Date("2026-04-01T00:00:00Z"),
    },
    {
      id: "dir-2",
      directive_text: "Org-wide: no security questionnaire bypass",
      priority: "high",
      category: "compliance",
      author_id: "user-2",
      created_at: new Date("2026-03-20T00:00:00Z"),
    },
  ];
  const { sql } = makeCapturingSql({ managerDirectives: fixtures });
  const di = new DealIntelligence({ databaseUrl: "", sql });
  const result = await di.getActiveManagerDirectives({ vertical: "healthcare" });
  assertEqual(result.length, 2, "both rows returned");
  assertEqual(result[0]!.priority, "urgent", "first row priority");
  assertEqual(result[0]!.directiveText, "Healthcare-specific: cap discount at 12%", "first row text");
  assertEqual(result[1]!.priority, "high", "second row priority");
  console.log("      OK — both vertical-scoped + org-wide directives surfaced; priorities preserved");
}

async function case3_getSystemIntelligence_empty_and_status_filter() {
  console.log("CASE 3 — getSystemIntelligence empty → []; SQL has status='active'…");
  const { sql, state } = makeCapturingSql({ systemIntelligence: [] });
  const di = new DealIntelligence({ databaseUrl: "", sql });
  const result = await di.getSystemIntelligence({ vertical: "healthcare" });
  assertEqual(result.length, 0, "empty returns []");
  const q = state.capturedQueries[0]!.text;
  assert(q.includes("status = 'active'"), "SQL filters status = 'active'");
  assert(q.includes("relevance_score DESC"), "SQL orders by relevance_score DESC");
  assert(q.includes("NULLS LAST"), "SQL includes NULLS LAST");
  console.log("      OK — empty result; SQL shape includes status='active' + relevance_score NULLS LAST");
}

async function case4_getSystemIntelligence_signalType_parked_forwardcompat() {
  console.log("CASE 4 — getSystemIntelligence accepts signalType param but does NOT filter on it (forward-compat)…");
  const fixtures = [
    {
      id: "si-1",
      title: "Healthcare buyer pricing pressure trend",
      insight: "Q4 healthcare deals are pricing-sensitive due to budget freezes.",
      insight_type: "vertical_trend",
      confidence: "0.82",
      relevance_score: "92.50",
      vertical: "healthcare",
    },
  ];
  const { sql, state } = makeCapturingSql({ systemIntelligence: fixtures });
  const di = new DealIntelligence({ databaseUrl: "", sql });
  const result = await di.getSystemIntelligence({
    vertical: "healthcare",
    signalType: "competitive_intel",
  });
  assertEqual(result.length, 1, "row returned");
  assertEqual(result[0]!.confidence, 0.82, "confidence parsed to number");
  assertEqual(result[0]!.relevanceScore, 92.5, "relevanceScore parsed to number");
  // Critical assertion: signalType should NOT be referenced in the SQL.
  const q = state.capturedQueries[0]!.text;
  assert(!q.includes("signal_type"), "SQL does NOT filter on signal_type (forward-compat parking)");
  console.log("      OK — signalType accepted but unused; decimal columns parsed to number");
}

function makeDealFixture(
  hubspotId: string,
  name: string,
  stage: Deal["stage"],
  amount: number,
  ownerId: string,
): Deal {
  return {
    hubspotId,
    name,
    companyId: null,
    primaryContactId: null,
    ownerId,
    bdrOwnerId: null,
    saOwnerId: null,
    stage,
    amount,
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

async function case5_getAtRiskComparableDeals_excludes_and_filters_active() {
  console.log("CASE 5 — getAtRiskComparableDeals excludes given dealIds + filters closed deals…");
  const deals: Deal[] = [
    makeDealFixture("deal-A", "Excluded Deal A", "discovery", 1_000_000, "owner-1"),
    makeDealFixture("deal-B", "Open Deal B", "negotiation", 750_000, "owner-2"),
    makeDealFixture("deal-C", "Closed Deal C", "closed_won", 500_000, "owner-3"),
    makeDealFixture("deal-D", "Closed Deal D", "closed_lost", 800_000, "owner-4"),
  ];
  const { sql } = makeCapturingSql({});
  const { adapter, capturedFilters } = makeCapturingAdapter(deals);
  const di = new DealIntelligence({ databaseUrl: "", sql });
  const result = await di.getAtRiskComparableDeals({
    vertical: "healthcare",
    signalType: "competitive_intel",
    excludeDealIds: ["deal-A"],
    adapter,
  });
  assertEqual(capturedFilters.length, 1, "adapter.listDeals called once");
  assertEqual(capturedFilters[0]?.vertical, "healthcare", "adapter received vertical filter");
  assertEqual(result.length, 1, "exactly 1 deal qualifies");
  assertEqual(result[0]!.hubspotDealId, "deal-B", "qualifying deal is deal-B");
  assertEqual(result[0]!.aeName, "owner-2", "owner surfaced as aeName");
  assert(result[0]!.atRiskReason.includes("healthcare"), "atRiskReason references vertical");
  assert(result[0]!.atRiskReason.includes("competitive_intel"), "atRiskReason references signalType");
  console.log("      OK — excluded dealIds + closed deals filtered; only deal-B surfaced");
}

async function case6_getAtRiskComparableDeals_empty_returns_empty_array() {
  console.log("CASE 6 — getAtRiskComparableDeals when adapter returns [] → []…");
  const { sql } = makeCapturingSql({});
  const { adapter } = makeCapturingAdapter([]);
  const di = new DealIntelligence({ databaseUrl: "", sql });
  const result = await di.getAtRiskComparableDeals({
    vertical: "healthcare",
    signalType: "competitive_intel",
    excludeDealIds: [],
    adapter,
  });
  assertEqual(result.length, 0, "empty returns []");
  console.log("      OK — adapter returns no deals → helper returns []");
}

async function case7_getExperimentsForVertical_lifecycle_filter() {
  console.log("CASE 7 — getExperimentsForVertical SQL filters lifecycle IN ('active', 'graduated')…");
  const { sql, state } = makeCapturingSql({ experiments: [] });
  const di = new DealIntelligence({ databaseUrl: "", sql });
  const result = await di.getExperimentsForVertical({ vertical: "healthcare" });
  assertEqual(result.length, 0, "empty returns []");
  const q = state.capturedQueries[0]!.text;
  assert(
    q.includes("lifecycle IN ('active', 'graduated')"),
    "SQL filters lifecycle IN ('active', 'graduated')",
  );
  assert(!q.includes("'testing'"), "SQL does NOT include 'testing' (handoff drift; reconciled per Decision 8(i))");
  assert(!q.includes("'proposed'"), "SQL excludes 'proposed' lifecycle");
  assert(!q.includes("'killed'"), "SQL excludes 'killed' lifecycle");
  console.log("      OK — SQL shape correct; testing/proposed/killed excluded");
}

async function case8_getExperimentsForVertical_returns_typed_rows() {
  console.log("CASE 8 — getExperimentsForVertical surfaces vertical-scoped + cross-vertical rows…");
  const fixtures = [
    {
      id: "exp-1",
      title: "Microsoft DAX battlecard",
      hypothesis: "Reps with battlecard close 15% more healthcare deals.",
      description: "Active in healthcare only.",
      lifecycle: "active",
      vertical: "healthcare",
    },
    {
      id: "exp-2",
      title: "TCO-led discovery",
      hypothesis: "TCO-anchored discovery surfaces budget early.",
      description: "Cross-vertical (vertical=null).",
      lifecycle: "graduated",
      vertical: null,
    },
  ];
  const { sql } = makeCapturingSql({ experiments: fixtures });
  const di = new DealIntelligence({ databaseUrl: "", sql });
  const result = await di.getExperimentsForVertical({ vertical: "healthcare" });
  assertEqual(result.length, 2, "both rows returned");
  assertEqual(result[0]!.lifecycle, "active", "first row lifecycle");
  assertEqual(result[0]!.vertical, "healthcare", "first row vertical");
  assertEqual(result[1]!.lifecycle, "graduated", "second row lifecycle");
  assertEqual(result[1]!.vertical, null, "cross-vertical surfaced (vertical=null)");
  console.log("      OK — both vertical-scoped + cross-vertical experiments surfaced");
}

async function main() {
  await case1_getActiveManagerDirectives_empty();
  await case2_getActiveManagerDirectives_vertical_and_orgwide();
  await case3_getSystemIntelligence_empty_and_status_filter();
  await case4_getSystemIntelligence_signalType_parked_forwardcompat();
  await case5_getAtRiskComparableDeals_excludes_and_filters_active();
  await case6_getAtRiskComparableDeals_empty_returns_empty_array();
  await case7_getExperimentsForVertical_lifecycle_filter();
  await case8_getExperimentsForVertical_returns_typed_rows();
  console.log("\nDealIntelligence context helpers: ALL 8/8 CASES PASS.");
}

main().catch((err) => {
  console.error("test:deal-intelligence-context-helpers FAILED:", err);
  process.exit(1);
});
