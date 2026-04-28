/**
 * Worker retry policy unit tests — Phase 4 Day 2 Session B Item 2.
 *
 * 5 cases per kickoff Decision 12:
 *   [1] First failure (attempts=1) → status='queued' + scheduled_for=+1m
 *   [2] Second failure (attempts=2) → status='queued' + scheduled_for=+5m
 *   [3] Third failure (attempts=3) → status='failed' permanent
 *   [4] scheduled_for filter excludes future-scheduled jobs from claim
 *       (regression check that the existing claim filter still respects it)
 *   [5] Successful job → status='succeeded' (regression check that the
 *       retry path doesn't break the success path)
 *
 * No DB. Mocks postgres.Sql via a fake-state dispatcher that recognizes
 * the worker-runner's SQL shapes:
 *   - sweep UPDATE (no rows touched in tests; sweep returns empty)
 *   - claim UPDATE (next eligible queued job)
 *   - status UPDATE on success / requeue / permanent fail
 *
 * Usage:
 *   pnpm --filter @nexus/shared test:worker-retry-policy
 */
import type postgres from "postgres";

import { runWorkerLoop, type JobHandler } from "@nexus/shared";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERT: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `ASSERT ${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// ── Mock SQL state ───────────────────────────────────────────────────

interface FakeJob {
  id: string;
  type: string;
  input: unknown;
  status: "queued" | "running" | "succeeded" | "failed";
  attempts: number;
  scheduled_for: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  error: string | null;
  result: unknown;
  created_at: Date;
}

interface MockSqlState {
  jobs: FakeJob[];
  /** Captured `now()` for deterministic comparisons in tests. */
  now: Date;
}

function makeMockSql(state: MockSqlState): postgres.Sql {
  const fn = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sqlText = strings.join("?");

    // Stalled-job sweep — fail then requeue. In the retry-policy tests,
    // no jobs match the sweep filter (all jobs start as queued or get
    // claimed within the same invocation), so both UPDATEs return [].
    if (
      sqlText.includes("UPDATE public.jobs") &&
      sqlText.includes("status = 'failed'") &&
      sqlText.includes("started_at <") &&
      sqlText.includes("attempts >=")
    ) {
      return Promise.resolve([]);
    }
    if (
      sqlText.includes("UPDATE public.jobs") &&
      sqlText.includes("status = 'queued'") &&
      sqlText.includes("started_at <") &&
      sqlText.includes("attempts <")
    ) {
      return Promise.resolve([]);
    }

    // Claim — atomic UPDATE on next eligible queued job.
    if (
      sqlText.includes("UPDATE public.jobs") &&
      sqlText.includes("FOR UPDATE SKIP LOCKED") &&
      sqlText.includes("RETURNING id, type, input, attempts")
    ) {
      const eligible = state.jobs.find(
        (j) =>
          j.status === "queued" &&
          (j.scheduled_for === null || j.scheduled_for <= state.now),
      );
      if (!eligible) return Promise.resolve([]);
      eligible.status = "running";
      eligible.attempts += 1;
      eligible.started_at = new Date(state.now);
      return Promise.resolve([
        {
          id: eligible.id,
          type: eligible.type,
          input: eligible.input,
          attempts: eligible.attempts,
        },
      ]);
    }

    // Status UPDATE — success path.
    if (
      sqlText.includes("UPDATE public.jobs") &&
      sqlText.includes("status = 'succeeded'") &&
      sqlText.includes("WHERE id =")
    ) {
      const id = String(values[1]); // values[0] is the json result
      const job = state.jobs.find((j) => j.id === id);
      if (job) {
        job.status = "succeeded";
        job.completed_at = new Date(state.now);
        job.result = values[0];
      }
      return Promise.resolve([]);
    }

    // Status UPDATE — requeue path (retry).
    if (
      sqlText.includes("UPDATE public.jobs") &&
      sqlText.includes("status = 'queued'") &&
      sqlText.includes("scheduled_for =") &&
      sqlText.includes("error =")
    ) {
      const scheduledFor = values[0] as Date;
      const error = String(values[1]);
      const id = String(values[2]);
      const job = state.jobs.find((j) => j.id === id);
      if (job) {
        job.status = "queued";
        job.scheduled_for = scheduledFor;
        job.error = error;
        job.completed_at = null;
      }
      return Promise.resolve([]);
    }

    // Status UPDATE — permanent failure.
    if (
      sqlText.includes("UPDATE public.jobs") &&
      sqlText.includes("status = 'failed'") &&
      sqlText.includes("error =")
    ) {
      const error = String(values[0]);
      const id = String(values[1]);
      const job = state.jobs.find((j) => j.id === id);
      if (job) {
        job.status = "failed";
        job.error = error;
        job.completed_at = new Date(state.now);
      }
      return Promise.resolve([]);
    }

    throw new Error(`Mock sql: unrecognized query: ${sqlText.slice(0, 200)}`);
  };
  (fn as unknown as { json: (v: unknown) => unknown }).json = (v) => v;
  (fn as unknown as { unsafe: (v: string) => string }).unsafe = (v) => v;
  return fn as unknown as postgres.Sql;
}

// ── Helpers ───────────────────────────────────────────────────────────

function makeJob(opts: {
  id: string;
  attempts?: number;
  scheduledFor?: Date | null;
}): FakeJob {
  return {
    id: opts.id,
    type: "noop",
    input: {},
    status: "queued",
    attempts: opts.attempts ?? 0,
    scheduled_for: opts.scheduledFor ?? null,
    started_at: null,
    completed_at: null,
    error: null,
    result: null,
    created_at: new Date(),
  };
}

const failingHandler: JobHandler = async () => {
  throw new Error("simulated handler failure");
};
const successHandler: JobHandler = async () => ({ ok: true });

function makeFailingHandlers() {
  return {
    noop: failingHandler,
    transcript_pipeline: failingHandler,
    coordinator_synthesis: failingHandler,
    observation_cluster: failingHandler,
    daily_digest: failingHandler,
    deal_health_check: failingHandler,
    hubspot_periodic_sync: failingHandler,
  } as never;
}

function makeSucceedingHandlers() {
  return {
    noop: successHandler,
    transcript_pipeline: successHandler,
    coordinator_synthesis: successHandler,
    observation_cluster: successHandler,
    daily_digest: successHandler,
    deal_health_check: successHandler,
    hubspot_periodic_sync: successHandler,
  } as never;
}

const FIXED_NOW = new Date("2026-04-28T04:00:00Z").getTime();

// ── Cases ─────────────────────────────────────────────────────────────

async function main() {
  // [1] First failure (attempts becomes 1 after claim) → +1m backoff.
  {
    console.log("[1] first failure → status='queued' + scheduled_for=+1m…");
    const state: MockSqlState = {
      jobs: [makeJob({ id: "job-1" })],
      now: new Date(FIXED_NOW),
    };
    const result = await runWorkerLoop(makeMockSql(state), {
      handlers: makeFailingHandlers(),
      now: () => FIXED_NOW,
      timeBudgetMs: 240_000,
    });
    assertEqual(result.jobsProcessed.length, 1, "one job processed");
    assertEqual(result.jobsProcessed[0]!.status, "requeued", "status=requeued");
    assertEqual(result.jobsProcessed[0]!.attempts, 1, "attempts=1 after first claim");
    const job = state.jobs[0]!;
    assertEqual(job.status, "queued", "DB job back to queued");
    assert(job.scheduled_for, "scheduled_for set");
    const expected1m = FIXED_NOW + 60_000;
    assertEqual(job.scheduled_for!.getTime(), expected1m, "scheduled_for = +1 minute");
    console.log("      OK — first failure requeued at +1m");
  }

  // [2] Second failure → +5m backoff.
  {
    console.log("[2] second failure → status='queued' + scheduled_for=+5m…");
    // Pre-state: job already had one prior attempt (attempts=1 in DB).
    // After this claim, attempts becomes 2.
    const state: MockSqlState = {
      jobs: [makeJob({ id: "job-2", attempts: 1 })],
      now: new Date(FIXED_NOW),
    };
    const result = await runWorkerLoop(makeMockSql(state), {
      handlers: makeFailingHandlers(),
      now: () => FIXED_NOW,
    });
    assertEqual(result.jobsProcessed[0]!.status, "requeued", "status=requeued");
    assertEqual(result.jobsProcessed[0]!.attempts, 2, "attempts=2 after second claim");
    const job = state.jobs[0]!;
    const expected5m = FIXED_NOW + 300_000;
    assertEqual(job.scheduled_for!.getTime(), expected5m, "scheduled_for = +5 minutes");
    console.log("      OK — second failure requeued at +5m");
  }

  // [3] Third failure → permanent failure.
  {
    console.log("[3] third failure → status='failed' permanent…");
    // Pre-state: attempts=2 in DB. After this claim, attempts becomes 3.
    const state: MockSqlState = {
      jobs: [makeJob({ id: "job-3", attempts: 2 })],
      now: new Date(FIXED_NOW),
    };
    const result = await runWorkerLoop(makeMockSql(state), {
      handlers: makeFailingHandlers(),
      now: () => FIXED_NOW,
    });
    assertEqual(result.jobsProcessed[0]!.status, "failed_permanent", "status=failed_permanent");
    assertEqual(result.jobsProcessed[0]!.attempts, 3, "attempts=3 (max)");
    const job = state.jobs[0]!;
    assertEqual(job.status, "failed", "DB job status=failed");
    assert(job.error?.includes("simulated handler failure"), "error message preserved");
    console.log("      OK — third failure marked permanent");
  }

  // [4] scheduled_for filter excludes future-scheduled jobs from claim.
  {
    console.log("[4] scheduled_for=future → not claimed; loop exits no_jobs…");
    const futureScheduled = new Date(FIXED_NOW + 60_000); // 1 minute from now
    const state: MockSqlState = {
      jobs: [makeJob({ id: "job-4", scheduledFor: futureScheduled })],
      now: new Date(FIXED_NOW),
    };
    const result = await runWorkerLoop(makeMockSql(state), {
      handlers: makeSucceedingHandlers(),
      now: () => FIXED_NOW,
    });
    assertEqual(result.jobsProcessed.length, 0, "no jobs processed");
    assertEqual(result.exitReason, "no_jobs", "exit reason no_jobs");
    assertEqual(state.jobs[0]!.status, "queued", "DB job still queued (not claimed)");
    assertEqual(state.jobs[0]!.attempts, 0, "attempts not incremented");
    console.log("      OK — future-scheduled job not claimed");
  }

  // [5] Successful job — status='succeeded' (regression check).
  {
    console.log("[5] successful job → status='succeeded' (regression)…");
    const state: MockSqlState = {
      jobs: [makeJob({ id: "job-5" })],
      now: new Date(FIXED_NOW),
    };
    const result = await runWorkerLoop(makeMockSql(state), {
      handlers: makeSucceedingHandlers(),
      now: () => FIXED_NOW,
    });
    assertEqual(result.jobsProcessed[0]!.status, "succeeded", "status=succeeded");
    assertEqual(state.jobs[0]!.status, "succeeded", "DB job status=succeeded");
    console.log("      OK — successful job lands clean");
  }

  console.log("\nWorker retry policy: ALL 5/5 CASES PASS.");
}

main().catch((err) => {
  console.error("test:worker-retry-policy FAILED:", err);
  process.exit(1);
});
