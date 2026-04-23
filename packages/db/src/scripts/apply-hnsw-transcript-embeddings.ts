/**
 * Apply HNSW index on `transcript_embeddings.embedding` — Phase 3 Day 2
 * Session A (run after Session B's first live pipeline populates rows).
 *
 * §2.16.1 Decision 1: HNSW (`ef_construction=64, m=16`) over
 * `vector_cosine_ops` — the standard pgvector setup for voyage/OpenAI-dim
 * cosine similarity. Decision locks "HNSW index added after first real
 * rows exist" because HNSW graph construction is cheaper against
 * populated data than empty.
 *
 * Session 0-B deliberately landed the table without the index; the
 * schema.ts definition gains the index Session A for drizzle-kit-generate
 * diff-cleanliness, and THIS script is the authoritative creator that
 * runs once the preprocessor has written first rows.
 *
 * Idempotent: `CREATE INDEX IF NOT EXISTS` — safe to re-run, and the
 * next-phase demo-reset script can call this as a post-truncate warm
 * step alongside the seed scripts.
 *
 * Uses DIRECT_URL to bypass the Supabase transaction pooler (which the
 * project's cumulative session load has saturated in Session A runs —
 * see operational notes).
 *
 * Usage:
 *   pnpm --filter @nexus/db apply:hnsw-transcript-embeddings
 */
import postgres from "postgres";

import { loadDevEnv, requireEnv } from "@nexus/shared";

loadDevEnv();

async function main(): Promise<void> {
  const url = process.env.DIRECT_URL ?? requireEnv("DATABASE_URL");
  const sql = postgres(url, { max: 1, prepare: false });

  try {
    console.log("Apply HNSW index on transcript_embeddings — §2.16.1 Decision 1\n");

    console.log("[1/3] Check transcript_embeddings row count…");
    const countRows = await sql<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM transcript_embeddings
    `;
    const rowCount = countRows[0]!.n;
    console.log(`      rows=${rowCount}`);
    if (rowCount === 0) {
      console.log(
        "      ⚠ NOTE: empty table. §2.16.1 Decision 1 locks 'after first real rows exist' — HNSW build is cheaper against populated data. Proceeding anyway; the CREATE INDEX IF NOT EXISTS is idempotent.",
      );
    }

    console.log("[2/3] Check existing index…");
    const existing = await sql<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
       WHERE tablename = 'transcript_embeddings'
         AND indexname = 'transcript_embeddings_embedding_hnsw'
    `;
    if (existing.length > 0) {
      console.log("      already exists — no-op");
    } else {
      console.log("      no existing index; creating…");
      console.log("[3/3] CREATE INDEX (this may take seconds-to-minutes at scale)…");
      await sql.unsafe(
        `CREATE INDEX IF NOT EXISTS transcript_embeddings_embedding_hnsw
           ON transcript_embeddings USING hnsw (embedding vector_cosine_ops)
           WITH (ef_construction = 64, m = 16)`,
      );
      console.log("      OK");
    }

    console.log("[verify] pg_indexes listing for transcript_embeddings:");
    const all = await sql<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname, indexdef FROM pg_indexes
       WHERE tablename = 'transcript_embeddings'
       ORDER BY indexname
    `;
    for (const row of all) {
      console.log(`      • ${row.indexname}`);
    }

    console.log("");
    console.log("HNSW index on transcript_embeddings: READY.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
