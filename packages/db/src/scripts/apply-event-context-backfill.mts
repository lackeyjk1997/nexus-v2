/**
 * Phase 4 Day 1 Session A.5 — backfill `deal_events.event_context` for
 * Phase 3-era rows whose `vertical` field is null inside the jsonb.
 *
 * Bug background: Pre-Phase 3 Session 0-B's `DealIntelligence
 * .buildEventContext` read `dealPayload?.{vertical,stage,amount,
 * companyId}` directly on the top-level payload, but `hubspot_cache
 * .payload` stores the RAW HubSpot shape `{id, properties: {...},
 * associations: {...}}` per adapter.ts:1256. Result: every Phase 3-era
 * `event_context` jsonb row carried populated structure but null fields
 * inside. The schema-flip migration 0006 (Phase 4 Day 1 Session A) was
 * unaffected (column-level NOT NULL holds), but the §2.16.1 decision-2
 * preservation contract was value-empty.
 *
 * Backfill rationale: re-run the FIXED `buildEventContext(dealId, [])`
 * against current `hubspot_cache` state and UPDATE each affected row's
 * `event_context`. Approximate (current state ≈ event-time state for v2
 * demo since deals were created within ~5 days), strictly better than
 * permanent null. PRODUCTIZATION-NOTES.md "Historical analysis —
 * baseline + priming" Stage 3 reads HubSpot's deal-property history API
 * for accurate-at-event reconstruction; out of v2 demo scope.
 *
 * Idempotency: the candidate filter (`event_context->>'vertical' IS
 * NULL`) excludes already-backfilled rows. Re-runs are no-ops. The
 * filter is bug-specific (vertical-field nullness as the canary); it is
 * not a general validity check — future field-null regressions in other
 * event_context fields would need separate detection.
 *
 * Backfill write path: this script issues corrective UPDATEs directly
 * via raw SQL, NOT via a `DealIntelligence` write method. Guardrail 25
 * (DealIntelligence is the sole write surface for intelligence data)
 * covers NEW event writes; corrective UPDATEs to existing rows that were
 * written through the service originally with a writer-side bug are an
 * acceptable v2-demo exception. If Phase 5+ adds write-side audit-trail
 * mechanisms (e.g., `event_context_revisions` table or `corrected_at`
 * column), the backfill would need to participate. Parked as a
 * productization-arc consideration.
 *
 * Usage: pnpm --filter @nexus/db apply:event-context-backfill
 */
import postgres from "postgres";
import { config } from "dotenv";
import { resolve } from "node:path";

import { DealIntelligence } from "@nexus/shared";

config({ path: resolve(process.cwd(), "../../.env.local"), override: true });

const PHASE_3_ERA_FLOOR = "2026-04-22T00:00:00Z";
const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 1000;

type CandidateRow = {
  id: string;
  hubspot_deal_id: string;
  type: string;
};

async function main(): Promise<void> {
  let dbUrl = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!dbUrl) {
    console.error(
      "FATAL: neither DATABASE_URL nor DIRECT_URL set — cannot connect",
    );
    process.exit(1);
  }
  // Operational fallback per Phase 3 Day 4 Session B precedent
  // (pool-session.mts): when the transaction pooler (:6543) is at the
  // 200-client EMAXCONN cap, route through the session pooler (:5432)
  // which has its own pool. Pass `--session` to opt in.
  if (process.argv.includes("--session")) {
    const transformed = dbUrl.replace(":6543/", ":5432/");
    if (transformed !== dbUrl) {
      console.log(
        `[apply-event-context-backfill] --session flag: routing via session pooler ${new URL(transformed).host}`,
      );
      dbUrl = transformed;
    }
  }

  const sql = postgres(dbUrl, { max: 1, prepare: false });
  const dealIntel = new DealIntelligence({ databaseUrl: dbUrl, sql });

  let totalUpdated = 0;
  let totalSkipped = 0;
  const typeBreakdown: Map<string, number> = new Map();

  try {
    console.log(
      "[apply-event-context-backfill] Phase 4 Day 1 Session A.5 — buildEventContext field-null backfill",
    );
    console.log(
      `[apply-event-context-backfill] filter: event_context->>'vertical' IS NULL AND created_at >= ${PHASE_3_ERA_FLOOR}`,
    );

    const candidates = await sql<CandidateRow[]>`
      SELECT id, hubspot_deal_id, type FROM deal_events
       WHERE event_context->>'vertical' IS NULL
         AND created_at >= ${PHASE_3_ERA_FLOOR}
       ORDER BY created_at
    `;
    console.log(
      `[apply-event-context-backfill] candidates: ${candidates.length}`,
    );

    if (candidates.length === 0) {
      console.log(
        "[apply-event-context-backfill] no rows need backfill — exiting",
      );
      return;
    }

    // Cache buildEventContext result per dealId across the run — same
    // current-state cache resolves to the same context for every event
    // on that deal.
    const ctxCache: Map<
      string,
      Awaited<ReturnType<DealIntelligence["buildEventContext"]>>
    > = new Map();
    const skippedDeals: Set<string> = new Set();

    let batchN = 0;
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      batchN += 1;
      const batch = candidates.slice(i, i + BATCH_SIZE);

      // Group rows in this batch by hubspot_deal_id
      const byDeal: Map<string, CandidateRow[]> = new Map();
      for (const row of batch) {
        const list = byDeal.get(row.hubspot_deal_id) ?? [];
        list.push(row);
        byDeal.set(row.hubspot_deal_id, list);
      }

      let batchUpdated = 0;
      let batchSkipped = 0;
      const batchSamples: Array<{ dealId: string; eventContext: unknown }> = [];

      // Pre-compute event_context per dealId OUTSIDE the transaction. The
      // pooled client has max=1; reads inside `sql.begin()` would deadlock
      // against the held transaction connection. Reads here, writes below.
      for (const [dealId, rows] of byDeal) {
        if (skippedDeals.has(dealId)) {
          batchSkipped += rows.length;
          continue;
        }
        if (ctxCache.has(dealId)) continue;

        // Verify hubspot_cache exists for this deal before invoking
        // buildEventContext; null cache → all-null context, which is
        // worse than skipping.
        const cached = await sql<Array<{ exists: boolean }>>`
          SELECT EXISTS (
            SELECT 1 FROM hubspot_cache
             WHERE object_type = 'deal' AND hubspot_id = ${dealId}
          ) AS exists
        `;
        if (!cached[0]?.exists) {
          skippedDeals.add(dealId);
          batchSkipped += rows.length;
          console.error(
            JSON.stringify({
              event: "event_context_backfill_skip",
              reason: "no_hubspot_cache",
              dealId,
              affectedRows: rows.length,
              ts: new Date().toISOString(),
            }),
          );
          continue;
        }
        const ctx = await dealIntel.buildEventContext(dealId, []);
        ctxCache.set(dealId, ctx);
      }

      // Per-batch transaction: only UPDATEs. Partial failures roll back.
      await sql.begin(async (tx) => {
        for (const [dealId, rows] of byDeal) {
          if (skippedDeals.has(dealId)) continue;
          const ctx = ctxCache.get(dealId);
          if (!ctx) continue; // shouldn't happen — we just resolved above

          const rowIds = rows.map((r) => r.id);
          await tx`
            UPDATE deal_events
               SET event_context = ${tx.json(ctx as unknown as Parameters<typeof tx.json>[0])}
             WHERE id = ANY(${rowIds})
          `;
          batchUpdated += rows.length;

          for (const row of rows) {
            typeBreakdown.set(
              row.type,
              (typeBreakdown.get(row.type) ?? 0) + 1,
            );
          }

          if (batchSamples.length < 2) {
            batchSamples.push({ dealId, eventContext: ctx });
          }
        }
      });

      console.error(
        JSON.stringify({
          event: "event_context_backfill_batch",
          batch_n: batchN,
          rows_updated: batchUpdated,
          rows_skipped_no_cache: batchSkipped,
          sample_updated_event_context: batchSamples,
          ts: new Date().toISOString(),
        }),
      );
      totalUpdated += batchUpdated;
      totalSkipped += batchSkipped;

      // Rate-limit between batches (skip after last)
      if (i + BATCH_SIZE < candidates.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    console.log("");
    console.log(
      JSON.stringify(
        {
          event: "event_context_backfill_summary",
          total_candidates: candidates.length,
          total_updated: totalUpdated,
          total_skipped: totalSkipped,
          unique_deals_processed: ctxCache.size,
          unique_deals_skipped: skippedDeals.size,
          type_breakdown: Object.fromEntries(typeBreakdown),
          ts: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } finally {
    await dealIntel.close();
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error("apply-event-context-backfill FAILED:", e);
  process.exit(1);
});
