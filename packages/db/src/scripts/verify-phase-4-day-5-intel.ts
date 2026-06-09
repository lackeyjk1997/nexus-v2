/**
 * Phase 4 Day 5 A — intelligence verification (runbook steps 6–8).
 *
 * Read-only checks against the production DB after the transcript pipeline
 * + auto-enqueued coordinator_synthesis / observation_cluster jobs settle:
 *
 *   6  coordinator_patterns — expect an admitted competitive_intel pattern
 *      (≥4 seed deals) and a deal_blocker pattern (≥3 seed deals), each with
 *      arr_impact.aggregate_arr present (admission gates on it). Flags
 *      early-subset duplicates (same vertical+signal_type, strict deal
 *      subset of a larger sibling) for curation.
 *   7  observation_clusters — expect one ≥3-member candidate (admits) and
 *      one 2-member near-miss (withheld by the dashboard's minMemberCount 3).
 *   8  MedVista isolation — no non-seed deal may appear in any pattern's
 *      deal set (cross-vertical isolation is structural).
 *
 * Usage:
 *   pnpm --filter @nexus/db verify:phase-4-day-5-intel
 */
import dns from "node:dns";

dns.setDefaultResultOrder("ipv6first");

import postgres from "postgres";

import { loadDevEnv, requireEnv } from "@nexus/shared";

loadDevEnv();

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? requireEnv("DIRECT_URL");
  const sql = postgres(url, { max: 1, prepare: false });
  let failures = 0;
  const check = (cond: boolean, label: string): void => {
    console.log(`  ${cond ? "✓" : "✗ FAIL"} ${label}`);
    if (!cond) failures++;
  };

  try {
    console.log("Phase 4 Day 5 A intelligence verification (steps 6–8)\n");

    /* ------------- job settle state ------------- */
    const jobs = await sql<Array<{ type: string; status: string; n: number }>>`
      SELECT type, status, count(*)::int AS n
        FROM jobs
       WHERE type IN ('coordinator_synthesis', 'observation_cluster')
         AND created_at > now() - interval '12 hours'
       GROUP BY 1, 2 ORDER BY 1, 2
    `;
    console.log("[settle] recent coordinator/cluster jobs:");
    for (const j of jobs) console.log(`    ${j.type} ${j.status}: ${j.n}`);
    const unsettled = jobs.filter((j) => j.status === "queued" || j.status === "running");
    if (unsettled.length > 0) {
      console.log("    → jobs still in flight; re-run once settled");
    }

    /* ------------- step 6: coordinator_patterns ------------- */
    const patterns = await sql<
      Array<{
        id: string;
        status: string;
        signal_type: string;
        vertical: string | null;
        score: string | null;
        aggregate_arr: string | null;
        synthesis_head: string;
        deals: string[] | null;
        created_at: Date;
      }>
    >`
      SELECT p.id, p.status, p.signal_type, p.vertical, p.score,
             p.arr_impact->>'aggregate_arr' AS aggregate_arr,
             left(p.synthesis, 100) AS synthesis_head,
             (SELECT array_agg(d.hubspot_deal_id ORDER BY d.hubspot_deal_id)
                FROM coordinator_pattern_deals d
               WHERE d.pattern_id = p.id) AS deals,
             p.created_at
        FROM coordinator_patterns p
       ORDER BY p.created_at
    `;
    console.log(`\n[6] coordinator_patterns: ${patterns.length} rows`);
    for (const p of patterns) {
      console.log(
        `    [${p.status}] ${p.vertical}/${p.signal_type} score=${p.score ?? "—"} ` +
          `agg_arr=${p.aggregate_arr ?? "—"} deals=[${(p.deals ?? []).join(", ")}]`,
      );
      console.log(`       ${p.synthesis_head.replace(/\n/g, " ")}`);
    }

    // Early-subset duplicates: same (vertical, signal_type), deal set strictly
    // contained in a later sibling's. These came from syntheses that ran
    // before all transcripts landed; curation = status 'expired'.
    const live = patterns.filter((p) => p.status !== "expired");
    const subsets: Array<(typeof patterns)[number]> = [];
    for (const a of live) {
      const aDeals = new Set(a.deals ?? []);
      for (const b of live) {
        if (a.id === b.id || a.signal_type !== b.signal_type || a.vertical !== b.vertical) continue;
        const bDeals = new Set(b.deals ?? []);
        if (aDeals.size < bDeals.size && [...aDeals].every((d) => bDeals.has(d))) {
          subsets.push(a);
          break;
        }
      }
    }
    if (subsets.length > 0) {
      console.log(`    ⚠ early-subset duplicates needing curation (status→expired):`);
      for (const s of subsets) {
        console.log(`       ${s.id} ${s.signal_type} deals=[${(s.deals ?? []).join(", ")}]`);
      }
    }

    const effective = live.filter((p) => !subsets.includes(p));
    const ci = effective.find((p) => p.signal_type === "competitive_intel");
    const blocker = effective.find((p) => p.signal_type === "deal_blocker");
    check((ci?.deals?.length ?? 0) >= 4, `competitive_intel pattern with ≥4 deals (got ${ci?.deals?.length ?? 0})`);
    check((blocker?.deals?.length ?? 0) >= 3, `deal_blocker pattern with ≥3 deals (got ${blocker?.deals?.length ?? 0})`);
    check(
      Number(ci?.aggregate_arr ?? 0) >= 500_000,
      `competitive_intel aggregate_arr ≥ $500K (got ${ci?.aggregate_arr ?? "—"})`,
    );
    check(
      Number(blocker?.aggregate_arr ?? 0) >= 500_000,
      `deal_blocker aggregate_arr ≥ $500K (got ${blocker?.aggregate_arr ?? "—"})`,
    );
    check(subsets.length === 0, `no uncurated early-subset duplicates (got ${subsets.length})`);

    /* ------------- step 7: observation_clusters ------------- */
    const clusters = await sql<
      Array<{
        id: string;
        status: string;
        member_count: number;
        confidence: string | null;
        candidate_category: string | null;
        basis: string | null;
      }>
    >`
      SELECT id, status, member_count, confidence, candidate_category,
             left(signature_basis, 100) AS basis
        FROM observation_clusters
       ORDER BY member_count DESC, created_at
    `;
    console.log(`\n[7] observation_clusters: ${clusters.length} rows`);
    for (const c of clusters) {
      console.log(
        `    [${c.status}] members=${c.member_count} confidence=${c.confidence ?? "—"} ` +
          `category=${c.candidate_category ?? "—"}`,
      );
      if (c.basis) console.log(`       ${c.basis.replace(/\n/g, " ")}`);
    }
    const admitting = clusters.filter((c) => c.status === "candidate" && c.member_count >= 3);
    const nearMiss = clusters.filter((c) => c.status === "candidate" && c.member_count === 2);
    check(admitting.length >= 1, `≥1 cluster with ≥3 members admits (got ${admitting.length})`);
    check(nearMiss.length >= 1, `≥1 two-member near-miss withheld (got ${nearMiss.length})`);

    /* ------------- step 8: MedVista isolation ------------- */
    const leaks = await sql<Array<{ pattern_id: string; hubspot_deal_id: string }>>`
      SELECT d.pattern_id, d.hubspot_deal_id
        FROM coordinator_pattern_deals d
       WHERE d.hubspot_deal_id NOT LIKE 'seed\\_%'
    `;
    console.log(`\n[8] MedVista isolation`);
    check(
      leaks.length === 0,
      `no non-seed deals in any pattern (got ${leaks.length}${leaks.length ? `: ${leaks.map((l) => l.hubspot_deal_id).join(", ")}` : ""})`,
    );

    console.log(
      failures === 0
        ? "\nintelligence verification: ALL CHECKS PASS"
        : `\nintelligence verification: ${failures} FAILURE(S)`,
    );
    process.exitCode = failures === 0 ? 0 : 2;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
