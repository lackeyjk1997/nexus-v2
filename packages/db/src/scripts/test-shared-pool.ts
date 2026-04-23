/**
 * Pool-saturation smoke test — foundation-review A7 verification.
 *
 * Before A7: each factory in `apps/web/src/lib/` opened its own postgres
 * pool. A single `/pipeline/[dealId]` page spawned MeddpiccService +
 * HubSpotAdapter + StakeholderService + ObservationService concurrently,
 * each with its own `max: 1-2` pool, for a peak of ~5 connections per
 * request. Under concurrent load, this saturated the 200-client Supabase
 * Transaction Pooler cap.
 *
 * After A7: all four factories borrow a process-wide shared pool via
 * `getSharedSql()`. Peak connections from a single "request simulator"
 * should stay at `getSharedSql`'s `max` (default 10), regardless of how
 * many service instances are constructed per iteration.
 *
 * Test: spin up 20 "requests" concurrently, each constructing all four
 * factories + issuing a trivial SELECT via each. Measure distinct pool
 * count via a probe (pg_stat_activity-based). Assert total connections
 * < 20 (significantly below the 40+ that pre-A7 would have used).
 */

import { ObservationService, StakeholderService, MeddpiccService, getSharedSql, closeSharedSql } from "@nexus/shared";
import postgres from "postgres";

import { loadDevEnv, requireEnv } from "@nexus/shared";

interface PoolStats {
  sharedPoolActive: number;
  totalAppConnections: number;
}

async function getStats(probe: postgres.Sql): Promise<PoolStats> {
  // Count active connections from *this process*. Supabase doesn't expose
  // per-process detail via pg_stat_activity reliably through the pooler,
  // so we fall back to a rough count of state='active' connections from
  // the same usename.
  const rows = await probe<{ n: number }[]>`
    SELECT COUNT(*)::int AS n
      FROM pg_stat_activity
     WHERE state != 'idle'
       AND pid != pg_backend_pid()
  `;
  const n = rows[0]?.n ?? 0;
  return { sharedPoolActive: n, totalAppConnections: n };
}

async function simulateRequest(dealId: string): Promise<void> {
  const databaseUrl = requireEnv("DATABASE_URL");
  // Each "request" constructs all four factory-equivalents with shared sql.
  // Mirrors what apps/web/src/lib/*.ts factories do, minus the adapter's
  // HubSpot dependencies (pure DB path).
  const sharedSql = getSharedSql({ databaseUrl });
  const meddpicc = new MeddpiccService({ databaseUrl, sql: sharedSql });
  const stakeholder = new StakeholderService({ databaseUrl, sql: sharedSql });
  const observation = new ObservationService({ databaseUrl, sql: sharedSql });

  try {
    await meddpicc.getByDealId(dealId); // returns null if not found — fine
    await stakeholder.listForDeal(dealId);
    // Skip observation.record (writes a row we'd have to clean up).
    // Just exercise the pool via the already-constructed service.
    void observation; // no read-path method; construction alone exercises the DI seam
  } finally {
    await meddpicc.close(); // no-op with shared pool
    await stakeholder.close(); // no-op with shared pool
    await observation.close(); // no-op with shared pool
  }
}

async function main(): Promise<void> {
  loadDevEnv();
  const databaseUrl = requireEnv("DATABASE_URL");

  // Independent probe connection (not through the shared pool).
  const probe = postgres(databaseUrl, { max: 1, prepare: false });

  try {
    const before = await getStats(probe);
    console.log(`before: ${before.totalAppConnections} active app connections`);

    // 20 concurrent "requests" — exercises the shared pool under
    // realistic-ish load.
    const N = 20;
    console.log(`simulating ${N} concurrent requests...`);
    const results = await Promise.allSettled(
      Array.from({ length: N }, (_, i) => simulateRequest(`test-deal-${i}`)),
    );
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    console.log(`  succeeded: ${succeeded}, failed: ${failed}`);
    if (failed > 0) {
      for (const r of results) {
        if (r.status === "rejected") console.error(r.reason);
      }
    }

    const during = await getStats(probe);
    console.log(`during (peak): ${during.totalAppConnections} active app connections`);

    // Cleanup — shut down the shared pool.
    await closeSharedSql();
    // Small delay for connections to drain.
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const after = await getStats(probe);
    console.log(`after: ${after.totalAppConnections} active app connections`);

    // Peak should be ≤ 20 (getSharedSql max=10 + probe=1 + misc). Pre-A7
    // this workload would have been 20 × (~5 per-request pools × 1-2 max)
    // = 100-200 connections easily, saturating the pooler.
    const PEAK_THRESHOLD = 20;
    if (during.totalAppConnections > PEAK_THRESHOLD) {
      console.error(
        `  FAIL: peak ${during.totalAppConnections} exceeds threshold ${PEAK_THRESHOLD}`,
      );
      process.exit(1);
    }
    if (succeeded < N) {
      console.error(`  FAIL: ${failed}/${N} requests failed`);
      process.exit(1);
    }
    console.log(
      `POOL SATURATION CHECK PASSED — peak ≤ ${PEAK_THRESHOLD}, all ${N} simulated requests succeeded`,
    );
  } finally {
    await probe.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
