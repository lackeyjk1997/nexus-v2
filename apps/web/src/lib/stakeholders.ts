import { StakeholderService, getSharedSql } from "@nexus/shared";

import { env } from "./env";

/**
 * Request-scoped StakeholderService factory.
 *
 * Pre-Phase 3 Session 0-B (foundation-review A7): passes the process-wide
 * shared postgres.js pool. `close()` becomes a no-op; shared pool stays alive.
 */
export function createStakeholderService(): StakeholderService {
  return new StakeholderService({
    databaseUrl: env.databaseUrl,
    sql: getSharedSql({ databaseUrl: env.databaseUrl }),
  });
}
