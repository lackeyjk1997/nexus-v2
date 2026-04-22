/**
 * Job handler registry. Keyed by job_type enum value.
 *
 * Day 3 implements `noop` only. The other six types throw `not_implemented`
 * so a dispatch to them during Phase 1 is loud, not silent — each owning
 * phase wires its handler when the domain code lands.
 */

export type JobHandler = (input: unknown) => Promise<unknown>;

function notYet(type: string, owner: string): JobHandler {
  return async () => {
    throw new Error(`not_implemented: ${type} (scheduled for ${owner})`);
  };
}

const noop: JobHandler = async (input) => {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return { message: "hello", echoedInput: input };
};

export const HANDLERS = {
  noop,
  transcript_pipeline: notYet("transcript_pipeline", "Phase 3 Day 2"),
  coordinator_synthesis: notYet("coordinator_synthesis", "Phase 4 Day 2"),
  observation_cluster: notYet("observation_cluster", "Phase 4 Day 3"),
  daily_digest: notYet("daily_digest", "Phase 5 Day 4"),
  deal_health_check: notYet("deal_health_check", "Phase 5 Day 3"),
  hubspot_periodic_sync: notYet("hubspot_periodic_sync", "Phase 1 Day 5"),
} satisfies Record<string, JobHandler>;

export type JobType = keyof typeof HANDLERS;

export const JOB_TYPES = Object.keys(HANDLERS) as JobType[];
