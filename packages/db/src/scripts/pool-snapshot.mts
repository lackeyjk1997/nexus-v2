/**
 * Pool diagnostic snapshot — durable ops tooling.
 *
 * Promoted from Pre-Phase-4-Day-2 one-off `_invest-pg-stat-snapshot.mts`
 * after the investigation surfaced two operational realities the snapshot
 * surface helps reason about:
 *
 *   1. The transaction pooler (port 6543) IS the saturating layer. The
 *      EMAXCONN cap is 200 client-side at the pooler. pg_stat_activity
 *      from postgres only sees the pooler's UPSTREAM backend connections
 *      (a small constant — typically 13-30) and is OPAQUE to the pooler's
 *      client-side queue. Synthetic capacity tests confirmed ~155 baseline
 *      pooler-client slots are used by other Supabase services + Supavisor's
 *      own internal connections, leaving only ~45 for the application.
 *
 *   2. The pooler holds backend connections in idle state for ~30s+ after
 *      the application closes its `postgres.js` client. This hysteresis
 *      means a "20-query Promise.all + sql.end()" leaves 16+ idle backend
 *      connections in the snapshot for half a minute, even though the app
 *      believes its pool is closed.
 *
 * Use cases:
 *   - "Is the pool currently leaking?" — look at `long_held_idle_seconds`
 *     entries, especially ones with `application_name="Supavisor"` query
 *     `"DISCARD ALL"` (pooler-internal recycle) or actual SQL queries
 *     idle >60s (genuine app-side leak via the pooler).
 *   - "What is the saturation pattern after a deploy?" — capture before +
 *     during + after, observe the `total_connections` drift.
 *   - "Did the recent mitigation hold?" — capture during synthetic
 *     reproduction OR during natural saturation; compare against pre-fix
 *     baseline.
 *
 * Limit: cannot see pooler-client-side slots directly. EMAXCONN is the
 * ground-truth saturation signal for that surface; this snapshot is the
 * complementary backend view.
 *
 * Usage:
 *   pnpm --filter @nexus/db pool-snapshot                   # default label
 *   pnpm --filter @nexus/db pool-snapshot --label=post_deploy
 */
import postgres from "postgres";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "../../.env.local"), override: true });

const labelArg = process.argv.find((a) => a.startsWith("--label="));
const label = labelArg ? labelArg.slice(8) : "snapshot";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, {
    max: 1,
    idle_timeout: 5,
    prepare: false,
    connection: { application_name: `nexus_pool_snapshot_${label}` },
  });
  try {
    const total = await sql<Array<{ total: number }>>`
      SELECT count(*)::int AS total FROM pg_stat_activity
    `;
    const byState = await sql<Array<{ state: string | null; n: number }>>`
      SELECT state, count(*)::int AS n
      FROM pg_stat_activity
      GROUP BY state
      ORDER BY n DESC
    `;
    const summary = await sql<
      Array<{
        state: string | null;
        backend_type: string | null;
        application_name: string | null;
        usename: string | null;
        n: number;
      }>
    >`
      SELECT state, backend_type, application_name, usename, count(*)::int AS n
      FROM pg_stat_activity
      GROUP BY state, backend_type, application_name, usename
      ORDER BY n DESC
    `;
    // Long-held entries — anything in the same state for >30s. Filters out
    // the snapshot's own connection by pid. Includes the recycled-connection
    // pattern (Supavisor + DISCARD ALL) so operators can spot pooler
    // hysteresis vs. real app-side leaks.
    const longHeld = await sql<
      Array<{
        pid: number;
        state: string | null;
        application_name: string | null;
        backend_type: string | null;
        seconds_in_state: number;
        wait_event_type: string | null;
        wait_event: string | null;
        query: string | null;
      }>
    >`
      SELECT pid, state, application_name, backend_type,
             EXTRACT(EPOCH FROM (now() - state_change))::int AS seconds_in_state,
             wait_event_type, wait_event,
             LEFT(query, 120) AS query
      FROM pg_stat_activity
      WHERE state IS NOT NULL
        AND state_change < now() - interval '30 seconds'
        AND pid != pg_backend_pid()
      ORDER BY state_change ASC
      LIMIT 25
    `;
    // Pooler-recycled-vs-genuine-idle classification. Backend connections
    // with query="DISCARD ALL" + application_name="Supavisor" are the
    // pooler returning a connection to its idle pool — expected
    // post-`sql.end()`. Anything else idle >60s is a candidate leak.
    const candidateLeaks = longHeld.filter(
      (r) =>
        r.seconds_in_state > 60 &&
        !(r.application_name === "Supavisor" && r.query?.startsWith("DISCARD ALL")),
    );
    const out = {
      label,
      ts: new Date().toISOString(),
      total_connections: total[0]?.total ?? 0,
      by_state: byState,
      summary,
      long_held_30s_plus: longHeld,
      candidate_leaks_60s_plus_excl_supavisor_recycle: candidateLeaks,
    };
    console.log(JSON.stringify(out));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(JSON.stringify({ error: msg.slice(0, 200), label }));
  process.exit(1);
});
