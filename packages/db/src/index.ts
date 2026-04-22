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
 */
export function createDb(url: string, options: { max?: number } = {}) {
  const client = postgres(url, { prepare: false, max: options.max ?? 1 });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
