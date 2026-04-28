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
import type { DealState } from "../applicability/evaluator";

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

  async close(): Promise<void> {
    if (this.ownedSql) {
      await this.sql.end({ timeout: 5 });
    }
  }
}
