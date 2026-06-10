import dns from "node:dns";
dns.setDefaultResultOrder("ipv6first");
import postgres from "postgres";
import { loadDevEnv } from "@nexus/shared";
loadDevEnv();
const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
const deadline = Date.now() + 12 * 60_000;
try {
  for (;;) {
    const jobs = await sql`
      SELECT type, status, attempts, left(coalesce(error,''),160) AS err, created_at
        FROM jobs WHERE type IN ('granola_ingest','deal_fitness') AND created_at > now() - interval '6 minutes'
       ORDER BY created_at`;
    const ts = await sql`SELECT count(*)::int AS n FROM transcripts WHERE hubspot_deal_id = '328509739706'`;
    const sc = await sql`SELECT overall_score FROM deal_fitness_scores WHERE hubspot_deal_id = '328509739706'`;
    console.log(`[${new Date().toISOString().slice(11,19)}] jobs=${jobs.map((j)=>`${j.type}:${j.status}(${j.attempts})`).join(" ")||"none"} transcripts=${ts[0]!.n} score=${sc[0]?.overall_score ?? "—"}`);
    for (const j of jobs.filter((j)=>j.status==="failed")) console.log("  FAILED", j.type, j.err);
    if (sc[0]?.overall_score != null) { console.log("CLICK→SCORE CHAIN COMPLETE"); break; }
    const newest = jobs[jobs.length-1]; if (newest && newest.status==="failed" && newest.attempts >= 3) { console.log("NEWEST JOB EXHAUSTED RETRIES"); break; }
    if (Date.now() > deadline) { console.log("TIMEOUT"); break; }
    await new Promise((r) => setTimeout(r, 20_000));
  }
} finally { await sql.end({ timeout: 5 }); }
