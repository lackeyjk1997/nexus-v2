/**
 * Phase 1 Day 5 — stage-change webhook round-trip smoke test.
 *
 * Flow:
 *   1. Read current dealstage from hubspot_cache.
 *   2. Pick a different stage.
 *   3. PATCH the deal via HubSpot API (bypasses our adapter — mimics a
 *      user/HubSpot-UI mutation).
 *   4. Poll hubspot_cache until the webhook-driven handler overwrites the
 *      row. Record elapsed seconds.
 *   5. Flip back to the original stage; verify second round-trip.
 *
 * Success: both flips land in hubspot_cache within the 15s SLA.
 *
 * Usage:
 *   pnpm --filter @nexus/db smoke:stage-change
 */

import postgres from "postgres";

import { HubSpotClient, loadPipelineIds, type DealStage } from "@nexus/shared";

import { loadDevEnv, requireEnv } from "@nexus/shared";

const MEDVISTA_DEAL_ID = "321972856545";
const TIMEOUT_S = 30;

interface CacheRow {
  payload: { properties: Record<string, string | null> };
  cached_at: Date;
}

async function readCachedStage(
  sql: postgres.Sql,
  dealId: string,
): Promise<{ stageId: string | null; cachedAt: Date } | null> {
  const rows = await sql<CacheRow[]>`
    SELECT payload, cached_at
      FROM hubspot_cache
     WHERE object_type = 'deal' AND hubspot_id = ${dealId}
     LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    stageId: row.payload.properties.dealstage ?? null,
    cachedAt: new Date(row.cached_at),
  };
}

async function flipAndWait(
  sql: postgres.Sql,
  http: HubSpotClient,
  dealId: string,
  toStageId: string,
  toStageName: string,
  label: string,
): Promise<number> {
  console.log(`\n=== ${label}: flipping to ${toStageName} (${toStageId}) ===`);
  const flipStart = Date.now();
  await http.request({
    method: "PATCH",
    path: `/crm/v3/objects/deals/${dealId}`,
    body: { properties: { dealstage: toStageId } },
  });
  console.log(`  t=0   PATCH /deals/${dealId} acknowledged`);

  const pollStart = Date.now();
  while (true) {
    const elapsedS = Math.round((Date.now() - pollStart) / 1000);
    const cached = await readCachedStage(sql, dealId);
    if (cached && cached.stageId === toStageId) {
      const total = (Date.now() - flipStart) / 1000;
      console.log(
        `  t=${elapsedS}s  cache hit: dealstage=${cached.stageId} (cached_at=${cached.cachedAt.toISOString()})`,
      );
      console.log(`  ✓ propagation ${total.toFixed(1)}s`);
      return total;
    }
    console.log(
      `  t=${elapsedS}s  cache shows dealstage=${cached?.stageId ?? "(empty)"} — waiting...`,
    );
    if (elapsedS >= TIMEOUT_S) {
      console.log(`  ✗ TIMEOUT after ${elapsedS}s — webhook did not propagate`);
      return Infinity;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function main(): Promise<void> {
  loadDevEnv();
  const token = requireEnv("NEXUS_HUBSPOT_TOKEN");
  const databaseUrl = requireEnv("DATABASE_URL");

  const pipelineIds = loadPipelineIds();
  const stageIds = pipelineIds.stageIds;

  const http = new HubSpotClient({ token });
  const sql = postgres(databaseUrl, { max: 3, idle_timeout: 10, prepare: false });

  try {
    const before = await readCachedStage(sql, MEDVISTA_DEAL_ID);
    if (!before || !before.stageId) {
      throw new Error(
        `No cached row for deal ${MEDVISTA_DEAL_ID}; run prewarm:hubspot-cache first.`,
      );
    }
    const originalStageId = before.stageId;
    const originalStageName =
      (Object.entries(stageIds).find(([, id]) => id === originalStageId)?.[0] ??
        "(unknown)") as DealStage;
    console.log(
      `Baseline: deal ${MEDVISTA_DEAL_ID} currently cached as ${originalStageName} (${originalStageId}), cached_at=${before.cachedAt.toISOString()}`,
    );

    const alt: DealStage =
      originalStageName === "qualified" ? "technical_validation" : "qualified";
    const altStageId = stageIds[alt];
    if (!altStageId) throw new Error(`No stage id for ${alt} in pipeline-ids.json`);

    const forwardSec = await flipAndWait(
      sql,
      http,
      MEDVISTA_DEAL_ID,
      altStageId,
      alt,
      "Forward flip",
    );

    const reverseSec = await flipAndWait(
      sql,
      http,
      MEDVISTA_DEAL_ID,
      originalStageId,
      originalStageName,
      "Reverse flip",
    );

    console.log("\n=== Summary ===");
    console.log(`  forward ${originalStageName} → ${alt}: ${forwardSec.toFixed(1)}s`);
    console.log(`  reverse ${alt} → ${originalStageName}: ${reverseSec.toFixed(1)}s`);
    const slaOk = forwardSec <= 15 && reverseSec <= 15;
    console.log(
      `  SLA (≤15s): ${slaOk ? "PASS" : "FAIL"}  — Day-5 exit criterion`,
    );
    if (!slaOk) process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
