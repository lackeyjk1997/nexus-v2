/**
 * Applicability rule DSL — Phase 4 Day 1 Session A.
 *
 * Per DECISIONS.md §2.21 (applicability gating LOCKED — every surface passes
 * three gates: stage, temporal, precondition; rules are structured JSONB
 * never prose; Guardrail 32). The Zod schema + inferred TS type lock the
 * structured-data shape. Foundation review C2 sketched this; Phase 4 Day 1
 * Session A locks it verbatim with two edits:
 *   - Added optional `description?: string` field for productization-arc
 *     diagnostic surface (admin dashboard renders rules with their human-
 *     readable description).
 *   - Explicit enum imports from `packages/shared/src/enums/` per Guardrail
 *     22 single-source-of-truth (closes any drift between schema-side enums
 *     and rule-clause enums).
 *
 * Rule semantics:
 *   - Each top-level field is optional. Undefined = "no gate" — the rule
 *     doesn't restrict that dimension. A rule with only `stages: ['discovery']`
 *     passes any deal in discovery regardless of MEDDPICC, signals, or
 *     experiments. Rejection-reason strings cite ONLY the clauses that
 *     rejected; undefined clauses don't appear.
 *   - Multiple clauses set on the same rule are AND-composed (all must
 *     pass).
 *   - Forward-compat: future clauses land via Zod additive extension; rules
 *     authored before a new clause exists pass cleanly because the new
 *     clause is undefined.
 *
 * Productization-arc preservation (PRODUCTIZATION-NOTES.md "Applicability
 * gating as structured JSONB ... scales to enterprise multi-rep without
 * schema change"): the additive-extension pattern means Stage 4 GA's
 * tenant_id discriminator + region restrictions extend without breaking
 * existing rules.
 */
import { z } from "zod";

import { DEAL_STAGES } from "../enums/deal-stage";
import { MEDDPICC_DIMENSION } from "../enums/meddpicc-dimension";
import { SIGNAL_TAXONOMY } from "../enums/signal-taxonomy";
import { VERTICAL } from "../enums/vertical";

export const ApplicabilityRuleSchema = z.object({
  /**
   * Human-readable description of what this rule gates. Surfaces in
   * `applicability_rejections.rule_description` (denormalized for query
   * convenience) and the Phase 5+ admin tuning dashboard.
   */
  description: z.string().optional(),

  /** Deal must be in one of these stages. */
  stages: z.array(z.enum(DEAL_STAGES)).optional(),

  /** Deal's vertical must be one of these. */
  verticals: z.array(z.enum(VERTICAL)).optional(),

  /** Days in current stage must be >= this. */
  minDaysInStage: z.number().int().positive().optional(),

  /** Days in current stage must be <= this. */
  maxDaysInStage: z.number().int().positive().optional(),

  /**
   * Days since deal was created must be >= this. Implements DECISIONS.md
   * §1.18's "first 48 hours observation-only" — set `minDaysSinceCreated:
   * 2` to skip new-deal admission.
   */
  minDaysSinceCreated: z.number().int().positive().optional(),

  /** Deal close status must match this. */
  requires: z.enum(["not_closed", "closed_won", "closed_lost"]).optional(),

  /**
   * MEDDPICC dimension guards. Each guard is an op/value comparison against
   * the deal's current MEDDPICC score for that dimension. If the dimension
   * has no score, the guard rejects (treats unscored as "doesn't meet
   * threshold" — the conservative default).
   */
  meddpiccGuards: z
    .array(
      z.object({
        dimension: z.enum(MEDDPICC_DIMENSION),
        op: z.enum(["lt", "lte", "gte", "gt", "eq"]),
        value: z.number(),
      }),
    )
    .optional(),

  /**
   * Deal's open `signal_detected` events must include at least one of each
   * listed signal type. Caller provides the eventStream slice (typically
   * recent signal_detected events for the deal).
   */
  signalTypePresent: z.array(z.enum(SIGNAL_TAXONOMY)).optional(),

  /**
   * Deal's open `signal_detected` events must NOT include any of these
   * signal types.
   */
  signalTypeAbsent: z.array(z.enum(SIGNAL_TAXONOMY)).optional(),
});

export type ApplicabilityRule = z.infer<typeof ApplicabilityRuleSchema>;

/**
 * Parse + validate a rule from raw JSONB (e.g., `experiments.applicability`,
 * `coordinator_patterns.applicability`). Throws ZodError on shape mismatch.
 *
 * Phase 4 Day 1 Session B's admission engine calls this when reading rules
 * from DB; surfaces the validation failure as a rejection reason
 * (`"rule_invalid: <issue>"`) rather than crashing the admission pass.
 */
export function parseApplicabilityRule(raw: unknown): ApplicabilityRule {
  return ApplicabilityRuleSchema.parse(raw);
}
