/**
 * Demo 2026-06-10 Run 2 — Granola demo operations.
 *
 * Subcommands (first positional arg):
 *
 *   activate --deal <hubspot_deal_id> [--buyer-name "Ernesto Andaya"]
 *            [--buyer-email e@x.com] [--seller-name "Jeff Lackey"]
 *     Upserts the granola_watch_config pinned-deal row (id='default') and
 *     enables the watcher. Also warms hubspot_cache with the deal so
 *     /pipeline shows it immediately. THIS is the moment the system goes
 *     live — before it, the 15s cron no-ops.
 *
 *   status
 *     Prints config, recent granola_ingest/deal_fitness jobs, transcripts
 *     and current fitness scores for the pinned deal.
 *
 *   fallback
 *     Pre-ingests the synthetic interview fixture onto the pinned deal and
 *     scores it — "here's one I ran earlier" insurance if the real test
 *     recording can't happen. Idempotent.
 *
 *   reset [--yes]
 *     Wipes the pinned deal's fitness rows, granola transcripts, and
 *     transcript_ingested events — clean slate between rehearsals. Does
 *     NOT touch granola_watch_config, the HubSpot deal, or anything from
 *     Run 1 (plan C stays intact).
 *
 * Usage:
 *   pnpm --filter @nexus/db granola-demo <subcommand> [flags]
 */
import dns from "node:dns";

dns.setDefaultResultOrder("ipv6first");

import postgres from "postgres";

import {
  HANDLERS,
  loadDevEnv,
  renderGranolaTranscript,
  requireEnv,
} from "@nexus/shared";

import { INTERVIEW_PART_1, INTERVIEW_PART_2 } from "./granola-fixture";

loadDevEnv();

function flag(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : null;
}

async function main(): Promise<void> {
  const sub = process.argv[2];
  const url = process.env.DATABASE_URL ?? requireEnv("DIRECT_URL");
  const sql = postgres(url, { max: 1, prepare: false });

  try {
    if (sub === "activate") {
      const dealId = flag("deal");
      if (!dealId) {
        console.error("activate requires --deal <hubspot_deal_id>");
        process.exit(1);
      }
      const buyerName = flag("buyer-name") ?? "Ernesto Andaya";
      const buyerEmail = flag("buyer-email");
      const sellerName = flag("seller-name") ?? "Jeff Lackey";
      await sql`
        INSERT INTO granola_watch_config
          (id, hubspot_deal_id, buyer_contact_name, buyer_contact_email,
           seller_name, enabled, updated_at)
        VALUES
          ('default', ${dealId}, ${buyerName}, ${buyerEmail},
           ${sellerName}, true, NOW())
        ON CONFLICT (id) DO UPDATE SET
          hubspot_deal_id = EXCLUDED.hubspot_deal_id,
          buyer_contact_name = EXCLUDED.buyer_contact_name,
          buyer_contact_email = EXCLUDED.buyer_contact_email,
          seller_name = EXCLUDED.seller_name,
          enabled = true,
          updated_at = NOW()
      `;
      console.log(`watch ACTIVATED for deal ${dealId} (buyer: ${buyerName})`);
      console.log("the production watcher (15s cron) is now live on this deal.");
      return;
    }

    if (sub === "status") {
      const cfg = await sql`
        SELECT hubspot_deal_id, buyer_contact_name, enabled, last_polled_at
          FROM granola_watch_config WHERE id = 'default'`;
      console.log("config:", cfg[0] ?? "(none — run activate)");
      if (!cfg[0]) return;
      const dealId = cfg[0].hubspot_deal_id as string;
      const jobs = await sql`
        SELECT type, status, left(coalesce(error,''),80) AS err, created_at
          FROM jobs WHERE type IN ('granola_ingest','deal_fitness')
         ORDER BY created_at DESC LIMIT 8`;
      console.log(`recent jobs (${jobs.length}):`);
      for (const j of jobs) {
        console.log(`  [${j.status}] ${j.type} ${j.created_at?.toISOString?.()} ${j.err || ""}`);
      }
      const ts = await sql`
        SELECT title, source, length(transcript_text) AS len, updated_at
          FROM transcripts WHERE hubspot_deal_id = ${dealId} ORDER BY updated_at DESC`;
      console.log(`transcripts on deal (${ts.length}):`);
      for (const t of ts) console.log(`  ${t.title} [${t.source}] ${t.len} chars @ ${t.updated_at?.toISOString?.()}`);
      const scores = await sql`
        SELECT overall_score, business_fit_score, emotional_fit_score,
               technical_fit_score, readiness_fit_score, velocity_trend, updated_at
          FROM deal_fitness_scores WHERE hubspot_deal_id = ${dealId}`;
      console.log("fitness:", scores[0] ?? "(no score yet)");
      return;
    }

    if (sub === "fallback") {
      const cfg = await sql<
        Array<{ hubspot_deal_id: string; buyer_contact_name: string | null; seller_name: string }>
      >`
        SELECT hubspot_deal_id, buyer_contact_name, seller_name
          FROM granola_watch_config WHERE id = 'default'`;
      if (!cfg[0]) {
        console.error("no watch config — run activate first");
        process.exit(1);
      }
      const dealId = cfg[0].hubspot_deal_id;
      const sellerName = cfg[0].seller_name;
      const buyerName = cfg[0].buyer_contact_name ?? "Ernesto Andaya";
      const engagementId = "demo-fallback-granola-note";
      const text = renderGranolaTranscript(
        [...INTERVIEW_PART_1, ...INTERVIEW_PART_2],
        { sellerName, buyerName },
      );
      const participants = [
        { name: sellerName, side: "seller", channel: "microphone" },
        { name: buyerName, side: "buyer", channel: "speaker" },
      ];
      const existing = await sql<Array<{ id: string }>>`
        SELECT id FROM transcripts WHERE hubspot_engagement_id = ${engagementId} LIMIT 1`;
      if (existing.length > 0) {
        await sql`
          UPDATE transcripts SET transcript_text = ${text}, updated_at = NOW()
           WHERE id = ${existing[0]!.id}`;
        console.log("fallback transcript refreshed");
      } else {
        await sql`
          INSERT INTO transcripts
            (hubspot_deal_id, title, transcript_text, participants, source,
             recorded_at, hubspot_engagement_id, pipeline_processed)
          VALUES
            (${dealId}, ${"Interview — " + buyerName + " (pre-run)"}, ${text},
             ${sql.json(participants as never)}, 'granola', NOW(), ${engagementId}, true)`;
        console.log("fallback transcript ingested");
      }
      console.log("scoring (in-process, ~90s)…");
      const result = await HANDLERS.deal_fitness(
        { hubspotDealId: dealId },
        { jobId: "demo-fallback", jobType: "deal_fitness", hooks: { sql } },
      );
      console.log("fallback fitness:", JSON.stringify(result));
      return;
    }

    if (sub === "reset") {
      const cfg = await sql<Array<{ hubspot_deal_id: string }>>`
        SELECT hubspot_deal_id FROM granola_watch_config WHERE id = 'default'`;
      if (!cfg[0]) {
        console.error("no watch config — nothing to reset");
        process.exit(1);
      }
      const dealId = cfg[0].hubspot_deal_id;
      if (!process.argv.includes("--yes")) {
        console.log(`would reset fitness + granola transcripts for deal ${dealId}; re-run with --yes`);
        return;
      }
      const fe = await sql`DELETE FROM deal_fitness_events WHERE hubspot_deal_id = ${dealId} RETURNING id`;
      const fs = await sql`DELETE FROM deal_fitness_scores WHERE hubspot_deal_id = ${dealId} RETURNING hubspot_deal_id`;
      const ev = await sql`
        DELETE FROM deal_events
         WHERE hubspot_deal_id = ${dealId} AND type = 'transcript_ingested'
           AND payload->>'source' = 'granola'
        RETURNING id`;
      const tr = await sql`
        DELETE FROM transcripts
         WHERE hubspot_deal_id = ${dealId} AND source = 'granola'
        RETURNING id`;
      console.log(
        `reset deal ${dealId}: fitness_events=${fe.length} scores=${fs.length} ` +
          `events=${ev.length} transcripts=${tr.length}`,
      );
      console.log("watcher will re-ingest on its next poll if HubSpot notes still exist —");
      console.log("disable first (UPDATE granola_watch_config SET enabled=false) for a true clean slate.");
      return;
    }

    console.error("usage: granola-demo <activate|status|fallback|reset> [flags]");
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
