/**
 * IntelligenceCoordinator.enrichAffectedDeals unit tests — Phase 4 Day 4.
 *
 * 3 cases per Decision 11:
 *   1. Basic enrichment — all fields populated; mock adapter returns Deal
 *      + DealContact[] for each call; mock SQL returns batch MEDDPICC
 *   2. Partial-failure — one adapter call throws; remaining deal gets
 *      `(unavailable)` placeholders + telemetry event captured
 *   3. MEDDPICC missing — meddpicc summary null; other fields populated
 *
 * Asserts return SHAPE + telemetry events. Mocks Pick<CrmAdapter,
 * "getDeal" | "listDealContacts"> + sql for the batch read.
 *
 * Usage:
 *   pnpm --filter @nexus/shared test:enrich-affected-deals-block
 */
import type postgres from "postgres";

import { IntelligenceCoordinator } from "@nexus/shared";
import type { AffectedSignalRow } from "@nexus/shared";
import type { CrmAdapter, Deal, Contact, ContactRole } from "@nexus/shared";

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

// ── Telemetry capture ─────────────────────────────────────────────────

let telemetryEvents: Array<Record<string, unknown>> = [];
const originalStderrWrite = process.stderr.write.bind(process.stderr);

function captureTelemetry() {
  telemetryEvents = [];
  process.stderr.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
    const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) continue;
      try {
        const event = JSON.parse(trimmed) as Record<string, unknown>;
        if (typeof event.event === "string") telemetryEvents.push(event);
      } catch {
        // not JSON — ignore
      }
    }
    return originalStderrWrite(chunk as never, ...(rest as []));
  }) as typeof process.stderr.write;
}

function restoreTelemetry() {
  process.stderr.write = originalStderrWrite;
}

function eventsOfType(name: string): Array<Record<string, unknown>> {
  return telemetryEvents.filter((e) => e.event === name);
}

// ── Mock adapter + sql helpers ────────────────────────────────────────

function makeMockSql(meddpiccRows: Array<Record<string, unknown>>): postgres.Sql {
  const fn = (strings: TemplateStringsArray) => {
    const text = strings.join("?");
    if (text.includes("FROM meddpicc_scores")) {
      return Promise.resolve(meddpiccRows);
    }
    throw new Error(`Mock sql: unrecognized: ${text.slice(0, 80)}`);
  };
  (fn as unknown as { json: (v: unknown) => unknown }).json = (v) => v;
  return fn as unknown as postgres.Sql;
}

interface AdapterFixture {
  deals: Map<string, Deal>;
  contactsByDealId: Map<string, Array<Contact & { role: ContactRole | null; isPrimary: boolean }>>;
  errors?: { getDeal?: Set<string>; listDealContacts?: Set<string> };
}

function makeMockAdapter(fx: AdapterFixture): Pick<CrmAdapter, "getDeal" | "listDealContacts"> {
  return {
    async getDeal(id) {
      if (fx.errors?.getDeal?.has(id)) throw new Error(`getDeal failed for ${id}`);
      const deal = fx.deals.get(id);
      if (!deal) throw new Error(`No fixture deal for ${id}`);
      return deal;
    },
    async listDealContacts(id) {
      if (fx.errors?.listDealContacts?.has(id)) throw new Error(`listDealContacts failed for ${id}`);
      return fx.contactsByDealId.get(id) ?? [];
    },
  };
}

function signal(dealId: string): AffectedSignalRow {
  return {
    hubspot_deal_id: dealId,
    vertical: "healthcare",
    signal_type: "competitive_intel",
    evidence_quote: "they cited Microsoft DAX",
    source_speaker: "Buyer",
    urgency: "medium",
    deal_size_band: "1m-5m",
    created_at: new Date().toISOString(),
  };
}

function makeDeal(id: string, name: string): Deal {
  return {
    hubspotId: id,
    name,
    companyId: null,
    primaryContactId: null,
    ownerId: "owner-jefflackey",
    bdrOwnerId: null,
    saOwnerId: null,
    stage: "negotiation",
    amount: 1_500_000,
    currency: "USD",
    closeDate: null,
    winProbability: null,
    forecastCategory: null,
    vertical: "healthcare",
    product: null,
    leadSource: null,
    primaryCompetitor: null,
    lossReason: null,
    closeCompetitor: null,
    closeNotes: null,
    closeImprovement: null,
    winTurningPoint: null,
    winReplicable: null,
    closedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    customProperties: {},
  };
}

function makeContact(
  id: string,
  firstName: string,
  lastName: string,
  role: ContactRole | null,
  isPrimary: boolean,
): Contact & { role: ContactRole | null; isPrimary: boolean } {
  return {
    hubspotId: id,
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}@example.com`,
    title: "VP Engineering",
    createdAt: new Date(),
    updatedAt: new Date(),
    customProperties: {},
    role,
    isPrimary,
  } as unknown as Contact & { role: ContactRole | null; isPrimary: boolean };
}

// ── Cases ─────────────────────────────────────────────────────────────

async function case1_basic_enrichment() {
  console.log("CASE 1 — basic enrichment: all fields populated; full status…");
  telemetryEvents = [];
  const dealsMap = new Map<string, AffectedSignalRow[]>([
    ["deal-A", [signal("deal-A")]],
    ["deal-B", [signal("deal-B"), signal("deal-B")]],
  ]);
  const fx: AdapterFixture = {
    deals: new Map([
      ["deal-A", makeDeal("deal-A", "MedVista Epic Integration")],
      ["deal-B", makeDeal("deal-B", "NordicMed Phase 2")],
    ]),
    contactsByDealId: new Map([
      [
        "deal-A",
        [
          makeContact("c-1", "Michael", "Chen", "champion", true),
          makeContact("c-2", "Anita", "Reyes", "economic_buyer", false),
        ],
      ],
      ["deal-B", [makeContact("c-3", "Karl", "Andersen", "decision_maker", true)]],
    ]),
  };
  const meddpiccRows = [
    {
      hubspot_deal_id: "deal-A",
      metrics_score: 75,
      economic_buyer_score: 60,
      decision_criteria_score: 80,
      decision_process_score: 70,
      paper_process_score: 65,
      identify_pain_score: 85,
      champion_score: 78,
      competition_score: 55,
      overall_score: 71,
      per_dimension_confidence: { metrics: 0.9, champion: 0.85 },
      evidence: {
        metrics: { evidence_text: "$50M ARR target", last_updated: "2026-04-15" },
      },
    },
  ];
  const ic = new IntelligenceCoordinator({
    databaseUrl: "",
    sql: makeMockSql(meddpiccRows),
  });
  const result = await ic.enrichAffectedDeals({
    dealsMap,
    adapter: makeMockAdapter(fx),
    jobId: "job-test-1",
  });
  assertEqual(result.length, 2, "2 enriched deals");
  const dealA = result[0]!;
  assertEqual(dealA.hubspotDealId, "deal-A", "deal A id");
  assertEqual(dealA.dealName, "MedVista Epic Integration", "deal A name");
  assertEqual(dealA.stage, "negotiation", "deal A stage");
  assertEqual(dealA.amount, 1_500_000, "deal A amount");
  assertEqual(dealA.aeName, "owner-jefflackey", "deal A ownerId surfaced as aeName");
  assertEqual(dealA.stakeholders.length, 2, "2 stakeholders for deal A");
  assertEqual(dealA.stakeholders[0]!.fullName, "Michael Chen", "stakeholder fullName");
  assertEqual(dealA.stakeholders[0]!.role, "champion", "stakeholder role");
  assertEqual(dealA.stakeholders[0]!.isPrimary, true, "stakeholder isPrimary");
  assert(dealA.meddpicc !== null, "deal A meddpicc populated");
  assertEqual(dealA.meddpicc!.overallScore, 71, "meddpicc overallScore");
  assertEqual(dealA.meddpicc!.scoresByDimension.metrics, 75, "metrics dim score");
  assertEqual(dealA.meddpicc!.scoresByDimension.champion, 78, "champion dim score");
  assertEqual(dealA.enrichmentStatus, "full", "status full");
  assertEqual(dealA.fieldsUnavailable.length, 0, "no fields unavailable");
  // deal B has 1 stakeholder, no meddpicc row
  const dealB = result[1]!;
  assertEqual(dealB.stakeholders.length, 1, "1 stakeholder for deal B");
  assertEqual(dealB.meddpicc, null, "deal B meddpicc null (no row in batch)");
  assertEqual(dealB.enrichmentStatus, "full", "deal B status full");
  assertEqual(eventsOfType("affected_deal_enrichment_partial").length, 0, "no partial telemetry");
  console.log("      OK — full enrichment with stakeholders + meddpicc; deal B no-meddpicc clean");
}

async function case2_partial_failure_with_telemetry() {
  console.log("CASE 2 — adapter.getDeal fails for one deal → partial status + telemetry…");
  telemetryEvents = [];
  const dealsMap = new Map<string, AffectedSignalRow[]>([
    ["deal-A", [signal("deal-A")]],
    ["deal-FAIL", [signal("deal-FAIL")]],
  ]);
  const fx: AdapterFixture = {
    deals: new Map([["deal-A", makeDeal("deal-A", "Working Deal A")]]),
    contactsByDealId: new Map([
      ["deal-A", [makeContact("c-1", "Working", "Person", null, false)]],
      // Note: deal-FAIL also has no contacts so listDealContacts returns []
    ]),
    errors: { getDeal: new Set(["deal-FAIL"]) },
  };
  const ic = new IntelligenceCoordinator({
    databaseUrl: "",
    sql: makeMockSql([]),
  });
  const result = await ic.enrichAffectedDeals({
    dealsMap,
    adapter: makeMockAdapter(fx),
    jobId: "job-test-2",
  });
  assertEqual(result.length, 2, "still 2 entries (failure does NOT drop the deal)");
  const dealA = result[0]!;
  assertEqual(dealA.enrichmentStatus, "full", "deal A still full");
  const dealFail = result[1]!;
  assertEqual(dealFail.hubspotDealId, "deal-FAIL", "failed deal still in result");
  assertEqual(dealFail.dealName, null, "failed deal: name null");
  assertEqual(dealFail.enrichmentStatus, "partial", "failed deal: partial status");
  assert(dealFail.fieldsUnavailable.includes("dealName"), "dealName flagged unavailable");
  assert(dealFail.fieldsUnavailable.includes("stage"), "stage flagged unavailable");
  // Cited signals from dealsMap STILL present even on failure
  assertEqual(dealFail.signals.length, 1, "signals from dealsMap preserved");
  // Telemetry assertion
  const partialEvents = eventsOfType("affected_deal_enrichment_partial");
  assert(partialEvents.length >= 1, "at least one partial telemetry event emitted");
  const failedTelem = partialEvents.find((e) => e.hubspot_deal_id === "deal-FAIL");
  assert(failedTelem !== undefined, "telemetry has deal-FAIL entry");
  assertEqual(failedTelem!.cause, "get_deal_failed", "telemetry cause");
  assertEqual(failedTelem!.job_id, "job-test-2", "telemetry job_id");
  console.log("      OK — partial-failure: failed deal preserved with placeholders + telemetry emitted");
}

async function case3_meddpicc_batch_empty_block_fallback() {
  console.log("CASE 3 — MEDDPICC batch returns empty → meddpicc null; other fields populated…");
  telemetryEvents = [];
  const dealsMap = new Map<string, AffectedSignalRow[]>([["deal-A", [signal("deal-A")]]]);
  const fx: AdapterFixture = {
    deals: new Map([["deal-A", makeDeal("deal-A", "Deal Without MEDDPICC")]]),
    contactsByDealId: new Map([
      ["deal-A", [makeContact("c-1", "Sole", "Stakeholder", null, true)]],
    ]),
  };
  const ic = new IntelligenceCoordinator({
    databaseUrl: "",
    sql: makeMockSql([]), // batch returns empty
  });
  const result = await ic.enrichAffectedDeals({
    dealsMap,
    adapter: makeMockAdapter(fx),
  });
  assertEqual(result.length, 1, "1 enriched deal");
  const deal = result[0]!;
  assertEqual(deal.dealName, "Deal Without MEDDPICC", "deal name populated");
  assertEqual(deal.stage, "negotiation", "stage populated");
  assertEqual(deal.stakeholders.length, 1, "stakeholder populated");
  assertEqual(deal.meddpicc, null, "meddpicc null");
  // Critical: enrichmentStatus stays "full" — meddpicc absence is not a failure.
  assertEqual(deal.enrichmentStatus, "full", "status full despite no meddpicc");
  assertEqual(deal.fieldsUnavailable.length, 0, "no fields flagged unavailable");
  console.log("      OK — MEDDPICC absent ≠ partial; meddpicc=null clean fallback");
}

async function main() {
  captureTelemetry();
  try {
    await case1_basic_enrichment();
    await case2_partial_failure_with_telemetry();
    await case3_meddpicc_batch_empty_block_fallback();
    console.log("\nIntelligenceCoordinator.enrichAffectedDeals: ALL 3/3 CASES PASS.");
  } finally {
    restoreTelemetry();
  }
}

main().catch((err) => {
  restoreTelemetry();
  console.error("test:enrich-affected-deals-block FAILED:", err);
  process.exit(1);
});
