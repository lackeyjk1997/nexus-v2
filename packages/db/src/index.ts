import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export * from "./schema";

// Re-export the drizzle helpers apps/web uses. Keeps @nexus/db as the single
// import surface so route handlers don't need drizzle-orm as a direct dep.
export { sql, eq, and, or, not, inArray, desc, asc } from "drizzle-orm";

/**
 * Drizzle client factory. Supabase's pooled URL uses PgBouncer in transaction
 * mode, which requires prepare:false. For direct URLs prepare can stay on but
 * prepare:false is still safe.
 *
 * Pre-Phase-4-Day-2 mitigation: `idle_timeout` default 30s. postgres.js
 * default is `0` (never close idle connections), so without this every
 * `createDb()` call held its connection alive indefinitely until process
 * death. In Vercel Fluid Compute warm containers this leaked one connection
 * per route invocation across cron firings — the dominant root-cause of the
 * recurring EMAXCONN cascade. The shared-pool `idle_timeout` (60s in
 * `getSharedSql`) is intentionally longer to keep that pool warm across
 * requests; per-invocation pools should reap aggressively.
 *
 * For long-lived consumers (the worker route) prefer `createDbFromSharedSql`
 * so all routes + handlers share a single per-container pool rather than
 * creating fresh ones.
 */
export function createDb(
  url: string,
  options: { max?: number; idleTimeout?: number } = {},
) {
  const client = postgres(url, {
    prepare: false,
    max: options.max ?? 1,
    idle_timeout: options.idleTimeout ?? 30,
  });
  return drizzle(client, { schema });
}

/**
 * Wrap an existing `postgres.js` client (typically `getSharedSql()` from
 * `@nexus/shared`) with Drizzle. Used by route handlers so that every
 * postgres connection a Vercel container makes flows through ONE shared
 * pool, rather than per-invocation `createDb()` allocating fresh pools
 * that the postgres.js default `idle_timeout: 0` keeps alive for the
 * container's full warm lifetime.
 *
 * Pre-Phase-4-Day-2 anchor for the Hypothesis 1 fix.
 */
export function createDbFromSharedSql(client: postgres.Sql) {
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
