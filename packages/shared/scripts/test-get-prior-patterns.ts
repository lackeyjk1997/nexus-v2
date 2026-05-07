/**
 * IntelligenceCoordinator.getPriorPatterns unit tests — Phase 4 Day 4.
 *
 * 3 cases per Decision 11:
 *   1. empty → []; SQL includes status IN ('synthesized', 'expired')
 *   2. 'detected'-status rows excluded (those are this-run candidates,
 *      not lineage)
 *   3. sinceDays cutoff applied; SQL has the make_interval clause
 *
 * Asserts SQL SHAPE (load-bearing filter clauses) + return SHAPE.
 *
 * Usage:
 *   pnpm --filter @nexus/shared test:get-prior-patterns
 */
import type postgres from "postgres";

import { IntelligenceCoordinator } from "@nexus/shared";

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

function makeCapturingSql(rows: unknown[]): {
  sql: postgres.Sql;
  state: MockState;
} {
  const state: MockState = { capturedQueries: [] };
  const fn = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    state.capturedQueries.push({ text, values });
    return Promise.resolve(rows);
  }) as unknown as postgres.Sql & { json: (v: unknown) => unknown };
  (fn as unknown as { json: (v: unknown) => unknown }).json = (v) => v;
  return { sql: fn as postgres.Sql, state };
}

async function case1_empty_and_status_filter() {
  console.log("CASE 1 — empty rows → []; SQL filters status IN ('synthesized', 'expired')…");
  const { sql, state } = makeCapturingSql([]);
  const ic = new IntelligenceCoordinator({ databaseUrl: "", sql });
  const result = await ic.getPriorPatterns({
    signalType: "competitive_intel",
    vertical: "healthcare",
  });
  assertEqual(result.length, 0, "empty returns []");
  const q = state.capturedQueries[0]!.text;
  assert(
    q.includes("status IN ('synthesized', 'expired')"),
    "SQL filters status IN ('synthesized', 'expired')",
  );
  assert(!q.includes("'detected'"), "SQL excludes 'detected' status (those are this-run candidates)");
  assert(q.includes("make_interval"), "SQL uses make_interval for sinceDays cutoff");
  console.log("      OK — empty result + SQL shape correct (status filter + make_interval)");
}

async function case2_detected_excluded_synthesized_and_expired_returned() {
  console.log("CASE 2 — only 'synthesized' + 'expired' rows surface (the SQL filter on status excludes 'detected')…");
  // The mock sql ignores the actual SQL filter and returns whatever rows it's
  // given — so the assertion here is about the SQL TEXT (status filter)
  // rather than about row filtering. The handler trusts the database to
  // honor the filter; the unit test verifies the filter is in the SQL.
  // Additionally, return both 'synthesized' and 'expired' rows to verify
  // the helper accepts both as valid lineage statuses.
  const fixtures = [
    {
      id: "pat-1",
      detected_at: new Date("2026-04-01T00:00:00Z"),
      synthesized_at: new Date("2026-04-01T01:00:00Z"),
      synthesis: "Microsoft DAX Q-end pricing pressure across healthcare deals.\n\nMechanism:\nThree healthcare AEs cited Microsoft 25% discount in past 10 days.",
      status: "synthesized",
    },
    {
      id: "pat-2",
      detected_at: new Date("2026-02-15T00:00:00Z"),
      synthesized_at: new Date("2026-02-15T02:00:00Z"),
      synthesis: "Salesforce healthcare expansion play.\n\nMechanism:\nSF reps targeting same buyers with healthcare-specific bundles.",
      status: "expired",
    },
  ];
  const { sql, state } = makeCapturingSql(fixtures);
  const ic = new IntelligenceCoordinator({ databaseUrl: "", sql });
  const result = await ic.getPriorPatterns({
    signalType: "competitive_intel",
    vertical: "healthcare",
  });
  assertEqual(result.length, 2, "both rows returned");
  assertEqual(result[0]!.status, "synthesized", "first row status");
  assertEqual(result[1]!.status, "expired", "second row status");
  // synthesis split assertion
  assertEqual(
    result[0]!.synthesisHeadline,
    "Microsoft DAX Q-end pricing pressure across healthcare deals.",
    "headline split correctly",
  );
  assert(
    result[0]!.mechanism.startsWith("Three healthcare AEs"),
    "mechanism split correctly",
  );
  // SQL text assertion
  const q = state.capturedQueries[0]!.text;
  assert(q.includes("'synthesized'"), "SQL includes 'synthesized'");
  assert(q.includes("'expired'"), "SQL includes 'expired'");
  console.log("      OK — both lineage-status rows surfaced; synthesis split into headline+mechanism");
}

async function case3_sinceDays_default_and_override() {
  console.log("CASE 3 — sinceDays default 90 + custom override applied…");
  // Default sinceDays
  const { sql: sql1, state: state1 } = makeCapturingSql([]);
  const ic1 = new IntelligenceCoordinator({ databaseUrl: "", sql: sql1 });
  await ic1.getPriorPatterns({ signalType: "competitive_intel", vertical: "healthcare" });
  const interpolated1 = state1.capturedQueries[0]!.values;
  assert(interpolated1.includes(90), "default sinceDays=90 interpolated");

  // Custom override
  const { sql: sql2, state: state2 } = makeCapturingSql([]);
  const ic2 = new IntelligenceCoordinator({ databaseUrl: "", sql: sql2 });
  await ic2.getPriorPatterns({
    signalType: "competitive_intel",
    vertical: "healthcare",
    sinceDays: 30,
  });
  const interpolated2 = state2.capturedQueries[0]!.values;
  assert(interpolated2.includes(30), "custom sinceDays=30 interpolated");
  console.log("      OK — sinceDays default 90 + custom override both honored");
}

async function main() {
  await case1_empty_and_status_filter();
  await case2_detected_excluded_synthesized_and_expired_returned();
  await case3_sinceDays_default_and_override();
  console.log("\nIntelligenceCoordinator.getPriorPatterns: ALL 3/3 CASES PASS.");
}

main().catch((err) => {
  console.error("test:get-prior-patterns FAILED:", err);
  process.exit(1);
});
