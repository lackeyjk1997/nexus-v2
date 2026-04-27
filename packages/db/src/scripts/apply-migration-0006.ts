/**
 * One-off — apply migration 0006 (Phase 4 Day 1 Session A foundation migration).
 *
 * Two structural changes per docs/BUILD-LOG.md `## Forward map` section:
 *   1. event_context SET NOT NULL on deal_events (§2.16.1 decision 2 flip).
 *   2. CREATE TABLE applicability_rejections + 3 indexes + RLS Pattern D.
 *
 * Idempotent: if applicability_rejections already exists AND deal_events
 * .event_context is already NOT NULL, the migration has already run.
 *
 * Bypasses drizzle-kit's migrator (matches Phase 2 Day 2 migration-0004 +
 * Pre-Phase 3 Session 0-B migration-0005 precedent for hand-edited SQL).
 *
 * Run after the commit lands locally:
 *   pnpm --filter @nexus/db apply:migration-0006
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

import { loadDevEnv, requireEnv } from "@nexus/shared";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(here, "../../drizzle/0006_phase_4_day_1_session_a.sql");

async function main(): Promise<void> {
  loadDevEnv();
  const url = requireEnv("DATABASE_URL");
  const sql = postgres(url, { max: 1, prepare: false });

  try {
    // Idempotence check — if applicability_rejections exists AND
    // event_context is already NOT NULL, no-op.
    const tableRows = await sql<{ table_name: string }[]>`
      SELECT table_name
        FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = 'applicability_rejections'
    `;
    const colRows = await sql<{ is_nullable: string }[]>`
      SELECT is_nullable
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'deal_events'
         AND column_name = 'event_context'
    `;
    const tableExists = tableRows.length > 0;
    const eventContextNotNull = colRows[0]?.is_nullable === "NO";

    if (tableExists && eventContextNotNull) {
      console.log(
        "already applied — applicability_rejections exists AND deal_events.event_context is NOT NULL. No-op.",
      );
      return;
    }
    if (tableExists !== eventContextNotNull) {
      console.warn(
        `partial state detected: applicability_rejections=${tableExists}, event_context_not_null=${eventContextNotNull}. Proceeding cautiously.`,
      );
    }

    // Read the hand-edited SQL and split on drizzle's `--> statement-breakpoint`
    // markers (matches migration 0005 applicator).
    const raw = readFileSync(MIGRATION_PATH, "utf8");
    const statements = raw
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => {
        if (s.length === 0) return false;
        return s
          .split("\n")
          .map((line) => line.trim())
          .some((line) => line.length > 0 && !line.startsWith("--"));
      });

    console.log(`applying migration 0006 — ${statements.length} statement blocks...`);

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

    // Verify event_context is now NOT NULL.
    const verifyCol = await sql<{ is_nullable: string }[]>`
      SELECT is_nullable
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'deal_events'
         AND column_name = 'event_context'
    `;
    console.log(
      `deal_events.event_context is_nullable: ${verifyCol[0]?.is_nullable ?? "MISSING"} (expected NO)`,
    );

    // Verify applicability_rejections table + indexes + RLS.
    const verifyTable = await sql<{ table_name: string }[]>`
      SELECT table_name
        FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'applicability_rejections'
    `;
    console.log(
      `applicability_rejections table: ${verifyTable.length > 0 ? "exists" : "MISSING"}`,
    );

    const idxRows = await sql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'applicability_rejections'
       ORDER BY indexname
    `;
    console.log(
      `applicability_rejections indexes: ${idxRows.map((r) => r.indexname).join(", ")}`,
    );

    const rlsRows = await sql<{ relname: string; relrowsecurity: boolean }[]>`
      SELECT c.relname, c.relrowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'applicability_rejections'
    `;
    for (const r of rlsRows) {
      console.log(`RLS ${r.relname}: ${r.relrowsecurity ? "enabled" : "DISABLED"}`);
    }

    const policyRows = await sql<{ policyname: string }[]>`
      SELECT policyname FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'applicability_rejections'
       ORDER BY policyname
    `;
    console.log(
      `applicability_rejections policies: ${policyRows.map((r) => r.policyname).join(", ")}`,
    );

    console.log("migration 0006 applied successfully.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
