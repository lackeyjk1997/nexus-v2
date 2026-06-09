import { NextResponse, type NextRequest } from "next/server";

import {
  GranolaClient,
  extractGranolaNoteId,
  getSharedSql,
} from "@nexus/shared";
import { createHubSpotAdapter } from "@/lib/crm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Granola click→score watcher (Demo 2026-06-10 Run 2).
 *
 * pg_cron (~15s) → this route → list note engagements on the ONE pinned
 * deal from granola_watch_config → filter to Granola-authored notes →
 * enqueue `granola_ingest` for any note without a transcripts row (the
 * worker fetches the raw transcript from the Granola REST API and chains
 * `deal_fitness`). The Granola sync click in the app is the semantic
 * trigger: nothing here runs until Granola has created the note.
 *
 * Privacy by construction: the only HubSpot object read is the pinned
 * deal's note associations; the only Granola meetings ever fetched are the
 * note ids Granola itself attached there. There is no recency-based or
 * workspace-wide ingestion path.
 *
 * DECISIONS 2.19: sidestepped, not relaxed — no engagement webhook
 * subscription exists; this is a read-only poll.
 *
 * Auth: Bearer CRON_SECRET (identical to /api/jobs/worker).
 * ?selfcheck=1 additionally verifies Granola REST reachability (count-only,
 * no note content in the response) — used to verify Business-tier access
 * from production where GRANOLA_API_KEY lives.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sql = getSharedSql();
  const selfcheck = request.nextUrl.searchParams.get("selfcheck") === "1";

  const diagnostics: Record<string, unknown> = {};
  if (selfcheck) {
    diagnostics.granola_key_present = GranolaClient.isConfigured();
    if (GranolaClient.isConfigured()) {
      try {
        const health = await new GranolaClient().healthCheck();
        diagnostics.granola_rest = health;
      } catch (err) {
        diagnostics.granola_rest = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
  }

  // ── Pinned-deal config (single row, id='default').
  const cfgRows = await sql<
    Array<{ hubspot_deal_id: string; enabled: boolean }>
  >`
    SELECT hubspot_deal_id, enabled
      FROM granola_watch_config
     WHERE id = 'default'
     LIMIT 1
  `;
  const cfg = cfgRows[0];
  if (!cfg || !cfg.enabled) {
    return NextResponse.json({
      status: "idle",
      reason: cfg ? "watch_disabled" : "no_watch_config",
      ...diagnostics,
    });
  }

  const adapter = createHubSpotAdapter();
  try {
    let notes: Awaited<ReturnType<typeof adapter.listDealNoteEngagements>>;
    try {
      notes = await adapter.listDealNoteEngagements(cfg.hubspot_deal_id);
    } catch (err) {
      // Scope failures (403) surface explicitly — J7 JEFF ACTIONS trigger.
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        JSON.stringify({
          event: "granola_watch_hubspot_error",
          deal_id: cfg.hubspot_deal_id,
          error: message.slice(0, 300),
          ts: new Date().toISOString(),
        }),
      );
      return NextResponse.json(
        { status: "error", source: "hubspot", error: message.slice(0, 300), ...diagnostics },
        { status: 502 },
      );
    }

    // Granola-authored filter: the synced note carries a Granola note id
    // and/or a notes.granola.ai link. Nexus never authors notes containing
    // either marker, so the provenance filter cannot self-trigger.
    const granolaNotes = notes
      .map((n) => ({ ...n, granolaNoteId: extractGranolaNoteId(n.body) }))
      .filter(
        (n) => n.granolaNoteId !== null || /granola\.ai/i.test(n.body),
      );

    const enqueued: string[] = [];
    const skipped: string[] = [];
    for (const note of granolaNotes) {
      // Dedup 1: a transcripts row for this engagement already exists →
      // content updates are handled by re-enqueueing ONLY when the note
      // body's last-modified moved past the transcript row's updated_at.
      const existing = await sql<Array<{ id: string; updated_at: Date }>>`
        SELECT id, updated_at FROM transcripts
         WHERE hubspot_engagement_id = ${note.engagementId}
         LIMIT 1
      `;
      const noteMoved =
        existing.length > 0 &&
        note.lastModifiedAt !== null &&
        note.lastModifiedAt.getTime() > existing[0]!.updated_at.getTime() + 30_000;
      if (existing.length > 0 && !noteMoved) {
        skipped.push(note.engagementId);
        continue;
      }
      // Dedup 2: an ingest job for this engagement is already in flight.
      const inflight = await sql<Array<{ id: string }>>`
        SELECT id FROM jobs
         WHERE type = 'granola_ingest'
           AND status IN ('queued', 'running')
           AND input->>'hubspotEngagementId' = ${note.engagementId}
         LIMIT 1
      `;
      if (inflight.length > 0) {
        skipped.push(note.engagementId);
        continue;
      }
      if (!note.granolaNoteId) {
        // Granola-marked note without an extractable note id — log the
        // shape problem loudly (unknown-unknown #3) but don't crash the poll.
        console.error(
          JSON.stringify({
            event: "granola_watch_note_id_missing",
            engagement_id: note.engagementId,
            body_head: note.body.slice(0, 200),
            ts: new Date().toISOString(),
          }),
        );
        skipped.push(note.engagementId);
        continue;
      }
      const job = await sql<Array<{ id: string }>>`
        INSERT INTO jobs (type, status, input)
        VALUES ('granola_ingest', 'queued', ${sql.json({
          granolaNoteId: note.granolaNoteId,
          hubspotEngagementId: note.engagementId,
        } as never)})
        RETURNING id
      `;
      enqueued.push(job[0]!.id);
      console.error(
        JSON.stringify({
          event: "granola_watch_enqueued",
          engagement_id: note.engagementId,
          granola_note_id: note.granolaNoteId,
          job_id: job[0]!.id,
          reason: existing.length > 0 ? "note_updated" : "new_note",
          ts: new Date().toISOString(),
        }),
      );
    }

    await sql`
      UPDATE granola_watch_config SET last_polled_at = NOW(), updated_at = NOW()
       WHERE id = 'default'
    `;

    return NextResponse.json({
      status: "ok",
      dealId: cfg.hubspot_deal_id,
      notesOnDeal: notes.length,
      granolaNotes: granolaNotes.length,
      enqueued,
      skipped: skipped.length,
      ...diagnostics,
    });
  } finally {
    await adapter.close();
  }
}
