/**
 * Phase 4 Day 5 A — pipeline executor (runbook steps 4–5).
 *
 * step 4  Enqueue one `transcript_pipeline` job per unprocessed seed
 *         transcript (`hubspot_engagement_id LIKE 'seed-p4d5-%'`,
 *         `pipeline_processed = false`). Jobs are claimed and run by the
 *         PRODUCTION worker via pg_cron (10s tick) — this script never runs
 *         handlers in-process, so the demo's compute provenance is genuinely
 *         the deployed production path. Polls until all jobs reach a
 *         terminal status.
 * step 5  Verify the signal map: `signal_detected` events grouped by
 *         (event_context vertical, payload signal_type) across the seed
 *         deals, checked against the README admission contract
 *         (competitive_intel ≥ 4 deals, deal_blocker ≥ 3 deals). Also
 *         verifies 5 prompt_call_log rows per succeeded run.
 *
 * Idempotent: skips transcripts already processed; safe to re-run after a
 * partial failure (only unprocessed transcripts re-enqueue).
 *
 * Usage:
 *   pnpm --filter @nexus/db run:phase-4-day-5-pipeline
 */
import dns from "node:dns";

dns.setDefaultResultOrder("ipv6first");

import postgres from "postgres";

import { loadDevEnv, requireEnv } from "@nexus/shared";

loadDevEnv();

const POLL_INTERVAL_MS = 15_000;
const POLL_TIMEOUT_MS = 45 * 60_000;

const EXPECTED = {
  competitive_intel_min_deals: 4,
  deal_blocker_min_deals: 3,
  prompt_calls_per_run: 5,
};

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? requireEnv("DIRECT_URL");
  const sql = postgres(url, { max: 1, prepare: false });

  try {
    console.log("Phase 4 Day 5 A pipeline executor (steps 4–5)\n");

    /* ------------- step 4: enqueue ------------- */
    const pending = await sql<Array<{ id: string; hubspot_engagement_id: string }>>`
      SELECT id, hubspot_engagement_id FROM transcripts
       WHERE hubspot_engagement_id LIKE 'seed-p4d5-%'
         AND pipeline_processed = false
       ORDER BY hubspot_engagement_id
    `;
    console.log(`[4] ${pending.length} unprocessed seed transcripts`);

    const jobIds: string[] = [];
    for (const t of pending) {
      // Re-run safety: skip if a queued/running job already targets this transcript.
      const inflight = await sql<Array<{ id: string }>>`
        SELECT id FROM jobs
         WHERE type = 'transcript_pipeline'
           AND status IN ('queued', 'running')
           AND input->>'transcriptId' = ${t.id}
         LIMIT 1
      `;
      if (inflight.length > 0) {
        console.log(`    inflight ${t.hubspot_engagement_id} job=${inflight[0]!.id}`);
        jobIds.push(inflight[0]!.id);
        continue;
      }
      const ins = await sql<Array<{ id: string }>>`
        INSERT INTO jobs (type, input, status)
        VALUES ('transcript_pipeline', ${sql.json({ transcriptId: t.id })}, 'queued')
        RETURNING id
      `;
      jobIds.push(ins[0]!.id);
      console.log(`    enqueued ${t.hubspot_engagement_id} job=${ins[0]!.id}`);
    }

    if (jobIds.length === 0) {
      console.log("    nothing to enqueue (all transcripts processed) — skipping to verification");
    } else {
      /* ------------- poll ------------- */
      const t0 = Date.now();
      for (;;) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const rows = await sql<Array<{ id: string; status: string; error: string | null }>>`
          SELECT id, status, error FROM jobs WHERE id = ANY(${jobIds})
        `;
        const byStatus: Record<string, number> = {};
        for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
        const elapsed = Math.round((Date.now() - t0) / 1000);
        console.log(`    [${elapsed}s] ${JSON.stringify(byStatus)}`);

        const terminal = rows.every((r) => r.status === "succeeded" || r.status === "failed");
        if (terminal) {
          for (const r of rows.filter((x) => x.status === "failed")) {
            console.log(`    FAILED job=${r.id}: ${r.error?.slice(0, 300)}`);
          }
          break;
        }
        if (Date.now() - t0 > POLL_TIMEOUT_MS) {
          throw new Error("poll timeout — jobs not terminal after 45 min");
        }
      }
    }

    /* ------------- step 5: verify ------------- */
    console.log("\n[5] Signal-map verification…");

    const processed = await sql<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM transcripts
       WHERE hubspot_engagement_id LIKE 'seed-p4d5-%' AND pipeline_processed = true
    `;
    console.log(`    transcripts processed: ${processed[0]!.n}/9`);

    const promptCalls = await sql<Array<{ job_id: string; n: number }>>`
      SELECT j.id AS job_id, count(p.id)::int AS n
        FROM jobs j LEFT JOIN prompt_call_log p ON p.job_id = j.id
       WHERE j.type = 'transcript_pipeline' AND j.status = 'succeeded'
         AND j.input->>'transcriptId' IN
             (SELECT id::text FROM transcripts WHERE hubspot_engagement_id LIKE 'seed-p4d5-%')
       GROUP BY j.id ORDER BY n
    `;
    const offCalls = promptCalls.filter((r) => r.n !== EXPECTED.prompt_calls_per_run);
    console.log(
      `    prompt_call_log: ${promptCalls.length} succeeded runs, ` +
        `${offCalls.length} with != ${EXPECTED.prompt_calls_per_run} calls` +
        (offCalls.length ? ` (${offCalls.map((r) => `${r.job_id}:${r.n}`).join(", ")})` : ""),
    );

    const groups = await sql<
      Array<{ vertical: string | null; signal_type: string; deals: number; deal_ids: string[] }>
    >`
      SELECT event_context->>'vertical' AS vertical,
             payload->'signal'->>'signal_type' AS signal_type,
             count(DISTINCT hubspot_deal_id)::int AS deals,
             array_agg(DISTINCT hubspot_deal_id) AS deal_ids
        FROM deal_events
       WHERE type = 'signal_detected'
         AND hubspot_deal_id LIKE 'seed\\_%'
       GROUP BY 1, 2
       ORDER BY deals DESC
    `;
    console.log("    (vertical, signal_type) groups across seed deals:");
    for (const g of groups) {
      console.log(
        `      ${g.vertical ?? "NULL"} / ${g.signal_type}: ${g.deals} deals [${g.deal_ids.join(", ")}]`,
      );
    }

    const byType = new Map(groups.filter((g) => g.vertical === "technology").map((g) => [g.signal_type, g]));
    const ci = byType.get("competitive_intel");
    const db = byType.get("deal_blocker");
    const ciPass = (ci?.deals ?? 0) >= EXPECTED.competitive_intel_min_deals;
    const dbPass = (db?.deals ?? 0) >= EXPECTED.deal_blocker_min_deals;
    console.log(
      `\n    ADMISSION CONTRACT: competitive_intel ${ci?.deals ?? 0}/${EXPECTED.competitive_intel_min_deals} ${ciPass ? "PASS" : "MISS"}` +
        ` · deal_blocker ${db?.deals ?? 0}/${EXPECTED.deal_blocker_min_deals} ${dbPass ? "PASS" : "MISS"}`,
    );
    if (!ciPass || !dbPass) {
      console.log("    → overlap math missed; consult README 'If the overlap math misses' (hybrid fallback)");
      process.exitCode = 2;
    } else {
      console.log("    → overlap structure holds; proceed to coordinator_synthesis (step 6)");
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
