import { MeddpiccService } from "@nexus/shared";

import { env } from "./env";

/**
 * Request-scoped MeddpiccService factory.
 *
 * Each call creates a new service instance with its own postgres pool.
 * Caller MUST `await service.close()` when done. Mirrors the
 * `createHubSpotAdapter` pattern in lib/crm.ts.
 */
export function createMeddpiccService(): MeddpiccService {
  return new MeddpiccService({ databaseUrl: env.databaseUrl });
}
