/**
 * One-off — apply migration 0007 (Phase 4 Day 3 observation-cluster
 * candidate-shape extension).
 *
 * Two structural changes per docs/BUILD-LOG.md `## Forward map` section:
 *   1. Drop NOT NULL on observation_clusters.signal_type + severity.
 *   2. Add 10 candidate-shape columns + UNIQUE constraint on cluster_key
 *      + status hot-path index.
 *
 * Idempotent: if cluster_key column already exists AND signal_type is
 * already nullable, the migration has already run. Partial-state guard
 * matches the migration 0006 precedent.
 *
 * Bypasses drizzle-kit's migrator (matches Phase 2 Day 2 migration-0004 +
 * Pre-Phase 3 Session 0-B migration-0005 + Phase 4 Day 1 migration-0006
 * precedents for hand-edited SQL).
 *
 * Run after the commit lands locally:
 *   pnpm --filter @nexus/db apply:migration-0007
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

import { loadDevEnv, requireEnv } from "@nexus/shared";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(
  here,
  "../../drizzle/0007_phase_4_day_3_observation_clusters.sql",
);

async function main(): Promise<void> {
  loadDevEnv();
  const url = requireEnv("DATABASE_URL");
  const sql = postgres(url, { max: 1, prepare: false });

  try {
    // Idempotence check.
    const colRows = await sql<{ column_name: string; is_nullable: string }[]>`
      SELECT column_name, is_nullable
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'observation_clusters'
         AND column_name IN ('cluster_key', 'signal_type')
    `;
    const clusterKeyExists = colRows.some((r) => r.column_name === "cluster_key");
    const signalTypeRow = colRows.find((r) => r.column_name === "signal_type");
    const signalTypeNullable = signalTypeRow?.is_nullable === "YES";

    if (clusterKeyExists && signalTypeNullable) {
      console.log(
        "already applied — observation_clusters.cluster_key exists AND signal_type is nullable. No-op.",
      );
      return;
    }
    if (clusterKeyExists !== signalTypeNullable) {
      console.warn(
        `partial state detected: cluster_key_exists=${clusterKeyExists}, signal_type_nullable=${signalTypeNullable}. Proceeding cautiously.`,
      );
    }

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

    console.log(
      `applying migration 0007 — ${statements.length} statement blocks...`,
    );

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

    // Verify the new shape.
    const verifyCols = await sql<{ column_name: string; is_nullable: string }[]>`
      SELECT column_name, is_nullable
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'observation_clusters'
       ORDER BY ordinal_position
    `;
    console.log("observation_clusters columns post-migration:");
    for (const c of verifyCols) {
      console.log(`  ${c.column_name} (nullable=${c.is_nullable})`);
    }

    const verifyConstraints = await sql<{ conname: string }[]>`
      SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class cls ON cls.oid = con.conrelid
       WHERE cls.relname = 'observation_clusters' AND con.contype = 'u'
       ORDER BY con.conname
    `;
    console.log(
      `observation_clusters UNIQUE constraints: ${verifyConstraints.map((r) => r.conname).join(", ")}`,
    );

    const verifyIdx = await sql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'observation_clusters'
       ORDER BY indexname
    `;
    console.log(
      `observation_clusters indexes: ${verifyIdx.map((r) => r.indexname).join(", ")}`,
    );

    console.log("migration 0007 applied successfully.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
