import { NextResponse, type NextRequest } from "next/server";
import { getSharedSql, runWorkerLoop } from "@nexus/shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Cron-triggered worker. Phase 4 Day 2 Session B refactored the route to
 * delegate the claim/run/status loop to `runWorkerLoop` in
 * @nexus/shared/jobs/worker-runner. The route handles auth + circuit-
 * breaker only; all retry/concurrency/sweep logic lives in the runner
 * (testable without a Next.js request/response harness).
 *
 * Auth: Bearer CRON_SECRET. The secret is set in Vercel env (all scopes) and
 * injected into pg_cron's http_get via Postgres GUCs (see
 * scripts/configure-cron.ts).
 *
 * Pool sharing (Pre-Phase-4-Day-2 Hypothesis 1 fix). The shared pool is
 * initialized lazily by `getSharedSql()` and reused across the route's
 * pre-claim ping + the runner's claim + handler dispatch. Previous
 * `createDb(DATABASE_URL)` per-invocation pattern leaked one connection
 * per cron firing; structural fix landed Pre-Phase-4-Day-2.
 *
 * Behaviors delegated to `runWorkerLoop`:
 *   - Stalled-job sweep at start of every invocation (§4.5 retry policy +
 *     amendment for handler overruns)
 *   - Pre-claim time-budget check (240s budget, 60s margin to maxDuration)
 *   - Loop-until-empty within budget
 *   - Retry policy on handler failure (3 attempts max; 1m + 5m backoff)
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

  const sql = getSharedSql();

  // Pre-Phase 4 Session A: pre-claim circuit breaker. The Supabase
  // transaction pooler caps at 200 concurrent clients; saturation surfaced 3
  // of the last 4 sessions before the Pre-Phase-4-Day-2 leak fix. This gate
  // remains as defense even with the leak fixed — if a future regression
  // saturates the pool, returning 503 + Retry-After surfaces saturation as
  // a recoverable load-shed instead of failing claims ambiguously.
  // pg_cron's net.http_get respects HTTP semantics; subsequent ticks retry
  // naturally. Telemetry: one stderr JSON line per circuit break.
  try {
    await sql`SELECT 1`;
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
    return NextResponse.json({ error: "ping_failed", detail: message }, { status: 500 });
  }

  let result;
  try {
    result = await runWorkerLoop(sql);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "worker_loop_failed", detail: message }, { status: 500 });
  }

  return NextResponse.json({
    status: result.jobsProcessed.length > 0 ? "completed" : "idle",
    jobsProcessed: result.jobsProcessed.length,
    exitReason: result.exitReason,
    totalDurationMs: result.totalDurationMs,
    sweep: result.sweep,
    jobs: result.jobsProcessed.map((j) => ({
      id: j.id,
      type: j.type,
      status: j.status,
      attempts: j.attempts,
      durationMs: j.durationMs,
    })),
  });
}
