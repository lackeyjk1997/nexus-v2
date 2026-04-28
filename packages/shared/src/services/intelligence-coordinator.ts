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
