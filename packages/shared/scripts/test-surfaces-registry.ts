/**
 * Surfaces registry unit tests — Phase 4 Day 1 Session B.
 *
 * TS-type-checks the registry shape. Verifies SurfaceId union is
 * exhaustive against the 4 literal surfaces. Verifies threshold-shape
 * unions discriminate correctly. No DB; no Claude; deterministic.
 *
 * Per DECISIONS.md §2.26 (surfaces registry literal) + Phase 4 Day 1
 * Session B kickoff Decision 2.
 *
 * Usage:
 *   pnpm --filter @nexus/shared test:surfaces-registry
 */
import {
  SURFACES,
  SURFACE_IDS,
  getSurface,
  type SurfaceId,
  type SurfaceConfig,
} from "@nexus/shared";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERT: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `ASSERT ${message}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

async function main(): Promise<void> {
  console.log("Surfaces registry — Phase 4 Day 1 Session B\n");
  let caseNum = 0;

  // [1] Surface count matches the literal port (4).
  caseNum++;
  console.log(`[${caseNum}] surface count = 4 (literal port)…`);
  {
    const ids = Object.keys(SURFACES);
    assertEqual(ids.length, 4, "SURFACES has 4 keys");
    assertEqual(SURFACE_IDS.length, 4, "SURFACE_IDS array has 4 entries");
    for (const id of SURFACE_IDS) {
      assert((SURFACES as Record<string, SurfaceConfig>)[id], `SURFACES[${id}] exists`);
    }
    console.log(`      OK — 4 surfaces: ${ids.join(", ")}`);
  }

  // [2] call_prep_brief shape.
  caseNum++;
  console.log(`[${caseNum}] call_prep_brief literal shape…`);
  {
    const s = SURFACES.call_prep_brief;
    assertEqual(s.id, "call_prep_brief", "id");
    assertEqual(s.kind, "deal_specific", "kind");
    assertEqual(s.admission.minScore, 70, "admission.minScore=70");
    assert(
      Array.isArray(s.admission.appliesWhenStageIn) &&
        s.admission.appliesWhenStageIn.length === 4,
      "appliesWhenStageIn has 4 stages",
    );
    assertEqual(s.maxItems.patterns, 3, "maxItems.patterns=3");
    assertEqual(s.maxItems.risks, 5, "maxItems.risks=5");
    assertEqual(s.maxItems.experiments, 2, "maxItems.experiments=2");
    assertEqual(s.emptyState, "CallPrepEmptyState", "emptyState");
    console.log(
      `      OK — minScore=70 stages=[disc,tv,prop,neg] maxItems={p:3,r:5,e:2}`,
    );
  }

  // [3] intelligence_dashboard_patterns shape.
  caseNum++;
  console.log(`[${caseNum}] intelligence_dashboard_patterns literal shape…`);
  {
    const s = SURFACES.intelligence_dashboard_patterns;
    assertEqual(s.kind, "portfolio", "kind=portfolio");
    assertEqual(s.admission.minDealsAffected, 2, "minDealsAffected=2");
    assertEqual(s.admission.minAggregateArr, 500_000, "minAggregateArr=500K");
    assertEqual(s.maxItems, 20, "maxItems=20");
    assertEqual(s.emptyState, "PatternsEmptyState", "emptyState");
    console.log(`      OK — portfolio kind; minDeals=2 minArr=500K maxItems=20`);
  }

  // [4] daily_digest shape.
  caseNum++;
  console.log(`[${caseNum}] daily_digest literal shape…`);
  {
    const s = SURFACES.daily_digest;
    assertEqual(s.kind, "portfolio", "kind=portfolio");
    assertEqual(s.admission.minScore, 75, "minScore=75");
    assertEqual(s.admission.maxAgeHours, 24, "maxAgeHours=24");
    assertEqual(s.maxItems, 5, "maxItems=5");
    assertEqual(s.emptyState, "DigestNothingNewState", "emptyState");
    console.log(`      OK — portfolio kind; minScore=75 maxAge=24h maxItems=5`);
  }

  // [5] deal_detail_intelligence shape.
  caseNum++;
  console.log(`[${caseNum}] deal_detail_intelligence literal shape…`);
  {
    const s = SURFACES.deal_detail_intelligence;
    assertEqual(s.kind, "deal_specific", "kind=deal_specific");
    assertEqual(s.admission.dealSpecific, true, "dealSpecific=true");
    assertEqual(s.admission.minScore, 60, "minScore=60");
    assertEqual(s.maxItems, 10, "maxItems=10");
    assertEqual(s.emptyState, "DealDetailEmptyState", "emptyState");
    console.log(`      OK — deal_specific; dealSpecific=true minScore=60 maxItems=10`);
  }

  // [6] getSurface() narrows by ID; throws on unknown.
  caseNum++;
  console.log(`[${caseNum}] getSurface() narrows + throws on unknown…`);
  {
    const s = getSurface("call_prep_brief");
    assertEqual(s.id, "call_prep_brief", "narrowing works");
    let caught: Error | null = null;
    try {
      getSurface("not_a_real_surface" as SurfaceId);
    } catch (err) {
      caught = err instanceof Error ? err : new Error(String(err));
    }
    assert(caught !== null, "throws on unknown id");
    assert(caught.message.includes("not_a_real_surface"), "error names the bad id");
    console.log(`      OK — narrowing + throwing both work`);
  }

  // [7] Discriminated union — switch on .kind exhausts.
  caseNum++;
  console.log(`[${caseNum}] discriminated union exhaustiveness…`);
  {
    const tally = { deal_specific: 0, portfolio: 0 };
    for (const id of SURFACE_IDS) {
      const s = getSurface(id);
      switch (s.kind) {
        case "deal_specific":
          tally.deal_specific++;
          break;
        case "portfolio":
          tally.portfolio++;
          break;
      }
    }
    assertEqual(tally.deal_specific, 2, "2 deal_specific surfaces");
    assertEqual(tally.portfolio, 2, "2 portfolio surfaces");
    console.log(
      `      OK — split: 2 deal_specific (call_prep_brief + deal_detail_intelligence), 2 portfolio (intelligence_dashboard_patterns + daily_digest)`,
    );
  }

  // [8] SURFACE_IDS array matches the union exactly.
  caseNum++;
  console.log(`[${caseNum}] SURFACE_IDS array matches the union exactly…`);
  {
    const idsFromArray = new Set<string>(SURFACE_IDS);
    const idsFromObject = new Set<string>(Object.keys(SURFACES));
    assertEqual(idsFromArray.size, idsFromObject.size, "size matches");
    for (const id of idsFromArray) {
      assert(idsFromObject.has(id), `${id} present in SURFACES`);
    }
    console.log(`      OK — set equality between SURFACE_IDS and Object.keys(SURFACES)`);
  }

  console.log("");
  console.log(`Surfaces registry: ALL ${caseNum}/${caseNum} CASES PASS.`);
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
