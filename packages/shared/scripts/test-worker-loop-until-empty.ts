/**
 * Worker loop-until-empty + stalled-job sweep unit tests — Phase 4 Day 2
 * Session B Item 3 (with amendment).
 *
 * 4 cases:
 *   [1] empty queue exits clean (exitReason='no_jobs')
 *   [2] full queue + small budget runs to time budget (exitReason='time_budget')
 *   [3] mixed (3 jobs queued, runs all 3 then exits no_jobs)
 *   [4] stalled-job sweep (the amendment): jobs with status='running' AND
 *       started_at < threshold AND attempts < maxAttempts get reset to
 *       queued (and then claimed in the same loop); jobs at attempts >=
 *       maxAttempts get permanently failed by the sweep
 *
 * No DB. Mocks postgres.Sql via the same fake-state dispatcher pattern
 * as test-worker-retry-policy.
 *
 * Usage:
 *   pnpm --filter @nexus/shared test:worker-loop-until-empty
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
  /** Sweep threshold: rows with `started_at < this Date` are stalled. */
  stalledBefore: Date;
  /** Reflected `now()` for claim logic. Tests advance manually if needed. */
  now: Date;
}

function makeMockSql(state: MockSqlState): postgres.Sql {
  const fn = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sqlText = strings.join("?");

    // Sweep — fail (attempts >= max). values: [threshold, maxAttempts]
    if (
      sqlText.includes("UPDATE public.jobs") &&
      sqlText.includes("status = 'failed'") &&
      sqlText.includes("error = 'stuck_running_attempts_exhausted'") &&
      sqlText.includes("attempts >=")
    ) {
      const maxAttempts = Number(values[1]);
      const swept = state.jobs.filter(
        (j) =>
          j.status === "running" &&
          j.started_at !== null &&
          j.started_at < state.stalledBefore &&
          j.attempts >= maxAttempts,
      );
      for (const job of swept) {
        job.status = "failed";
        job.error = "stuck_running_attempts_exhausted";
        job.completed_at = new Date(state.now);
      }
      return Promise.resolve(swept.map((j) => ({ id: j.id })));
    }

    // Sweep — requeue (attempts < max). values: [threshold, maxAttempts]
    if (
      sqlText.includes("UPDATE public.jobs") &&
      sqlText.includes("SET status = 'queued'") &&
      sqlText.includes("started_at <") &&
      sqlText.includes("attempts <")
    ) {
      const maxAttempts = Number(values[1]);
      const swept = state.jobs.filter(
        (j) =>
          j.status === "running" &&
          j.started_at !== null &&
          j.started_at < state.stalledBefore &&
          j.attempts < maxAttempts,
      );
      for (const job of swept) {
        job.status = "queued";
      }
      return Promise.resolve(swept.map((j) => ({ id: j.id })));
    }

    // Claim
    if (
      sqlText.includes("UPDATE public.jobs") &&
      sqlText.includes("FOR UPDATE SKIP LOCKED")
    ) {
      const eligible = state.jobs
        .filter(
          (j) =>
            j.status === "queued" &&
            (j.scheduled_for === null || j.scheduled_for <= state.now),
        )
        .sort((a, b) => a.created_at.getTime() - b.created_at.getTime())[0];
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

    // Status UPDATE — success.
    if (
      sqlText.includes("UPDATE public.jobs") &&
      sqlText.includes("status = 'succeeded'")
    ) {
      const id = String(values[1]);
      const job = state.jobs.find((j) => j.id === id);
      if (job) {
        job.status = "succeeded";
        job.completed_at = new Date(state.now);
      }
      return Promise.resolve([]);
    }

    // Status UPDATE — requeue or permanent failure (collapsed; this test
    // only uses the success-path handler, so neither fires).
    throw new Error(`Mock sql: unrecognized query: ${sqlText.slice(0, 200)}`);
  };
  (fn as unknown as { json: (v: unknown) => unknown }).json = (v) => v;
  (fn as unknown as { unsafe: (v: string) => string }).unsafe = (v) => v;
  return fn as unknown as postgres.Sql;
}

const successHandler: JobHandler = async () => ({ ok: true });

function makeHandlers() {
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

function makeJob(opts: {
  id: string;
  status?: FakeJob["status"];
  attempts?: number;
  startedAt?: Date | null;
  createdAt?: Date;
}): FakeJob {
  return {
    id: opts.id,
    type: "noop",
    input: {},
    status: opts.status ?? "queued",
    attempts: opts.attempts ?? 0,
    scheduled_for: null,
    started_at: opts.startedAt ?? null,
    completed_at: null,
    error: null,
    result: null,
    created_at: opts.createdAt ?? new Date(),
  };
}

const FIXED_NOW = new Date("2026-04-28T04:00:00Z").getTime();

async function main() {
  // [1] Empty queue → exit no_jobs.
  {
    console.log("[1] empty queue → exitReason='no_jobs'…");
    const state: MockSqlState = {
      jobs: [],
      stalledBefore: new Date(FIXED_NOW - 5 * 60_000),
      now: new Date(FIXED_NOW),
    };
    const result = await runWorkerLoop(makeMockSql(state), {
      handlers: makeHandlers(),
      now: () => FIXED_NOW,
    });
    assertEqual(result.exitReason, "no_jobs", "exit reason");
    assertEqual(result.jobsProcessed.length, 0, "no jobs processed");
    assertEqual(result.sweep.requeued, 0, "no sweep requeues");
    assertEqual(result.sweep.failed, 0, "no sweep fails");
    console.log("      OK — empty queue exits clean");
  }

  // [2] Tiny time budget + many jobs → exit time_budget.
  {
    console.log("[2] tiny budget + many jobs → exitReason='time_budget'…");
    const state: MockSqlState = {
      jobs: Array.from({ length: 5 }, (_, i) =>
        makeJob({ id: `job-${i}`, createdAt: new Date(FIXED_NOW + i) }),
      ),
      stalledBefore: new Date(FIXED_NOW - 5 * 60_000),
      now: new Date(FIXED_NOW),
    };
    let mockTime = FIXED_NOW;
    // Each call to now() advances the clock — simulates time passing.
    // After ~3 jobs, elapsed should exceed our 50ms budget.
    const result = await runWorkerLoop(makeMockSql(state), {
      handlers: makeHandlers(),
      now: () => {
        const t = mockTime;
        mockTime += 30; // 30ms per now() call simulates progress
        return t;
      },
      timeBudgetMs: 100, // very small budget for fast test
    });
    assertEqual(result.exitReason, "time_budget", "exit reason");
    assert(result.jobsProcessed.length >= 1, "at least 1 job processed");
    assert(result.jobsProcessed.length < 5, "not all 5 processed (budget cut off)");
    console.log(
      `      OK — exited on time budget after ${result.jobsProcessed.length} job(s)`,
    );
  }

  // [3] Three queued jobs → all 3 run then exit no_jobs.
  {
    console.log("[3] 3 queued jobs → all run, exit no_jobs…");
    const state: MockSqlState = {
      jobs: [
        makeJob({ id: "j-1", createdAt: new Date(FIXED_NOW + 1) }),
        makeJob({ id: "j-2", createdAt: new Date(FIXED_NOW + 2) }),
        makeJob({ id: "j-3", createdAt: new Date(FIXED_NOW + 3) }),
      ],
      stalledBefore: new Date(FIXED_NOW - 5 * 60_000),
      now: new Date(FIXED_NOW),
    };
    const result = await runWorkerLoop(makeMockSql(state), {
      handlers: makeHandlers(),
      now: () => FIXED_NOW,
      timeBudgetMs: 240_000,
    });
    assertEqual(result.jobsProcessed.length, 3, "all 3 jobs processed");
    assertEqual(result.exitReason, "no_jobs", "exit reason no_jobs");
    for (const job of state.jobs) {
      assertEqual(job.status, "succeeded", `${job.id} succeeded`);
    }
    // Order preserved (oldest created_at first).
    assertEqual(result.jobsProcessed[0]!.id, "j-1", "j-1 first");
    assertEqual(result.jobsProcessed[1]!.id, "j-2", "j-2 second");
    assertEqual(result.jobsProcessed[2]!.id, "j-3", "j-3 third");
    console.log("      OK — all 3 jobs ran in order then exited no_jobs");
  }

  // [4] Stalled-job sweep (amendment): mix of jobs to verify both branches.
  {
    console.log("[4] stalled sweep — requeue + permanent fail per attempts…");
    const longAgo = new Date(FIXED_NOW - 10 * 60_000); // 10min ago = past 5-min threshold
    const state: MockSqlState = {
      jobs: [
        // Stalled at attempts=1 → sweep requeues. Then claim picks it up.
        makeJob({
          id: "stalled-low",
          status: "running",
          attempts: 1,
          startedAt: longAgo,
          createdAt: new Date(FIXED_NOW + 1),
        }),
        // Stalled at attempts=3 (max) → sweep permanently fails. Not claimed.
        makeJob({
          id: "stalled-max",
          status: "running",
          attempts: 3,
          startedAt: longAgo,
          createdAt: new Date(FIXED_NOW + 2),
        }),
        // Recently-started running job → NOT swept (within threshold).
        makeJob({
          id: "recent-running",
          status: "running",
          attempts: 1,
          startedAt: new Date(FIXED_NOW - 30_000), // 30s ago, well within threshold
          createdAt: new Date(FIXED_NOW + 3),
        }),
      ],
      stalledBefore: new Date(FIXED_NOW - 5 * 60_000),
      now: new Date(FIXED_NOW),
    };
    const result = await runWorkerLoop(makeMockSql(state), {
      handlers: makeHandlers(),
      now: () => FIXED_NOW,
    });
    assertEqual(result.sweep.failed, 1, "1 stalled-max job permanently failed");
    assertEqual(result.sweep.requeued, 1, "1 stalled-low job requeued");
    // After sweep, stalled-low is queued → loop claims and runs it.
    assertEqual(result.jobsProcessed.length, 1, "1 job processed (the requeued one)");
    assertEqual(result.jobsProcessed[0]!.id, "stalled-low", "claimed the requeued job");
    assertEqual(result.jobsProcessed[0]!.status, "succeeded", "succeeded");
    // Note: claim increments attempts from 1 → 2, so processed.attempts === 2.
    assertEqual(result.jobsProcessed[0]!.attempts, 2, "attempts++ on claim of requeued job");

    const stalledMax = state.jobs.find((j) => j.id === "stalled-max")!;
    assertEqual(stalledMax.status, "failed", "stalled-max → failed");
    assert(
      stalledMax.error?.includes("stuck_running_attempts_exhausted"),
      "stalled-max error message",
    );

    const recent = state.jobs.find((j) => j.id === "recent-running")!;
    assertEqual(recent.status, "running", "recent-running NOT swept (within threshold)");
    console.log("      OK — sweep handled both branches; recent job preserved");
  }

  console.log("\nWorker loop-until-empty + stalled sweep: ALL 4/4 CASES PASS.");
}

main().catch((err) => {
  console.error("test:worker-loop-until-empty FAILED:", err);
  process.exit(1);
});
