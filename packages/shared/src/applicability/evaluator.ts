/**
 * Applicability rule evaluator — Phase 4 Day 1 Session A.
 *
 * Per DECISIONS.md §2.21 (applicability gating LOCKED — every surface
 * passes three gates: stage, temporal, precondition) + Guardrail 32 (rules
 * structured JSONB, never prose) + the Phase 4 Day 1 Session A kickoff
 * Decision 4 (undefined field = no gate).
 *
 * The evaluator walks each clause of an `ApplicabilityRule` against a
 * `DealState` projection + a recent-event-stream slice, returning
 * `{pass, reasons[]}` where reasons cite the specific clause that
 * rejected. Caller responsible for fetching DealState (via
 * `DealIntelligence.getDealState(dealId)`) and the event stream slice
 * (typically recent `signal_detected` events for `signalTypePresent` /
 * `signalTypeAbsent` clauses); evaluator does NOT fetch.
 *
 * Foundation-review anchor: Output 4 C2.
 */
import type { DealStage } from "../enums/deal-stage";
import type { MeddpiccDimension } from "../enums/meddpicc-dimension";
import type { SignalTaxonomy } from "../enums/signal-taxonomy";
import type { Vertical } from "../enums/vertical";

import type { ApplicabilityRule } from "./dsl";

/**
 * The data structure passed to the evaluator. Read once via
 * `DealIntelligence.getDealState(dealId)` per applicability check; cached
 * at the call boundary (admission engine batches per-rep digest checks).
 *
 * CRM-agnostic on its surface (vertical / stage / amount / dealSizeBand /
 * employeeCountBand are abstract identifiers); SalesforceAdapter's
 * `getDealState` lands as a parallel implementation in productization
 * Stage 3, not a rewrite.
 *
 * `meddpiccScores` is `Partial<Record<dim, number>>` — null/undefined dims
 * omitted (a dim with `null` score from the meddpicc_scores table doesn't
 * appear in the map at all). Phase 4 Day 1 Session A locks this shape.
 *
 * `openSignals` is the deal's currently-open `signal_detected` events. Day
 * 1 treats all non-archived signal_detected events as open; Phase 4+ may
 * refine via `signal_resolved` event type.
 */
export interface DealState {
  hubspotDealId: string;
  vertical: Vertical | null;
  stage: DealStage | null;
  amount: number | null;
  dealSizeBand: string | null;
  employeeCountBand: string | null;
  daysInStage: number;
  daysSinceCreated: number;
  closeStatus: "not_closed" | "closed_won" | "closed_lost";
  meddpiccScores: Partial<Record<MeddpiccDimension, number>>;
  openSignals: ReadonlyArray<{
    signalType: SignalTaxonomy;
    detectedAt: Date;
    sourceRef: string;
  }>;
  activeExperimentAssignments: ReadonlyArray<string>;
}

/**
 * Minimal event-stream entry the evaluator needs to check
 * signalTypePresent / signalTypeAbsent. Caller provides a filtered slice
 * of `deal_events` rows. Phase 4 Day 1 Session B's admission engine builds
 * this slice from the latest N `signal_detected` events for the deal; for
 * Day 1 unit tests, fixtures construct it directly.
 */
export interface EvaluatorEvent {
  type: string; // dealEventTypeEnum value (e.g., 'signal_detected')
  signalType?: SignalTaxonomy | null;
  createdAt: Date;
}

export interface ApplicabilityResult {
  pass: boolean;
  reasons: string[];
}

/**
 * Evaluate a rule against a deal state + event stream slice.
 *
 * Returns `{pass: true, reasons: []}` when no clause rejects; otherwise
 * `{pass: false, reasons: [...]}` with one reason string per rejecting
 * clause. Undefined rule fields produce no reasons (Decision 4 — undefined
 * = no gate).
 *
 * Per Phase 4 Day 1 Session A kickoff: the evaluator does NOT cache
 * results, write to `applicability_rejections`, or fetch any data. Caller
 * (admission engine in Session B) handles those concerns.
 */
export function applies(input: {
  rule: ApplicabilityRule;
  dealState: DealState;
  eventStream: readonly EvaluatorEvent[];
}): ApplicabilityResult {
  const { rule, dealState, eventStream } = input;
  const reasons: string[] = [];

  // ── stages ────────────────────────────────────────────────────────────
  if (rule.stages && rule.stages.length > 0) {
    if (!dealState.stage || !rule.stages.includes(dealState.stage)) {
      reasons.push(
        `gated: deal in stage=${dealState.stage ?? "unknown"}, rule requires stages=${JSON.stringify(rule.stages)}`,
      );
    }
  }

  // ── verticals ─────────────────────────────────────────────────────────
  if (rule.verticals && rule.verticals.length > 0) {
    if (!dealState.vertical || !rule.verticals.includes(dealState.vertical)) {
      reasons.push(
        `gated: deal in vertical=${dealState.vertical ?? "unknown"}, rule requires verticals=${JSON.stringify(rule.verticals)}`,
      );
    }
  }

  // ── temporal: days in stage ──────────────────────────────────────────
  if (
    typeof rule.minDaysInStage === "number" &&
    dealState.daysInStage < rule.minDaysInStage
  ) {
    reasons.push(
      `gated: daysInStage=${dealState.daysInStage}, rule requires >= ${rule.minDaysInStage}`,
    );
  }
  if (
    typeof rule.maxDaysInStage === "number" &&
    dealState.daysInStage > rule.maxDaysInStage
  ) {
    reasons.push(
      `gated: daysInStage=${dealState.daysInStage}, rule requires <= ${rule.maxDaysInStage}`,
    );
  }

  // ── temporal: days since created (§1.18 "48-hour observation" rule) ──
  if (
    typeof rule.minDaysSinceCreated === "number" &&
    dealState.daysSinceCreated < rule.minDaysSinceCreated
  ) {
    reasons.push(
      `gated: daysSinceCreated=${dealState.daysSinceCreated}, rule requires >= ${rule.minDaysSinceCreated}`,
    );
  }

  // ── close status ──────────────────────────────────────────────────────
  if (rule.requires && dealState.closeStatus !== rule.requires) {
    reasons.push(
      `gated: closeStatus=${dealState.closeStatus}, rule requires ${rule.requires}`,
    );
  }

  // ── MEDDPICC guards ───────────────────────────────────────────────────
  if (rule.meddpiccGuards && rule.meddpiccGuards.length > 0) {
    for (const guard of rule.meddpiccGuards) {
      const score = dealState.meddpiccScores[guard.dimension];
      if (typeof score !== "number") {
        // Conservative default: unscored dim doesn't meet threshold.
        reasons.push(
          `gated: meddpicc.${guard.dimension} not yet captured, rule requires ${guard.op} ${guard.value}`,
        );
        continue;
      }
      const passes =
        guard.op === "lt"
          ? score < guard.value
          : guard.op === "lte"
            ? score <= guard.value
            : guard.op === "gte"
              ? score >= guard.value
              : guard.op === "gt"
                ? score > guard.value
                : guard.op === "eq"
                  ? score === guard.value
                  : false;
      if (!passes) {
        reasons.push(
          `gated: meddpicc.${guard.dimension}=${score}, rule requires ${guard.op} ${guard.value}`,
        );
      }
    }
  }

  // ── signal type presence ──────────────────────────────────────────────
  if (
    (rule.signalTypePresent && rule.signalTypePresent.length > 0) ||
    (rule.signalTypeAbsent && rule.signalTypeAbsent.length > 0)
  ) {
    const signalTypesInStream = new Set<SignalTaxonomy>();
    for (const e of eventStream) {
      if (e.type === "signal_detected" && e.signalType) {
        signalTypesInStream.add(e.signalType);
      }
    }
    if (rule.signalTypePresent) {
      for (const required of rule.signalTypePresent) {
        if (!signalTypesInStream.has(required)) {
          reasons.push(
            `gated: no open signal_detected of type=${required}, rule requires presence`,
          );
        }
      }
    }
    if (rule.signalTypeAbsent) {
      for (const forbidden of rule.signalTypeAbsent) {
        if (signalTypesInStream.has(forbidden)) {
          reasons.push(
            `gated: signal_detected of type=${forbidden} present, rule requires absence`,
          );
        }
      }
    }
  }

  return { pass: reasons.length === 0, reasons };
}
