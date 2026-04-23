import { ObservationService } from "@nexus/shared";

import { env } from "./env";

/**
 * Request-scoped ObservationService factory. Mirrors createMeddpiccService
 * / createStakeholderService / createHubSpotAdapter: new postgres pool per
 * call, caller MUST `await service.close()` when done.
 */
export function createObservationService(): ObservationService {
  return new ObservationService({ databaseUrl: env.databaseUrl });
}
