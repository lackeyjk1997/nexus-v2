/**
 * IntelligenceCoordinator service — skeleton for Phase 3 Day 4 Session A.
 *
 * Phase 4 Day 2 implements the real coordinator: scheduled (pg_cron) +
 * on-demand pattern detection across deals; per DECISIONS.md §2.17
 * coordinator_patterns is the authoritative table; per §2.16 the
 * coordinator reads from `signal_detected` events to find recurring
 * cross-deal patterns and emits `coordinator_patterns` rows + per-deal
 * `coordinated_intel_received` events.
 *
 * Day 4 Session A lands the skeleton service so Day 4 Session B's
 * pipeline step 5 (`coordinator_signal`) has a concrete entry point.
 * Today's `receiveSignal` is a no-op — the coordinator's actual logic
 * lives in Phase 4. Today's `getActivePatterns` returns an empty array
 * — readers (call-prep orchestrator, 01-detect-signals'
 * `${activePatternsBlock}`) treat empty as `(none)` per the documented
 * convention in those prompt files.
 *
 * Why a skeleton service rather than a stub method on DealIntelligence
 * or a no-op call site:
 *  1. Mirrors the DealIntelligence skeleton precedent (Pre-Phase 3
 *     Session 0-B). Same constructor shape, same `{ databaseUrl, sql? }`
 *     injection seam, same `close()` discipline.
 *  2. Gives Phase 4 Day 2 a single concrete file + interface to flesh
 *     out, with a clear search-to-find-the-wiring path from the
 *     pipeline call site.
 *  3. The coordinator is its own conceptual surface (cross-deal pattern
 *     detection vs. per-deal intelligence), so a peer service rather
 *     than a method on DealIntelligence respects the §2.16 / §2.17
 *     boundary.
 *
 * Foundation-review anchor: not a foundation-review item — Phase 3
 * Day 4 introduces the skeleton as Phase 4 prep.
 */
import postgres from "postgres";

import { type Vertical } from "../enums/vertical";

export interface IntelligenceCoordinatorOptions {
  databaseUrl: string;
  /** Inject a pre-built postgres client (shared pool, tests). */
  sql?: postgres.Sql;
}

/**
 * Input shape for `receiveSignal`. Captures the fields Phase 4's pattern-
 * detection logic will need (signal type, deal id, evidence quote, source
 * transcript, calling rep). Day 4 doesn't act on any of these — the
 * coordinator's actual reads happen via the event stream — but the
 * interface is locked so Day 4's pipeline call site doesn't need to
 * change when Phase 4 fills in the body.
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
 * deals)`). Day 4's empty return is rendered by callers as `(none)`.
 */
export interface ActivePatternSummary {
  patternId: string;
  signalType: string;
  vertical: Vertical | null;
  synthesisHeadline: string;
  dealCount: number;
}

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
   * Day 4: no-op. Phase 4 Day 2 wires the real implementation — likely
   * either (a) writes a `coordinator_signal_queued` event for a periodic
   * scan to consume, or (b) directly enqueues a `coordinator_synthesis`
   * job when the per-vertical signal count crosses a threshold.
   *
   * The pipeline calls this once per detected signal. Day 4 Session B's
   * call site is a forEach-loop; the no-op makes this cheap.
   *
   * Returns Promise<void> on purpose — Phase 4 may turn this into a
   * fire-and-forget enqueue without changing the call site contract.
   */
  async receiveSignal(input: ReceivedSignalInput): Promise<void> {
    // Reference the input so the linter doesn't complain — Phase 4 will
    // actually use it.
    void input;
  }

  /**
   * Read-side hook for "what patterns are currently active that this
   * deal/vertical's prompts should consider."
   *
   * Day 4: returns []. Phase 4 Day 2 reads from `coordinator_patterns`
   * filtered by lifecycle = 'active' and the supplied vertical / dealIds
   * filter. Callers (06a's ${activePatternsBlock}, future call-prep
   * orchestrator) render empty arrays as `(none)`.
   */
  async getActivePatterns(opts: {
    vertical?: Vertical;
    dealIds?: readonly string[];
  }): Promise<readonly ActivePatternSummary[]> {
    void opts;
    return [];
  }

  async close(): Promise<void> {
    if (this.ownedSql) {
      await this.sql.end({ timeout: 5 });
    }
  }
}
