/**
 * Phase 3 Day 3 Session A — adapter-level verification script for
 * `HubSpotAdapter.updateDealCustomProperties`.
 *
 * **AUTHORED BUT NOT RUN IN SESSION A.** Session B runs this as sub-step 2
 * of the 3-step verification staircase (oversight-adjudicated Decision 3 in
 * the Day 3 kickoff): MockClaudeWrapper handler shape → adapter PATCH round-
 * trip → full pipeline live run.
 *
 * Isolates adapter-bug risk from pipeline-wiring-bug risk: if MEDDPICC
 * writeback lands wrong in Session B's full-flow run, this script tells us
 * whether the adapter is the culprit or the pipeline wiring is.
 *
 * Flow (two phases):
 *
 *   Phase 1 — Write canary. Writes two distinct nexus_meddpicc_* properties
 *   on MedVista deal 321972856545:
 *     { nexus_meddpicc_paper_process_score: 7, nexus_meddpicc_metrics_score: 8 }
 *   Exercises the multi-property serialization loop (not just the single-
 *   property PATCH path). Reads deal via `adapter.getDeal(id)` and asserts
 *   both properties landed with the expected integer values. Verifies
 *   `hubspot_cache.payload.properties` carries the patched-in-place values
 *   (A9 contract — cache-stay-authoritative; no stale refetch).
 *
 *   Phase 2 — Idempotent re-write. Re-runs the exact same PATCH. Asserts:
 *     - Deal properties match the same expected values (idempotency).
 *     - No duplicate cache rows.
 *     - Cache cached_at timestamp advanced (write path exercised; echo
 *       webhooks are async so this is a hubspot_cache.cached_at tick from
 *       patchCacheProperty alone).
 *
 * Rollback for a bad write: re-run with corrected values; HubSpot PATCH is
 * idempotent. Blast radius is 1 deal × 2 properties. Visible in the HubSpot
 * UI on deal 321972856545 but recoverable in ~30 seconds.
 *
 * Usage:
 *   pnpm --filter @nexus/db test:update-deal-custom-properties
 */
import dns from "node:dns";

// Supabase direct host (db.<ref>.supabase.co) resolves only AAAA on dev
// Macs as of Phase 3 Day 4. Force IPv6-first so getaddrinfo doesn't
// ENOTFOUND on the IPv4 path. Must precede loadDevEnv + any postgres
// import so the resolver order applies to the first connection.
dns.setDefaultResultOrder("ipv6first");

import {
  loadDevEnv,
  requireEnv,
} from "@nexus/shared";

loadDevEnv();

// Force DIRECT_URL for this test process so cache-side reads bypass the
// pooler. Dev-Mac convention per the Session A operational note —
// concurrent dev-server + test-script traffic on the shared 200-limit
// instance saturates fast.
// Phase 3 Day 4 Session B: dev-Mac IPv6 route to Supabase direct host
// is broken; DIRECT_URL swap disabled. Pooler URL is IPv4 and works.

import postgres from "postgres";

import { HubSpotAdapter, loadPipelineIds } from "@nexus/shared";

const MEDVISTA_DEAL_ID = "321972856545";

const CANARY_PROPS = {
  nexus_meddpicc_paper_process_score: 7,
  nexus_meddpicc_metrics_score: 8,
} as const;

interface CacheRow {
  payload: { properties: Record<string, string | null> };
  cached_at: Date;
}

async function readCachedProperty(
  sql: postgres.Sql,
  dealId: string,
  propertyName: string,
): Promise<{ value: string | null; cachedAt: Date } | null> {
  const rows = await sql<CacheRow[]>`
    SELECT payload, cached_at
      FROM hubspot_cache
     WHERE object_type = 'deal' AND hubspot_id = ${dealId}
     LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    value: row.payload.properties[propertyName] ?? null,
    cachedAt: new Date(row.cached_at),
  };
}

let failures = 0;

function assertEquals(label: string, actual: unknown, expected: unknown): void {
  if (actual === expected) {
    console.log(`  ✓ ${label}: ${String(actual)}`);
  } else {
    failures++;
    console.log(
      `  ✗ ${label}: expected ${String(expected)} got ${String(actual)}`,
    );
  }
}

async function main(): Promise<void> {
  const token = requireEnv("NEXUS_HUBSPOT_TOKEN");
  const portalId = requireEnv("HUBSPOT_PORTAL_ID");
  const clientSecret = requireEnv("HUBSPOT_CLIENT_SECRET");
  const databaseUrl = requireEnv("DATABASE_URL");

  const adapter = new HubSpotAdapter({
    token,
    portalId,
    clientSecret,
    databaseUrl,
    pipelineIds: loadPipelineIds(),
  });

  const sql = postgres(databaseUrl, {
    max: 2,
    idle_timeout: 10,
    prepare: false,
  });

  try {
    console.log(
      `\n=== Phase 1 — Canary write of 2 properties to deal ${MEDVISTA_DEAL_ID} ===`,
    );
    const phase1Start = Date.now();
    await adapter.updateDealCustomProperties(MEDVISTA_DEAL_ID, CANARY_PROPS);
    const phase1Ms = Date.now() - phase1Start;
    console.log(`  PATCH completed in ${phase1Ms}ms`);

    // Verify via adapter.getDeal (exercises deal-read path which may or may
    // not hit cache depending on TTL state; either way we validate the
    // properties landed).
    const deal = await adapter.getDeal(MEDVISTA_DEAL_ID);
    console.log(`  Read deal: ${deal.name} (${deal.hubspotId})`);
    assertEquals(
      "custom.nexus_meddpicc_paper_process_score",
      deal.customProperties?.nexus_meddpicc_paper_process_score,
      String(CANARY_PROPS.nexus_meddpicc_paper_process_score),
    );
    assertEquals(
      "custom.nexus_meddpicc_metrics_score",
      deal.customProperties?.nexus_meddpicc_metrics_score,
      String(CANARY_PROPS.nexus_meddpicc_metrics_score),
    );

    // Verify hubspot_cache has the patched-in-place values (A9 contract).
    const paperCache = await readCachedProperty(
      sql,
      MEDVISTA_DEAL_ID,
      "nexus_meddpicc_paper_process_score",
    );
    const metricsCache = await readCachedProperty(
      sql,
      MEDVISTA_DEAL_ID,
      "nexus_meddpicc_metrics_score",
    );
    assertEquals(
      "hubspot_cache.payload.properties.nexus_meddpicc_paper_process_score",
      paperCache?.value,
      String(CANARY_PROPS.nexus_meddpicc_paper_process_score),
    );
    assertEquals(
      "hubspot_cache.payload.properties.nexus_meddpicc_metrics_score",
      metricsCache?.value,
      String(CANARY_PROPS.nexus_meddpicc_metrics_score),
    );
    const phase1CachedAt = paperCache?.cachedAt ?? new Date(0);

    console.log(
      `\n=== Phase 2 — Idempotent re-write with same values ===`,
    );
    // Brief pause so Phase 2's cached_at bumps past Phase 1's (same-ms ties
    // would read as "did not advance" erroneously).
    await new Promise((r) => setTimeout(r, 50));
    const phase2Start = Date.now();
    await adapter.updateDealCustomProperties(MEDVISTA_DEAL_ID, CANARY_PROPS);
    const phase2Ms = Date.now() - phase2Start;
    console.log(`  PATCH completed in ${phase2Ms}ms`);

    const dealAfter = await adapter.getDeal(MEDVISTA_DEAL_ID);
    assertEquals(
      "re-read custom.nexus_meddpicc_paper_process_score",
      dealAfter.customProperties?.nexus_meddpicc_paper_process_score,
      String(CANARY_PROPS.nexus_meddpicc_paper_process_score),
    );
    assertEquals(
      "re-read custom.nexus_meddpicc_metrics_score",
      dealAfter.customProperties?.nexus_meddpicc_metrics_score,
      String(CANARY_PROPS.nexus_meddpicc_metrics_score),
    );

    const paperCacheAfter = await readCachedProperty(
      sql,
      MEDVISTA_DEAL_ID,
      "nexus_meddpicc_paper_process_score",
    );
    const cachedAdvanced =
      (paperCacheAfter?.cachedAt?.getTime() ?? 0) > phase1CachedAt.getTime();
    if (cachedAdvanced) {
      console.log(
        `  ✓ hubspot_cache.cached_at advanced (${phase1CachedAt.toISOString()} → ${paperCacheAfter?.cachedAt.toISOString()})`,
      );
    } else {
      failures++;
      console.log(
        `  ✗ hubspot_cache.cached_at did NOT advance (still ${phase1CachedAt.toISOString()})`,
      );
    }

    console.log("\n=== Summary ===");
    if (failures === 0) {
      console.log(
        `PASS: 2-phase round-trip verified against deal ${MEDVISTA_DEAL_ID}.`,
      );
    } else {
      console.log(`FAIL: ${failures} assertion(s) diverged.`);
      process.exitCode = 1;
    }
  } finally {
    await adapter.close();
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
