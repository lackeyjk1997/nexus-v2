/**
 * IntelligenceCoordinator.getActivePatterns unit tests — Phase 4 Day 2 Session A.
 *
 * 5 cases per kickoff Decision 9:
 *   [1] no patterns → empty result
 *   [2] only detected status → returned
 *   [3] only synthesized status → returned
 *   [4] mixed (detected + synthesized + expired) → expired filtered out
 *   [5] vertical filter applied → only matching vertical returned
 *
 * No DB; no Claude; deterministic. Mocks the `sql` parameter via the
 * `{databaseUrl, sql}` injection seam by feeding queries through a
 * SQL-text-based dispatcher.
 *
 * Usage:
 *   pnpm --filter @nexus/shared test:coordinator-active-patterns
 */
import type postgres from "postgres";

import { IntelligenceCoordinator, type ActivePatternSummary } from "@nexus/shared";

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
// getActivePatterns issues one query shape:
//   SELECT cp.id, cp.signal_type, cp.vertical, cp.synthesis,
//          (SELECT COUNT(*)::int FROM coordinator_pattern_deals
//            WHERE pattern_id = cp.id) AS deal_count
//     FROM coordinator_patterns cp
//    WHERE cp.status IN ('detected', 'synthesized')
//      AND (verticalFilter::vertical IS NULL OR cp.vertical = verticalFilter)
//      AND (signalTypeFilter::signal_taxonomy IS NULL OR cp.signal_type = signalTypeFilter)
//      AND (dealIdsFilterIsNull::boolean OR EXISTS (...))
//    ORDER BY cp.detected_at DESC
//
// The mock pre-applies the WHERE filters in JS so the assertion is on
// the rows the service maps. Values are read from the interpolated args.

interface PatternRow {
  id: string;
  signal_type: string;
  vertical: string | null;
  synthesis: string;
  deal_count: number;
  status: "detected" | "synthesized" | "expired";
  detected_at: number; // ms timestamp for sorting
}

function makeMockSql(rows: readonly PatternRow[]): postgres.Sql {
  const fn = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sqlText = strings.join("?");
    if (!sqlText.includes("FROM coordinator_patterns cp")) {
      throw new Error(`Mock sql: unrecognized query: ${sqlText.slice(0, 200)}`);
    }
    // Values per interpolation order in service:
    //   ${verticalFilter}, ${verticalFilter}, ${signalTypeFilter},
    //   ${signalTypeFilter}, ${dealIdsFilter === null}, ${dealIdsFilter ?? []}
    const verticalArg = values[0] as string | null;
    const signalTypeArg = values[2] as string | null;
    const dealIdsIsNullArg = values[4] as boolean;
    const dealIdsArrayArg = (values[5] as readonly string[]) ?? [];

    const filtered = rows
      .filter((r) => r.status === "detected" || r.status === "synthesized")
      .filter((r) => verticalArg == null || r.vertical === verticalArg)
      .filter((r) => signalTypeArg == null || r.signal_type === signalTypeArg)
      .filter((r) => dealIdsIsNullArg || dealIdsArrayArg.length > 0)
      .sort((a, b) => b.detected_at - a.detected_at);

    return Promise.resolve(
      filtered.map((r) => ({
        id: r.id,
        signal_type: r.signal_type,
        vertical: r.vertical,
        synthesis: r.synthesis,
        deal_count: r.deal_count,
      })),
    );
  };
  return fn as unknown as postgres.Sql;
}

function makeCoord(rows: readonly PatternRow[]): IntelligenceCoordinator {
  return new IntelligenceCoordinator({
    databaseUrl: "ignored://test",
    sql: makeMockSql(rows),
  });
}

// ── Cases ─────────────────────────────────────────────────────────────

async function main() {
  // [1] No patterns → empty result.
  {
    console.log("[1] no patterns → empty result…");
    const coord = makeCoord([]);
    const result = await coord.getActivePatterns();
    assertEqual(result.length, 0, "result length");
    console.log("      OK — empty fixture → empty result");
  }

  // [2] Only detected status.
  {
    console.log("[2] only detected status returned…");
    const rows: PatternRow[] = [
      {
        id: "p-detected-1",
        signal_type: "competitive_intel",
        vertical: "healthcare",
        synthesis: "Microsoft DAX pricing pressure across three deals.",
        deal_count: 3,
        status: "detected",
        detected_at: 1_000,
      },
    ];
    const coord = makeCoord(rows);
    const result = await coord.getActivePatterns();
    assertEqual(result.length, 1, "result length");
    assertEqual(result[0]!.patternId, "p-detected-1", "patternId");
    assertEqual(result[0]!.signalType, "competitive_intel", "signalType");
    assertEqual(result[0]!.dealCount, 3, "dealCount");
    assertEqual(
      result[0]!.synthesisHeadline,
      "Microsoft DAX pricing pressure across three deals.",
      "synthesisHeadline",
    );
    console.log("      OK — detected pattern surfaces");
  }

  // [3] Only synthesized status.
  {
    console.log("[3] only synthesized status returned…");
    const rows: PatternRow[] = [
      {
        id: "p-synth-1",
        signal_type: "deal_blocker",
        vertical: "financial_services",
        synthesis: "Procurement cycle slipping across NA finance deals.\nFollowup actions...",
        deal_count: 4,
        status: "synthesized",
        detected_at: 2_000,
      },
    ];
    const coord = makeCoord(rows);
    const result = await coord.getActivePatterns();
    assertEqual(result.length, 1, "result length");
    assertEqual(result[0]!.patternId, "p-synth-1", "patternId");
    // headline should slice at the first newline.
    assertEqual(
      result[0]!.synthesisHeadline,
      "Procurement cycle slipping across NA finance deals.",
      "synthesisHeadline takes first line",
    );
    console.log("      OK — synthesized pattern surfaces; headline truncated");
  }

  // [4] Mixed: detected + synthesized + expired → expired filtered out, ordered.
  {
    console.log("[4] mixed statuses → expired filtered, ordered desc…");
    const rows: PatternRow[] = [
      {
        id: "p-old-detected",
        signal_type: "competitive_intel",
        vertical: "healthcare",
        synthesis: "old pattern",
        deal_count: 2,
        status: "detected",
        detected_at: 500,
      },
      {
        id: "p-expired",
        signal_type: "process_friction",
        vertical: "healthcare",
        synthesis: "expired pattern",
        deal_count: 5,
        status: "expired",
        detected_at: 600,
      },
      {
        id: "p-newest-synth",
        signal_type: "win_pattern",
        vertical: "healthcare",
        synthesis: "fresh synthesis",
        deal_count: 7,
        status: "synthesized",
        detected_at: 9_999,
      },
    ];
    const coord = makeCoord(rows);
    const result = await coord.getActivePatterns();
    assertEqual(result.length, 2, "result length (expired filtered)");
    assertEqual(result[0]!.patternId, "p-newest-synth", "newest first");
    assertEqual(result[1]!.patternId, "p-old-detected", "older second");
    const ids = result.map((r: ActivePatternSummary) => r.patternId);
    assert(!ids.includes("p-expired"), "expired pattern absent");
    console.log("      OK — expired filtered; ordered by detected_at desc");
  }

  // [5] Vertical filter applied.
  {
    console.log("[5] vertical filter applied…");
    const rows: PatternRow[] = [
      {
        id: "p-hc",
        signal_type: "competitive_intel",
        vertical: "healthcare",
        synthesis: "healthcare pattern",
        deal_count: 2,
        status: "detected",
        detected_at: 1_000,
      },
      {
        id: "p-fs",
        signal_type: "competitive_intel",
        vertical: "financial_services",
        synthesis: "fs pattern",
        deal_count: 3,
        status: "detected",
        detected_at: 2_000,
      },
    ];
    const coord = makeCoord(rows);
    const result = await coord.getActivePatterns({ vertical: "healthcare" });
    assertEqual(result.length, 1, "result length filtered");
    assertEqual(result[0]!.patternId, "p-hc", "only healthcare");
    console.log("      OK — vertical filter applied correctly");
  }

  console.log("\nIntelligenceCoordinator.getActivePatterns: ALL 5/5 CASES PASS.");
}

main().catch((err) => {
  console.error("test:coordinator-active-patterns FAILED:", err);
  process.exit(1);
});
