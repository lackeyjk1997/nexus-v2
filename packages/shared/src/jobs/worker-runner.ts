/**
 * Worker runner — Phase 4 Day 2 Session B.
 *
 * Extracts the worker route's claim/run/status loop into a pure function
 * so Items 2 (retry policy) + 3 (loop-until-empty + sweep) are testable
 * without standing up a Next.js request/response harness. The worker
 * route now calls `runWorkerLoop(getSharedSql())` after its auth +
 * circuit-breaker preamble.
 *
 * Three behaviors land in this module:
 *
 *   1. Stalled-job sweep (Item 3 amendment). At start of every invocation,
 *      before claiming, sweep `jobs WHERE status='running' AND started_at <
 *      now() - 5min`. If `attempts >= 3`: mark as permanently failed (the
 *      job has exhausted its retry budget AND been killed mid-run by Vercel
 *      SIGTERM at 300s; further retries would just cycle). If `attempts <
 *      3`: re-queue with status='queued' so the retry policy can give it
 *      another shot via the normal claim path.
 *
 *   2. Pre-claim time-budget check (Item 3). Loop iterations check the
 *      time budget BEFORE claiming a new job, NEVER mid-job. The in-flight
 *      job runs to completion within its own time; the 60s margin between
 *      240s budget and 300s maxDuration covers graceful exit. Never
 *      interrupt a running handler — partial work (Claude calls already
 *      paid for, half-written events) would be lost.
 *
 *   3. Retry policy with exponential backoff (Item 2). Up to 3 total
 *      attempts (per `attempts` column, incremented at claim time):
 *        - attempts=1 fails → status='queued' + scheduled_for = now()+1m
 *        - attempts=2 fails → status='queued' + scheduled_for = now()+5m
 *        - attempts=3 fails → status='failed' permanent
 *      The existing claim filter at the worker route already respects
 *      `scheduled_for IS NULL OR scheduled_for <= now()`, so backoff
 *      delay is honored without further filter changes.
 *
 * Telemetry per Phase 4 Day 2 Session B kickoff Decision 11 — stderr
 * JSON line per event:
 *   - worker_stuck_jobs_swept                (failed_count, requeued_count, threshold)
 *   - worker_retry_scheduled                 (job_id, type, attempt, next_scheduled_at, backoff_ms, error_class)
 *   - worker_retry_exhausted                 (job_id, type, total_attempts, final_error)
 *   - worker_loop_exhausted_no_jobs          (jobs_processed, elapsed_ms)
 *   - worker_loop_exhausted_time_budget      (jobs_processed, elapsed_ms, budget_ms)
 */
import type postgres from "postgres";

import { HANDLERS, type JobType } from "./handlers";

const DEFAULT_TIME_BUDGET_MS = 240_000;
const DEFAULT_STALLED_THRESHOLD = "5 minutes";
const DEFAULT_MAX_ATTEMPTS = 3;

interface ClaimedJobRow {
  id: string;
  type: JobType;
  input: unknown;
  attempts: number;
}

export interface SweepResult {
  requeued: number;
  failed: number;
}

export interface ProcessedJob {
  id: string;
  type: string;
  status: "succeeded" | "requeued" | "failed_permanent";
  attempts: number;
  durationMs: number;
  error?: string;
}

export interface WorkerLoopResult {
  jobsProcessed: ProcessedJob[];
  exitReason: "no_jobs" | "time_budget";
  totalDurationMs: number;
  sweep: SweepResult;
}

export interface WorkerRunnerOptions {
  /** Default 240_000 (60s margin to 300s maxDuration). Tests can lower it. */
  timeBudgetMs?: number;
  /** Default '5 minutes'. Tests can shrink to exercise the sweep. */
  stalledThreshold?: string;
  /** Default 3. Tests can lower to exercise the retry-exhausted path. */
  maxAttempts?: number;
  /** Test seam: override the HANDLERS map. */
  handlers?: typeof HANDLERS;
  /** Test seam: override `Date.now()` for deterministic time-budget tests. */
  now?: () => number;
}

/**
 * Sweep stuck jobs from previous worker invocations. Run at start of every
 * worker invocation before claiming. Two-step:
 *   (a) Permanently fail stalled jobs at attempts >= maxAttempts (their
 *       retry budget was exhausted; further retries would just cycle if
 *       the underlying problem is persistent).
 *   (b) Re-queue stalled jobs at attempts < maxAttempts (give them another
 *       shot via the normal retry path; UPSERT sources are idempotent so
 *       partial-progress jobs are safe to re-run).
 *
 * Returns the count of swept rows for telemetry + worker route response.
 */
export async function sweepStalledJobs(
  sql: postgres.Sql,
  options: { threshold?: string; maxAttempts?: number } = {},
): Promise<SweepResult> {
  const threshold = options.threshold ?? DEFAULT_STALLED_THRESHOLD;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  const failed = await sql<Array<{ id: string }>>`
    UPDATE public.jobs
       SET status = 'failed',
           error = 'stuck_running_attempts_exhausted',
           completed_at = now()
     WHERE status = 'running'
       AND started_at < now() - (${threshold})::interval
       AND attempts >= ${maxAttempts}
     RETURNING id
  `;
  const requeued = await sql<Array<{ id: string }>>`
    UPDATE public.jobs
       SET status = 'queued'
     WHERE status = 'running'
       AND started_at < now() - (${threshold})::interval
       AND attempts < ${maxAttempts}
     RETURNING id
  `;

  if (failed.length > 0 || requeued.length > 0) {
    console.error(
      JSON.stringify({
        event: "worker_stuck_jobs_swept",
        failed_count: failed.length,
        requeued_count: requeued.length,
        threshold,
        ts: new Date().toISOString(),
      }),
    );
  }

  return { requeued: requeued.length, failed: failed.length };
}

/**
 * Worker loop. Claim → run → status update, repeated until either the
 * time budget is exhausted or no eligible job remains. Pre-claim time
 * check ensures the in-flight job runs to completion (never mid-job
 * abort).
 *
 * Returns processed-job summaries + exit reason + sweep summary.
 */
export async function runWorkerLoop(
  sql: postgres.Sql,
  options: WorkerRunnerOptions = {},
): Promise<WorkerLoopResult> {
  const timeBudget = options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;
  const handlers = options.handlers ?? HANDLERS;
  const now = options.now ?? Date.now;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const startTs = now();

  const sweep = await sweepStalledJobs(sql, {
    threshold: options.stalledThreshold,
    maxAttempts,
  });

  const jobsProcessed: ProcessedJob[] = [];
  let exitReason: WorkerLoopResult["exitReason"] = "no_jobs";

  while (true) {
    // Pre-claim time-budget check. NEVER mid-job — once a job is claimed,
    // it runs to completion. The 60s margin (240s budget → 300s maxDuration)
    // is the safety zone for the in-flight handler + graceful exit.
    if (now() - startTs >= timeBudget) {
      exitReason = "time_budget";
      console.error(
        JSON.stringify({
          event: "worker_loop_exhausted_time_budget",
          jobs_processed: jobsProcessed.length,
          elapsed_ms: now() - startTs,
          budget_ms: timeBudget,
          ts: new Date().toISOString(),
        }),
      );
      break;
    }

    const claimed = await sql<ClaimedJobRow[]>`
      UPDATE public.jobs
         SET status = 'running',
             started_at = now(),
             attempts = attempts + 1
       WHERE id = (
         SELECT id FROM public.jobs
          WHERE status = 'queued'
            AND (scheduled_for IS NULL OR scheduled_for <= now())
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
       )
       RETURNING id, type, input, attempts
    `;

    if (claimed.length === 0) {
      exitReason = "no_jobs";
      console.error(
        JSON.stringify({
          event: "worker_loop_exhausted_no_jobs",
          jobs_processed: jobsProcessed.length,
          elapsed_ms: now() - startTs,
          ts: new Date().toISOString(),
        }),
      );
      break;
    }

    const job = claimed[0]!;
    const jobStart = now();

    try {
      const handler = handlers[job.type];
      if (!handler) {
        throw new Error(`no handler registered for job type "${job.type}"`);
      }
      const result = await handler(job.input, {
        jobId: job.id,
        jobType: job.type,
      });
      await sql`
        UPDATE public.jobs
           SET status = 'succeeded',
               result = ${sql.json(result as Parameters<typeof sql.json>[0])},
               completed_at = now()
         WHERE id = ${job.id}
      `;
      jobsProcessed.push({
        id: job.id,
        type: job.type,
        status: "succeeded",
        attempts: job.attempts,
        durationMs: now() - jobStart,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const errorClass =
        err instanceof Error ? err.constructor.name : "unknown";
      const durationMs = now() - jobStart;

      if (job.attempts < maxAttempts) {
        const backoffMs = computeBackoffMs(job.attempts);
        const scheduledFor = new Date(now() + backoffMs);
        await sql`
          UPDATE public.jobs
             SET status = 'queued',
                 scheduled_for = ${scheduledFor},
                 error = ${message},
                 completed_at = NULL
           WHERE id = ${job.id}
        `;
        console.error(
          JSON.stringify({
            event: "worker_retry_scheduled",
            job_id: job.id,
            type: job.type,
            attempt: job.attempts,
            next_scheduled_at: scheduledFor.toISOString(),
            backoff_ms: backoffMs,
            error_class: errorClass,
            ts: new Date().toISOString(),
          }),
        );
        jobsProcessed.push({
          id: job.id,
          type: job.type,
          status: "requeued",
          attempts: job.attempts,
          durationMs,
          error: message,
        });
      } else {
        await sql`
          UPDATE public.jobs
             SET status = 'failed',
                 error = ${message},
                 completed_at = now()
           WHERE id = ${job.id}
        `;
        console.error(
          JSON.stringify({
            event: "worker_retry_exhausted",
            job_id: job.id,
            type: job.type,
            total_attempts: job.attempts,
            final_error: message,
            ts: new Date().toISOString(),
          }),
        );
        jobsProcessed.push({
          id: job.id,
          type: job.type,
          status: "failed_permanent",
          attempts: job.attempts,
          durationMs,
          error: message,
        });
      }
    }
  }

  return {
    jobsProcessed,
    exitReason,
    totalDurationMs: now() - startTs,
    sweep,
  };
}

/**
 * Backoff schedule per Phase 4 Day 2 Session B kickoff Decision 6:
 *   attempts=1 (first failure) → 1 minute
 *   attempts=2 (second failure) → 5 minutes
 *   attempts=3+ doesn't reach this path (handler treats as permanent failure)
 */
function computeBackoffMs(attempts: number): number {
  if (attempts <= 1) return 60_000;
  return 300_000;
}
