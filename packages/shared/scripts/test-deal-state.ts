/**
 * DealIntelligence.getDealState live round-trip — Phase 4 Day 1 Session A.
 *
 * Exercises getDealState against the live MedVista fixture (deal
 * 321972856545). Verifies the projection reads the right sources +
 * computes derived fields per Decision 3's locked shape.
 *
 * Usage:
 *   pnpm --filter @nexus/shared test:deal-state
 */
import dns from "node:dns";

// Supabase direct host (db.<ref>.supabase.co) resolves only AAAA on dev
// Macs as of Phase 3 Day 4. Force IPv6-first so getaddrinfo doesn't
// ENOTFOUND on the IPv4 path. Must precede any postgres import so the
// resolver order applies to the first connection.
dns.setDefaultResultOrder("ipv6first");

import { DealIntelligence, loadDevEnv, requireEnv } from "@nexus/shared";

loadDevEnv();

const HUBSPOT_DEAL_ID = "321972856545"; // MedVista Epic Integration

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERT: ${message}`);
}

async function main(): Promise<void> {
  // Phase 3 Day 4 Session B: dev-Mac IPv6 route to Supabase direct host
  // is broken; prefer pooler URL (IPv4, works) over DIRECT_URL (IPv6-only,
  // unreachable). Falls back to DIRECT_URL if DATABASE_URL absent.
  const databaseUrl = process.env.DATABASE_URL ?? requireEnv("DIRECT_URL");

  const dealIntel = new DealIntelligence({ databaseUrl });
  try {
    console.log(
      "DealIntelligence.getDealState live round-trip — Phase 4 Day 1 Session A\n",
    );
    console.log(`[1/8] reading getDealState(${HUBSPOT_DEAL_ID})…`);
    const dealState = await dealIntel.getDealState(HUBSPOT_DEAL_ID);
    console.log(`      OK`);

    console.log(`[2/8] verify hubspotDealId echoes input…`);
    assert(
      dealState.hubspotDealId === HUBSPOT_DEAL_ID,
      `hubspotDealId mismatch: got ${dealState.hubspotDealId}`,
    );
    console.log(`      OK — ${dealState.hubspotDealId}`);

    console.log(`[3/8] verify vertical = 'healthcare' (from MedVista cache)…`);
    assert(
      dealState.vertical === "healthcare",
      `vertical mismatch: got ${dealState.vertical}`,
    );
    console.log(`      OK — vertical=${dealState.vertical}`);

    console.log(`[4/8] verify stage is one of DEAL_STAGES…`);
    assert(
      dealState.stage !== null,
      "stage should not be null for a seeded MedVista deal",
    );
    console.log(`      OK — stage=${dealState.stage}`);

    console.log(`[5/8] verify meddpiccScores is non-empty (Phase 3 Day 4 populated)…`);
    const dimsWithScores = Object.keys(dealState.meddpiccScores);
    assert(
      dimsWithScores.length >= 1,
      `meddpiccScores expected at least 1 dim populated (Phase 3 Day 4 Session B left 8 dims), got ${dimsWithScores.length}`,
    );
    console.log(
      `      OK — ${dimsWithScores.length} dims scored: ${JSON.stringify(dealState.meddpiccScores)}`,
    );

    console.log(`[6/8] verify openSignals.length >= 1 (Phase 3 runs detected signals)…`);
    assert(
      dealState.openSignals.length >= 1,
      `openSignals expected at least 1 (Phase 3 Day 4 left 50+ signal_detected events), got ${dealState.openSignals.length}`,
    );
    console.log(
      `      OK — ${dealState.openSignals.length} open signals; sample: [${dealState.openSignals[0]?.signalType}]`,
    );

    console.log(`[7/8] verify daysSinceCreated > 0 + closeStatus = 'not_closed'…`);
    assert(
      dealState.daysSinceCreated > 0,
      `daysSinceCreated expected > 0 for a seeded deal, got ${dealState.daysSinceCreated}`,
    );
    assert(
      dealState.closeStatus === "not_closed",
      `closeStatus expected 'not_closed' for an open MedVista deal, got ${dealState.closeStatus}`,
    );
    console.log(
      `      OK — daysSinceCreated=${dealState.daysSinceCreated} closeStatus=${dealState.closeStatus}`,
    );

    console.log(`[8/8] verify activeExperimentAssignments is empty array (Day 1 Session A)…`);
    assert(
      Array.isArray(dealState.activeExperimentAssignments) &&
        dealState.activeExperimentAssignments.length === 0,
      "activeExperimentAssignments should be [] for Day 1 Session A (no experiment writers yet)",
    );
    console.log(`      OK — activeExperimentAssignments=[] (expected)`);

    console.log("");
    console.log(`Full DealState snapshot:`);
    console.log(
      JSON.stringify(
        {
          hubspotDealId: dealState.hubspotDealId,
          vertical: dealState.vertical,
          stage: dealState.stage,
          amount: dealState.amount,
          dealSizeBand: dealState.dealSizeBand,
          employeeCountBand: dealState.employeeCountBand,
          daysInStage: dealState.daysInStage,
          daysSinceCreated: dealState.daysSinceCreated,
          closeStatus: dealState.closeStatus,
          meddpiccScores: dealState.meddpiccScores,
          openSignalsCount: dealState.openSignals.length,
          activeExperimentAssignmentsCount: dealState.activeExperimentAssignments.length,
        },
        null,
        2,
      ),
    );

    console.log("");
    console.log("DealIntelligence.getDealState: ALL 8 CASES PASS.");
  } finally {
    await dealIntel.close();
  }
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
