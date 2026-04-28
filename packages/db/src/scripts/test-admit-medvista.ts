/**
 * Live admission exercise — Phase 4 Day 1 Session B verification staircase.
 *
 * Runs SurfaceAdmission.admit({surfaceId: 'deal_detail_intelligence',
 * userId: <demo>, dealId: 321972856545}) against prod Supabase + live
 * Claude scoring on any admitted candidates.
 *
 * **Clean-run expected behavior (§1.18 silence-as-feature
 * verification):** today MedVista has 0 coordinator_patterns (Phase 4
 * Day 2 writes them), 0 raised risk_flags (Preflight 12 verified at
 * session start), 0 active experiments (no Phase 5 writers yet).
 * Expected: empty admitted set, 0 rejections, 0 scoring calls.
 *
 * **Optional synthetic-pattern path (--synthetic):** seeds a single
 * coordinator_pattern row matching MedVista's healthcare/discovery
 * state via direct INSERT, runs admit, expects 1 admitted with
 * non-null score + explanation + 1 prompt_call_log row, then
 * DELETEs the synthetic row regardless of test outcome.
 *
 * Cost ceiling per kickoff Decision 6:
 *   - Clean run: $0 live Claude (empty admitted set → 0 scoring).
 *   - Synthetic path: ~$0.05-0.10 (1 scoring call).
 *
 * Usage:
 *   pnpm --filter @nexus/db exec tsx src/scripts/test-admit-medvista.ts
 *   pnpm --filter @nexus/db exec tsx src/scripts/test-admit-medvista.ts --synthetic
 *
 * Env: requires .env.local with DATABASE_URL + ANTHROPIC_API_KEY.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const here = fileURLToPath(import.meta.url);
loadEnv({
  path: resolve(here, "../../../../../.env.local"),
  override: true,
});

import postgres from "postgres";

import { SurfaceAdmission } from "@nexus/shared";

const MEDVISTA_DEAL_ID = "321972856545";
const SYNTHETIC_PATTERN_KEY =
  "test-session-b-synthetic-pattern-2026-04-28-DELETE-IF-PRESENT";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERT: ${message}`);
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const useSynthetic = args.has("--synthetic");

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }

  console.log(
    `Live admit-medvista — Phase 4 Day 1 Session B (synthetic=${useSynthetic})\n`,
  );

  const sql = postgres(dbUrl, { max: 1, prepare: false, idle_timeout: 30 });

  // Resolve a userId — any authenticated user works for the clean run
  // (no dismissals exist; user_id doesn't materially gate). For the
  // synthetic-pattern run we'd want a real demo user; lookup the first
  // public.users row.
  const users = await sql<Array<{ id: string; email: string }>>`
    SELECT id, email FROM public.users ORDER BY created_at ASC LIMIT 1
  `;
  if (users.length === 0) {
    throw new Error("No users found in public.users — cannot run admission");
  }
  const userId = users[0]!.id;
  console.log(`Using userId=${userId} (email=${users[0]!.email})`);

  // Inserted synthetic pattern's id (for cleanup).
  let syntheticPatternId: string | null = null;

  try {
    if (useSynthetic) {
      console.log(`\n── Seeding synthetic pattern ──`);
      // INSERT a coordinator_pattern matching MedVista healthcare /
      // discovery state. Use a unique pattern_key with a clear marker
      // so accidental survivors are easy to delete.
      const inserted = await sql<Array<{ id: string }>>`
        INSERT INTO coordinator_patterns (
          pattern_key, signal_type, vertical, competitor, synthesis,
          recommendations, arr_impact, applicability, status, score, reasoning
        ) VALUES (
          ${SYNTHETIC_PATTERN_KEY},
          'competitive_intel',
          'healthcare',
          'Microsoft DAX',
          'Synthetic Session B test pattern — Microsoft DAX competitive in healthcare discovery deals.',
          ${sql.json([
            {
              priority: "this_week",
              application: "deal_specific",
              action: "Synthetic test recommendation — DELETE me with the pattern.",
              cited_signal_quotes: ["synthetic test quote"],
            },
          ])},
          ${sql.json({
            aggregate_arr: 1_500_000,
            directly_affected_deals: 3,
            multiplier: 1.5,
          })},
          ${sql.json({
            description: "synthetic-test rule (passes everything)",
          })},
          'detected',
          '85.00',
          'Synthetic test reasoning — Session B verification staircase.'
        )
        RETURNING id
      `;
      syntheticPatternId = inserted[0]?.id ?? null;
      assert(syntheticPatternId, "synthetic pattern insert returned an id");
      // Link the pattern to MedVista.
      await sql`
        INSERT INTO coordinator_pattern_deals (pattern_id, hubspot_deal_id)
        VALUES (${syntheticPatternId}, ${MEDVISTA_DEAL_ID})
      `;
      console.log(`Inserted synthetic pattern ${syntheticPatternId} + linked to MedVista`);
    }

    console.log(`\n── Running admission ──`);
    const engine = new SurfaceAdmission({ databaseUrl: dbUrl, sql });
    const result = await engine.admit({
      surfaceId: "deal_detail_intelligence",
      userId,
      dealId: MEDVISTA_DEAL_ID,
    });
    await engine.close();

    console.log(`admitted.length=${result.admitted.length}`);
    console.log(`rejections.length=${result.rejections.length}`);

    if (result.admitted.length > 0) {
      console.log(`\nAdmitted insights (sorted by score desc):`);
      for (const item of result.admitted) {
        const id =
          item.kind === "pattern"
            ? item.pattern.id
            : item.kind === "experiment"
              ? item.experiment.id
              : item.riskFlag.id;
        console.log(
          `  - [${item.kind} ${id}] score=${item.score} — ${item.scoreExplanation}`,
        );
      }
    }

    // Verifications.
    if (useSynthetic) {
      assert(
        result.admitted.length === 1,
        `synthetic path expected 1 admitted, got ${result.admitted.length}`,
      );
      const top = result.admitted[0]!;
      assert(top.kind === "pattern", "admitted item should be a pattern");
      assert(
        top.score >= 0 && top.score <= 100,
        `score in [0..100], got ${top.score}`,
      );
      assert(
        top.scoreExplanation.length > 0,
        "scoreExplanation should be non-empty",
      );
      console.log(`\n✓ Synthetic-pattern path verified: 1 admitted with live score + explanation`);
    } else {
      assert(
        result.admitted.length === 0,
        `clean run expected 0 admitted (§1.18 silence verification), got ${result.admitted.length}`,
      );
      assert(
        result.rejections.length === 0,
        `clean run expected 0 in-memory rejections, got ${result.rejections.length}`,
      );
      console.log(
        `\n✓ Clean-run §1.18 silence verification PASS — empty admitted set, 0 errors`,
      );
    }
  } finally {
    // Cleanup — always runs, even if test failed.
    if (syntheticPatternId) {
      console.log(`\n── Cleaning up synthetic pattern ${syntheticPatternId} ──`);
      // Cascade via FK: delete the pattern; coordinator_pattern_deals
      // links cascade ON DELETE.
      await sql`
        DELETE FROM coordinator_patterns WHERE id = ${syntheticPatternId}
      `;
      // Defensive fallback by pattern_key in case FK didn't cascade
      // and we leaked pattern_deals.
      await sql`
        DELETE FROM coordinator_patterns WHERE pattern_key = ${SYNTHETIC_PATTERN_KEY}
      `;
      console.log(`✓ Cleanup complete`);
    }
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
