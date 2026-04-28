/**
 * Phase 4 Day 1 Session A.5 — MedVista spot-check after the
 * `event_context` backfill. Reads the 5 most recent `deal_events` rows
 * for MedVista (321972856545) and prints id + type + event_context so
 * the values can be verified against the kickoff's expected shape:
 * `{vertical: "healthcare", stageAtEvent: "discovery", dealSizeBand:
 * "1m-5m", employeeCountBand: "1k-5k", activeExperimentAssignments: []}`.
 *
 * Read-only; safe to re-run. Pairs with audit-event-context-fields.mts
 * which counts the bug surface; this script verifies VALUE correctness
 * for a sample.
 *
 * Usage: pnpm --filter @nexus/db exec tsx src/scripts/spot-check-event-context.mts
 */
import postgres from "postgres";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "../../.env.local"), override: true });

const MEDVISTA_DEAL_ID = "321972856545";

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!dbUrl) {
    console.error("FATAL: neither DATABASE_URL nor DIRECT_URL set");
    process.exit(1);
  }
  const sql = postgres(dbUrl, { max: 1, prepare: false });
  try {
    const rows = await sql<
      Array<{
        id: string;
        type: string;
        created_at: Date;
        event_context: unknown;
      }>
    >`
      SELECT id, type, created_at, event_context
        FROM deal_events
       WHERE hubspot_deal_id = ${MEDVISTA_DEAL_ID}
       ORDER BY created_at DESC
       LIMIT 5
    `;
    console.log(JSON.stringify(
      {
        event: "spot_check_event_context",
        deal_id: MEDVISTA_DEAL_ID,
        rows: rows.map((r) => ({
          id: r.id,
          type: r.type,
          created_at: r.created_at instanceof Date
            ? r.created_at.toISOString()
            : String(r.created_at),
          event_context: r.event_context,
        })),
        ts: new Date().toISOString(),
      },
      null,
      2,
    ));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error("spot-check-event-context failed:", e);
  process.exit(1);
});
