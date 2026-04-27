/**
 * Seed MedVista discovery-call transcript into the `transcripts` table —
 * Phase 3 Day 2 Session A.
 *
 * The transcript pipeline needs a live `transcripts` row to run against.
 * The fixture text itself has lived at
 * `packages/shared/tests/fixtures/medvista-transcript.txt` since Phase 1
 * Day 4 (the detect-signals integration test reads it directly from disk).
 * Session A lands the same text as a real DB row so Session B's
 * `transcript_pipeline` handler can process it end-to-end.
 *
 * Idempotence: the row is keyed on
 *   hubspot_engagement_id = "fixture-medvista-discovery-01"
 * — a synthetic identifier (not a real HubSpot engagement ID) whose sole
 * purpose is to make re-runs a lookup-first upsert rather than a duplicate
 * insert. Non-fixture transcripts will carry real HubSpot engagement IDs
 * produced by the Phase 3 Day 4+ call-prep / ingest flow.
 *
 * The deal anchor is the MedVista Epic Integration deal's real HubSpot ID
 * (`321972856545` — Phase 1 Day 5 seed), so downstream `deal_events` rows
 * written by the pipeline link into the already-populated `hubspot_cache`
 * row for MedVista.
 *
 * Demo-reset manifest: `transcripts` has a truncate disposition in
 * `packages/db/src/seed-data/demo-reset-manifest.ts`. A future demo-reset
 * script would re-run this seed as part of its post-truncate warm step.
 *
 * Usage:
 *   pnpm --filter @nexus/db seed:medvista-transcript
 */
import { readFileSync } from "node:fs";
import dns from "node:dns";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Supabase direct host (db.<ref>.supabase.co) resolves only AAAA on dev
// Macs as of Phase 3 Day 4. Force IPv6-first so getaddrinfo doesn't
// ENOTFOUND on the IPv4 path. Must precede loadDevEnv + any postgres
// import so the resolver order applies to the first connection.
dns.setDefaultResultOrder("ipv6first");

import postgres from "postgres";

import { loadDevEnv, requireEnv } from "@nexus/shared";

loadDevEnv();

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(
  here,
  "../../../shared/tests/fixtures/medvista-transcript.txt",
);

const SENTINEL_ENGAGEMENT_ID = "fixture-medvista-discovery-01";
const MEDVISTA_DEAL_ID = "321972856545";
const TITLE = "MedVista Health — Discovery Call — 42 min";
const DURATION_SECONDS = 42 * 60;

/**
 * Participants are manually enumerated from the fixture's header line:
 *   [Participants: Sarah Chen (AE, Nexus/Anthropic), Alex Kim (Solutions
 *    Architect, Nexus/Anthropic), Dr. Michael Chen (Chief Medical Officer,
 *    MedVista), Jennifer Wu (Director of Information Technology, MedVista)]
 *
 * Shape matches what the TranscriptPreprocessor consumes in Session A
 * (Phase 3 Day 2) — `side` discriminates buyer vs. seller so downstream
 * detect-signals prompts can filter correctly per DECISIONS.md §2.13.1.
 */
const PARTICIPANTS = [
  { name: "Sarah Chen", role: "AE", side: "seller", org: "Nexus" },
  { name: "Alex Kim", role: "SA", side: "seller", org: "Nexus" },
  {
    name: "Dr. Michael Chen",
    role: "Chief Medical Officer",
    side: "buyer",
    org: "MedVista Health",
  },
  {
    name: "Jennifer Wu",
    role: "Director of Information Technology",
    side: "buyer",
    org: "MedVista Health",
  },
] as const;

async function main(): Promise<void> {
  // Phase 3 Day 4 Session B: dev-Mac IPv6 route to Supabase direct host
  // is broken; prefer pooler URL (IPv4, works) over DIRECT_URL (IPv6-only,
  // unreachable). Falls back to DIRECT_URL if DATABASE_URL absent.
  const url = process.env.DATABASE_URL ?? requireEnv("DIRECT_URL");
  const sql = postgres(url, { max: 1, prepare: false });

  try {
    console.log(`Seed MedVista transcript — Phase 3 Day 2 Session A\n`);
    console.log(`fixture path: ${FIXTURE_PATH}`);

    const transcriptText = readFileSync(FIXTURE_PATH, "utf8");
    console.log(`fixture text: ${transcriptText.length} chars`);

    console.log(`\n[1/3] Lookup existing row by engagement_id sentinel…`);
    const existing = await sql<Array<{ id: string }>>`
      SELECT id FROM transcripts
       WHERE hubspot_engagement_id = ${SENTINEL_ENGAGEMENT_ID}
       LIMIT 1
    `;

    if (existing.length > 0) {
      console.log(`      found existing id=${existing[0]!.id}`);
      console.log(`[2/3] UPDATE existing row (idempotent text refresh)…`);
      const updated = await sql<Array<{ id: string }>>`
        UPDATE transcripts SET
          transcript_text = ${transcriptText},
          title = ${TITLE},
          participants = ${sql.json(PARTICIPANTS)},
          hubspot_deal_id = ${MEDVISTA_DEAL_ID},
          duration_seconds = ${DURATION_SECONDS},
          pipeline_processed = false,
          updated_at = NOW()
         WHERE hubspot_engagement_id = ${SENTINEL_ENGAGEMENT_ID}
        RETURNING id
      `;
      console.log(`      updated id=${updated[0]!.id}`);
    } else {
      console.log(`      no existing row`);
      console.log(`[2/3] INSERT new row…`);
      const inserted = await sql<Array<{ id: string }>>`
        INSERT INTO transcripts (
          hubspot_deal_id, title, transcript_text, participants,
          source, duration_seconds, hubspot_engagement_id, pipeline_processed
        ) VALUES (
          ${MEDVISTA_DEAL_ID},
          ${TITLE},
          ${transcriptText},
          ${sql.json(PARTICIPANTS)},
          'simulated',
          ${DURATION_SECONDS},
          ${SENTINEL_ENGAGEMENT_ID},
          false
        )
        RETURNING id
      `;
      console.log(`      inserted id=${inserted[0]!.id}`);
    }

    console.log(`[3/3] Verify row readable + anchor values…`);
    const final = await sql<
      Array<{
        id: string;
        hubspot_deal_id: string;
        title: string;
        text_length: number;
        participants_count: number;
        pipeline_processed: boolean;
      }>
    >`
      SELECT id, hubspot_deal_id, title,
             length(transcript_text) AS text_length,
             jsonb_array_length(participants) AS participants_count,
             pipeline_processed
        FROM transcripts
       WHERE hubspot_engagement_id = ${SENTINEL_ENGAGEMENT_ID}
       LIMIT 1
    `;
    const row = final[0]!;
    console.log(
      `      id=${row.id}`,
      `\n      hubspot_deal_id=${row.hubspot_deal_id}`,
      `\n      title="${row.title}"`,
      `\n      text_length=${row.text_length}`,
      `\n      participants_count=${row.participants_count}`,
      `\n      pipeline_processed=${row.pipeline_processed}`,
    );

    console.log("");
    console.log("MedVista transcript seeded. Ready for Session B pipeline run.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
