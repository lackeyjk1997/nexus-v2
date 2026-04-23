/**
 * One-off verification: confirm MEDDPICC properties landed on the live
 * HubSpot portal (245978261) for MedVista deal 321972856545 after Session
 * B's sub-step 3 full-flow live run. Invoked via `tsx` directly (no pnpm
 * alias — one-off verification, not a repeated gate). Used once at Day 3
 * closeout; retained in the scripts dir as an audit artifact.
 */
import { HubSpotAdapter, loadPipelineIds, loadDevEnv, requireEnv } from "@nexus/shared";

loadDevEnv();
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;

async function main(): Promise<void> {
  const adapter = new HubSpotAdapter({
    token: requireEnv("NEXUS_HUBSPOT_TOKEN"),
    portalId: requireEnv("HUBSPOT_PORTAL_ID"),
    clientSecret: requireEnv("HUBSPOT_CLIENT_SECRET"),
    databaseUrl: requireEnv("DATABASE_URL"),
    pipelineIds: loadPipelineIds(),
  });
  try {
    const deal = await adapter.getDeal("321972856545");
    console.log(`Live HubSpot deal: ${deal.name} (${deal.hubspotId})`);
    console.log("MEDDPICC custom properties:");
    const keys = [
      "nexus_meddpicc_metrics_score",
      "nexus_meddpicc_eb_score",
      "nexus_meddpicc_dc_score",
      "nexus_meddpicc_dp_score",
      "nexus_meddpicc_paper_process_score",
      "nexus_meddpicc_pain_score",
      "nexus_meddpicc_champion_score",
      "nexus_meddpicc_competition_score",
      "nexus_meddpicc_score",
    ];
    for (const k of keys) {
      const v = deal.customProperties?.[k];
      console.log(`  ${k}: ${v ?? "(null)"}`);
    }
  } finally {
    await adapter.close();
  }
}
main().catch((err) => { console.error(err); process.exit(1); });
