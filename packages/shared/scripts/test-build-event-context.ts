/**
 * DealIntelligence.buildEventContext unit tests — Phase 4 Day 1 Session A.5.
 *
 * Verifies the shape-correct read pattern that lands in Session A.5:
 * `payload.properties.{nexus_vertical, dealstage, amount, ...}` plus
 * `payload.associations.companies.results[0].id` for the company link
 * (with `payload.companyId` fallback for any future mapper-normalized
 * payload). Tests against an in-memory cache fixture matching the actual
 * `hubspot_cache.payload` shape per adapter.ts:1256.
 *
 * No DB; no Claude; deterministic. Mocks the `sql` parameter via the
 * `{databaseUrl, sql}` injection seam.
 *
 * Usage:
 *   pnpm --filter @nexus/shared test:build-event-context
 */
import type postgres from "postgres";

import { DealIntelligence } from "@nexus/shared";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERT: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `ASSERT ${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

type CacheRow = { payload: Record<string, unknown> | null };

/**
 * In-memory mock of postgres.Sql implementing only the tagged-template
 * call shape buildEventContext uses. Inspects the joined SQL to dispatch
 * deal vs company queries; reads the first interpolated value as the
 * hubspot_id. Returns a Promise<CacheRow[]>; postgres.js's PendingQuery
 * is thenable so `await` resolves uniformly.
 */
function makeMockSql(
  deals: Map<string, Record<string, unknown>>,
  companies: Map<string, Record<string, unknown>>,
): postgres.Sql {
  const fn = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sqlText = strings.join("?");
    if (sqlText.includes("object_type = 'deal'")) {
      const id = String(values[0]);
      const payload = deals.get(id);
      return Promise.resolve<CacheRow[]>(payload ? [{ payload }] : []);
    }
    if (sqlText.includes("object_type = 'company'")) {
      const id = String(values[0]);
      const payload = companies.get(id);
      return Promise.resolve<CacheRow[]>(payload ? [{ payload }] : []);
    }
    throw new Error(`Mock sql: unrecognized query: ${sqlText}`);
  };
  return fn as unknown as postgres.Sql;
}

// ── Fixtures matching adapter.ts:1256 raw HubSpot shape ──────────────

// MedVista-shaped deal — discovery stage (3544580805 per pipeline-ids.json),
// $2.4M, healthcare. Hand-written to mirror the structural shape of the
// real hubspot_cache.payload row for deal 321972856545; values like
// `nexus_vertical`/`dealstage`/`amount` chosen to map cleanly to the
// expected DealEventContext output. Hand-writing keeps the test
// independent of portal state.
const medvistaDealPayload: Record<string, unknown> = {
  id: "321972856545",
  properties: {
    dealstage: "3544580805", // discovery
    nexus_vertical: "healthcare",
    amount: "2400000", // string per HubSpot raw API
    createdate: "2026-04-22T15:00:00Z",
    dealname: "MedVista Epic Integration",
  },
  associations: {
    companies: {
      results: [{ id: "fixture-medvista-co" }],
    },
  },
};

// MedVista-shaped company — 4500 employees (clearly in 1k-5k band per
// bucketEmployeeCount: 1000 ≤ n < 5000), healthcare vertical.
const medvistaCompanyPayload: Record<string, unknown> = {
  id: "fixture-medvista-co",
  properties: {
    nexus_vertical: "healthcare",
    numberofemployees: "4500", // string per HubSpot raw API
    name: "MedVista Health",
  },
};

async function main(): Promise<void> {
  console.log(
    "DealIntelligence.buildEventContext unit tests — Phase 4 Day 1 Session A.5\n",
  );

  // ── Case 1: happy path against MedVista raw shape ──────────────────
  console.log("[1/8] happy path — MedVista raw HubSpot shape…");
  {
    const sql = makeMockSql(
      new Map([["321972856545", medvistaDealPayload]]),
      new Map([["fixture-medvista-co", medvistaCompanyPayload]]),
    );
    const intel = new DealIntelligence({ databaseUrl: "ignored", sql });
    const ctx = await intel.buildEventContext("321972856545", []);
    assertEqual(ctx.vertical, "healthcare", "vertical");
    assertEqual(ctx.stageAtEvent, "discovery", "stageAtEvent");
    assertEqual(ctx.dealSizeBand, "1m-5m", "dealSizeBand");
    assertEqual(ctx.employeeCountBand, "1k-5k", "employeeCountBand");
    assert(
      Array.isArray(ctx.activeExperimentAssignments) &&
        ctx.activeExperimentAssignments.length === 0,
      "activeExperimentAssignments=[]",
    );
    await intel.close();
  }
  console.log("      OK — vertical=healthcare stage=discovery 1m-5m 1k-5k");

  // ── Case 2: activeExperimentAssignments passes through ─────────────
  console.log("[2/8] activeExperimentAssignments passes through…");
  {
    const sql = makeMockSql(
      new Map([["321972856545", medvistaDealPayload]]),
      new Map([["fixture-medvista-co", medvistaCompanyPayload]]),
    );
    const intel = new DealIntelligence({ databaseUrl: "ignored", sql });
    const ctx = await intel.buildEventContext("321972856545", ["exp-A", "exp-B"]);
    assertEqual(ctx.activeExperimentAssignments.length, 2, "length");
    assertEqual(ctx.activeExperimentAssignments[0], "exp-A", "[0]");
    assertEqual(ctx.activeExperimentAssignments[1], "exp-B", "[1]");
    await intel.close();
  }
  console.log("      OK — 2 assignments threaded through");

  // ── Case 3: null deal payload → all-null fields, no crash ──────────
  console.log("[3/8] missing deal cache — all fields null, no crash…");
  {
    const sql = makeMockSql(new Map(), new Map());
    const intel = new DealIntelligence({ databaseUrl: "ignored", sql });
    const ctx = await intel.buildEventContext("nonexistent-deal", []);
    assertEqual(ctx.vertical, null, "vertical=null");
    assertEqual(ctx.stageAtEvent, null, "stageAtEvent=null");
    assertEqual(ctx.dealSizeBand, null, "dealSizeBand=null");
    assertEqual(ctx.employeeCountBand, null, "employeeCountBand=null");
    assert(ctx.activeExperimentAssignments.length === 0, "[]");
    await intel.close();
  }
  console.log("      OK — null payload → all-null fields");

  // ── Case 4: company cache missing → deal vertical preserved ────────
  console.log("[4/8] company cache missing — deal vertical preserved…");
  {
    const sql = makeMockSql(
      new Map([["321972856545", medvistaDealPayload]]),
      new Map(), // no companies cached
    );
    const intel = new DealIntelligence({ databaseUrl: "ignored", sql });
    const ctx = await intel.buildEventContext("321972856545", []);
    assertEqual(ctx.vertical, "healthcare", "vertical from deal");
    assertEqual(ctx.stageAtEvent, "discovery", "stageAtEvent");
    assertEqual(ctx.dealSizeBand, "1m-5m", "dealSizeBand");
    assertEqual(ctx.employeeCountBand, null, "employeeCountBand=null");
    await intel.close();
  }
  console.log("      OK — deal vertical holds, employee band null");

  // ── Case 5: deal lacks nexus_vertical → company vertical fallback ──
  console.log("[5/8] no nexus_vertical on deal — falls back to company…");
  {
    const dealNoVertical: Record<string, unknown> = {
      id: "321972856545",
      properties: {
        dealstage: "3544580805",
        amount: "2400000",
        // no nexus_vertical
      },
      associations: {
        companies: { results: [{ id: "fixture-medvista-co" }] },
      },
    };
    const sql = makeMockSql(
      new Map([["321972856545", dealNoVertical]]),
      new Map([["fixture-medvista-co", medvistaCompanyPayload]]),
    );
    const intel = new DealIntelligence({ databaseUrl: "ignored", sql });
    const ctx = await intel.buildEventContext("321972856545", []);
    assertEqual(ctx.vertical, "healthcare", "vertical from company");
    await intel.close();
  }
  console.log("      OK — company vertical takes over");

  // ── Case 6: amount as numeric string → parsed via parseHubspotNumber ──
  console.log("[6/8] amount as string — parsed via parseHubspotNumber…");
  {
    const dealStringAmount: Record<string, unknown> = {
      id: "deal-007",
      properties: {
        dealstage: "3544580805",
        nexus_vertical: "healthcare",
        amount: "750000", // 500k-1m
      },
    };
    const sql = makeMockSql(
      new Map([["deal-007", dealStringAmount]]),
      new Map(),
    );
    const intel = new DealIntelligence({ databaseUrl: "ignored", sql });
    const ctx = await intel.buildEventContext("deal-007", []);
    assertEqual(ctx.dealSizeBand, "500k-1m", "string→number→band");
    await intel.close();
  }
  console.log("      OK — string '750000' → 500k-1m");

  // ── Case 7: unknown stage id → stageAtEvent=null ──────────────────
  console.log("[7/8] unknown stage id — stageAtEvent=null…");
  {
    const dealUnknownStage: Record<string, unknown> = {
      id: "deal-008",
      properties: {
        dealstage: "9999999999", // not in pipeline-ids.json
        nexus_vertical: "healthcare",
        amount: "100000",
      },
    };
    const sql = makeMockSql(
      new Map([["deal-008", dealUnknownStage]]),
      new Map(),
    );
    const intel = new DealIntelligence({ databaseUrl: "ignored", sql });
    const ctx = await intel.buildEventContext("deal-008", []);
    assertEqual(ctx.stageAtEvent, null, "unknown id → null");
    assertEqual(ctx.vertical, "healthcare", "vertical still resolves");
    await intel.close();
  }
  console.log("      OK — unknown stage id falls to null");

  // ── Case 8: companyId top-level fallback (mapper-normalized shape) ─
  console.log("[8/8] companyId top-level fallback (no associations)…");
  {
    const dealTopLevelCompany: Record<string, unknown> = {
      id: "deal-009",
      properties: {
        dealstage: "3544580805",
        nexus_vertical: "healthcare",
        amount: "2400000",
      },
      // no associations key
      companyId: "fixture-medvista-co", // mapper-normalized fallback
    };
    const sql = makeMockSql(
      new Map([["deal-009", dealTopLevelCompany]]),
      new Map([["fixture-medvista-co", medvistaCompanyPayload]]),
    );
    const intel = new DealIntelligence({ databaseUrl: "ignored", sql });
    const ctx = await intel.buildEventContext("deal-009", []);
    assertEqual(ctx.employeeCountBand, "1k-5k", "company resolves via fallback");
    await intel.close();
  }
  console.log("      OK — top-level companyId fallback works");

  console.log("");
  console.log("DealIntelligence.buildEventContext: ALL 8 CASES PASS.");
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
