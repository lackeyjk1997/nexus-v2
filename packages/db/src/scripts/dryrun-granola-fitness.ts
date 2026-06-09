/**
 * Demo 2026-06-10 Run 2 — synthetic dry-run of the click→score chain.
 *
 * Exercises everything EXCEPT the Granola REST fetch (which needs
 * GRANOLA_API_KEY — verified separately from production via
 * /api/granola/watch?selfcheck=1):
 *
 *   1. A synthetic interview-shaped meeting in the EXACT Granola payload
 *      shape (channel-level speakers: microphone=seller, speaker=buyer)
 *      → renderGranolaTranscript → transcripts upsert (granola_ingest's
 *      post-fetch path, replicated).
 *   2. HANDLERS.deal_fitness in-process → asserts scores persisted,
 *      events detected with evidence, quotes verbatim-grounded.
 *   3. A SECOND sync (same engagement id, longer transcript — the
 *      mid-call re-sync) → re-score → asserts the score MOVED.
 *
 * Cleanup unconditional unless --keep. Uses a synthetic deal id that can
 * never collide with the real demo deal.
 *
 * Usage:
 *   pnpm --filter @nexus/db dryrun:granola-fitness [--keep]
 */
import dns from "node:dns";

dns.setDefaultResultOrder("ipv6first");

import postgres from "postgres";

import {
  HANDLERS,
  loadDevEnv,
  renderGranolaTranscript,
  requireEnv,
  type GranolaTranscriptEntry,
} from "@nexus/shared";

loadDevEnv();

const DEAL_ID = "dryrun_granola_deal";
const ENGAGEMENT_ID = "dryrun-granola-note-1";
const KEEP = process.argv.includes("--keep");

// Synthetic interview fixture — shared with granola-demo-ops fallback.
import { INTERVIEW_PART_1 as PART_1, INTERVIEW_PART_2 as PART_2 } from "./granola-fixture";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? requireEnv("DIRECT_URL");
  const sql = postgres(url, { max: 1, prepare: false });
  let failures = 0;
  const check = (cond: boolean, label: string): void => {
    console.log(`  ${cond ? "✓" : "✗ FAIL"} ${label}`);
    if (!cond) failures++;
  };

  try {
    console.log("Granola click→score synthetic dry-run\n");

    /* ── Setup: synthetic deal in hubspot_cache ── */
    await sql`
      INSERT INTO hubspot_cache (object_type, hubspot_id, payload, cached_at)
      VALUES ('deal', ${DEAL_ID}, ${sql.json({
        id: DEAL_ID,
        properties: {
          dealname: "granola (dry-run)",
          dealstage: "qualified",
          amount: "210000",
          closedate: "2026-07-01",
          nexus_vertical: "technology",
        },
      } as never)}, NOW())
      ON CONFLICT ON CONSTRAINT hubspot_cache_object_key
      DO UPDATE SET payload = EXCLUDED.payload, cached_at = NOW()
    `;

    const ingestSynthetic = async (
      entries: GranolaTranscriptEntry[],
      title: string,
    ): Promise<void> => {
      const text = renderGranolaTranscript(entries, {
        sellerName: "Jeff Lackey",
        buyerName: "Ernesto Andaya",
      });
      const participants = [
        { name: "Jeff Lackey", side: "seller", channel: "microphone" },
        { name: "Ernesto Andaya", side: "buyer", channel: "speaker" },
      ];
      const existing = await sql<Array<{ id: string }>>`
        SELECT id FROM transcripts WHERE hubspot_engagement_id = ${ENGAGEMENT_ID} LIMIT 1
      `;
      if (existing.length > 0) {
        await sql`
          UPDATE transcripts SET transcript_text = ${text}, title = ${title}, updated_at = NOW()
           WHERE id = ${existing[0]!.id}
        `;
      } else {
        await sql`
          INSERT INTO transcripts
            (hubspot_deal_id, title, transcript_text, participants, source,
             recorded_at, hubspot_engagement_id, pipeline_processed)
          VALUES
            (${DEAL_ID}, ${title}, ${text},
             ${sql.json(participants as never)}, 'granola', NOW(), ${ENGAGEMENT_ID}, true)
        `;
      }
    };

    /* ── Sync 1: partial transcript → first score ── */
    console.log("[1] first sync (partial interview) → deal_fitness");
    await ingestSynthetic(PART_1, "Interview — Ernesto Andaya (dry-run)");
    const run1 = (await HANDLERS.deal_fitness(
      { hubspotDealId: DEAL_ID },
      { jobId: "dryrun-1", jobType: "deal_fitness", hooks: { sql } },
    )) as {
      overallScore: number;
      eventsDetected: number;
      categories: Record<string, number>;
      velocityTrend: string;
    };
    console.log(`    run 1: ${JSON.stringify(run1)}`);
    check(run1.overallScore > 0, `overall score > 0 (got ${run1.overallScore})`);
    check(run1.eventsDetected >= 2, `≥2 events detected (got ${run1.eventsDetected})`);

    // Evidence grounding: every persisted quote must appear in the transcript.
    const evidenceRows = await sql<Array<{ evidence_snippets: unknown }>>`
      SELECT evidence_snippets FROM deal_fitness_events
       WHERE hubspot_deal_id = ${DEAL_ID} AND detected = true
    `;
    const transcript1 = renderGranolaTranscript(PART_1, {
      sellerName: "Jeff Lackey",
      buyerName: "Ernesto Andaya",
    });
    const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const normalizedTranscript = norm(transcript1);
    let groundedQuotes = 0;
    let totalQuotes = 0;
    for (const row of evidenceRows) {
      const snippets = Array.isArray(row.evidence_snippets)
        ? (row.evidence_snippets as Array<{ quote?: string }>)
        : [];
      for (const s of snippets) {
        if (!s.quote) continue;
        totalQuotes++;
        if (normalizedTranscript.includes(norm(s.quote))) groundedQuotes++;
      }
    }
    check(
      totalQuotes > 0 && groundedQuotes === totalQuotes,
      `evidence quotes verbatim-grounded (${groundedQuotes}/${totalQuotes})`,
    );

    /* ── Sync 2: full transcript (re-sync) → score must MOVE ── */
    console.log("[2] second sync (full interview) → re-score");
    await ingestSynthetic([...PART_1, ...PART_2], "Interview — Ernesto Andaya (dry-run)");
    const run2 = (await HANDLERS.deal_fitness(
      { hubspotDealId: DEAL_ID },
      { jobId: "dryrun-2", jobType: "deal_fitness", hooks: { sql } },
    )) as {
      overallScore: number;
      priorOverall: number | null;
      eventsDetected: number;
      velocityTrend: string;
    };
    console.log(`    run 2: ${JSON.stringify(run2)}`);
    check(run2.priorOverall === run1.overallScore, "run 2 saw run 1's score as prior");
    check(
      run2.overallScore !== run1.overallScore,
      `score MOVED (${run1.overallScore} → ${run2.overallScore})`,
    );
    check(
      run2.eventsDetected >= run1.eventsDetected,
      `detections did not regress (${run1.eventsDetected} → ${run2.eventsDetected})`,
    );
    check(
      run2.velocityTrend === "accelerating" || run2.velocityTrend === "decelerating",
      `velocity registered movement (got ${run2.velocityTrend})`,
    );

    console.log(
      failures === 0 ? "\ndry-run: ALL CHECKS PASS" : `\ndry-run: ${failures} FAILURE(S)`,
    );
    process.exitCode = failures === 0 ? 0 : 1;
  } finally {
    if (!KEEP) {
      try {
        await sql`DELETE FROM deal_fitness_events WHERE hubspot_deal_id = ${DEAL_ID}`;
        await sql`DELETE FROM deal_fitness_scores WHERE hubspot_deal_id = ${DEAL_ID}`;
        await sql`DELETE FROM deal_events WHERE hubspot_deal_id = ${DEAL_ID}`;
        await sql`DELETE FROM transcripts WHERE hubspot_deal_id = ${DEAL_ID}`;
        await sql`DELETE FROM hubspot_cache WHERE object_type = 'deal' AND hubspot_id = ${DEAL_ID}`;
        console.log("cleanup: synthetic rows removed");
      } catch (err) {
        console.error("cleanup failed:", err);
      }
    } else {
      console.log("--keep: synthetic rows retained");
    }
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
