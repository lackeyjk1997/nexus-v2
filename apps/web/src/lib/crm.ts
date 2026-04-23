import { HubSpotAdapter, getSharedSql, loadPipelineIds } from "@nexus/shared";

import { env } from "./env";

/**
 * Request-scoped HubSpotAdapter factory.
 *
 * Pre-Phase 3 Session 0-B (foundation-review A7): passes the process-wide
 * shared postgres.js pool via `getSharedSql()` so per-request adapter
 * construction no longer opens a new pool. `close()` on the adapter is a
 * no-op because `ownedSql` is false; the shared pool stays alive.
 *
 * Prior behavior (pre-0B): each call opened its own `max: 2` postgres pool
 * with 30s idle_timeout. Under Session A workloads, this compounded with
 * MeddpiccService/StakeholderService/ObservationService pools and saturated
 * the Supabase Transaction Pooler 200-client cap.
 */
export function createHubSpotAdapter(): HubSpotAdapter {
  return new HubSpotAdapter({
    token: env.hubspotToken,
    portalId: env.hubspotPortalId,
    clientSecret: env.hubspotClientSecret,
    databaseUrl: env.databaseUrl,
    pipelineIds: loadPipelineIds(),
    sql: getSharedSql({ databaseUrl: env.databaseUrl }),
  });
}
