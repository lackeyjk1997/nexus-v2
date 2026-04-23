/**
 * Process-wide shared postgres.js client (foundation-review anchor: Output 2 A7).
 *
 * Before this module, every factory in `apps/web/src/lib/` opened its own
 * `postgres()` pool per request. A single `/pipeline/[dealId]` page load
 * spawned MeddpiccService + HubSpotAdapter + StakeholderService concurrently,
 * each with its own 1–2-connection pool. Session A saturated the 200-client
 * Supabase Transaction Pooler cap mid-verification; Session B trimmed per-
 * service `max` as a partial mitigation. This module is the proper fix.
 *
 * Usage:
 *   - Request-scoped factories in `apps/web/src/lib/` pass `sql: getSharedSql()`
 *     when constructing services/adapters. Those constructors record
 *     `ownedSql: false`, so their `close()` is a no-op — the shared pool
 *     stays alive across requests.
 *   - Scripts + long-running workers that want dedicated pool semantics keep
 *     passing `{databaseUrl}` only; the service creates its own pool as
 *     before.
 *
 * Lifecycle:
 *   - Lazy-initialized on first `getSharedSql()` call.
 *   - In Next.js dev (Turbopack), module state resets on hot-reload; the
 *     pool gets recreated per reload. Acceptable for dev.
 *   - In Vercel serverless (Fluid Compute), module state is per-container.
 *     Warm containers reuse the pool across requests. Cold starts create a
 *     fresh pool. Connections close when the container is reclaimed.
 *
 * RLS:
 *   - This is a service-role / pooler connection. It bypasses RLS by design.
 *   - Pattern A tables (observations, surface_dismissals, surface_feedback,
 *     notifications) require application-layer enforcement: route boundary
 *     validates `auth.getUser()` and passes `user.id` as the row's
 *     `observer_id`/`user_id`. The `test-rls-*.ts` scripts remain the canary
 *     for schema/policy drift.
 */
import postgres from "postgres";

export interface SharedSqlOptions {
  /** Override the DATABASE_URL env var. Useful in tests. */
  databaseUrl?: string;
  /** Max connections in the shared pool. Default: 10. */
  max?: number;
  /** Idle timeout in seconds. Default: 60. */
  idleTimeout?: number;
}

let sharedSqlInstance: postgres.Sql | undefined;

/**
 * Get (or lazily create) the process-wide shared postgres.js client.
 *
 * Subsequent calls return the same instance regardless of `options` — first
 * call wins. Call `resetSharedSql()` to allow recreation (tests only).
 */
export function getSharedSql(options: SharedSqlOptions = {}): postgres.Sql {
  if (sharedSqlInstance) return sharedSqlInstance;

  const url = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "getSharedSql: DATABASE_URL is not set. Pass `options.databaseUrl` or set the env var.",
    );
  }

  sharedSqlInstance = postgres(url, {
    max: options.max ?? 10,
    idle_timeout: options.idleTimeout ?? 60,
    // Pooler requires prepare: false (transaction-mode pooler doesn't support
    // prepared statements across transactions).
    prepare: false,
  });
  return sharedSqlInstance;
}

/**
 * Drop the shared-client reference. Does NOT call `end()` on the pool —
 * caller is responsible for cleanup if needed (normally pool dies with
 * process). For tests only.
 */
export function resetSharedSql(): void {
  sharedSqlInstance = undefined;
}

/**
 * Explicit shutdown — awaits pool drain. Only needed for scripts or
 * test harnesses that want to exit cleanly. In long-running processes
 * (Next.js server, Vercel functions) the pool dies with the process.
 */
export async function closeSharedSql(): Promise<void> {
  if (!sharedSqlInstance) return;
  const sql = sharedSqlInstance;
  sharedSqlInstance = undefined;
  await sql.end({ timeout: 5 });
}
