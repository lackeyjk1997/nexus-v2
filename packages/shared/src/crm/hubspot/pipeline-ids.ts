/**
 * Runtime reader for the pipeline-ids.json artifact produced by
 * scripts/hubspot-provision-pipeline.ts (07C Step 4).
 *
 * Path locked in DECISIONS.md 2.18.1: packages/shared/src/crm/hubspot/pipeline-ids.json.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { DealStage } from "../types";

export const PIPELINE_IDS_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "pipeline-ids.json",
);

export interface PipelineIdsFile {
  portalId: string | null;
  pipelineId: string | null;
  stageIds: Partial<Record<DealStage, string>>;
  provisionedAt: string | null;
}

export function loadPipelineIds(): PipelineIdsFile {
  const raw = readFileSync(PIPELINE_IDS_PATH, "utf-8");
  const parsed = JSON.parse(raw) as PipelineIdsFile & { _note?: string };
  delete (parsed as { _note?: string })._note;
  return parsed;
}

export function isProvisioned(file: PipelineIdsFile): boolean {
  return (
    file.pipelineId !== null && Object.keys(file.stageIds).length === 9
  );
}
