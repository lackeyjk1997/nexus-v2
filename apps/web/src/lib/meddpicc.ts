import { MeddpiccService, getSharedSql } from "@nexus/shared";

import { env } from "./env";

/**
 * Request-scoped MeddpiccService factory.
 *
 * Pre-Phase 3 Session 0-B (foundation-review A7): passes the process-wide
 * shared postgres.js pool. `close()` becomes a no-op because `ownedSql` is
 * false; shared pool stays alive across requests.
 */
export function createMeddpiccService(): MeddpiccService {
  return new MeddpiccService({
    databaseUrl: env.databaseUrl,
    sql: getSharedSql({ databaseUrl: env.databaseUrl }),
  });
}
