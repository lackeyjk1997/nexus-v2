/**
 * Runtime reader for the pipeline-ids.json artifact produced by
 * scripts/hubspot-provision-pipeline.ts (07C Step 4).
 *
 * Path locked in DECISIONS.md 2.18.1: packages/shared/src/crm/hubspot/pipeline-ids.json.
 *
 * Dual path:
 *   - Bundle-time: JSON is imported so Vercel's serverless bundler inlines it.
 *   - Dev/script: scripts that mutate the file use PIPELINE_IDS_PATH + fs.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pipelineIds from "./pipeline-ids.json" with { type: "json" };

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
  const { _note, ...rest } = pipelineIds as PipelineIdsFile & {
    _note?: string;
  };
  return rest;
}

export function isProvisioned(file: PipelineIdsFile): boolean {
  return (
    file.pipelineId !== null && Object.keys(file.stageIds).length === 9
  );
}
