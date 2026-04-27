import { NextResponse, type NextRequest } from "next/server";
import { createDb, jobs, eq, sql } from "@nexus/db";
import { HANDLERS, type JobType } from "@nexus/shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type ClaimedJob = {
  id: string;
  type: JobType;
  input: unknown;
};

/**
 * Cron-triggered worker. Claims one queued job per invocation using
 * `FOR UPDATE SKIP LOCKED` so concurrent pg_cron invocations never collide.
 * Handlers dispatch via HANDLERS map; unknown types fail loudly.
 *
 * Auth: Bearer CRON_SECRET. The secret is set in Vercel env (all scopes) and
 * injected into pg_cron's http_get via Postgres GUCs (see
 * scripts/configure-cron.ts).
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL missing" }, { status: 500 });
  }

  const db = createDb(process.env.DATABASE_URL);

  // Pre-Phase 4 Session A: pre-claim circuit breaker. The Supabase
  // transaction pooler caps at 200 concurrent clients; saturation surfaced 3
  // of the last 4 sessions. Without this gate, a saturated pool either (a)
  // makes the claim fail with EMAXCONN — increments attempt count + leaves
  // job in 'queued' state ambiguously — or (b) makes a successful claim
  // proceed to a handler that can't open its own connections, marking the
  // job 'running' and stranding it until the 300s maxDuration. Returning
  // 503 + Retry-After surfaces saturation as a recoverable load-shed instead.
  // pg_cron's net.http_get respects HTTP semantics; subsequent ticks retry
  // naturally. Telemetry: one stderr JSON line per circuit break (extends
  // the §2.13.1 telemetry pattern; observable in Vercel function logs).
  try {
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("EMAXCONN") || message.includes("max client connections")) {
      console.error(
        JSON.stringify({
          event: "worker_circuit_break",
          reason: "pool_saturated",
          ts: new Date().toISOString(),
          detail: message.slice(0, 160),
        }),
      );
      return NextResponse.json(
        { error: "pool_saturated", retryAfterSeconds: 30 },
        { status: 503, headers: { "Retry-After": "30" } },
      );
    }
    // Non-EMAXCONN errors fall through to the existing claim path's error
    // surface — let the original `claim_failed` 500 handle them.
    return NextResponse.json({ error: "claim_failed", detail: message }, { status: 500 });
  }

  let claimed: ClaimedJob[];
  try {
    claimed = (await db.execute(sql`
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
       RETURNING id, type, input
    `)) as unknown as ClaimedJob[];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "claim_failed", detail: message }, { status: 500 });
  }

  const job = claimed[0];
  if (!job) {
    return NextResponse.json({ status: "idle", message: "no queued jobs" });
  }

  const start = Date.now();
  try {
    const handler = HANDLERS[job.type];
    if (!handler) {
      throw new Error(`no handler registered for job type "${job.type}"`);
    }
    // Pass JobHandlerContext so handlers (e.g. transcript_pipeline) can
    // populate anchors / audit fields on downstream calls (Claude wrapper
    // prompt_call_log anchors per §2.16.1 decision 3). Handlers that
    // don't need ctx ignore it.
    const result = await handler(job.input, { jobId: job.id, jobType: job.type });
    await db
      .update(jobs)
      .set({ status: "succeeded", result: result as never, completedAt: new Date() })
      .where(eq(jobs.id, job.id));
    return NextResponse.json({
      status: "succeeded",
      jobId: job.id,
      type: job.type,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(jobs)
      .set({ status: "failed", error: message, completedAt: new Date() })
      .where(eq(jobs.id, job.id));
    return NextResponse.json({
      status: "failed",
      jobId: job.id,
      type: job.type,
      error: message,
      durationMs: Date.now() - start,
    });
  }
}
