/**
 * One-off — apply migration 0008 (Granola click→score automation).
 *
 * Two statements: 'granola' transcript_source enum value + the
 * granola_watch_config pinned-deal table. ALTER TYPE ... ADD VALUE cannot
 * run inside a transaction block, so statements execute sequentially
 * unwrapped (both are individually idempotent: IF NOT EXISTS on each).
 *
 * Run:
 *   pnpm --filter @nexus/db apply:migration-0008
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv6first");

import postgres from "postgres";

import { loadDevEnv, requireEnv } from "@nexus/shared";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(here, "../../drizzle/0008_granola_watch.sql");

loadDevEnv();

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? requireEnv("DIRECT_URL");
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    const raw = readFileSync(MIGRATION_PATH, "utf8");
    const statements = raw
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      await sql.unsafe(stmt);
    }
    const check = await sql<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'granola_watch_config'
      ) AS exists
    `;
    const enumCheck = await sql<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'transcript_source' AND e.enumlabel = 'granola'
      ) AS exists
    `;
    console.log(
      `migration 0008: granola_watch_config=${check[0]!.exists} ` +
        `transcript_source 'granola'=${enumCheck[0]!.exists}`,
    );
    if (!check[0]!.exists || !enumCheck[0]!.exists) process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
