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
import { type DealStage, DEAL_STAGES } from "../enums/deal-stage";
import {
  MEDDPICC_DIMENSION,
  type MeddpiccDimension,
} from "../enums/meddpicc-dimension";
import { isSignalTaxonomy, type SignalTaxonomy } from "../enums/signal-taxonomy";
import { loadPipelineIds } from "../crm/hubspot/pipeline-ids";
import {
  applies,
  parseApplicabilityRule,
  type ApplicabilityRule,
  type DealState,
  type EvaluatorEvent,
} from "../applicability";
import type { CrmAdapter } from "../crm/adapter";

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
 * Locally-mirrored deal_event_type union — the canonical pgEnum lives in
 * packages/db/src/schema.ts:254, but @nexus/shared cannot depend on
 * @nexus/db (cycle). Day 4 keeps this mirror tight: only the events
 * `getRecentEvents` consumers actively filter on. If a future caller
 * needs more types in the filter, extend the union here AND keep it
 * grep-checkable against the schema's pgEnum for drift.
 */
export type DealEventType =
  | "stage_changed"
  | "meddpicc_scored"
  | "signal_detected"
  | "stakeholder_engagement_recorded"
  | "transcript_ingested"
  | "deal_theory_updated"
  | "risk_flag_raised"
  | "risk_flag_cleared"
  | "coordinated_intel_received"
  | "experiment_attributed"
  | "observation_linked"
  | "intervention_proposed"
  | "intervention_resolved"
  | "email_drafted"
  | "call_prep_generated"
  | "close_hypothesis_produced"
  | "close_reconciliation_recorded"
  | "agent_action_recorded"
  | "agent_config_change_proposed"
  | "agent_config_change_applied";

/**
 * Recent-event summary returned by `getRecentEvents`. Renders as one
 * line per event in 06a's `${recentEventsBlock}`:
 * `- [${type}, ${createdAt.toISOString()}] ${summary}`
 */
export interface RecentEventSummary {
  type: DealEventType;
  createdAt: Date;
  summary: string;
}

/**
 * Materialized deal-theory shape. 06a's tool schema defines the change
 * delta; this shape represents the cumulative theory state after folding
 * the deltas. Day 4's `getCurrentTheory` returns the latest single
 * `deal_theory_updated` event's payload as the (approximate) current
 * theory. Phase 4+ replaces with full event-stream replay producing the
 * cumulative state in `deal_snapshots`.
 *
 * All fields optional + nullable to mirror "first call has no prior
 * theory" semantics. Empty/null = no claims yet.
 */
export interface DealTheory {
  workingHypothesis: string | null;
  threats: ReadonlyArray<{
    description: string;
    severity: "low" | "medium" | "high" | "critical";
    trend: "new" | "escalating" | "steady" | "resolving";
    supportingEvidence: ReadonlyArray<string>;
  }>;
  tailwinds: ReadonlyArray<{
    description: string;
    trend: "new" | "strengthening" | "steady" | "weakening";
    supportingEvidence: ReadonlyArray<string>;
  }>;
  meddpiccTrajectory: ReadonlyArray<{
    dimension: string;
    currentConfidence: number;
    direction: "improving" | "steady" | "weakening";
  }>;
  stakeholderConfidence: ReadonlyArray<{
    contactName: string;
    engagementRead: "hot" | "warm" | "cold" | "departed";
    direction:
      | "strengthening"
      | "steady"
      | "weakening"
      | "newly_introduced"
      | "newly_silent";
  }>;
  openQuestions: ReadonlyArray<{
    question: string;
    whatWouldResolve: string;
  }>;
  /** ISO timestamp of the source event the theory was read from. */
  asOf: string | null;
}

/**
 * Coordinator-pattern row admitted by `getApplicablePatterns` — Phase 4
 * Day 1 Session B.
 *
 * Mirrors `coordinator_patterns` schema columns the admission engine +
 * scoring pass need. `score` and `reasoning` here are the DB-stored
 * coordinator synthesis fields (Phase 4 Day 2 writer); the Claude
 * importance score from `09-score-insight` is layered separately by
 * `SurfaceAdmission.admit`.
 *
 * `dealsAffectedCount` is the count from `coordinator_pattern_deals`
 * — the kickoff's `intelligence_dashboard_patterns` threshold reads
 * this value. For deal-specific surfaces the count is informational.
 */
export interface Pattern {
  id: string;
  patternKey: string;
  signalType: string;
  vertical: string | null;
  competitor: string | null;
  synthesis: string;
  recommendations: unknown;
  arrImpact: Record<string, unknown>;
  score: number | null;
  reasoning: string | null;
  applicability: ApplicabilityRule;
  status: "detected" | "synthesized" | "expired";
  detectedAt: Date;
  synthesizedAt: Date | null;
  dealsAffectedCount: number;
}

/**
 * Experiment row admitted by `getApplicableExperiments` — Phase 4
 * Day 1 Session B. Mirrors `experiments` schema columns the admission
 * engine consumes. The denormalized `vertical` column is the hot pre-
 * filter (`vertical IS NULL OR vertical = $dealVertical`); the
 * `applicability` JSONB further restricts via the evaluator.
 */
export interface Experiment {
  id: string;
  title: string;
  hypothesis: string;
  description: string | null;
  category: string;
  lifecycle: "proposed" | "active" | "graduated" | "killed";
  vertical: string | null;
  applicability: ApplicabilityRule;
  thresholds: Record<string, unknown>;
}

/**
 * Risk-flag event admitted by `getApplicableFlags` — Phase 4 Day 1
 * Session B. Risk flags are events of type `risk_flag_raised` whose
 * `source_ref` has no later `risk_flag_cleared` event with matching
 * `source_ref` — the "currently-raised" set computed from the event
 * stream, NOT a separate table.
 *
 * **Default applicability lock for Session B (kickoff Decision 4):**
 * payload may not carry an `applicability` field today (zero
 * `risk_flag_raised` events exist; Phase 5 Day 1's AgentIntervention
 * engine is the first writer). When absent, the rule defaults to `{}`
 * (the DSL's "undefined = no gate" semantic — passes any deal). The
 * productization contract (Decision 4 note) requires Phase 5 Day 1's
 * writer to populate per-flag applicability OR for `getApplicableFlags`
 * to enforce a global cross-cutting `minDaysSinceCreated >= 2` filter
 * to honor §1.18 first-48h-observation-only.
 */
export interface RiskFlag {
  id: string;
  hubspotDealId: string;
  sourceRef: string | null;
  payload: Record<string, unknown>;
  raisedAt: Date;
  applicability: ApplicabilityRule;
}

/**
 * Active manager-directive row admitted by `getActiveManagerDirectives` —
 * Phase 4 Day 4. Feeds the coordinator_synthesis prompt's
 * `${activeDirectivesBlock}` so synthesis honors leadership constraints
 * (discount caps, comp-plan boundaries, no-touch verticals).
 *
 * Schema column `priority` is the `priority` pgEnum
 * (`low | medium | high | urgent`); the canonical Postgres values do NOT
 * include `critical` — the priority CASE expression in the SQL orders
 * `urgent` highest.
 */
export interface ActiveManagerDirective {
  id: string;
  directiveText: string;
  priority: "low" | "medium" | "high" | "urgent";
  category: string | null;
  authorId: string;
  createdAt: Date;
}

/**
 * System-intelligence row admitted by `getSystemIntelligence` — Phase 4
 * Day 4. Feeds the coordinator_synthesis prompt's
 * `${systemIntelligenceBlock}` so synthesis can lean on vertical-level
 * insights (analyst reports, customer-success patterns, market context).
 *
 * Note: the schema's `system_intelligence` carries `insight_type text`,
 * NOT a `signal_taxonomy` column. The `getSystemIntelligence` opts accept
 * an optional `signalType` for forward-compat with the prompt's
 * Interpolation-Variables doc, but the helper does NOT filter on it
 * today. Phase 5+ schema extension or supporting_data filter is the
 * upgrade path.
 */
export interface SystemIntelligenceItem {
  id: string;
  title: string;
  insight: string;
  insightType: string;
  confidence: number | null;
  relevanceScore: number | null;
  vertical: Vertical | null;
}

/**
 * At-risk comparable-deal row admitted by `getAtRiskComparableDeals` —
 * Phase 4 Day 4. Feeds the coordinator_synthesis prompt's
 * `${atRiskDealsBlock}` so the prompt's "portfolio impact" calculation
 * grounds in real comparable deals.
 *
 * MVP heuristic per Phase 4 Day 4 kickoff Decision 3: same vertical +
 * active stage (excluding closed_won / closed_lost) + exclude the
 * directly-affected dealIds. No MEDDPICC-dimension-to-signal-type
 * mapping today; Phase 5+ adds an `atRiskByDimension` extension when
 * a real ontology project lands.
 */
export interface AtRiskDeal {
  hubspotDealId: string;
  dealName: string;
  stage: DealStage | null;
  amount: number | null;
  aeName: string | null;
  atRiskReason: string;
}

/**
 * Vertical-scoped experiment summary admitted by `getExperimentsForVertical`
 * — Phase 4 Day 4. The vertical-scoped variant of `getApplicableExperiments`
 * (which is per-deal). Feeds the coordinator_synthesis prompt's
 * `${relatedExperimentsBlock}` so synthesis avoids contradicting in-flight
 * tactics.
 *
 * Filter: `lifecycle IN ('active', 'graduated') AND (vertical IS NULL OR
 * vertical = $vertical)`. Reconciles the 04C handoff's
 * `status IN ('testing', 'graduated')` against the actual schema enum
 * `('proposed' | 'active' | 'graduated' | 'killed')` per Phase 4 Day 4
 * kickoff Decision 8(i).
 */
export interface VerticalExperimentSummary {
  id: string;
  title: string;
  hypothesis: string;
  description: string | null;
  lifecycle: "active" | "graduated";
  vertical: Vertical | null;
}

/**
 * Theory-update event payload — the persisted shape of one
 * `deal_theory_updated` event. Mirrors the change-set output of 06a's
 * `update_deal_theory` tool plus the operational metadata Day 4 attaches
 * (reasoning context, prompt version, etc.).
 */
export interface DealTheoryUpdatePayload {
  /** Change delta from 06a's tool output. */
  update: Record<string, unknown>;
  /** Source data-point that triggered the update. */
  dataPointType:
    | "transcript"
    | "email"
    | "observation"
    | "fitness_analysis"
    | "meddpicc_update";
  /** ID of the source data point (transcript_id, observation_id, etc.). */
  dataPointId: string;
  /** Pipeline / surface that emitted the update (job_id when from a job). */
  emittedBy?: string | null;
  /** Prompt version + stop reason from the Claude call. */
  promptVersion?: string;
  stopReason?: string;
}

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
/**
 * One-line stringifier for an event payload, used by `getRecentEvents` to
 * render `${recentEventsBlock}` lines in 06a's prompt. Per-type so each
 * type renders its load-bearing fields without dumping raw jsonb.
 *
 * Day 4 covers the event types likely to surface in the 14-day window of
 * a transcript-pipeline-driven theory update; future types extend the
 * switch. Unknown types fall through to a generic "(no summary)" — the
 * type itself + timestamp still convey the basic signal in the rendered
 * line.
 */
export function summarizeEventPayload(
  type: DealEventType,
  payload: unknown,
): string {
  if (typeof payload !== "object" || payload === null) return "(no summary)";
  const p = payload as Record<string, unknown>;
  switch (type) {
    case "transcript_ingested":
      return `transcript ingested (${(p.title as string | undefined) ?? "untitled"}, ${(p.textLength as number | undefined) ?? "?"} chars)`;
    case "signal_detected": {
      const signal = p.signal as Record<string, unknown> | undefined;
      const summary = signal?.summary as string | undefined;
      const signalType = signal?.signal_type as string | undefined;
      return signalType && summary ? `[${signalType}] ${summary}` : "signal detected";
    }
    case "meddpicc_scored":
      return `MEDDPICC scored — ${(p.scores_emitted as Array<unknown> | undefined)?.length ?? 0} dims emitted, overall=${(p.overall_score as number | null | undefined) ?? "n/a"}`;
    case "stage_changed":
      return `stage changed → ${(p.toStage as string | undefined) ?? "?"}`;
    case "stakeholder_engagement_recorded":
      return `stakeholder engagement: ${(p.contactName as string | undefined) ?? "?"} ${(p.engagementType as string | undefined) ?? ""}`;
    case "deal_theory_updated":
      return "deal theory updated";
    case "coordinated_intel_received":
      return `coordinator pattern: ${(p.synthesisHeadline as string | undefined) ?? "(no headline)"}`;
    case "email_drafted":
      return `email drafted: "${(p.subject as string | undefined) ?? "(no subject)"}"`;
    default:
      return "(no summary)";
  }
}

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
 * Lazy HubSpot stage-id → DealStage inverse map. Phase 4 Day 1 Session A
 * helper for getDealState's reading of `payload.properties.dealstage` from
 * hubspot_cache (the cache stores raw HubSpot shape per adapter.ts:1256;
 * `dealstage` is the HubSpot pipeline-stage internal ID like "3544580805").
 *
 * Inverts `loadPipelineIds().stageIds` (DealStage → ID) into ID → DealStage
 * for the read direction. Loaded lazily on first call + memoized for the
 * process lifetime.
 */
let stageIdToInternalCache: Map<string, DealStage> | null = null;
function stageIdToInternal(): Map<string, DealStage> {
  if (stageIdToInternalCache) return stageIdToInternalCache;
  const ids = loadPipelineIds();
  const m = new Map<string, DealStage>();
  for (const dealStage of DEAL_STAGES) {
    const hubspotId = ids.stageIds[dealStage];
    if (typeof hubspotId === "string" && hubspotId.length > 0) {
      m.set(hubspotId, dealStage);
    }
  }
  stageIdToInternalCache = m;
  return m;
}

/**
 * Parse a number from HubSpot's raw payload — values can be number, string,
 * or null/undefined depending on property type. Returns null on anything
 * that doesn't coerce cleanly.
 */
function parseHubspotNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
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
   * Migration 0006 (Phase 4 Day 1 Session A) flipped the column-level
   * `event_context` to NOT NULL; field-level nulls inside the jsonb are
   * legitimate ("no segmentation data available for this dimension")
   * rather than a bug.
   *
   * §2.16.1 decision 2 scope: `{vertical, deal_size_band,
   * employee_count_band, stage_at_event, active_experiment_assignments}`.
   */
  async buildEventContext(
    hubspotDealId: string,
    activeExperimentAssignments: readonly string[] = [],
  ): Promise<DealEventContext> {
    // Deal payload from hubspot_cache (primary store — §2.19 data boundary).
    // The cache stores the RAW HubSpot shape:
    // `{id, properties: {dealstage, nexus_vertical, amount, ...},
    //   associations: {companies: {results: [{id}]}, ...}}` per
    // adapter.ts:1256 (writeCache passes the raw payload through). Reads
    // `payload.properties.*` for normalized fields and resolves
    // `dealstage` (HubSpot internal ID) via the pipeline-ids inverse map.
    // Mirrors `getDealState`'s read pattern below — both methods read the
    // same cache shape, so they share the `stageIdToInternal()` +
    // `parseHubspotNumber()` helpers above.
    //
    // Phase 4 Day 1 Session A.5 fix: the prior implementation read
    // `dealPayload?.{stage,vertical,amount,companyId}` directly on the
    // top-level payload, which silently produced null fields inside the
    // event_context jsonb for every Phase 3-era event writer. Existing
    // rows backfilled via `apply-event-context-backfill.mts`.
    //
    // Productization arc (PRODUCTIZATION-NOTES.md "Historical analysis —
    // baseline + priming" Stage 3): a long-term accurate-at-event
    // backfill reads HubSpot's deal-property history API to reconstruct
    // segmentation at the original event time. Out of v2 demo scope; the
    // current-state-cache path is the demo-era stand-in.
    const dealRows = await this.sql<HubspotDealCacheRow[]>`
      SELECT payload FROM hubspot_cache
       WHERE object_type = 'deal' AND hubspot_id = ${hubspotDealId}
       LIMIT 1
    `;
    const dealPayload = dealRows[0]?.payload ?? null;
    const dealProps =
      (dealPayload?.properties as Record<string, unknown> | undefined) ?? null;

    // Stage: HubSpot stage ID → DealStage via pipeline-ids inverse map.
    const stageId =
      typeof dealProps?.dealstage === "string" ? dealProps.dealstage : null;
    const stageAtEvent: DealStage | null = stageId
      ? (stageIdToInternal().get(stageId) ?? null)
      : null;

    // Vertical: nexus_vertical custom property.
    const verticalRaw = dealProps?.nexus_vertical;
    const dealVertical: Vertical | null = isVertical(verticalRaw)
      ? verticalRaw
      : null;

    // Amount: numeric, may arrive as string from HubSpot's raw API.
    const amount = parseHubspotNumber(dealProps?.amount);
    const dealSizeBand = bucketDealSize(amount);

    // Company id: from `payload.associations.companies.results[0].id` in
    // the raw HubSpot shape, OR `payload.companyId` if a future mapper
    // normalizes it. Try both — the same fallback ladder `getDealState`
    // uses.
    const associations = dealPayload?.associations as
      | { companies?: { results?: Array<{ id?: unknown }> } }
      | undefined;
    const associatedCompanyId = associations?.companies?.results?.[0]?.id;
    const companyId =
      typeof associatedCompanyId === "string"
        ? associatedCompanyId
        : typeof dealPayload?.companyId === "string"
          ? dealPayload.companyId
          : null;

    let companyVertical: Vertical | null = null;
    let employeeCountBand: string | null = null;
    if (companyId) {
      const companyRows = await this.sql<CompanyCacheRow[]>`
        SELECT payload FROM hubspot_cache
         WHERE object_type = 'company' AND hubspot_id = ${companyId}
         LIMIT 1
      `;
      const companyPayload = companyRows[0]?.payload ?? null;
      const companyProps =
        (companyPayload?.properties as Record<string, unknown> | undefined) ??
        null;
      const companyVerticalRaw = companyProps?.nexus_vertical;
      companyVertical = isVertical(companyVerticalRaw) ? companyVerticalRaw : null;
      const employeeCount = parseHubspotNumber(companyProps?.numberofemployees);
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

  /**
   * Read the current deal theory state for prompt #14A's `${currentTheoryBlock}`.
   *
   * Day 4 MVP: returns the LATEST `deal_theory_updated` event's payload as
   * the (approximate) current theory. Phase 4+ replaces with full event-
   * stream replay producing the cumulative state in `deal_snapshots`.
   *
   * Returns null when no theory events exist yet — callers render this as
   * `(no prior theory — this is the first update for this deal)` per the
   * 06a .md spec.
   */
  async getCurrentTheory(hubspotDealId: string): Promise<DealTheory | null> {
    const rows = await this.sql<
      Array<{ payload: DealTheoryUpdatePayload | null; created_at: Date }>
    >`
      SELECT payload, created_at
        FROM deal_events
       WHERE hubspot_deal_id = ${hubspotDealId}
         AND type = 'deal_theory_updated'
       ORDER BY created_at DESC
       LIMIT 1
    `;
    const row = rows[0];
    if (!row || !row.payload) return null;

    const update = (row.payload.update ?? {}) as Record<string, unknown>;
    const wh = update.working_hypothesis as
      | { new_claim?: string }
      | null
      | undefined;

    // The persisted payload mirrors 06a's tool-schema snake_case keys; the
    // DealTheory shape uses camelCase. Transform here so consumers
    // (renderCurrentTheoryBlock, future close-hypothesis surfaces) read a
    // single shape regardless of persistence format.
    const threatsRaw = Array.isArray(update.threats_changed)
      ? (update.threats_changed as Array<Record<string, unknown>>)
      : [];
    const tailwindsRaw = Array.isArray(update.tailwinds_changed)
      ? (update.tailwinds_changed as Array<Record<string, unknown>>)
      : [];
    const trajectoryRaw = Array.isArray(update.meddpicc_trajectory_changed)
      ? (update.meddpicc_trajectory_changed as Array<Record<string, unknown>>)
      : [];
    const stakeholderRaw = Array.isArray(update.stakeholder_confidence_changed)
      ? (update.stakeholder_confidence_changed as Array<Record<string, unknown>>)
      : [];
    const openQuestionsRaw = Array.isArray(update.open_questions_changed)
      ? (update.open_questions_changed as Array<Record<string, unknown>>)
      : [];

    return {
      workingHypothesis: typeof wh?.new_claim === "string" ? wh.new_claim : null,
      threats: threatsRaw.map((t) => ({
        description: String(t.description ?? ""),
        severity: t.severity as DealTheory["threats"][number]["severity"],
        trend: t.trend as DealTheory["threats"][number]["trend"],
        supportingEvidence: Array.isArray(t.supporting_evidence)
          ? (t.supporting_evidence as string[])
          : [],
      })),
      tailwinds: tailwindsRaw.map((t) => ({
        description: String(t.description ?? ""),
        trend: t.trend as DealTheory["tailwinds"][number]["trend"],
        supportingEvidence: Array.isArray(t.supporting_evidence)
          ? (t.supporting_evidence as string[])
          : [],
      })),
      meddpiccTrajectory: trajectoryRaw.map((m) => ({
        dimension: String(m.dimension ?? ""),
        currentConfidence:
          typeof m.current_confidence === "number" ? m.current_confidence : 0,
        direction: m.direction as DealTheory["meddpiccTrajectory"][number]["direction"],
      })),
      stakeholderConfidence: stakeholderRaw.map((s) => ({
        contactName: String(s.contact_name ?? ""),
        engagementRead:
          s.engagement_read as DealTheory["stakeholderConfidence"][number]["engagementRead"],
        direction:
          s.direction as DealTheory["stakeholderConfidence"][number]["direction"],
      })),
      openQuestions: openQuestionsRaw.map((q) => ({
        question: String(q.question ?? ""),
        whatWouldResolve: String(q.what_would_resolve ?? ""),
      })),
      asOf:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
    };
  }

  /**
   * Read recent events for a deal — used by 06a's `${recentEventsBlock}` to
   * give the theory updater 14 days of context. Caller controls the
   * window + limit + optional type filter.
   */
  async getRecentEvents(
    hubspotDealId: string,
    opts: {
      sinceDays?: number;
      limit?: number;
      types?: readonly DealEventType[];
    } = {},
  ): Promise<readonly RecentEventSummary[]> {
    const sinceDays = opts.sinceDays ?? 14;
    const limit = opts.limit ?? 15;
    const typeFilter = opts.types && opts.types.length > 0 ? opts.types : null;

    const rows = await this.sql<
      Array<{ type: DealEventType; created_at: Date; payload: unknown }>
    >`
      SELECT type, created_at, payload
        FROM deal_events
       WHERE hubspot_deal_id = ${hubspotDealId}
         AND created_at >= NOW() - MAKE_INTERVAL(days => ${sinceDays})
         ${typeFilter ? this.sql`AND type IN ${this.sql(typeFilter)}` : this.sql``}
       ORDER BY created_at DESC
       LIMIT ${limit}
    `;

    return rows.map((r) => ({
      type: r.type,
      createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
      summary: summarizeEventPayload(r.type, r.payload),
    }));
  }

  /**
   * Append a `deal_theory_updated` event from prompt #14A's output. Day 4
   * Session B's pipeline step 6 calls this after `callClaude<UpdateDealTheoryOutput>`.
   *
   * `event_context` is caller-supplied (built via `buildEventContext`) so
   * Phase 3-era writers stay consistent. `source_ref` enables idempotency
   * — the pipeline uses `${transcriptId}:theory:${jobId}` so each pipeline
   * invocation appends one event per the §2.16 append-only discipline.
   */
  async appendTheoryUpdate(
    hubspotDealId: string,
    payload: DealTheoryUpdatePayload,
    opts: { eventContext: DealEventContext; sourceRef: string },
  ): Promise<void> {
    await this.sql`
      INSERT INTO deal_events (
        hubspot_deal_id, type, payload, event_context, source_kind, source_ref
      ) VALUES (
        ${hubspotDealId},
        'deal_theory_updated',
        ${this.sql.json(payload as unknown as Parameters<typeof this.sql.json>[0])},
        ${this.sql.json(opts.eventContext as unknown as Parameters<typeof this.sql.json>[0])},
        'prompt',
        ${opts.sourceRef}
      )
    `;
  }

  /**
   * Materialize the cumulative deal theory into `deal_snapshots`.
   *
   * Day 4: NO-OP STUB. Phase 4+ implements the event-stream replay (read
   * all `deal_theory_updated` events for the deal, fold into a single
   * cumulative `DealTheory`, upsert `deal_snapshots`). Pipeline step 6
   * calls this method so the call site is in place; today the call is a
   * no-op so writes don't happen, reads use the latest-event approximation
   * via `getCurrentTheory`.
   *
   * The deferred materialization matches Day 2/3's pattern: write events
   * now, materialize/read later when needed (first reader is Phase 5
   * Day 1's close-analysis-final + close-hypothesis surfaces, possibly
   * earlier if Phase 4 Day 2's coordinator queries the snapshot directly).
   */
  async refreshSnapshot(hubspotDealId: string): Promise<void> {
    void hubspotDealId;
  }

  /**
   * Read the deal's current `DealState` projection — the data structure
   * the applicability evaluator + admission engine read per Phase 4 Day 1
   * Session A (DECISIONS.md §2.21 + Foundation-review C2). CRM-agnostic
   * shape; SalesforceAdapter's `getDealState` lands as a parallel
   * implementation in productization Stage 3.
   *
   * Sources:
   *   - `hubspot_cache` (deal): vertical, stage, amount, createdAt, companyId.
   *   - `hubspot_cache` (company via dealPayload.companyId):
   *     numberOfEmployees, vertical-fallback.
   *   - `meddpicc_scores`: per-dim scores (Partial<Record<dim, number>>).
   *   - `deal_events` filtered to `signal_detected`: openSignals.
   *   - `deal_events` filtered to `stage_changed` (latest): daysInStage
   *     anchor. Falls back to `daysSinceCreated` if no stage_changed
   *     event exists; emits `dealstate_stage_fallback` stderr telemetry
   *     when the fallback fires (surfaces Phase 1-era writer gaps
   *     operationally per Phase 4 Day 1 Session A kickoff addition —
   *     deals that moved stages without a stage_changed event written
   *     would silently mask under daysSinceCreated; visibility lets
   *     Phase 5+ free-diagnose).
   *   - `experiment_assignments`: empty array for Day 1 (no assignment
   *     read yet; Phase 5+ wires the experiment lifecycle UI which is
   *     the first writer; Phase 4 Day 1 Session B's admission engine
   *     reads this slot when it consumes activeExperimentAssignments).
   */
  async getDealState(hubspotDealId: string): Promise<DealState> {
    // Deal cache. The cache stores the RAW HubSpot payload shape:
    // `{id, properties: {dealstage, nexus_vertical, amount, createdate, ...},
    //   associations: {companies: {results: [{id}]}, ...}}` per adapter.ts:1256.
    // getDealState reads `payload.properties.*` for normalized fields,
    // resolves `dealstage` (HubSpot internal ID) via the pipeline-ids
    // inverse map.
    const dealRows = await this.sql<HubspotDealCacheRow[]>`
      SELECT payload FROM hubspot_cache
       WHERE object_type = 'deal' AND hubspot_id = ${hubspotDealId}
       LIMIT 1
    `;
    const dealPayload = dealRows[0]?.payload ?? null;
    const dealProps =
      (dealPayload?.properties as Record<string, unknown> | undefined) ?? null;

    // Stage: HubSpot stage ID → DealStage via pipeline-ids inverse map.
    const stageId =
      typeof dealProps?.dealstage === "string" ? dealProps.dealstage : null;
    const stage: DealStage | null = stageId
      ? (stageIdToInternal().get(stageId) ?? null)
      : null;

    // Vertical: nexus_vertical custom property.
    const verticalRaw = dealProps?.nexus_vertical;
    const dealVertical: Vertical | null = isVertical(verticalRaw)
      ? verticalRaw
      : null;

    // Amount: numeric, may arrive as string from HubSpot's raw API.
    const amount = parseHubspotNumber(dealProps?.amount);
    const dealSizeBand = bucketDealSize(amount);

    // createdAt: HubSpot's raw `createdate` property OR top-level `createdAt`
    // (mappers may normalize). Try both.
    const createdAtRaw =
      (typeof dealProps?.createdate === "string" ? dealProps.createdate : null) ??
      (typeof dealPayload?.createdAt === "string" ? dealPayload.createdAt : null);
    const createdAt = createdAtRaw ? new Date(createdAtRaw) : null;

    // Company id: from `payload.associations.companies.results[0].id` in the
    // raw HubSpot shape, OR `payload.companyId` if the mapper has normalized
    // it. Try both.
    const associations = dealPayload?.associations as
      | { companies?: { results?: Array<{ id?: unknown }> } }
      | undefined;
    const associatedCompanyId = associations?.companies?.results?.[0]?.id;
    const companyId =
      typeof associatedCompanyId === "string"
        ? associatedCompanyId
        : typeof dealPayload?.companyId === "string"
          ? dealPayload.companyId
          : null;

    let companyVertical: Vertical | null = null;
    let employeeCountBand: string | null = null;
    if (companyId) {
      const companyRows = await this.sql<CompanyCacheRow[]>`
        SELECT payload FROM hubspot_cache
         WHERE object_type = 'company' AND hubspot_id = ${companyId}
         LIMIT 1
      `;
      const companyPayload = companyRows[0]?.payload ?? null;
      const companyProps =
        (companyPayload?.properties as Record<string, unknown> | undefined) ??
        null;
      const companyVerticalRaw = companyProps?.nexus_vertical;
      companyVertical = isVertical(companyVerticalRaw) ? companyVerticalRaw : null;
      const employeeCount = parseHubspotNumber(companyProps?.numberofemployees);
      employeeCountBand = bucketEmployeeCount(employeeCount);
    }

    const vertical = dealVertical ?? companyVertical;

    // MEDDPICC scores: Partial<Record<dim, number>>; null/undefined dims
    // omitted from the map.
    const meddpiccRows = await this.sql<MeddpiccPromptRow[]>`
      SELECT metrics_score, economic_buyer_score, decision_criteria_score,
             decision_process_score, paper_process_score, identify_pain_score,
             champion_score, competition_score, overall_score,
             per_dimension_confidence, evidence
        FROM meddpicc_scores
       WHERE hubspot_deal_id = ${hubspotDealId}
       LIMIT 1
    `;
    const meddpiccRow = meddpiccRows[0];
    const meddpiccScores: Partial<Record<MeddpiccDimension, number>> = {};
    if (meddpiccRow) {
      for (const dim of MEDDPICC_DIMENSION) {
        const score = meddpiccRow[`${dim}_score` as keyof MeddpiccPromptRow] as
          | number
          | null
          | undefined;
        if (typeof score === "number") {
          meddpiccScores[dim] = score;
        }
      }
    }

    // Open signals — Day 1 = all signal_detected events for the deal.
    // Phase 4+ may refine via signal_resolved event type.
    const signalRows = await this.sql<
      Array<{ payload: unknown; source_ref: string | null; created_at: Date }>
    >`
      SELECT payload, source_ref, created_at
        FROM deal_events
       WHERE hubspot_deal_id = ${hubspotDealId}
         AND type = 'signal_detected'
       ORDER BY created_at DESC
    `;
    const openSignals = signalRows
      .map((r) => {
        const payload = (typeof r.payload === "object" && r.payload !== null
          ? r.payload
          : {}) as Record<string, unknown>;
        const signal = payload.signal as Record<string, unknown> | undefined;
        const signalTypeRaw = signal?.signal_type;
        if (!isSignalTaxonomy(signalTypeRaw)) return null;
        return {
          signalType: signalTypeRaw as SignalTaxonomy,
          detectedAt:
            r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
          sourceRef: r.source_ref ?? "",
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    // daysInStage — anchor on latest stage_changed event for the deal.
    // Fallback to daysSinceCreated when no stage_changed event exists,
    // emitting structured stderr telemetry so the gap is observable.
    const stageChangedRows = await this.sql<Array<{ created_at: Date }>>`
      SELECT created_at
        FROM deal_events
       WHERE hubspot_deal_id = ${hubspotDealId}
         AND type = 'stage_changed'
       ORDER BY created_at DESC
       LIMIT 1
    `;
    const now = new Date();
    const daysSinceCreated = createdAt
      ? Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000))
      : 0;

    let daysInStage: number;
    if (stageChangedRows.length > 0 && stageChangedRows[0]) {
      const stageChangedAt =
        stageChangedRows[0].created_at instanceof Date
          ? stageChangedRows[0].created_at
          : new Date(stageChangedRows[0].created_at);
      daysInStage = Math.max(
        0,
        Math.floor((now.getTime() - stageChangedAt.getTime()) / 86_400_000),
      );
    } else {
      daysInStage = daysSinceCreated;
      // Telemetry per Phase 4 Day 1 Session A kickoff addition: surface the
      // fallback so Phase 5+ has free diagnostics on Phase 1-era writer gaps.
      // Matches existing claude_call + worker_circuit_break stderr JSON
      // pattern (§2.13.1 telemetry-as-early-warning).
      console.error(
        JSON.stringify({
          event: "dealstate_stage_fallback",
          reason: "no_stage_changed_event",
          hubspotDealId,
          stage,
          daysSinceCreated,
          ts: new Date().toISOString(),
        }),
      );
    }

    // closeStatus derivation.
    const closeStatus: DealState["closeStatus"] =
      stage === "closed_won"
        ? "closed_won"
        : stage === "closed_lost"
          ? "closed_lost"
          : "not_closed";

    // activeExperimentAssignments — Day 1 returns []. Phase 5+ wires the
    // experiment lifecycle UI; until then there are no assignments to read.
    const activeExperimentAssignments: ReadonlyArray<string> = [];

    return {
      hubspotDealId,
      vertical,
      stage,
      amount,
      dealSizeBand,
      employeeCountBand,
      daysInStage,
      daysSinceCreated,
      closeStatus,
      meddpiccScores,
      openSignals,
      activeExperimentAssignments,
    };
  }

  /**
   * Build the EvaluatorEvent slice the applicability evaluator needs
   * for `signalTypePresent` / `signalTypeAbsent` clauses, sourced from
   * the deal's currently-open `signal_detected` events (already on
   * DealState.openSignals — no extra DB read).
   */
  private buildEventStreamFromDealState(
    state: DealState,
  ): readonly EvaluatorEvent[] {
    return state.openSignals.map((s) => ({
      type: "signal_detected" as const,
      signalType: s.signalType,
      createdAt: s.detectedAt,
    }));
  }

  /**
   * Batch-write rejection rows for one applicability pass. Per Phase 4
   * Day 1 Session B kickoff Decision 3 step 3: writes happen AFTER the
   * loop in a single INSERT — never inside `applies()` and never with
   * `sql.begin()` wrapping the loop (the operational-vigilance note at
   * the top of the kickoff: don't open a transaction that holds the
   * only client while calling a method that needs its own connection).
   *
   * `surfaceId` is optional — null when called outside a surface
   * context (e.g., direct unit-test invocation). Phase 5+ admin tuning
   * UI reads this column to surface "rule X rejected N% of deals on
   * surface Y."
   */
  private async writeApplicabilityRejections(
    rejections: ReadonlyArray<{
      ruleId: string;
      ruleDescription: string | null;
      hubspotDealId: string;
      reasons: readonly string[];
      dealStateSnapshot: DealState;
    }>,
    surfaceId: string | null,
  ): Promise<void> {
    if (rejections.length === 0) return;
    const sql = this.sql;
    const rows = rejections.map((r) => ({
      rule_id: r.ruleId,
      rule_description: r.ruleDescription,
      surface_id: surfaceId,
      hubspot_deal_id: r.hubspotDealId,
      reasons: sql.json(r.reasons as unknown as Parameters<typeof sql.json>[0]),
      deal_state_snapshot: sql.json(
        r.dealStateSnapshot as unknown as Parameters<typeof sql.json>[0],
      ),
    }));
    await sql`
      INSERT INTO applicability_rejections ${sql(
        rows,
        "rule_id",
        "rule_description",
        "surface_id",
        "hubspot_deal_id",
        "reasons",
        "deal_state_snapshot",
      )}
    `;
  }

  /**
   * Read coordinator patterns linked to this deal that pass the
   * applicability gate — Phase 4 Day 1 Session B (DECISIONS.md §2.21
   * three gates + Guardrail 32 structured-JSONB rules).
   *
   * Status filter: `status IN ('detected', 'synthesized')`. The third
   * enum value `expired` is excluded — expired patterns are diagnostic
   * audit only, not surface candidates. Captured in the Reasoning stub
   * as a Decision 3-class admissibility call (start conservative;
   * extend if Phase 4 Day 2 surfaces a different lifecycle expectation).
   *
   * Rule-side parse failures (Zod) surface as `rule_invalid: <issue>`
   * rejection reasons rather than crashing the read pass per Decision 4.
   */
  async getApplicablePatterns(
    hubspotDealId: string,
    opts: { surfaceId?: string } = {},
  ): Promise<readonly Pattern[]> {
    const dealState = await this.getDealState(hubspotDealId);
    const eventStream = this.buildEventStreamFromDealState(dealState);

    const rows = await this.sql<
      Array<{
        id: string;
        pattern_key: string;
        signal_type: string;
        vertical: string | null;
        competitor: string | null;
        synthesis: string;
        recommendations: unknown;
        arr_impact: Record<string, unknown> | null;
        score: string | null;
        reasoning: string | null;
        applicability: unknown;
        status: "detected" | "synthesized" | "expired";
        detected_at: Date;
        synthesized_at: Date | null;
        deals_affected_count: number;
      }>
    >`
      SELECT p.id, p.pattern_key, p.signal_type, p.vertical, p.competitor,
             p.synthesis, p.recommendations, p.arr_impact, p.score,
             p.reasoning, p.applicability, p.status, p.detected_at,
             p.synthesized_at,
             (SELECT COUNT(*)::int FROM coordinator_pattern_deals
               WHERE pattern_id = p.id) AS deals_affected_count
        FROM coordinator_patterns p
        JOIN coordinator_pattern_deals cpd ON cpd.pattern_id = p.id
       WHERE cpd.hubspot_deal_id = ${hubspotDealId}
         AND p.status IN ('detected', 'synthesized')
       ORDER BY p.detected_at DESC
    `;

    const passes: Pattern[] = [];
    const rejections: Array<{
      ruleId: string;
      ruleDescription: string | null;
      hubspotDealId: string;
      reasons: string[];
      dealStateSnapshot: DealState;
    }> = [];

    for (const row of rows) {
      let rule: ApplicabilityRule;
      try {
        rule = parseApplicabilityRule(row.applicability ?? {});
      } catch (err) {
        const issue = err instanceof Error ? err.message : String(err);
        rejections.push({
          ruleId: row.id,
          ruleDescription: null,
          hubspotDealId,
          reasons: [`rule_invalid: ${issue}`],
          dealStateSnapshot: dealState,
        });
        continue;
      }
      const result = applies({ rule, dealState, eventStream });
      if (result.pass) {
        passes.push({
          id: row.id,
          patternKey: row.pattern_key,
          signalType: row.signal_type,
          vertical: row.vertical,
          competitor: row.competitor,
          synthesis: row.synthesis,
          recommendations: row.recommendations,
          arrImpact: row.arr_impact ?? {},
          score: row.score === null ? null : Number(row.score),
          reasoning: row.reasoning,
          applicability: rule,
          status: row.status,
          detectedAt:
            row.detected_at instanceof Date
              ? row.detected_at
              : new Date(row.detected_at),
          synthesizedAt: row.synthesized_at
            ? row.synthesized_at instanceof Date
              ? row.synthesized_at
              : new Date(row.synthesized_at)
            : null,
          dealsAffectedCount: row.deals_affected_count,
        });
      } else {
        rejections.push({
          ruleId: row.id,
          ruleDescription: rule.description ?? null,
          hubspotDealId,
          reasons: result.reasons,
          dealStateSnapshot: dealState,
        });
      }
    }

    await this.writeApplicabilityRejections(rejections, opts.surfaceId ?? null);

    return passes;
  }

  /**
   * Read active experiments potentially applicable to this deal that
   * pass the applicability gate — Phase 4 Day 1 Session B.
   *
   * SQL pre-filter: `lifecycle = 'active' AND (vertical IS NULL OR
   * vertical = $dealVertical)` — uses the denormalized
   * `experiments.vertical` column (cheap btree index lookup) before
   * loading the JSONB rule. The applies() pass then enforces any
   * additional clauses on the structured rule (multi-vertical
   * experiments live in `applicability.verticals[]` rather than the
   * column).
   *
   * Deals with null vertical: still match `vertical IS NULL`
   * experiments (cross-vertical) but the column comparison `vertical
   * = NULL` returns null/false, so vertical-specific experiments
   * don't match. Acceptable v2 demo behavior — production deals carry
   * a vertical via the Phase 1 Day 5 seed + nexus_vertical property.
   */
  async getApplicableExperiments(
    hubspotDealId: string,
    opts: { surfaceId?: string } = {},
  ): Promise<readonly Experiment[]> {
    const dealState = await this.getDealState(hubspotDealId);
    const eventStream = this.buildEventStreamFromDealState(dealState);

    const rows = await this.sql<
      Array<{
        id: string;
        title: string;
        hypothesis: string;
        description: string | null;
        category: string;
        lifecycle: "proposed" | "active" | "graduated" | "killed";
        vertical: string | null;
        applicability: unknown;
        thresholds: Record<string, unknown> | null;
      }>
    >`
      SELECT id, title, hypothesis, description, category, lifecycle,
             vertical, applicability, thresholds
        FROM experiments
       WHERE lifecycle = 'active'
         AND (vertical IS NULL OR vertical = ${dealState.vertical})
       ORDER BY created_at DESC
    `;

    const passes: Experiment[] = [];
    const rejections: Array<{
      ruleId: string;
      ruleDescription: string | null;
      hubspotDealId: string;
      reasons: string[];
      dealStateSnapshot: DealState;
    }> = [];

    for (const row of rows) {
      let rule: ApplicabilityRule;
      try {
        rule = parseApplicabilityRule(row.applicability ?? {});
      } catch (err) {
        const issue = err instanceof Error ? err.message : String(err);
        rejections.push({
          ruleId: row.id,
          ruleDescription: null,
          hubspotDealId,
          reasons: [`rule_invalid: ${issue}`],
          dealStateSnapshot: dealState,
        });
        continue;
      }
      const result = applies({ rule, dealState, eventStream });
      if (result.pass) {
        passes.push({
          id: row.id,
          title: row.title,
          hypothesis: row.hypothesis,
          description: row.description,
          category: row.category,
          lifecycle: row.lifecycle,
          vertical: row.vertical,
          applicability: rule,
          thresholds: row.thresholds ?? {},
        });
      } else {
        rejections.push({
          ruleId: row.id,
          ruleDescription: rule.description ?? null,
          hubspotDealId,
          reasons: result.reasons,
          dealStateSnapshot: dealState,
        });
      }
    }

    await this.writeApplicabilityRejections(rejections, opts.surfaceId ?? null);

    return passes;
  }

  /**
   * Read the deal's currently-raised risk flags that pass the
   * applicability gate — Phase 4 Day 1 Session B.
   *
   * Risk flags are NOT a separate table — they're `deal_events` of
   * type `risk_flag_raised` whose `source_ref` has no later
   * `risk_flag_cleared` event with matching `source_ref`. Computed
   * via NOT EXISTS subquery on the same hubspot_deal_id.
   *
   * **Empty-default applicability lock for Session B (kickoff
   * Decision 4):** today zero `risk_flag_raised` events exist
   * (Preflight 12 verified). The first writer is Phase 5 Day 1's
   * AgentIntervention engine; until then, payload may not carry an
   * `applicability` field. When absent the rule defaults to `{}` —
   * the DSL's "undefined = no gate" semantic. Phase 5 Day 1 kickoff
   * decides whether the writer populates per-flag applicability or
   * `getApplicableFlags` enforces a global cross-cutting filter for
   * §1.18's first-48h-observation-only rule.
   */
  async getApplicableFlags(
    hubspotDealId: string,
    opts: { surfaceId?: string } = {},
  ): Promise<readonly RiskFlag[]> {
    const dealState = await this.getDealState(hubspotDealId);
    const eventStream = this.buildEventStreamFromDealState(dealState);

    const rows = await this.sql<
      Array<{
        id: string;
        hubspot_deal_id: string;
        source_ref: string | null;
        payload: Record<string, unknown>;
        created_at: Date;
      }>
    >`
      SELECT e.id, e.hubspot_deal_id, e.source_ref, e.payload, e.created_at
        FROM deal_events e
       WHERE e.hubspot_deal_id = ${hubspotDealId}
         AND e.type = 'risk_flag_raised'
         AND NOT EXISTS (
           SELECT 1 FROM deal_events e2
            WHERE e2.hubspot_deal_id = e.hubspot_deal_id
              AND e2.type = 'risk_flag_cleared'
              AND e2.source_ref IS NOT DISTINCT FROM e.source_ref
              AND e2.created_at > e.created_at
         )
       ORDER BY e.created_at DESC
    `;

    const passes: RiskFlag[] = [];
    const rejections: Array<{
      ruleId: string;
      ruleDescription: string | null;
      hubspotDealId: string;
      reasons: string[];
      dealStateSnapshot: DealState;
    }> = [];

    for (const row of rows) {
      const rawApplicability =
        (row.payload as Record<string, unknown> | null)?.applicability ?? {};
      let rule: ApplicabilityRule;
      try {
        rule = parseApplicabilityRule(rawApplicability);
      } catch (err) {
        const issue = err instanceof Error ? err.message : String(err);
        rejections.push({
          ruleId: row.id,
          ruleDescription: null,
          hubspotDealId,
          reasons: [`rule_invalid: ${issue}`],
          dealStateSnapshot: dealState,
        });
        continue;
      }
      const result = applies({ rule, dealState, eventStream });
      if (result.pass) {
        passes.push({
          id: row.id,
          hubspotDealId: row.hubspot_deal_id,
          sourceRef: row.source_ref,
          payload: row.payload ?? {},
          raisedAt:
            row.created_at instanceof Date
              ? row.created_at
              : new Date(row.created_at),
          applicability: rule,
        });
      } else {
        rejections.push({
          ruleId: row.id,
          ruleDescription: rule.description ?? null,
          hubspotDealId,
          reasons: result.reasons,
          dealStateSnapshot: dealState,
        });
      }
    }

    await this.writeApplicabilityRejections(rejections, opts.surfaceId ?? null);

    return passes;
  }

  /**
   * Read active manager directives (vertical-scoped or org-wide) for the
   * coordinator_synthesis prompt's `${activeDirectivesBlock}` — Phase 4
   * Day 4.
   *
   * Filter: `is_active = true AND (scope->>'vertical' IS NULL OR
   * scope->>'vertical' = $vertical)`. The schema stores directive scope
   * as JSONB (per §2.21 + Guardrail 32 structured-JSONB rules); this
   * helper reads the `vertical` key from the JSONB rather than a typed
   * column. Org-wide directives (scope.vertical IS NULL) match every
   * vertical.
   *
   * Order: explicit CASE on `priority` rather than enum-ordinal sort.
   * The pgEnum value set is `('low' | 'medium' | 'high' | 'urgent')`;
   * the CASE expression orders `urgent` highest and is robust to
   * future enum reorder + self-documents the precedence.
   *
   * Empty render: callers render `(no active directives)` per the
   * 04-coordinator-synthesis prompt's documented empty-block fallback
   * (§1.18 silence-as-feature).
   */
  async getActiveManagerDirectives(opts: {
    vertical?: Vertical | null;
    limit?: number;
  } = {}): Promise<readonly ActiveManagerDirective[]> {
    const vertical = opts.vertical ?? null;
    const limit = opts.limit ?? 10;
    const rows = await this.sql<
      Array<{
        id: string;
        directive_text: string;
        priority: "low" | "medium" | "high" | "urgent";
        category: string | null;
        author_id: string;
        created_at: Date;
      }>
    >`
      SELECT id, directive_text, priority, category, author_id, created_at
        FROM manager_directives
       WHERE is_active = true
         AND (
           ${vertical}::text IS NULL
           OR scope->>'vertical' IS NULL
           OR scope->>'vertical' = ${vertical}::text
         )
       ORDER BY
         CASE priority
           WHEN 'urgent' THEN 4
           WHEN 'high'   THEN 3
           WHEN 'medium' THEN 2
           WHEN 'low'    THEN 1
           ELSE 0
         END DESC,
         created_at DESC
       LIMIT ${limit}
    `;
    return rows.map((r) => ({
      id: r.id,
      directiveText: r.directive_text,
      priority: r.priority,
      category: r.category,
      authorId: r.author_id,
      createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
    }));
  }

  /**
   * Read active system-intelligence rows for the coordinator_synthesis
   * prompt's `${systemIntelligenceBlock}` — Phase 4 Day 4.
   *
   * Filter: `status = 'active' AND (vertical IS NULL OR vertical =
   * $vertical)`. Cross-vertical rows (vertical IS NULL) match every
   * vertical.
   *
   * Order: `relevance_score DESC NULLS LAST, created_at DESC`. The
   * relevance_score column is decimal(5,2) populated by Phase 5+
   * content writers; null sorts last so unscored rows surface only
   * when no scored alternatives exist.
   *
   * The `signalType?` parameter is accepted for forward-compat with
   * the 04-coordinator-synthesis prompt's Interpolation-Variables doc
   * but does NOT filter today (the schema's
   * `system_intelligence.insight_type text` is not a signal_taxonomy
   * column; Phase 5+ either adds a `signal_taxonomy` column or filters
   * on `supporting_data->>'related_signal_types'`). Captured in the
   * Phase 4 Day 4 Reasoning stub as a Type 1 handoff-doc reconciliation
   * note.
   *
   * Empty render: callers render `(none)` per the prompt's documented
   * empty-block fallback (§1.18).
   */
  async getSystemIntelligence(opts: {
    vertical?: Vertical | null;
    /** Forward-compat: accepted but unused per Phase 4 Day 4 Decision 8(iii). */
    signalType?: SignalTaxonomy;
    limit?: number;
  } = {}): Promise<readonly SystemIntelligenceItem[]> {
    void opts.signalType; // forward-compat; see JSDoc.
    const vertical = opts.vertical ?? null;
    const limit = opts.limit ?? 5;
    const rows = await this.sql<
      Array<{
        id: string;
        title: string;
        insight: string;
        insight_type: string;
        confidence: string | null;
        relevance_score: string | null;
        vertical: Vertical | null;
      }>
    >`
      SELECT id, title, insight, insight_type, confidence, relevance_score, vertical
        FROM system_intelligence
       WHERE status = 'active'
         AND (${vertical}::vertical IS NULL OR vertical IS NULL OR vertical = ${vertical}::vertical)
       ORDER BY relevance_score DESC NULLS LAST, created_at DESC
       LIMIT ${limit}
    `;
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      insight: r.insight,
      insightType: r.insight_type,
      confidence: r.confidence === null ? null : Number(r.confidence),
      relevanceScore: r.relevance_score === null ? null : Number(r.relevance_score),
      vertical: r.vertical,
    }));
  }

  /**
   * Read at-risk comparable deals through the CrmAdapter for the
   * coordinator_synthesis prompt's `${atRiskDealsBlock}` — Phase 4
   * Day 4.
   *
   * MVP heuristic per Phase 4 Day 4 kickoff Decision 3: same vertical +
   * active stage (excludes closed_won / closed_lost) + exclude the
   * directly-affected `excludeDealIds`. No MEDDPICC-dimension-to-
   * signal-type ontology today (real ontology project; Phase 5+).
   *
   * §2.18 boundary: this helper goes through `Pick<CrmAdapter,
   * "listDeals">` rather than reading hubspot_cache directly because
   * the output is CRM-shaped Deal data the adapter is the
   * deserialization seam for. Stage 3 SalesforceAdapter implements the
   * same interface so the helper carries forward without rewrite.
   *
   * Empty render: callers render `(no comparable at-risk deals
   * identified)` per the prompt's documented empty-block fallback.
   */
  async getAtRiskComparableDeals(opts: {
    vertical: Vertical;
    signalType: SignalTaxonomy;
    excludeDealIds: readonly string[];
    adapter: Pick<CrmAdapter, "listDeals">;
    limit?: number;
  }): Promise<readonly AtRiskDeal[]> {
    const limit = opts.limit ?? 10;
    const excludeSet = new Set(opts.excludeDealIds);

    // CrmAdapter.listDeals supports a vertical filter natively (adapter
    // interface line 71 in `crm/adapter.ts`); productization-arc Stage 3
    // SalesforceAdapter implements the same signature.
    const deals = await opts.adapter.listDeals({ vertical: opts.vertical });

    const atRisk: AtRiskDeal[] = [];
    for (const deal of deals) {
      if (excludeSet.has(deal.hubspotId)) continue;
      const stage = deal.stage;
      if (stage === "closed_won" || stage === "closed_lost") continue;

      // Derived sentence — references the signal type so the prompt's
      // narrative grounding has something to attach to.
      const atRiskReason = `Same vertical (${opts.vertical}); active in stage ${stage ?? "unknown"}; could face the same ${opts.signalType} mechanism.`;

      atRisk.push({
        hubspotDealId: deal.hubspotId,
        dealName: deal.name,
        stage: stage ?? null,
        amount: typeof deal.amount === "number" ? deal.amount : null,
        // Deal carries `ownerId` (HubSpotId); the AE NAME requires a
        // separate owner lookup that's not on the CrmAdapter
        // interface today. Surface the id when present so the prompt
        // has a stable reference even when the name isn't enriched
        // — Stage 3+ promotes this to a real owner-name lookup.
        aeName: deal.ownerId ?? null,
        atRiskReason,
      });

      if (atRisk.length >= limit) break;
    }

    return atRisk;
  }

  /**
   * Read active+graduated experiments scoped to a vertical for the
   * coordinator_synthesis prompt's `${relatedExperimentsBlock}` —
   * Phase 4 Day 4.
   *
   * Vertical-scoped variant of the per-deal `getApplicableExperiments`.
   * Filter: `lifecycle IN ('active', 'graduated') AND (vertical IS
   * NULL OR vertical = $vertical)`. Reconciles the 04C handoff's
   * `status IN ('testing', 'graduated')` against the actual schema
   * enum `('proposed' | 'active' | 'graduated' | 'killed')` per
   * Phase 4 Day 4 kickoff Decision 8(i) — `testing` does not exist
   * in the enum; `active` is the running-experiment value.
   *
   * The `signalType?` parameter is accepted for forward-compat but
   * does NOT filter today (experiments don't carry a signal-type
   * association in their applicability JSONB consistently). Phase 5+
   * adds the filter when the contract solidifies.
   *
   * Empty render: callers render `(no related experiments active)`
   * per the prompt's documented empty-block fallback.
   */
  async getExperimentsForVertical(opts: {
    vertical: Vertical;
    /** Forward-compat: accepted but unused per Phase 4 Day 4 Decision 8 parking. */
    signalType?: SignalTaxonomy;
    limit?: number;
  }): Promise<readonly VerticalExperimentSummary[]> {
    void opts.signalType; // forward-compat; see JSDoc.
    const limit = opts.limit ?? 10;
    const rows = await this.sql<
      Array<{
        id: string;
        title: string;
        hypothesis: string;
        description: string | null;
        lifecycle: "active" | "graduated";
        vertical: Vertical | null;
      }>
    >`
      SELECT id, title, hypothesis, description, lifecycle, vertical
        FROM experiments
       WHERE lifecycle IN ('active', 'graduated')
         AND (vertical IS NULL OR vertical = ${opts.vertical}::vertical)
       ORDER BY created_at DESC
       LIMIT ${limit}
    `;
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      hypothesis: r.hypothesis,
      description: r.description,
      lifecycle: r.lifecycle,
      vertical: r.vertical,
    }));
  }

  async close(): Promise<void> {
    if (this.ownedSql) {
      await this.sql.end({ timeout: 5 });
    }
  }
}
