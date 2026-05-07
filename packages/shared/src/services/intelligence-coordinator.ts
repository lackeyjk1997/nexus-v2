/**
 * IntelligenceCoordinator service — Phase 4 Day 2 Session A.
 *
 * Cross-deal pattern detection. Phase 3 Day 4 Session A landed the
 * skeleton (no-op `receiveSignal` + empty `getActivePatterns`); this
 * session fills in the real implementations behind the same interface.
 *
 * Per DECISIONS.md §2.17 `coordinator_patterns` is the authoritative
 * table. Per §2.16 the coordinator reads from `signal_detected` events
 * to find recurring cross-deal patterns and emits `coordinator_patterns`
 * rows + `coordinator_pattern_deals` join rows. Per Phase 4 Day 2
 * Session A kickoff Decision 2, `receiveSignal` does NOT do inline
 * pattern detection — it enqueues a `coordinator_synthesis` job (with
 * dedup against in-flight jobs in the last hour) so synchronous work
 * doesn't block the transcript pipeline's already-heavy 5-Claude-call
 * Promise.all surface (§2.6 long-ops-as-jobs).
 *
 * Telemetry per Decision 8 — stderr JSON line per event matching the
 * existing `claude_call`, `worker_circuit_break`, `dealstate_stage_fallback`
 * shapes (§2.13.1 telemetry-as-early-warning):
 *   - signal_received                   (vertical, signal_type, dealId, jobId)
 *   - signal_dedup_skipped              (existing in-flight job pattern_key)
 *   - signal_received_invalid           (validation reason)
 */
import postgres from "postgres";

import { isSignalTaxonomy, type SignalTaxonomy } from "../enums/signal-taxonomy";
import { isVertical, type Vertical } from "../enums/vertical";
import type { CrmAdapter } from "../crm/adapter";
import { MEDDPICC_DIMENSION, type MeddpiccDimension } from "../enums/meddpicc-dimension";

export interface IntelligenceCoordinatorOptions {
  databaseUrl: string;
  /** Inject a pre-built postgres client (shared pool, tests). */
  sql?: postgres.Sql;
}

/**
 * Input shape for `receiveSignal`. Captures the fields Phase 4's pattern-
 * detection logic needs (signal type, deal id, evidence quote, source
 * transcript, calling rep). Phase 3 Day 4 Session B's pipeline call site
 * already passes this shape unchanged.
 */
export interface ReceivedSignalInput {
  hubspotDealId: string;
  signalType: string;
  evidenceQuote: string;
  sourceSpeaker: string;
  transcriptId?: string | null;
  observerUserId?: string | null;
  vertical?: Vertical | null;
}

/**
 * Output shape for `getActivePatterns`. Mirrors what 01-detect-signals,
 * 05-deal-fitness, 07-give-back, and 06a-close-analysis-continuous
 * expect when interpolating `${activePatternsBlock}` (one line per
 * pattern: `- [{signalType}] {synthesisHeadline} (affecting {dealCount}
 * deals)`). Empty array is rendered by callers as `(none)`.
 */
export interface ActivePatternSummary {
  patternId: string;
  signalType: SignalTaxonomy;
  vertical: Vertical | null;
  synthesisHeadline: string;
  dealCount: number;
}

/**
 * Prior-pattern lineage row admitted by `getPriorPatterns` — Phase 4
 * Day 4. Feeds the coordinator_synthesis prompt's
 * `${priorPatternsBlock}` so the synthesis call can name lineage
 * (extension / intensification / branch) instead of silently restating
 * prior synthesis as new.
 *
 * Filter: `signal_type = $signalType AND vertical = $vertical AND
 * status IN ('synthesized', 'expired') AND detected_at >= now() -
 * interval $sinceDays days`. The `'detected'` status is excluded —
 * those rows are this-run candidates, not lineage.
 *
 * Empty render: callers render `(no prior patterns of this
 * type/vertical in 90 days — this is novel)` per the prompt's
 * documented empty-block fallback.
 */
export interface PriorPatternSummary {
  patternId: string;
  detectedAt: Date;
  synthesizedAt: Date | null;
  synthesisHeadline: string;
  mechanism: string;
  status: "synthesized" | "expired";
}

/**
 * One signal-detected row from the coordinator_synthesis handler's
 * dealsMap, exposed as a public type so the helper signature is
 * reachable from across the package boundary. Mirrors the handler's
 * inline RecentSignalRow shape (read from `deal_events.payload->'signal'`)
 * field-for-field.
 *
 * `created_at` is `string | Date` because postgres.js returns timestamp
 * columns as `Date` instances, while the unit-test mock harness passes
 * ISO strings; renderers must handle both shapes (see `formatCallDate`).
 */
export interface AffectedSignalRow {
  hubspot_deal_id: string;
  vertical: string;
  signal_type: string;
  evidence_quote: string | null;
  source_speaker: string | null;
  urgency: string | null;
  deal_size_band: string | null;
  created_at: string | Date;
}

/**
 * Stakeholder summary for one enriched affected deal. Sourced from
 * `CrmAdapter.listDealContacts` (Contact + role + isPrimary). The
 * coordinator_synthesis prompt receives a top-N truncation rendered
 * as one line per stakeholder.
 */
export interface EnrichedStakeholder {
  hubspotContactId: string;
  fullName: string;
  title: string | null;
  role: string | null;
  isPrimary: boolean;
}

/**
 * Per-deal MEDDPICC summary block. Reused from the existing
 * `formatMeddpiccBlock` shape (8 lines, one per dimension). When the
 * batch read returns no row for a deal, the block is rendered as
 * `(none)` per the prompt's documented empty-block fallback.
 */
export interface EnrichedMeddpiccSummary {
  scoresByDimension: Partial<Record<MeddpiccDimension, number>>;
  evidence: Record<
    string,
    { evidence_text?: string; last_updated?: string } | undefined
  > | null;
  perDimensionConfidence: Record<string, number> | null;
  overallScore: number | null;
}

/**
 * Enriched affected-deal row — the per-deal output of
 * `enrichAffectedDeals`. The coordinator_synthesis handler renders
 * this as one block per deal, each with stage / amount / AE /
 * stakeholders / signals / MEDDPICC gaps for the prompt's
 * `${affectedDealsBlock}`.
 *
 * `enrichmentStatus = "partial"` indicates one or more adapter calls
 * for this deal failed; remaining fields default to `(unavailable)`-
 * style placeholders at render time so the prompt's discipline still
 * holds.
 */
export interface EnrichedAffectedDeal {
  hubspotDealId: string;
  dealName: string | null;
  companyName: string | null;
  stage: string | null;
  amount: number | null;
  aeName: string | null;
  stakeholders: readonly EnrichedStakeholder[];
  signals: readonly AffectedSignalRow[];
  meddpicc: EnrichedMeddpiccSummary | null;
  enrichmentStatus: "full" | "partial";
  fieldsUnavailable: readonly string[];
}

/**
 * Outcome of `receiveSignal` exposed to test gates. Production callers
 * (transcript pipeline step 5) ignore the return value — the contract
 * is fire-and-forget per the original Phase 3 Day 4 Session A skeleton.
 * Tests use this to assert the right branch ran.
 */
export type ReceiveSignalOutcome =
  | { kind: "enqueued"; jobId: string }
  | { kind: "deduped"; existingJobId: string }
  | { kind: "rejected"; reason: string };

export class IntelligenceCoordinator {
  private readonly sql: postgres.Sql;
  private readonly ownedSql: boolean;

  constructor(options: IntelligenceCoordinatorOptions) {
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
   * Pipeline-side hook for "this signal was just detected on a deal."
   *
   * Per Decision 2: validate input → check for in-flight
   * coordinator_synthesis job within the last hour matching the same
   * (vertical, signalType) → enqueue a fresh job OR emit dedup-skipped
   * telemetry.
   *
   * Validation failure is non-fatal: emits `signal_received_invalid`
   * telemetry, returns `{kind:"rejected"}`. The pipeline keeps running.
   * Vertical is required because the synthesis prompt segments by
   * vertical and we can't dedup without it.
   *
   * Returns `Promise<ReceiveSignalOutcome>` so test gates can assert
   * which branch ran. Production callers (transcript pipeline) await
   * for sequencing but discard the outcome.
   */
  async receiveSignal(input: ReceivedSignalInput): Promise<ReceiveSignalOutcome> {
    // ── Validation ────────────────────────────────────────────────────
    if (!input.hubspotDealId || input.hubspotDealId.length === 0) {
      return this.rejectSignal(input, "missing_hubspot_deal_id");
    }
    if (!isSignalTaxonomy(input.signalType)) {
      return this.rejectSignal(input, "invalid_signal_type");
    }
    if (input.vertical == null) {
      return this.rejectSignal(input, "missing_vertical");
    }
    if (!isVertical(input.vertical)) {
      return this.rejectSignal(input, "invalid_vertical");
    }

    // ── Dedup check ───────────────────────────────────────────────────
    // Race-tolerant: worst case is two coordinator_synthesis jobs run
    // for the same (vertical, signalType) pair; the handler is idempotent
    // on pattern_key (Decision 4) so the second one's INSERTs no-op.
    // No FOR UPDATE — there is no existing row to lock on the miss path.
    const existing = await this.sql<Array<{ id: string }>>`
      SELECT id FROM jobs
       WHERE type = 'coordinator_synthesis'
         AND status IN ('queued', 'running')
         AND input->>'vertical' = ${input.vertical}
         AND input->>'signalType' = ${input.signalType}
         AND created_at > now() - interval '1 hour'
       LIMIT 1
    `;

    if (existing.length > 0) {
      const existingJobId = existing[0]!.id;
      console.error(
        JSON.stringify({
          event: "signal_dedup_skipped",
          vertical: input.vertical,
          signal_type: input.signalType,
          hubspot_deal_id: input.hubspotDealId,
          existing_job_id: existingJobId,
          ts: new Date().toISOString(),
        }),
      );
      return { kind: "deduped", existingJobId };
    }

    // ── Enqueue ───────────────────────────────────────────────────────
    const jobInput = {
      vertical: input.vertical,
      signalType: input.signalType,
      triggeringDealId: input.hubspotDealId,
      triggeringTranscriptId: input.transcriptId ?? null,
      enqueuedAt: new Date().toISOString(),
    };

    const inserted = await this.sql<Array<{ id: string }>>`
      INSERT INTO jobs (type, status, input)
      VALUES ('coordinator_synthesis', 'queued', ${this.sql.json(jobInput as unknown as Parameters<typeof this.sql.json>[0])})
      RETURNING id
    `;

    const jobId = inserted[0]!.id;
    console.error(
      JSON.stringify({
        event: "signal_received",
        vertical: input.vertical,
        signal_type: input.signalType,
        hubspot_deal_id: input.hubspotDealId,
        job_id: jobId,
        ts: new Date().toISOString(),
      }),
    );
    return { kind: "enqueued", jobId };
  }

  /**
   * Read-side hook for "what patterns are currently active that this
   * deal/vertical's prompts should consider."
   *
   * Per Item 2: returns `coordinator_patterns` rows where status IN
   * ('detected', 'synthesized'). Optional filters: vertical, signalType,
   * dealIds (the latter joins through coordinator_pattern_deals to
   * surface only patterns touching the given deals).
   *
   * `dealCount` is the total count of deals on the pattern (NOT just
   * the dealIds-filter intersection) — consumers render it as "affecting
   * N deals" so the count must reflect the full pattern's reach.
   *
   * Empty result rendered by callers as `(none)` per the documented
   * convention in 06a-close-analysis-continuous + 01-detect-signals +
   * 05-deal-fitness + 07-give-back prompts.
   */
  async getActivePatterns(opts: {
    vertical?: Vertical;
    signalType?: SignalTaxonomy;
    dealIds?: readonly string[];
  } = {}): Promise<readonly ActivePatternSummary[]> {
    const verticalFilter = opts.vertical ?? null;
    const signalTypeFilter = opts.signalType ?? null;
    const dealIdsFilter =
      opts.dealIds && opts.dealIds.length > 0 ? opts.dealIds : null;

    const rows = await this.sql<
      Array<{
        id: string;
        signal_type: SignalTaxonomy;
        vertical: Vertical | null;
        synthesis: string;
        deal_count: number;
      }>
    >`
      SELECT cp.id,
             cp.signal_type,
             cp.vertical,
             cp.synthesis,
             (SELECT COUNT(*)::int FROM coordinator_pattern_deals
               WHERE pattern_id = cp.id) AS deal_count
        FROM coordinator_patterns cp
       WHERE cp.status IN ('detected', 'synthesized')
         AND (${verticalFilter}::vertical IS NULL OR cp.vertical = ${verticalFilter}::vertical)
         AND (${signalTypeFilter}::signal_taxonomy IS NULL OR cp.signal_type = ${signalTypeFilter}::signal_taxonomy)
         AND (
           ${dealIdsFilter === null}::boolean
           OR EXISTS (
             SELECT 1 FROM coordinator_pattern_deals cpd
              WHERE cpd.pattern_id = cp.id
                AND cpd.hubspot_deal_id = ANY(${dealIdsFilter ?? []}::text[])
           )
         )
       ORDER BY cp.detected_at DESC
       LIMIT 50
    `;

    return rows.map((row) => ({
      patternId: row.id,
      signalType: row.signal_type,
      vertical: row.vertical,
      synthesisHeadline: extractHeadline(row.synthesis),
      dealCount: row.deal_count,
    }));
  }

  /**
   * Read prior patterns of the same `signalType` + `vertical` for
   * lineage-naming in the coordinator_synthesis prompt's
   * `${priorPatternsBlock}` — Phase 4 Day 4.
   *
   * Filter: `signal_type = $signalType AND vertical = $vertical AND
   * status IN ('synthesized', 'expired') AND detected_at >= now() -
   * interval N days`. The `'detected'` status is excluded — those rows
   * are this-run candidates, not lineage. The window default 90d
   * matches the prompt's documented empty-block fallback "no prior
   * patterns ... in 90 days — this is novel."
   *
   * The `synthesis` text column carries the composite shape
   * `{headline}\n\nMechanism:\n{mechanism}` per Phase 4 Day 2 Session
   * A's WRITE contract; this helper splits on `"\n\nMechanism:\n"` to
   * separate the headline + mechanism for the prompt's per-pattern
   * render.
   *
   * Empty render: callers render `(no prior patterns of this
   * type/vertical in 90 days — this is novel)` per the prompt's
   * documented empty-block fallback (§1.18).
   */
  async getPriorPatterns(opts: {
    signalType: SignalTaxonomy;
    vertical: Vertical;
    sinceDays?: number;
    limit?: number;
  }): Promise<readonly PriorPatternSummary[]> {
    const sinceDays = opts.sinceDays ?? 90;
    const limit = opts.limit ?? 5;
    const rows = await this.sql<
      Array<{
        id: string;
        detected_at: Date;
        synthesized_at: Date | null;
        synthesis: string;
        status: "synthesized" | "expired";
      }>
    >`
      SELECT id, detected_at, synthesized_at, synthesis, status
        FROM coordinator_patterns
       WHERE signal_type = ${opts.signalType}::signal_taxonomy
         AND vertical = ${opts.vertical}::vertical
         AND status IN ('synthesized', 'expired')
         AND detected_at >= now() - make_interval(days => ${sinceDays})
       ORDER BY detected_at DESC
       LIMIT ${limit}
    `;
    return rows.map((r) => {
      const { headline, mechanism } = splitSynthesis(r.synthesis);
      return {
        patternId: r.id,
        detectedAt: r.detected_at instanceof Date ? r.detected_at : new Date(r.detected_at),
        synthesizedAt:
          r.synthesized_at === null
            ? null
            : r.synthesized_at instanceof Date
              ? r.synthesized_at
              : new Date(r.synthesized_at),
        synthesisHeadline: headline,
        mechanism,
        status: r.status,
      };
    });
  }

  /**
   * Enrich the coordinator_synthesis handler's per-group `dealsMap`
   * with CRM-shaped fields (stage / amount / AE / stakeholders) +
   * per-deal MEDDPICC scores — Phase 4 Day 4.
   *
   * Replaces the 04C handoff's documented
   * `getPatternSignalsEnriched(patternId)` because the patternId
   * doesn't exist when the handler builds prompt vars (the handler
   * INSERTs the coordinator_patterns row AFTER Claude returns
   * synthesis). Per Phase 4 Day 4 kickoff Decision 4, the helper takes
   * the `dealsMap` directly + a Pick<CrmAdapter, ...> + an explicit
   * limit; ordering follows the dealsMap's iteration order so deals
   * with the most-recent signals surface first (handler reads signal
   * events ORDER BY created_at DESC).
   *
   * Per-deal enrichment fans out sequentially: `adapter.getDeal` +
   * `adapter.listDealContacts` per deal, then a single batch
   * MEDDPICC read across all dealIds. Sequential per the §2.6 +
   * Pre-Phase-4-Day-2 45-connection working ceiling discipline; warm
   * `hubspot_cache` means each adapter call resolves locally rather
   * than via HubSpot REST.
   *
   * Adapter call failures degrade per-deal: `enrichmentStatus =
   * "partial"`, fields_unavailable populated with the missing field
   * names, +1 `affected_deal_enrichment_partial` stderr telemetry
   * line per failed deal. The cited signal quotes from `dealsMap`
   * are always present (they don't go through the adapter), so the
   * prompt's "trace to specific signals" discipline holds even
   * under partial failure.
   */
  async enrichAffectedDeals(opts: {
    dealsMap: Map<string, AffectedSignalRow[]>;
    adapter: Pick<CrmAdapter, "getDeal" | "listDealContacts">;
    limit?: number;
    /**
     * Optional job_id anchor surfaced into the partial-enrichment
     * telemetry shape so per-job audit reads can correlate.
     */
    jobId?: string | null;
  }): Promise<readonly EnrichedAffectedDeal[]> {
    const limit = opts.limit ?? 25;
    const dealIds = [...opts.dealsMap.keys()].slice(0, limit);

    // ── Single batch MEDDPICC read across all dealIds.
    type MeddpiccRow = {
      hubspot_deal_id: string;
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
    let meddpiccRows: MeddpiccRow[] = [];
    if (dealIds.length > 0) {
      try {
        meddpiccRows = await this.sql<MeddpiccRow[]>`
          SELECT hubspot_deal_id,
                 metrics_score, economic_buyer_score, decision_criteria_score,
                 decision_process_score, paper_process_score, identify_pain_score,
                 champion_score, competition_score, overall_score,
                 per_dimension_confidence, evidence
            FROM meddpicc_scores
           WHERE hubspot_deal_id = ANY(${dealIds}::text[])
        `;
      } catch (err) {
        // MEDDPICC table is best-effort — empty result lets callers
        // render `(none)`. Telemetry per failure cause.
        console.error(
          JSON.stringify({
            event: "affected_deal_enrichment_partial",
            cause: "meddpicc_batch_failed",
            error_class: err instanceof Error ? err.constructor.name : "unknown",
            error_message: err instanceof Error ? err.message : String(err),
            deal_count: dealIds.length,
            job_id: opts.jobId ?? null,
            ts: new Date().toISOString(),
          }),
        );
        meddpiccRows = [];
      }
    }
    const meddpiccByDealId = new Map<string, MeddpiccRow>();
    for (const row of meddpiccRows) meddpiccByDealId.set(row.hubspot_deal_id, row);

    // ── Per-deal sequential adapter fanout.
    const enriched: EnrichedAffectedDeal[] = [];
    for (const dealId of dealIds) {
      const signals = opts.dealsMap.get(dealId) ?? [];
      const fieldsUnavailable: string[] = [];
      let dealName: string | null = null;
      let companyName: string | null = null;
      let stage: string | null = null;
      let amount: number | null = null;
      let aeName: string | null = null;
      let stakeholders: EnrichedStakeholder[] = [];

      try {
        const deal = await opts.adapter.getDeal(dealId);
        dealName = deal.name ?? null;
        stage = deal.stage ?? null;
        amount = typeof deal.amount === "number" ? deal.amount : null;
        // Surface ownerId as the AE reference today (full owner-name
        // resolution requires a separate `getUser`-class lookup that
        // isn't on the CrmAdapter interface; Stage 3 promotes this to
        // a real owner-name lookup).
        aeName = deal.ownerId ?? null;
      } catch (err) {
        fieldsUnavailable.push("dealName", "stage", "amount", "aeName");
        console.error(
          JSON.stringify({
            event: "affected_deal_enrichment_partial",
            cause: "get_deal_failed",
            hubspot_deal_id: dealId,
            error_class: err instanceof Error ? err.constructor.name : "unknown",
            error_message: err instanceof Error ? err.message : String(err),
            job_id: opts.jobId ?? null,
            ts: new Date().toISOString(),
          }),
        );
      }

      try {
        const contacts = await opts.adapter.listDealContacts(dealId);
        stakeholders = contacts.slice(0, 5).map((c) => ({
          hubspotContactId: c.hubspotId,
          fullName: [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || c.email || c.hubspotId,
          title: c.title ?? null,
          role: c.role ?? null,
          isPrimary: c.isPrimary === true,
        }));
      } catch (err) {
        fieldsUnavailable.push("stakeholders");
        console.error(
          JSON.stringify({
            event: "affected_deal_enrichment_partial",
            cause: "list_deal_contacts_failed",
            hubspot_deal_id: dealId,
            error_class: err instanceof Error ? err.constructor.name : "unknown",
            error_message: err instanceof Error ? err.message : String(err),
            job_id: opts.jobId ?? null,
            ts: new Date().toISOString(),
          }),
        );
      }

      const meddpiccRow = meddpiccByDealId.get(dealId);
      let meddpicc: EnrichedMeddpiccSummary | null = null;
      if (meddpiccRow) {
        const scoresByDimension: Partial<Record<MeddpiccDimension, number>> = {};
        for (const dim of MEDDPICC_DIMENSION) {
          const key = `${dim}_score` as keyof MeddpiccRow;
          const score = meddpiccRow[key] as number | null | undefined;
          if (typeof score === "number") scoresByDimension[dim] = score;
        }
        meddpicc = {
          scoresByDimension,
          evidence: meddpiccRow.evidence,
          perDimensionConfidence: meddpiccRow.per_dimension_confidence,
          overallScore:
            typeof meddpiccRow.overall_score === "number" ? meddpiccRow.overall_score : null,
        };
      }

      enriched.push({
        hubspotDealId: dealId,
        dealName,
        companyName,
        stage,
        amount,
        aeName,
        stakeholders,
        signals,
        meddpicc,
        enrichmentStatus: fieldsUnavailable.length === 0 ? "full" : "partial",
        fieldsUnavailable,
      });
    }

    return enriched;
  }

  async close(): Promise<void> {
    if (this.ownedSql) {
      await this.sql.end({ timeout: 5 });
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────

  private rejectSignal(
    input: ReceivedSignalInput,
    reason: string,
  ): ReceiveSignalOutcome {
    console.error(
      JSON.stringify({
        event: "signal_received_invalid",
        reason,
        vertical: input.vertical ?? null,
        signal_type: input.signalType ?? null,
        hubspot_deal_id: input.hubspotDealId ?? null,
        ts: new Date().toISOString(),
      }),
    );
    return { kind: "rejected", reason };
  }
}

/**
 * Extract the first sentence of the synthesis text as the
 * `synthesisHeadline` consumers render. The coordinator_synthesis
 * prompt's `synthesis.headline` is one sentence by spec; the row's
 * `synthesis` text column stores it as the first line. If the column
 * holds multi-line text, take everything up to the first newline / period.
 */
function extractHeadline(synthesis: string): string {
  if (!synthesis) return "";
  const firstNewline = synthesis.indexOf("\n");
  if (firstNewline > 0) return synthesis.slice(0, firstNewline).trim();
  return synthesis.trim();
}

/**
 * Split the composite `synthesis` text column into headline +
 * mechanism per the Phase 4 Day 2 Session A WRITE shape:
 * `{headline}\n\nMechanism:\n{mechanism}`. Returns the full text as
 * the headline + empty mechanism when the marker isn't present
 * (legacy rows or future schema variants).
 */
function splitSynthesis(synthesis: string): { headline: string; mechanism: string } {
  if (!synthesis) return { headline: "", mechanism: "" };
  const marker = "\n\nMechanism:\n";
  const idx = synthesis.indexOf(marker);
  if (idx > 0) {
    return {
      headline: synthesis.slice(0, idx).trim(),
      mechanism: synthesis.slice(idx + marker.length).trim(),
    };
  }
  return { headline: extractHeadline(synthesis), mechanism: "" };
}
