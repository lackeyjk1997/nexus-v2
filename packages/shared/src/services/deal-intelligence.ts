/**
 * DealIntelligence service — skeleton for Pre-Phase 3 Session 0-B.
 *
 * The full `DealIntelligence` service (§2.16, Guardrails 24–25) is Phase 4's
 * unified read/write interface for `deal_events` + `deal_snapshots`. This
 * file lands the single method Phase 3 Day 2 needs from day one —
 * `buildEventContext` — so every event written from Phase 3 Day 2 onward
 * populates the `deal_events.event_context` column (§2.16.1 decision 2,
 * pulled forward Pre-Phase 3 Session 0-A).
 *
 * Phase 4 expands this file with `recordEvent`, `getDealState`,
 * `getApplicablePatterns`, `getApplicableExperiments`, `getApplicableFlags`,
 * `refreshSnapshot`. Each of those adds rows/reads via postgres.js-direct,
 * following the MeddpiccService template.
 *
 * Foundation-review anchor: Output 2 A2 (event_context pull-forward).
 */
import postgres from "postgres";

import { type Vertical, isVertical } from "../enums/vertical";
import { type DealStage, isDealStage } from "../enums/deal-stage";
import { MEDDPICC_DIMENSION } from "../enums/meddpicc-dimension";

/**
 * Segmentation snapshot for a single `deal_events` row. Written at event
 * time; never updated. `hubspot_cache` preserves current state; this shape
 * preserves historical state so Phase 4+ coordinator queries can slice by
 * accurate-at-event segmentation.
 */
export interface DealEventContext {
  vertical: Vertical | null;
  dealSizeBand: string | null;
  employeeCountBand: string | null;
  stageAtEvent: DealStage | null;
  activeExperimentAssignments: readonly string[];
}

export interface DealIntelligenceOptions {
  databaseUrl: string;
  /** Inject a pre-built postgres client (shared pool, tests). */
  sql?: postgres.Sql;
}

type HubspotDealCacheRow = {
  payload: Record<string, unknown> | null;
};

type CompanyCacheRow = {
  payload: Record<string, unknown> | null;
};

/**
 * Raw shape of the `meddpicc_scores` row as read by the MEDDPICC prompt
 * formatter. Mirrors the schema columns exactly (snake_case) so a SELECT
 * * FROM meddpicc_scores can be cast without remapping. The evidence jsonb
 * column is deliberately typed permissively because production rows carry
 * two observed shapes across Day-2-era writes (plain strings) and Day-3+
 * writes (structured `{evidence_text, last_updated}` objects); the
 * formatter reads both paths safely via optional chaining.
 */
export type MeddpiccPromptRow = {
  metrics_score: number | null;
  economic_buyer_score: number | null;
  decision_criteria_score: number | null;
  decision_process_score: number | null;
  paper_process_score: number | null;
  identify_pain_score: number | null;
  champion_score: number | null;
  competition_score: number | null;
  overall_score: number | null;
  per_dimension_confidence: Record<string, number> | null;
  evidence: Record<
    string,
    { evidence_text?: string; last_updated?: string } | undefined
  > | null;
};

/**
 * Pure-function MEDDPICC prompt formatter. Exposed outside the class so
 * the byte-identical diff gate (packages/shared/scripts/test-meddpicc-format.ts)
 * can exercise it against frozen fixtures without a DB round-trip.
 *
 * Output contract is byte-identical to the pre-Day-3 inline formatter in
 * `packages/shared/src/jobs/handlers.ts` (Phase 3 Day 2 Session B). The
 * refactor extracts this function to DealIntelligence per the documented
 * contract in prompts 01, 05, 07 (`DealIntelligence.formatMeddpiccForPrompt`).
 *
 * Shape:
 *  - null row → "(none)"
 *  - non-null row → 8 lines, one per MEDDPICC_DIMENSION (enum order):
 *      "- {dim}: not yet captured"                                     (score null)
 *      "- {dim}: {evidence_text} (score: {n}, confidence: {n}%, last_updated: {date})"
 *    joined with "\n".
 *
 * Any edit to this function requires updating the frozen expected strings
 * in test-meddpicc-format.ts to match; the test is the drift canary.
 */
export function formatMeddpiccBlock(row: MeddpiccPromptRow | null): string {
  if (!row) return "(none)";
  return MEDDPICC_DIMENSION.map((dim) => {
    const score = row[`${dim}_score` as keyof MeddpiccPromptRow] as number | null;
    if (score === null || score === undefined) {
      return `- ${dim}: not yet captured`;
    }
    const dimEvidence = row.evidence?.[dim];
    const evidenceText = dimEvidence?.evidence_text ?? "(no evidence)";
    const lastUpdated = dimEvidence?.last_updated ?? "—";
    const conf = row.per_dimension_confidence?.[dim];
    const confStr = typeof conf === "number" ? `${Math.round(conf * 100)}%` : "—";
    return `- ${dim}: ${evidenceText} (score: ${score}, confidence: ${confStr}, last_updated: ${lastUpdated})`;
  }).join("\n");
}

/**
 * ARR band buckets for `deal_size_band`. Locked in this module so the
 * bucket edges don't drift across event writers. Migrations that add a
 * new bucket shape coordinate here.
 */
function bucketDealSize(amount: number | null | undefined): string | null {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    return null;
  }
  if (amount < 100_000) return "<100k";
  if (amount < 500_000) return "100k-500k";
  if (amount < 1_000_000) return "500k-1m";
  if (amount < 5_000_000) return "1m-5m";
  if (amount < 10_000_000) return "5m-10m";
  return ">=10m";
}

/**
 * Headcount band buckets for `employee_count_band`. Mirrors the bucket
 * granularity most mid-market/enterprise segmentation queries want.
 */
function bucketEmployeeCount(count: number | null | undefined): string | null {
  if (typeof count !== "number" || !Number.isFinite(count) || count < 0) {
    return null;
  }
  if (count < 50) return "<50";
  if (count < 200) return "50-200";
  if (count < 1000) return "200-1k";
  if (count < 5000) return "1k-5k";
  if (count < 10_000) return "5k-10k";
  return ">=10k";
}

export class DealIntelligence {
  private readonly sql: postgres.Sql;
  private readonly ownedSql: boolean;

  constructor(options: DealIntelligenceOptions) {
    this.sql =
      options.sql ??
      postgres(options.databaseUrl, {
        max: 1,
        idle_timeout: 30,
        prepare: false,
      });
    this.ownedSql = !options.sql;
  }

  /**
   * Build the `event_context` payload for a `deal_events` row at write
   * time. Reads `hubspot_cache` for the deal + its associated company;
   * caller supplies the active experiment-assignment IDs (which live in
   * Nexus `experiment_assignments`, not HubSpot).
   *
   * Returns null-filled fields when the deal or company is not cached.
   * The event still writes; Phase 4 Day 1's NOT NULL flip only applies
   * once Phase 3-era writers are known to populate it reliably.
   *
   * §2.16.1 decision 2 scope: `{vertical, deal_size_band,
   * employee_count_band, stage_at_event, active_experiment_assignments}`.
   */
  async buildEventContext(
    hubspotDealId: string,
    activeExperimentAssignments: readonly string[] = [],
  ): Promise<DealEventContext> {
    // Deal payload from hubspot_cache (primary store — §2.19 data boundary).
    const dealRows = await this.sql<HubspotDealCacheRow[]>`
      SELECT payload FROM hubspot_cache
       WHERE object_type = 'deal' AND hubspot_id = ${hubspotDealId}
       LIMIT 1
    `;
    const dealPayload = dealRows[0]?.payload ?? null;

    const stageRaw = dealPayload?.stage;
    const stageAtEvent = isDealStage(stageRaw) ? stageRaw : null;

    const verticalRaw = dealPayload?.vertical;
    const dealVertical = isVertical(verticalRaw) ? verticalRaw : null;

    const amount = typeof dealPayload?.amount === "number" ? dealPayload.amount : null;
    const dealSizeBand = bucketDealSize(amount);

    // Company-derived fields: vertical-fallback + employee-count band.
    // Company ID may be on the deal payload as `companyId` per the HubSpot
    // mappers. If company isn't cached, company-derived fields stay null.
    const companyId =
      typeof dealPayload?.companyId === "string" ? dealPayload.companyId : null;
    let companyVertical: Vertical | null = null;
    let employeeCountBand: string | null = null;
    if (companyId) {
      const companyRows = await this.sql<CompanyCacheRow[]>`
        SELECT payload FROM hubspot_cache
         WHERE object_type = 'company' AND hubspot_id = ${companyId}
         LIMIT 1
      `;
      const companyPayload = companyRows[0]?.payload ?? null;
      const companyVerticalRaw = companyPayload?.vertical;
      companyVertical = isVertical(companyVerticalRaw) ? companyVerticalRaw : null;
      const employeeCount =
        typeof companyPayload?.numberOfEmployees === "number"
          ? companyPayload.numberOfEmployees
          : null;
      employeeCountBand = bucketEmployeeCount(employeeCount);
    }

    return {
      vertical: dealVertical ?? companyVertical,
      dealSizeBand,
      employeeCountBand,
      stageAtEvent,
      activeExperimentAssignments: [...activeExperimentAssignments],
    };
  }

  /**
   * Format the current MEDDPICC state for prompt interpolation. The canonical
   * `${meddpiccBlock}` source for prompts 01-detect-signals, 05-deal-fitness,
   * 07-give-back, and pipeline-score-meddpicc — they all document this method
   * as the builder (Phase 3 Day 3 Session A, per oversight adjudication).
   *
   * Reads `meddpicc_scores` directly via the injected sql client. Output is
   * byte-identical to the pre-Day-3 inline formatter in `handlers.ts` (Phase 3
   * Day 2 Session B) per the test-meddpicc-format.ts byte-identical gate.
   *
   * Why direct-sql (not delegated to MeddpiccService.getByDealId):
   *  - The existing `MeddpiccRecord.evidence` type is `Partial<Record<..., string>>`
   *    (plain strings), but production rows carry structured
   *    `{evidence_text, last_updated}` objects. Direct-sql keeps the formatter
   *    tolerant of both shapes without forcing a MeddpiccService type change
   *    that would ripple through Phase 2 UI callers unnecessarily.
   *  - Matches the existing DealIntelligence.buildEventContext pattern
   *    (also direct-sql against hubspot_cache, not delegated to CrmAdapter).
   *  - MeddpiccService stays focused on the table's transactional upsert
   *    (single-write-path per §2.10 / Guardrail 13); reads for intelligence
   *    formatting are DealIntelligence's job per Guardrail 25.
   */
  async formatMeddpiccForPrompt(hubspotDealId: string): Promise<string> {
    const rows = await this.sql<MeddpiccPromptRow[]>`
      SELECT metrics_score, economic_buyer_score, decision_criteria_score,
             decision_process_score, paper_process_score, identify_pain_score,
             champion_score, competition_score, overall_score,
             per_dimension_confidence, evidence
        FROM meddpicc_scores
       WHERE hubspot_deal_id = ${hubspotDealId}
       LIMIT 1
    `;
    return formatMeddpiccBlock(rows[0] ?? null);
  }

  async close(): Promise<void> {
    if (this.ownedSql) {
      await this.sql.end({ timeout: 5 });
    }
  }
}
