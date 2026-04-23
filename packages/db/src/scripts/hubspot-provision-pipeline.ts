/**
 * 07C Step 4 — create the "Nexus Sales" pipeline and 9 stages.
 *
 * Idempotent: looks up the pipeline by label; if present, captures its stage
 * IDs without recreating. Writes the final mapping to
 *   packages/shared/src/crm/hubspot/pipeline-ids.json
 * per DECISIONS.md 2.18.1.
 *
 * Usage:
 *   pnpm --filter @nexus/db provision:hubspot-pipeline
 */

import { writeFileSync } from "node:fs";

import {
  HubSpotClient,
  PIPELINE_IDS_PATH,
  type PipelineIdsFile,
  DEAL_STAGES,
  type DealStage,
} from "@nexus/shared";

import { loadDevEnv, requireEnv } from "@nexus/shared";

interface HubSpotPipelineStage {
  id: string;
  label: string;
  displayOrder: number;
  metadata: Record<string, string>;
}

interface HubSpotPipeline {
  id: string;
  label: string;
  displayOrder: number;
  stages: HubSpotPipelineStage[];
  createdAt: string;
  updatedAt: string;
}

const STAGE_SPECS: Array<{
  internal: DealStage;
  label: string;
  probability: string;
  isClosed?: boolean;
}> = [
  { internal: "new_lead", label: "New Lead", probability: "0.05" },
  { internal: "qualified", label: "Qualified", probability: "0.15" },
  { internal: "discovery", label: "Discovery", probability: "0.30" },
  {
    internal: "technical_validation",
    label: "Technical Validation",
    probability: "0.50",
  },
  { internal: "proposal", label: "Proposal", probability: "0.65" },
  { internal: "negotiation", label: "Negotiation", probability: "0.80" },
  { internal: "closing", label: "Closing", probability: "0.90" },
  {
    internal: "closed_won",
    label: "Closed Won",
    probability: "1.00",
    isClosed: true,
  },
  {
    internal: "closed_lost",
    label: "Closed Lost",
    probability: "0.00",
    isClosed: true,
  },
];

async function main(): Promise<void> {
  loadDevEnv();
  const token = requireEnv("NEXUS_HUBSPOT_TOKEN");
  const portalId = requireEnv("HUBSPOT_PORTAL_ID");

  const http = new HubSpotClient({ token });

  console.log(`Provisioning pipeline against HubSpot portal ${portalId}...`);

  // Look up existing pipeline
  const { body: list } = await http.request<{ results: HubSpotPipeline[] }>({
    method: "GET",
    path: "/crm/v3/pipelines/deals",
  });
  let pipeline = list.results.find(
    (p: HubSpotPipeline) => p.label === "Nexus Sales",
  );

  if (pipeline) {
    console.log(`Found existing pipeline ${pipeline.id} — reusing.`);
  } else {
    console.log(`Creating new pipeline "Nexus Sales"...`);
    const body = {
      label: "Nexus Sales",
      displayOrder: 0,
      stages: STAGE_SPECS.map((s, i) => ({
        label: s.label,
        displayOrder: i,
        metadata: {
          probability: s.probability,
          ...(s.isClosed ? { isClosed: "true" } : {}),
        },
      })),
    };
    const { body: created } = await http.request<HubSpotPipeline>({
      method: "POST",
      path: "/crm/v3/pipelines/deals",
      body,
    });
    pipeline = created;
    console.log(`Created pipeline ${pipeline.id}.`);
  }

  // Map HubSpot stage IDs back to internal names by label match.
  const stageIds: Partial<Record<DealStage, string>> = {};
  for (const spec of STAGE_SPECS) {
    const match = pipeline.stages.find(
      (s: HubSpotPipelineStage) => s.label === spec.label,
    );
    if (!match) {
      throw new Error(
        `Pipeline ${pipeline.id} missing expected stage "${spec.label}"`,
      );
    }
    stageIds[spec.internal] = match.id;
  }

  const out: PipelineIdsFile & { _note: string } = {
    portalId,
    pipelineId: pipeline.id,
    stageIds,
    provisionedAt: new Date().toISOString(),
    _note:
      "Populated by scripts/hubspot-provision-pipeline.ts on first run. Committed to Git per DECISIONS.md 2.18.1 (portal-specific, not secret).",
  };
  writeFileSync(PIPELINE_IDS_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${PIPELINE_IDS_PATH}.`);

  console.log("Pipeline provisioning complete:");
  console.log(`  portalId:   ${portalId}`);
  console.log(`  pipelineId: ${pipeline.id}`);
  for (const stage of DEAL_STAGES) {
    console.log(`  ${stage.padEnd(22)} -> ${stageIds[stage]}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
