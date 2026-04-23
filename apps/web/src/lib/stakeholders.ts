import { StakeholderService } from "@nexus/shared";

import { env } from "./env";

/**
 * Request-scoped StakeholderService factory. Mirrors createMeddpiccService
 * / createHubSpotAdapter: new postgres pool per call, caller MUST
 * `await service.close()` when done.
 */
export function createStakeholderService(): StakeholderService {
  return new StakeholderService({ databaseUrl: env.databaseUrl });
}
