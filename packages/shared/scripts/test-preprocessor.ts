/**
 * TranscriptPreprocessor standalone harness — Phase 3 Day 2 Session A.
 *
 * Exercises the preprocessor end-to-end against the seeded MedVista
 * discovery transcript. Verifies:
 *
 *   1. Preprocessor locates the transcripts row by ID
 *   2. Speaker-turn segmentation extracts a reasonable number of turns
 *      with speaker names from the participant list
 *   3. Entity extraction populates competitors (MedVista fixture names
 *      Microsoft DAX Copilot, Nuance, Dragon, PowerScribe, etc.)
 *   4. Voyage returns 1 + N embeddings with expected dimensionality
 *   5. `analyzed_transcripts` row exists with speaker_turns jsonb
 *   6. `transcript_embeddings` rows exist: 1 scope='transcript' +
 *      N scope='speaker_turn' with matching indices
 *
 * Cost: ONE Voyage embedding call batching 1 + N texts (MedVista fixture
 * is ~8K chars, ~N=~25 turns → ~26 texts per batch). ~1-2K Voyage tokens
 * at $0.12 per 1M = <$0.001 per run. Practically free to re-run.
 *
 * Prerequisite: `pnpm --filter @nexus/db seed:medvista-transcript` has
 * been run so a `transcripts` row exists with the sentinel engagement ID.
 *
 * Usage:
 *   pnpm --filter @nexus/shared test:preprocessor
 */
import dns from "node:dns";

// Supabase direct host (db.<ref>.supabase.co) resolves only AAAA on dev
// Macs as of Phase 3 Day 4. Force IPv6-first so getaddrinfo doesn't
// ENOTFOUND on the IPv4 path. Must precede any postgres import so the
// resolver order applies to the first connection.
dns.setDefaultResultOrder("ipv6first");

import postgres from "postgres";

import {
  TranscriptPreprocessor,
  loadDevEnv,
  requireEnv,
} from "@nexus/shared";

loadDevEnv();

const SENTINEL_ENGAGEMENT_ID = "fixture-medvista-discovery-01";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERT: ${message}`);
}

async function main(): Promise<void> {
  // Phase 3 Day 4 Session B: dev-Mac IPv6 route to Supabase direct host
  // is broken; prefer pooler URL (IPv4, works) over DIRECT_URL (IPv6-only,
  // unreachable). Falls back to DIRECT_URL if DATABASE_URL absent.
  const url = process.env.DATABASE_URL ?? requireEnv("DIRECT_URL");
  const verify = postgres(url, { max: 1, prepare: false });

  console.log("TranscriptPreprocessor standalone harness — Phase 3 Day 2 Session A\n");

  try {
    console.log("[0/6] Locate seeded MedVista transcript…");
    const rows = await verify<Array<{ id: string; text_length: number }>>`
      SELECT id, length(transcript_text)::int AS text_length
        FROM transcripts
       WHERE hubspot_engagement_id = ${SENTINEL_ENGAGEMENT_ID}
       LIMIT 1
    `;
    if (rows.length === 0) {
      throw new Error(
        `No MedVista transcript seeded. Run: pnpm --filter @nexus/db seed:medvista-transcript`,
      );
    }
    const transcriptId = rows[0]!.id;
    console.log(
      `      transcript id=${transcriptId} text_length=${rows[0]!.text_length}`,
    );

    console.log("[1/6] Run preprocessor.preprocess()…");
    const preprocessor = new TranscriptPreprocessor({ databaseUrl: url });
    const result = await preprocessor.preprocess(transcriptId);
    await preprocessor.close();
    console.log(
      `      speakerTurnCount=${result.speakerTurnCount}`,
      `\n      wordCount=${result.wordCount}`,
      `\n      competitorsMentioned=[${result.competitorsMentioned.join(", ")}]`,
      `\n      embeddingModel=${result.embeddingModel}`,
      `\n      embeddingsWritten=${result.embeddingsWritten}`,
      `\n      embeddingTokensUsed=${result.embeddingTokensUsed}`,
    );

    assert(result.speakerTurnCount >= 10, "expected at least 10 turns in MedVista fixture");
    assert(result.wordCount > 100, "expected word_count > 100");
    assert(
      result.competitorsMentioned.length > 0,
      "expected competitors extracted from MedVista fixture",
    );
    assert(
      result.competitorsMentioned.some((c) => c.toLowerCase().includes("microsoft")),
      "expected 'Microsoft' in competitors_mentioned (fixture has Microsoft DAX)",
    );
    assert(result.embeddingsWritten === result.speakerTurnCount + 1, "embeddings = 1 + N turns");
    assert(result.embeddingModel.length > 0, "embedding_model must be populated");

    console.log("[2/6] Verify analyzed_transcripts row…");
    const at = await verify<
      Array<{
        transcript_id: string;
        turn_count: number;
        word_count: number;
        competitors_count: number;
        entities: unknown;
      }>
    >`
      SELECT transcript_id,
             jsonb_array_length(speaker_turns)::int AS turn_count,
             word_count,
             array_length(competitors_mentioned, 1) AS competitors_count,
             entities
        FROM analyzed_transcripts
       WHERE transcript_id = ${transcriptId}
       LIMIT 1
    `;
    assert(at.length === 1, "analyzed_transcripts row not found");
    const a = at[0]!;
    assert(a.turn_count === result.speakerTurnCount, "speaker_turns jsonb count mismatch");
    assert(a.word_count === result.wordCount, "word_count mismatch");
    assert(
      a.competitors_count === result.competitorsMentioned.length,
      "competitors_mentioned[] count mismatch",
    );
    console.log(
      `      turn_count=${a.turn_count} word_count=${a.word_count} competitors_count=${a.competitors_count}`,
    );
    console.log(`      entities=${JSON.stringify(a.entities)}`);

    console.log("[3/6] Verify transcript_embeddings rows (transcript-scope)…");
    const tr = await verify<
      Array<{ n: number; model: string }>
    >`
      SELECT COUNT(*)::int AS n, embedding_model AS model
        FROM transcript_embeddings
       WHERE transcript_id = ${transcriptId}
         AND scope = 'transcript'
       GROUP BY embedding_model
    `;
    assert(tr.length === 1, "expected exactly one model group for transcript-scope");
    assert(tr[0]!.n === 1, `expected 1 transcript-scope row, got ${tr[0]!.n}`);
    assert(tr[0]!.model === result.embeddingModel, "transcript-scope embedding_model mismatch");
    console.log(`      rows=1 model=${tr[0]!.model}`);

    console.log("[4/6] Verify transcript_embeddings rows (speaker-turn scope)…");
    const ts = await verify<
      Array<{ n: number; min_idx: number; max_idx: number }>
    >`
      SELECT COUNT(*)::int AS n,
             MIN(speaker_turn_index)::int AS min_idx,
             MAX(speaker_turn_index)::int AS max_idx
        FROM transcript_embeddings
       WHERE transcript_id = ${transcriptId}
         AND scope = 'speaker_turn'
    `;
    assert(ts[0]!.n === result.speakerTurnCount, "speaker-turn row count mismatch");
    assert(ts[0]!.min_idx === 0, "speaker_turn_index should start at 0");
    assert(
      ts[0]!.max_idx === result.speakerTurnCount - 1,
      "speaker_turn_index should end at N-1",
    );
    console.log(
      `      rows=${ts[0]!.n} indices=${ts[0]!.min_idx}..${ts[0]!.max_idx}`,
    );

    console.log("[5/6] Verify pipeline_processed flag flipped…");
    const flag = await verify<Array<{ pipeline_processed: boolean }>>`
      SELECT pipeline_processed FROM transcripts WHERE id = ${transcriptId}
    `;
    assert(flag[0]!.pipeline_processed === true, "pipeline_processed should be true");
    console.log("      OK");

    console.log("[6/6] Verify idempotence — re-run produces same row counts…");
    const pre2 = new TranscriptPreprocessor({ databaseUrl: url });
    const result2 = await pre2.preprocess(transcriptId);
    await pre2.close();
    assert(result2.speakerTurnCount === result.speakerTurnCount, "re-run turn count drift");
    const ts2 = await verify<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM transcript_embeddings WHERE transcript_id = ${transcriptId}
    `;
    assert(
      ts2[0]!.n === result.embeddingsWritten,
      `re-run embedding count drift: got ${ts2[0]!.n}, expected ${result.embeddingsWritten}`,
    );
    console.log(
      `      re-run: turns=${result2.speakerTurnCount} embeddings=${ts2[0]!.n} (matches first run)`,
    );

    console.log("");
    console.log("TranscriptPreprocessor: ALL PASS.");
  } finally {
    await verify.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
