import { HubSpotAdapter, loadPipelineIds } from "@nexus/shared";

import { env } from "./env";

/**
 * Request-scoped HubSpotAdapter factory.
 *
 * Each call creates a new adapter instance with its own postgres pool. The
 * caller MUST `await adapter.close()` when done to release connections.
 *
 * Phase 2 will hoist this into a singleton once streaming + long-lived
 * connections are better understood; Day-5 use is bounded (one route handler
 * or one Server Component per request).
 */
export function createHubSpotAdapter(): HubSpotAdapter {
  return new HubSpotAdapter({
    token: env.hubspotToken,
    portalId: env.hubspotPortalId,
    clientSecret: env.hubspotClientSecret,
    databaseUrl: env.databaseUrl,
    pipelineIds: loadPipelineIds(),
  });
}
