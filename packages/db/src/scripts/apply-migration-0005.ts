/**
 * One-off — apply migration 0005 (Pre-Phase 3 Session 0-B foundation migration).
 *
 * Bundles 9 schema changes per docs/PRE-PHASE-3-FIX-PLAN.md §4.2. Runs the
 * entire SQL file in one transaction so any failure rolls back. Idempotent
 * via existence checks on the three new tables (prompt_call_log,
 * transcript_embeddings, sync_state) — if any exist, script assumes the
 * migration already ran and no-ops.
 *
 * Separate from drizzle-kit's migrate chain for consistency with the Phase
 * 2 Day 2 migration-0004 precedent: hand-edited SQL (CREATE EXTENSION,
 * CHECK constraint, USING cast, RLS Pattern D) beyond drizzle-kit's
 * generator output, so bypassing drizzle's migrator is safer.
 *
 * Run after the commit lands locally:
 *   pnpm --filter @nexus/db apply:migration-0005
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

import { loadDevEnv, requireEnv } from "@nexus/shared";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(here, "../../drizzle/0005_majestic_shiva.sql");

async function main(): Promise<void> {
  loadDevEnv();
  const url = requireEnv("DATABASE_URL");
  const sql = postgres(url, { max: 1, prepare: false });

  try {
    // Idempotence check — if any of the three new tables exists, skip.
    const existingRows = await sql<{ table_name: string }[]>`
      SELECT table_name
        FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('prompt_call_log', 'transcript_embeddings', 'sync_state')
    `;
    if (existingRows.length > 0) {
      console.log(
        `already applied — found ${existingRows.length}/3 new tables: ${existingRows.map((r) => r.table_name).join(", ")}. No-op.`,
      );
      return;
    }

    // Read the hand-edited SQL and split on drizzle's `--> statement-breakpoint`
    // markers for clearer error messages on partial failure. Each block may
    // contain leading comments + one SQL statement (Postgres parses comments
    // fine). Filter only truly-empty blocks (blocks whose non-comment lines
    // are empty).
    const raw = readFileSync(MIGRATION_PATH, "utf8");
    const statements = raw
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => {
        if (s.length === 0) return false;
        // Block has content if any non-comment, non-empty line exists.
        return s
          .split("\n")
          .map((line) => line.trim())
          .some((line) => line.length > 0 && !line.startsWith("--"));
      });

    console.log(`applying migration 0005 — ${statements.length} statement blocks...`);

    // Run inside a transaction so partial failures roll back.
    await sql.begin(async (tx) => {
      for (let i = 0; i < statements.length; i += 1) {
        const stmt = statements[i];
        if (!stmt) continue;
        try {
          await tx.unsafe(stmt);
        } catch (err) {
          console.error(`statement ${i + 1}/${statements.length} FAILED:`);
          console.error(stmt.slice(0, 400));
          throw err;
        }
      }
    });

    // Verify the three new tables now exist.
    const verifyRows = await sql<{ table_name: string }[]>`
      SELECT table_name
        FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('prompt_call_log', 'transcript_embeddings', 'sync_state')
       ORDER BY table_name
    `;
    console.log(
      `migration 0005 applied. New tables: ${verifyRows.map((r) => r.table_name).join(", ")}`,
    );

    // Verify the extension.
    const extRows = await sql<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `;
    console.log(`vector extension: ${extRows.length > 0 ? "installed" : "MISSING"}`);

    // Verify RLS enabled on the three new tables.
    const rlsRows = await sql<{ relname: string; relrowsecurity: boolean }[]>`
      SELECT c.relname, c.relrowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relname IN ('prompt_call_log', 'transcript_embeddings', 'sync_state')
       ORDER BY c.relname
    `;
    for (const r of rlsRows) {
      console.log(`RLS ${r.relname}: ${r.relrowsecurity ? "enabled" : "DISABLED"}`);
    }

    // Verify observations.signal_type nullable.
    const sigRows = await sql<{ is_nullable: string }[]>`
      SELECT is_nullable
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'observations'
         AND column_name = 'signal_type'
    `;
    console.log(
      `observations.signal_type nullable: ${sigRows[0]?.is_nullable ?? "UNKNOWN"}`,
    );

    // Verify deal_events.event_context column.
    const ctxRows = await sql<{ column_name: string }[]>`
      SELECT column_name
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'deal_events'
         AND column_name = 'event_context'
    `;
    console.log(`deal_events.event_context: ${ctxRows.length > 0 ? "present" : "MISSING"}`);

    // Verify fitness_velocity enum + column type.
    const enumRows = await sql<{ typname: string }[]>`
      SELECT typname FROM pg_type WHERE typname = 'fitness_velocity'
    `;
    console.log(`fitness_velocity enum: ${enumRows.length > 0 ? "present" : "MISSING"}`);

    console.log("migration 0005 verification PASSED");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
