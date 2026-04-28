/**
 * Phase 4 Day 1 Session A.5 — bug-scope audit for the `buildEventContext`
 * Phase 3-era field-null bug.
 *
 * Counts Phase 3-era `deal_events` rows where `event_context->>'vertical'
 * IS NULL` AND `created_at >= '2026-04-22T00:00:00Z'`. Used as Preflight 10
 * (pre-backfill bug surface) AND Item 4 verification (post-backfill
 * re-audit).
 *
 * Filter rationale (per Session A.5 kickoff Decision 3): vertical-field
 * nullness is the canary for the buildEventContext bug. Future field-null
 * regressions in other event_context fields (dealSizeBand,
 * employeeCountBand, stageAtEvent) would need separate detection — this
 * filter is bug-specific, not a general validity check.
 *
 * Idempotent + read-only. Re-runnable.
 *
 * Usage: pnpm --filter @nexus/db exec tsx src/scripts/audit-event-context-fields.mts
 */
import postgres from "postgres";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "../../.env.local"), override: true });

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!dbUrl) {
    console.error("FATAL: neither DATABASE_URL nor DIRECT_URL set");
    process.exit(1);
  }
  const sql = postgres(dbUrl, { max: 1, prepare: false });
  try {
    const total = await sql<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM deal_events
       WHERE created_at >= '2026-04-22T00:00:00Z'
    `;
    const fieldNull = await sql<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM deal_events
       WHERE created_at >= '2026-04-22T00:00:00Z'
         AND event_context->>'vertical' IS NULL
    `;
    const byType = await sql<Array<{ type: string; n: number }>>`
      SELECT type, COUNT(*)::int AS n FROM deal_events
       WHERE created_at >= '2026-04-22T00:00:00Z'
         AND event_context->>'vertical' IS NULL
       GROUP BY type
       ORDER BY n DESC
    `;
    const byDeal = await sql<Array<{ hubspot_deal_id: string; n: number }>>`
      SELECT hubspot_deal_id, COUNT(*)::int AS n FROM deal_events
       WHERE created_at >= '2026-04-22T00:00:00Z'
         AND event_context->>'vertical' IS NULL
       GROUP BY hubspot_deal_id
       ORDER BY n DESC
    `;

    console.log(JSON.stringify({
      event: "event_context_field_audit",
      filter: "created_at >= 2026-04-22 AND event_context->>'vertical' IS NULL",
      total_phase_3_era_rows: total[0]?.n ?? 0,
      vertical_null_rows: fieldNull[0]?.n ?? 0,
      by_type: byType.map((r) => ({ type: r.type, n: r.n })),
      by_deal: byDeal.map((r) => ({ hubspot_deal_id: r.hubspot_deal_id, n: r.n })),
      ts: new Date().toISOString(),
    }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error("audit-event-context-fields failed:", e);
  process.exit(1);
});
