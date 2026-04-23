/**
 * 07C Step 9 — pre-warm `hubspot_cache` by running the three `bulkSync*`
 * methods. Ensures the first browser request to `/pipeline` hits cache rather
 * than HubSpot's API.
 *
 * Usage:
 *   pnpm --filter @nexus/db prewarm:hubspot-cache
 */

import {
  HubSpotAdapter,
  loadPipelineIds,
} from "@nexus/shared";

import { loadDevEnv, requireEnv } from "@nexus/shared";

async function main(): Promise<void> {
  loadDevEnv();
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
  try {
    console.log("Pre-warming hubspot_cache...");
    const [deals, contacts, companies] = await Promise.all([
      adapter.bulkSyncDeals(),
      adapter.bulkSyncContacts(),
      adapter.bulkSyncCompanies(),
    ]);
    console.log(`  deals:     synced ${deals.synced} failed ${deals.failed}`);
    console.log(
      `  contacts:  synced ${contacts.synced} failed ${contacts.failed}`,
    );
    console.log(
      `  companies: synced ${companies.synced} failed ${companies.failed}`,
    );
    const health = await adapter.healthCheck();
    console.log(
      `  healthCheck: ${health.status} · latency ${health.latencyMs}ms · rateLimitRemaining ${health.rateLimitRemaining ?? "—"}`,
    );
  } finally {
    await adapter.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
