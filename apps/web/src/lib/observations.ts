import { ObservationService, getSharedSql } from "@nexus/shared";

import { env } from "./env";

/**
 * Request-scoped ObservationService factory.
 *
 * Pre-Phase 3 Session 0-B (foundation-review A7): passes the process-wide
 * shared postgres.js pool. `close()` becomes a no-op; shared pool stays alive.
 */
export function createObservationService(): ObservationService {
  return new ObservationService({
    databaseUrl: env.databaseUrl,
    sql: getSharedSql({ databaseUrl: env.databaseUrl }),
  });
}
