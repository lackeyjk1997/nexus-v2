import dns from "node:dns";
dns.setDefaultResultOrder("ipv6first");
import postgres from "postgres";
import { loadDevEnv, requireEnv } from "@nexus/shared";
loadDevEnv();
const sql = postgres(process.env.DATABASE_URL ?? requireEnv("DIRECT_URL"), { max: 1, prepare: false });
try {
  // Every deal with at least one transcript, except the granola demo deal
  // (its first score should come from the real recording, not seed runs).
  const deals = await sql<Array<{ hubspot_deal_id: string; n: number }>>`
    SELECT hubspot_deal_id, count(*)::int AS n FROM transcripts
     WHERE hubspot_deal_id != '328509739706'
     GROUP BY 1 ORDER BY 1`;
  const ids: string[] = [];
  for (const d of deals) {
    const inflight = await sql`
      SELECT id FROM jobs WHERE type = 'deal_fitness' AND status IN ('queued','running')
        AND input->>'hubspotDealId' = ${d.hubspot_deal_id} LIMIT 1`;
    if (inflight.length > 0) { console.log(`inflight ${d.hubspot_deal_id}`); continue; }
    const j = await sql`
      INSERT INTO jobs (type, status, input)
      VALUES ('deal_fitness', 'queued', ${sql.json({ hubspotDealId: d.hubspot_deal_id } as never)})
      RETURNING id`;
    ids.push(j[0]!.id);
    console.log(`enqueued deal_fitness ${d.hubspot_deal_id} (${d.n} transcripts) job=${j[0]!.id}`);
  }
  // Poll to terminal.
  const deadline = Date.now() + 20 * 60_000;
  for (;;) {
    const rows = await sql`
      SELECT status, count(*)::int AS n FROM jobs WHERE id = ANY(${ids}) GROUP BY 1`;
    const summary = Object.fromEntries(rows.map((r) => [r.status, r.n]));
    console.log(`[${new Date().toISOString().slice(11,19)}] ${JSON.stringify(summary)}`);
    const done = rows.every((r) => r.status === "succeeded" || r.status === "failed");
    if (done) {
      const failed = await sql`
        SELECT input->>'hubspotDealId' AS deal, left(coalesce(error,''),150) AS err
          FROM jobs WHERE id = ANY(${ids}) AND status = 'failed'`;
      for (const f of failed) console.log(`FAILED ${f.deal}: ${f.err}`);
      process.exitCode = failed.length === 0 ? 0 : 2;
      break;
    }
    if (Date.now() > deadline) { console.log("TIMEOUT"); process.exitCode = 3; break; }
    await new Promise((r) => setTimeout(r, 20_000));
  }
  const scores = await sql`
    SELECT hubspot_deal_id, overall_score, business_fit_score, emotional_fit_score,
           technical_fit_score, readiness_fit_score, velocity_trend
      FROM deal_fitness_scores ORDER BY overall_score DESC NULLS LAST`;
  console.log("\nscores:");
  for (const s of scores) {
    console.log(`  ${s.hubspot_deal_id}: overall=${s.overall_score} B=${s.business_fit_score} E=${s.emotional_fit_score} T=${s.technical_fit_score} R=${s.readiness_fit_score} ${s.velocity_trend}`);
  }
} finally { await sql.end({ timeout: 5 }); }
