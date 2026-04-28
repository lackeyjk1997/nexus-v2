/**
 * Surface Admission engine — Phase 4 Day 1 Session B.
 *
 * Per DECISIONS.md §2.26 (admission engine LOCKED) + §1.16 (admission
 * thresholds → Claude scores ordering only — never admission) + §1.17
 * (dismissal soft 7-day re-surface + hard) + §1.18 (silence as feature
 * — applicability rejections silent + threshold non-matches silent +
 * single-data-point patterns don't surface) + §2.21 three-gate
 * applicability + Guardrail 25 (DealIntelligence sole interface for
 * intelligence reads).
 *
 * Surface-kind routing (kickoff Decision 3):
 *
 * - **Deal-specific surfaces** (`call_prep_brief`,
 *   `deal_detail_intelligence`): per-candidate applicability gates
 *   fire because the applicability rule is a deal-context attribute.
 *   Resolve DealState via DealIntelligence.getDealState; read patterns
 *   via getApplicablePatterns (rule rejections → applicability_
 *   rejections); read experiments via getApplicableExperiments; read
 *   flags via getApplicableFlags. Apply registry threshold rules
 *   (silent on threshold-fail per §1.18). Apply dismissal filter
 *   in-memory. Score the survivors via 09-score-insight. Truncate to
 *   maxItems.
 *
 * - **Portfolio surfaces** (`intelligence_dashboard_patterns`,
 *   `daily_digest`): no DealState (no dealId). Skip the applies()
 *   evaluator entirely — applicability is a deal-context attribute and
 *   has no meaning without a deal (the rebuild plan's pattern-level
 *   thresholds for `intelligence_dashboard_patterns` confirm portfolio
 *   surfaces gate by pattern attributes, not deal context). Read
 *   coordinator_patterns directly. Apply registry threshold rules
 *   (pattern-level: minDealsAffected + minAggregateArr; recency for
 *   daily_digest). Dismissal filter. Score. Truncate.
 *
 * Threshold-fail discipline (§1.18 silence + Decision 7g):
 * threshold non-matches NEVER write rejections. Only rule
 * (applicability) rejections write to applicability_rejections.
 * If Phase 5+ admin tuning UI needs threshold-fail diagnostics, that's
 * a NEW surface (`admission_threshold_evaluations` table or generic
 * audit log) — NOT a retrofit on `applicability_rejections` (different
 * metadata: typed clauses vs numeric calibration deltas).
 *
 * Scoring discipline (§1.16):
 * Per-candidate fanout. One Claude call per admitted candidate, capped
 * at maxItems. Each call writes one prompt_call_log row via the
 * existing wrapper wiring (§2.16.1 decision 3). Batched scoring is OUT
 * of scope for Session B per kickoff Decision 1's defense.
 *
 * Operational vigilance (kickoff top-of-document note + Session A.5
 * precedent): admission's only writes are the rejection batches inside
 * getApplicable* methods. The admission engine itself does NOT open
 * sql.begin() — reads are issued sequentially against the shared sql
 * client; if a future refactor introduces a transaction here, it must
 * NOT call DealIntelligence methods (or any service that needs its own
 * connection) inside that transaction. Two-phase pattern: reads
 * outside, writes inside.
 */
import postgres from "postgres";

import { parseApplicabilityRule, type ApplicabilityRule } from "../applicability";
import { callClaude } from "../claude/client";
import {
  scoreInsightTool,
  type ScoreComponents,
  type ScoreInsightOutput,
} from "../claude/tools/score-insight";
import {
  getSurface,
  type SurfaceConfig,
  type SurfaceId,
} from "../surfaces/registry";
import {
  DealIntelligence,
  type DealEventType,
  type Experiment,
  type Pattern,
  type RecentEventSummary,
  type RiskFlag,
} from "./deal-intelligence";

/**
 * The scoring callback the admission engine fans out per candidate.
 * Default implementation calls the unified Claude wrapper against
 * 09-score-insight; tests inject a deterministic stub.
 */
export type ScoreInsightFn = (args: {
  surfaceId: SurfaceId;
  candidate: AdmissionCandidate;
  dealStateBlock: string;
  recentEventsBlock: string;
  hubspotDealId: string | null;
}) => Promise<{
  score: number;
  explanation: string;
  components?: ScoreComponents;
}>;

/**
 * Insight kinds the admission engine handles. Discriminator for the
 * AdmittedInsight + AdmissionCandidate unions.
 */
export type InsightKind = "pattern" | "experiment" | "risk_flag";

/**
 * Pre-scoring candidate shape — what threshold-filtered + dismissal-
 * filtered candidates look like before Claude scores them.
 */
export type AdmissionCandidate =
  | { kind: "pattern"; pattern: Pattern }
  | { kind: "experiment"; experiment: Experiment }
  | { kind: "risk_flag"; riskFlag: RiskFlag };

/**
 * Admitted insight — the scored, ordered output of the admission flow.
 * Discriminated union: callers narrow on `.kind` to access the
 * specific candidate.
 */
export type AdmittedInsight = AdmissionCandidate & {
  score: number;
  scoreExplanation: string;
  scoreComponents?: ScoreComponents;
};

/**
 * Diagnostic-only surface for callers who want to count rule rejections
 * post-admit (e.g., the Phase 5+ admin tuning dashboard reads
 * `applicability_rejections` directly; this in-memory return is for
 * the unit-test seam). Not user-surfaced per §1.18.
 */
export interface AppliedRejection {
  ruleId: string;
  reasons: readonly string[];
  hubspotDealId: string | null;
}

export interface SurfaceAdmissionOptions {
  databaseUrl: string;
  sql?: postgres.Sql;
  dealIntel?: DealIntelligence;
  /**
   * Scoring callback override (test injection). Defaults to a real
   * 09-score-insight Claude call via callClaude.
   */
  scoreFn?: ScoreInsightFn;
}

export interface AdmitArgs {
  surfaceId: SurfaceId;
  userId: string;
  /** Required for deal-specific surfaces; ignored for portfolio. */
  dealId?: string;
  /**
   * Optional anchors for prompt_call_log telemetry. The admission
   * engine threads these into each scoring call so per-deal /
   * per-job audit lookups remain a single JOIN.
   */
  jobId?: string;
  /**
   * Active experiment assignment IDs — passed to DealIntelligence's
   * DealState read for the activeExperimentAssignments slot. Phase 5+
   * wires this from the experiment lifecycle UI; Session B callers
   * default to []. (DealIntelligence.getDealState reads via the
   * Day-1 placeholder which returns [] regardless; this argument
   * exists in the engine signature so future Phase 5+ wiring lands
   * additively.)
   */
  activeExperimentAssignments?: readonly string[];
}

export interface AdmitResult {
  admitted: AdmittedInsight[];
  rejections: AppliedRejection[];
}

/**
 * Default scoring implementation: real Claude call via the unified
 * wrapper. Tests inject `scoreFn` to bypass network + cost.
 */
function defaultScoreFn(opts: {
  hubspotDealId: string | null;
  jobId?: string;
}): ScoreInsightFn {
  return async ({
    surfaceId,
    candidate,
    dealStateBlock,
    recentEventsBlock,
  }) => {
    const result = await callClaude<ScoreInsightOutput>({
      promptFile: "09-score-insight",
      vars: {
        surfaceId,
        candidateInsightBlock: serializeCandidate(candidate),
        dealStateBlock,
        recentEventsBlock,
      },
      tool: scoreInsightTool,
      task: "classification",
      anchors: {
        hubspotDealId: opts.hubspotDealId ?? undefined,
        jobId: opts.jobId,
      },
    });
    return {
      score: result.toolInput.score,
      explanation: result.toolInput.score_explanation,
      components: result.toolInput.score_components,
    };
  };
}

function serializeCandidate(candidate: AdmissionCandidate): string {
  switch (candidate.kind) {
    case "pattern": {
      const p = candidate.pattern;
      const arrAggregate = (p.arrImpact as Record<string, unknown>)
        ?.aggregate_arr;
      return [
        `kind: pattern`,
        `patternId: ${p.id}`,
        `patternKey: ${p.patternKey}`,
        `signalType: ${p.signalType}`,
        `vertical: ${p.vertical ?? "(cross-vertical)"}`,
        `competitor: ${p.competitor ?? "(none)"}`,
        `dealsAffected: ${p.dealsAffectedCount}`,
        `aggregateArr: ${typeof arrAggregate === "number" ? arrAggregate : "(unknown)"}`,
        `synthesis: ${p.synthesis}`,
        `reasoning: ${p.reasoning ?? "(none)"}`,
        `dbScore: ${p.score ?? "(unscored)"}`,
        `status: ${p.status}`,
        `detectedAt: ${p.detectedAt.toISOString()}`,
      ].join("\n");
    }
    case "experiment": {
      const e = candidate.experiment;
      return [
        `kind: experiment`,
        `experimentId: ${e.id}`,
        `title: ${e.title}`,
        `category: ${e.category}`,
        `lifecycle: ${e.lifecycle}`,
        `vertical: ${e.vertical ?? "(cross-vertical)"}`,
        `hypothesis: ${e.hypothesis}`,
        `description: ${e.description ?? "(none)"}`,
      ].join("\n");
    }
    case "risk_flag": {
      const r = candidate.riskFlag;
      return [
        `kind: risk_flag`,
        `flagId: ${r.id}`,
        `dealId: ${r.hubspotDealId}`,
        `sourceRef: ${r.sourceRef ?? "(none)"}`,
        `raisedAt: ${r.raisedAt.toISOString()}`,
        `payload: ${JSON.stringify(r.payload)}`,
      ].join("\n");
    }
  }
}

function serializeDealStateBlock(state: {
  hubspotDealId: string;
  vertical: string | null;
  stage: string | null;
  amount: number | null;
  dealSizeBand: string | null;
  employeeCountBand: string | null;
  daysInStage: number;
  daysSinceCreated: number;
  closeStatus: string;
  meddpiccScores: Partial<Record<string, number>>;
  openSignals: ReadonlyArray<{
    signalType: string;
    detectedAt: Date;
    sourceRef: string;
  }>;
  activeExperimentAssignments: ReadonlyArray<string>;
}): string {
  return [
    `hubspotDealId: ${state.hubspotDealId}`,
    `vertical: ${state.vertical ?? "(unknown)"}`,
    `stage: ${state.stage ?? "(unknown)"}`,
    `amount: ${state.amount ?? "(unknown)"}`,
    `dealSizeBand: ${state.dealSizeBand ?? "(unknown)"}`,
    `employeeCountBand: ${state.employeeCountBand ?? "(unknown)"}`,
    `daysInStage: ${state.daysInStage}`,
    `daysSinceCreated: ${state.daysSinceCreated}`,
    `closeStatus: ${state.closeStatus}`,
    `meddpiccScores: ${JSON.stringify(state.meddpiccScores)}`,
    `openSignalsCount: ${state.openSignals.length}`,
    `activeExperimentAssignments: ${state.activeExperimentAssignments.length}`,
  ].join("\n");
}

function serializeRecentEventsBlock(
  events: readonly RecentEventSummary[],
): string {
  if (events.length === 0) return "(no recent events in 14-day window)";
  return events
    .map(
      (e) => `- [${e.type}, ${e.createdAt.toISOString()}] ${e.summary}`,
    )
    .join("\n");
}

/**
 * Surface dismissals filter — Phase 4 Day 1 Session B kickoff Decision 5.
 *
 * In-memory implementation per kickoff productization-arc note (both
 * axes documented):
 *  1. **Volume / scaling axis** — anti-JOIN scales better at high row
 *     counts; in-memory works for v2 demo's low volume.
 *  2. **Concurrency / TOCTOU axis** — in-memory has a time-of-check-
 *     to-time-of-use window where a dismissal landing between the
 *     candidate read and the filter could let a just-dismissed
 *     insight surface once. Harmless at v2 demo scale (millisecond
 *     window, no compliance surface); matters at productization.
 *
 * Productization upgrade paths:
 *  - Anti-JOIN for volume scaling.
 *  - Re-check at render time OR transactional read+filter for TOCTOU.
 *
 * Captured in Reasoning stub at end-of-session.
 */
async function loadDismissedKeys(
  sql: postgres.Sql,
  userId: string,
  candidates: readonly AdmissionCandidate[],
): Promise<Set<string>> {
  if (candidates.length === 0) return new Set();
  const keys = candidates.map((c) => keyOf(c));
  const insightIds = candidates.map((c) => insightIdOf(c));
  const insightTypes = candidates.map((c) => c.kind);
  // Single query: load any dismissals for this user touching any of the
  // candidate IDs, then filter in-memory by mode + resurface_after.
  const rows = await sql<
    Array<{
      insight_id: string;
      insight_type: string;
      mode: "soft" | "hard";
      resurface_after: Date | null;
    }>
  >`
    SELECT insight_id, insight_type, mode, resurface_after
      FROM surface_dismissals
     WHERE user_id = ${userId}
       AND insight_id IN ${sql(insightIds)}
       AND insight_type IN ${sql(insightTypes)}
  `;
  const now = Date.now();
  const dismissed = new Set<string>();
  for (const row of rows) {
    const isHard = row.mode === "hard";
    const isSoftActive =
      row.mode === "soft" &&
      row.resurface_after !== null &&
      new Date(row.resurface_after).getTime() > now;
    if (isHard || isSoftActive) {
      dismissed.add(`${row.insight_id}::${row.insight_type}`);
    }
  }
  // Sanity: keys vs dismissed only matter for membership; the union
  // shape is `${insightId}::${insightType}` for both lookups.
  void keys;
  return dismissed;
}

function insightIdOf(c: AdmissionCandidate): string {
  switch (c.kind) {
    case "pattern":
      return c.pattern.id;
    case "experiment":
      return c.experiment.id;
    case "risk_flag":
      return c.riskFlag.id;
  }
}

function keyOf(c: AdmissionCandidate): string {
  return `${insightIdOf(c)}::${c.kind}`;
}

/**
 * Threshold filter — applies the surface registry's admission rules
 * AFTER applicability gating + dismissal filter, BEFORE Claude scoring.
 *
 * Per §1.18 + Decision 7g: threshold non-matches are silent (no
 * rejection write). They simply don't carry forward. Diagnostic
 * surface for threshold fails is parked as a NEW surface, NOT a
 * retrofit on applicability_rejections.
 *
 * Surface-specific rules:
 *  - call_prep_brief: deal stage must be in `appliesWhenStageIn`.
 *    minScore is post-Claude-scoring (applied in `admit` after the
 *    scoring fanout). Pattern-only candidates check coordinator's
 *    DB-stored synthesis score against minScore? No — kickoff
 *    Decision 3 step 4 says "thresholds are configurable but default
 *    — a candidate that fails the threshold isn't a rule rejection,
 *    it's a calibration non-match". The score floor applies to
 *    Claude's importance score for ordering — captured in Reasoning
 *    stub: minScore is interpreted as a post-Claude-score floor (the
 *    cleanest interpretation of §1.16's admission-vs-scoring split is
 *    that minScore and Claude scoring share a single 0-100 surface,
 *    with the threshold filtering AFTER Claude assigns the
 *    importance score; admin tuning UI in Phase 5+ adjusts it).
 *  - intelligence_dashboard_patterns: pattern-only; minDealsAffected
 *    on dealsAffectedCount; minAggregateArr on arrImpact.aggregate_arr.
 *  - daily_digest: maxAgeHours on candidate.detectedAt/raisedAt
 *    recency.
 *  - deal_detail_intelligence: dealSpecific=true (just enforces dealId
 *    presence); minScore is post-Claude-scoring like call_prep_brief.
 */
function applyPreScoringThresholds(
  surface: SurfaceConfig,
  candidates: readonly AdmissionCandidate[],
  dealStage: string | null,
): AdmissionCandidate[] {
  switch (surface.id) {
    case "call_prep_brief": {
      const stages = surface.admission.appliesWhenStageIn;
      if (!dealStage || !stages.includes(dealStage)) {
        // Surface doesn't apply to this deal's stage — return empty.
        return [];
      }
      // Per-candidate stage filter passed; Claude minScore floor
      // applied post-scoring.
      return [...candidates];
    }
    case "intelligence_dashboard_patterns": {
      const { minDealsAffected, minAggregateArr } = surface.admission;
      return candidates.filter((c) => {
        if (c.kind !== "pattern") return false; // pattern-only surface
        const dealsCount = c.pattern.dealsAffectedCount;
        const arrAggregate = (c.pattern.arrImpact as Record<string, unknown>)
          ?.aggregate_arr;
        const arrValue = typeof arrAggregate === "number" ? arrAggregate : 0;
        return dealsCount >= minDealsAffected && arrValue >= minAggregateArr;
      });
    }
    case "daily_digest": {
      const cutoff = Date.now() - surface.admission.maxAgeHours * 3_600_000;
      return candidates.filter((c) => {
        const ts =
          c.kind === "pattern"
            ? c.pattern.detectedAt.getTime()
            : c.kind === "risk_flag"
              ? c.riskFlag.raisedAt.getTime()
              : 0;
        return ts >= cutoff;
      });
    }
    case "deal_detail_intelligence": {
      // dealSpecific=true is enforced upstream (admit() throws on
      // missing dealId for deal-specific surfaces). minScore is
      // post-Claude-score floor.
      return [...candidates];
    }
  }
}

function applyPostScoringScoreFloor(
  surface: SurfaceConfig,
  admitted: readonly AdmittedInsight[],
): AdmittedInsight[] {
  switch (surface.id) {
    case "call_prep_brief":
      return admitted.filter((a) => a.score >= surface.admission.minScore);
    case "deal_detail_intelligence":
      return admitted.filter((a) => a.score >= surface.admission.minScore);
    case "daily_digest":
      return admitted.filter((a) => a.score >= surface.admission.minScore);
    case "intelligence_dashboard_patterns":
      // No per-candidate score floor; rely on pre-scoring threshold.
      return [...admitted];
  }
}

/**
 * Apply maxItems truncation. Most surfaces use a single overall cap;
 * call_prep_brief uses a per-kind cap (`{patterns: 3, risks: 5,
 * experiments: 2}`).
 */
function truncateToMaxItems(
  surface: SurfaceConfig,
  admitted: readonly AdmittedInsight[],
): AdmittedInsight[] {
  if (surface.id === "call_prep_brief") {
    const caps = surface.maxItems;
    const buckets: Record<InsightKind, AdmittedInsight[]> = {
      pattern: [],
      experiment: [],
      risk_flag: [],
    };
    // admitted is already sorted by score desc — push respecting cap.
    for (const item of admitted) {
      const cap =
        item.kind === "pattern"
          ? caps.patterns
          : item.kind === "experiment"
            ? caps.experiments
            : caps.risks;
      const bucket = buckets[item.kind];
      if (bucket.length < cap) bucket.push(item);
    }
    // Re-merge in score-desc order (each bucket already in score-desc).
    const merged = [...buckets.pattern, ...buckets.experiment, ...buckets.risk_flag];
    merged.sort((a, b) => b.score - a.score);
    return merged;
  }
  return admitted.slice(0, surface.maxItems);
}

export class SurfaceAdmission {
  private readonly sql: postgres.Sql;
  private readonly ownedSql: boolean;
  private readonly dealIntel: DealIntelligence;
  private readonly ownedDealIntel: boolean;
  private readonly scoreFn: ScoreInsightFn | null;

  constructor(opts: SurfaceAdmissionOptions) {
    this.sql =
      opts.sql ??
      postgres(opts.databaseUrl, { max: 1, idle_timeout: 30, prepare: false });
    this.ownedSql = !opts.sql;
    this.dealIntel =
      opts.dealIntel ??
      new DealIntelligence({ databaseUrl: opts.databaseUrl, sql: this.sql });
    this.ownedDealIntel = !opts.dealIntel;
    this.scoreFn = opts.scoreFn ?? null;
  }

  async admit(args: AdmitArgs): Promise<AdmitResult> {
    const surface = getSurface(args.surfaceId);
    const rejections: AppliedRejection[] = [];

    if (surface.kind === "deal_specific") {
      if (!args.dealId) {
        throw new Error(
          `surfaceId=${args.surfaceId} is deal-specific; admit() requires dealId`,
        );
      }
      return this.admitDealSpecific(surface, args, args.dealId, rejections);
    }
    return this.admitPortfolio(surface, args, rejections);
  }

  /**
   * Deal-specific admission flow (kickoff Decision 3, deal-specific
   * 7-step flow):
   *   1. Resolve dealState (already done inside getApplicable* via
   *      getDealState; we read it once here for the threshold filter
   *      + scoring blocks too).
   *   2. Read candidates via getApplicable{Patterns,Experiments,Flags}.
   *      Each writes rule rejections to applicability_rejections
   *      transparently.
   *   3. (Threshold filter) — applyPreScoringThresholds.
   *   4. Dismissal filter.
   *   5. Score the survivors (per-candidate fanout, capped at maxItems
   *      total to bound cost).
   *   6. Apply post-scoring minScore floor (where applicable).
   *   7. Sort by score desc; truncate to maxItems.
   */
  private async admitDealSpecific(
    surface: SurfaceConfig,
    args: AdmitArgs,
    dealId: string,
    rejections: AppliedRejection[],
  ): Promise<AdmitResult> {
    // Reads outside any transaction (operational vigilance — see
    // top-of-file note + Session A.5 precedent).
    const dealState = await this.dealIntel.getDealState(dealId);
    const recentEvents = await this.dealIntel.getRecentEvents(dealId, {
      sinceDays: 14,
      limit: 15,
    });

    // surfaceId threaded into getApplicable* so rejection rows record
    // which surface was being admitted.
    const [patterns, experiments, flags] = await Promise.all([
      this.dealIntel.getApplicablePatterns(dealId, {
        surfaceId: args.surfaceId,
      }),
      this.dealIntel.getApplicableExperiments(dealId, {
        surfaceId: args.surfaceId,
      }),
      this.dealIntel.getApplicableFlags(dealId, {
        surfaceId: args.surfaceId,
      }),
    ]);

    let candidates: AdmissionCandidate[] = [
      ...patterns.map((p): AdmissionCandidate => ({ kind: "pattern", pattern: p })),
      ...experiments.map((e): AdmissionCandidate => ({
        kind: "experiment",
        experiment: e,
      })),
      ...flags.map((f): AdmissionCandidate => ({ kind: "risk_flag", riskFlag: f })),
    ];

    // Threshold filter (silent on fail per §1.18).
    candidates = applyPreScoringThresholds(surface, candidates, dealState.stage);

    if (candidates.length === 0) {
      return { admitted: [], rejections };
    }

    // Dismissal filter (in-memory per Decision 5).
    const dismissed = await loadDismissedKeys(this.sql, args.userId, candidates);
    candidates = candidates.filter((c) => !dismissed.has(keyOf(c)));

    if (candidates.length === 0) {
      return { admitted: [], rejections };
    }

    // Cap scoring fanout at maxItems-equivalent. For per-kind caps
    // (call_prep_brief), the upper bound is sum of caps; for single
    // overall caps, it's that cap. We don't know which candidates will
    // pass the post-scoring floor + truncation, so we score up to the
    // pre-truncation cap to keep the cost bound predictable.
    const fanoutCap = computeFanoutCap(surface);
    const toScore = candidates.slice(0, fanoutCap);

    const dealStateBlock = serializeDealStateBlock(dealState);
    const recentEventsBlock = serializeRecentEventsBlock(recentEvents);
    const score =
      this.scoreFn ??
      defaultScoreFn({ hubspotDealId: dealId, jobId: args.jobId });

    const scored: AdmittedInsight[] = [];
    for (const candidate of toScore) {
      const result = await score({
        surfaceId: args.surfaceId,
        candidate,
        dealStateBlock,
        recentEventsBlock,
        hubspotDealId: dealId,
      });
      scored.push({
        ...candidate,
        score: result.score,
        scoreExplanation: result.explanation,
        scoreComponents: result.components,
      });
    }

    // Sort by score desc.
    scored.sort((a, b) => b.score - a.score);

    // Post-scoring score floor.
    const aboveFloor = applyPostScoringScoreFloor(surface, scored);

    // Truncate to maxItems.
    const admitted = truncateToMaxItems(surface, aboveFloor);

    return { admitted, rejections };
  }

  /**
   * Portfolio admission flow (kickoff Decision 3, portfolio 7-step
   * flow): no DealState; skip applies(); pattern-level threshold
   * filter; dismissal filter; score; sort; truncate.
   *
   * Today only `intelligence_dashboard_patterns` and `daily_digest`
   * route here. `daily_digest` job handler is Phase 5; the engine's
   * portfolio path supports it for future-compatibility.
   */
  private async admitPortfolio(
    surface: SurfaceConfig,
    args: AdmitArgs,
    rejections: AppliedRejection[],
  ): Promise<AdmitResult> {
    // Read coordinator_patterns directly. Status admissibility per
    // Reasoning-stub Decision: 'detected' + 'synthesized' admit;
    // 'expired' excludes.
    const patternRows = await this.sql<
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
       WHERE p.status IN ('detected', 'synthesized')
       ORDER BY p.detected_at DESC
    `;

    let candidates: AdmissionCandidate[] = patternRows.map(
      (row): AdmissionCandidate => ({
        kind: "pattern",
        pattern: {
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
          // Portfolio path doesn't run applies() — applicability rule
          // is a deal-context attribute and has no meaning without a
          // deal. Parse-or-fallback to {} so consumers see the
          // persisted shape; admission engine itself doesn't evaluate
          // it on portfolio surfaces.
          applicability: tryParseApplicability(row.applicability),
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
        },
      }),
    );

    candidates = applyPreScoringThresholds(surface, candidates, null);

    if (candidates.length === 0) {
      return { admitted: [], rejections };
    }

    const dismissed = await loadDismissedKeys(this.sql, args.userId, candidates);
    candidates = candidates.filter((c) => !dismissed.has(keyOf(c)));

    if (candidates.length === 0) {
      return { admitted: [], rejections };
    }

    const fanoutCap = computeFanoutCap(surface);
    const toScore = candidates.slice(0, fanoutCap);

    const dealStateBlock = "(portfolio surface — no per-deal context)";
    const recentEventsBlock = "(portfolio surface — no per-deal event stream)";
    const score =
      this.scoreFn ?? defaultScoreFn({ hubspotDealId: null, jobId: args.jobId });

    const scored: AdmittedInsight[] = [];
    for (const candidate of toScore) {
      const result = await score({
        surfaceId: args.surfaceId,
        candidate,
        dealStateBlock,
        recentEventsBlock,
        hubspotDealId: null,
      });
      scored.push({
        ...candidate,
        score: result.score,
        scoreExplanation: result.explanation,
        scoreComponents: result.components,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    const aboveFloor = applyPostScoringScoreFloor(surface, scored);
    const admitted = truncateToMaxItems(surface, aboveFloor);

    return { admitted, rejections };
  }

  async close(): Promise<void> {
    if (this.ownedDealIntel) await this.dealIntel.close();
    if (this.ownedSql) await this.sql.end({ timeout: 5 });
  }
}

/**
 * Parse-or-fallback for portfolio path: applicability has no functional
 * effect (no DealState to evaluate against), but consumers may inspect
 * the rule for diagnostic purposes. Invalid shape → empty rule rather
 * than throwing.
 */
function tryParseApplicability(raw: unknown): ApplicabilityRule {
  try {
    return parseApplicabilityRule(raw ?? {});
  } catch {
    return {};
  }
}

/**
 * Compute the maximum candidates we'll Claude-score for a given
 * surface. For per-kind caps, sum across kinds. For single overall
 * caps, that cap. This bounds cost predictably regardless of how
 * many candidates passed the threshold filter.
 */
function computeFanoutCap(surface: SurfaceConfig): number {
  if (surface.id === "call_prep_brief") {
    const c = surface.maxItems;
    return c.patterns + c.experiments + c.risks;
  }
  return surface.maxItems;
}

// Re-export for callers that need the surface event-type list when
// constructing `recentEvents` blocks manually (e.g., test harnesses).
export type { DealEventType };
