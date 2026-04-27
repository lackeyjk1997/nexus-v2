/**
 * Applicability gating module — Phase 4 Day 1 Session A.
 *
 * Per DECISIONS.md §2.21 (applicability gating LOCKED) + Guardrail 32
 * (rules are structured JSONB, never prose). Foundation-review C2.
 */
export {
  ApplicabilityRuleSchema,
  parseApplicabilityRule,
  type ApplicabilityRule,
} from "./dsl";

export {
  applies,
  type DealState,
  type EvaluatorEvent,
  type ApplicabilityResult,
} from "./evaluator";
