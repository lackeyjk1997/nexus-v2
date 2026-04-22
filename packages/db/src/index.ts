import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

export * from "./schema.js";

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
