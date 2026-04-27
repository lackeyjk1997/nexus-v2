/**
 * Tool-use schema for prompt #14A (06a-close-analysis-continuous, REWRITTEN).
 * Tool name matches the prompt body verbatim: `update_deal_theory`.
 *
 * Mirrors the .md schema at packages/prompts/files/06a-close-analysis-continuous.md
 * (lines 73-156) verbatim. Each top-level section is OPTIONAL + nullable per
 * the .md body's "Emit only the changes — sections you do not change should
 * be omitted from the tool call (omitted = unchanged from prior theory)"
 * semantics.
 *
 * §2.13.1 calendared decision: 06a left as-is for Phase 5 Day 1 review
 * (no reasoning_trace top-level field). Per-section `triggered_by_quote`
 * provides micro-reasoning. If Phase 5 Day 1 review concludes weak
 * reasoning in practice, that's a separate version-bump (1.1.0 → 1.2.0).
 *
 * `dimension` enum imports MEDDPICC_DIMENSION per Guardrail 22 single-source
 * (closes the camelCase + 7-vs-8 drift via schema-side validation, same
 * pattern as score-meddpicc.ts).
 */
import {
  MEDDPICC_DIMENSION,
  type MeddpiccDimension,
} from "../../enums/meddpicc-dimension";

export const updateDealTheoryTool = {
  name: "update_deal_theory",
  description:
    "Emit incremental updates to the deal theory. Omit sections that are unchanged from prior theory.",
  input_schema: {
    type: "object" as const,
    properties: {
      working_hypothesis: {
        type: ["object", "null"] as const,
        properties: {
          new_claim: {
            type: "string" as const,
            description:
              "Updated one-sentence central claim. Required if this section is included.",
          },
          shift_from_prior: {
            type: ["string", "null"] as const,
            description:
              "If this is a meaningful shift from the prior claim, one sentence on what changed. Null for incremental refinement.",
          },
          triggered_by_quote: {
            type: "string" as const,
            description:
              "Quote or data point from the new data that caused the shift.",
          },
        },
        required: ["new_claim", "triggered_by_quote"],
      },
      threats_changed: {
        type: ["array", "null"] as const,
        items: {
          type: "object" as const,
          properties: {
            description: { type: "string" as const },
            severity: {
              type: "string" as const,
              enum: ["low", "medium", "high", "critical"] as const,
            },
            trend: {
              type: "string" as const,
              enum: ["new", "escalating", "steady", "resolving"] as const,
            },
            supporting_evidence: {
              type: "array" as const,
              items: { type: "string" as const },
              minItems: 1,
            },
            change_type: {
              type: "string" as const,
              enum: ["added", "modified", "resolved"] as const,
            },
          },
          required: [
            "description",
            "severity",
            "trend",
            "supporting_evidence",
            "change_type",
          ],
        },
      },
      tailwinds_changed: {
        type: ["array", "null"] as const,
        items: {
          type: "object" as const,
          properties: {
            description: { type: "string" as const },
            trend: {
              type: "string" as const,
              enum: ["new", "strengthening", "steady", "weakening"] as const,
            },
            supporting_evidence: {
              type: "array" as const,
              items: { type: "string" as const },
              minItems: 1,
            },
            change_type: {
              type: "string" as const,
              enum: ["added", "modified", "removed"] as const,
            },
          },
          required: ["description", "trend", "supporting_evidence", "change_type"],
        },
      },
      meddpicc_trajectory_changed: {
        type: ["array", "null"] as const,
        items: {
          type: "object" as const,
          properties: {
            dimension: {
              type: "string" as const,
              enum: MEDDPICC_DIMENSION,
              description:
                "Snake_case MEDDPICC dimension matching MEDDPICC_DIMENSION enum.",
            },
            current_confidence: {
              type: "integer" as const,
              minimum: 0,
              maximum: 100,
            },
            direction: {
              type: "string" as const,
              enum: ["improving", "steady", "weakening"] as const,
            },
            triggered_by_quote: { type: "string" as const },
          },
          required: [
            "dimension",
            "current_confidence",
            "direction",
            "triggered_by_quote",
          ],
        },
      },
      stakeholder_confidence_changed: {
        type: ["array", "null"] as const,
        items: {
          type: "object" as const,
          properties: {
            contact_name: { type: "string" as const },
            engagement_read: {
              type: "string" as const,
              enum: ["hot", "warm", "cold", "departed"] as const,
            },
            direction: {
              type: "string" as const,
              enum: [
                "strengthening",
                "steady",
                "weakening",
                "newly_introduced",
                "newly_silent",
              ] as const,
            },
            triggered_by_quote: { type: "string" as const },
          },
          required: [
            "contact_name",
            "engagement_read",
            "direction",
            "triggered_by_quote",
          ],
        },
      },
      open_questions_changed: {
        type: ["array", "null"] as const,
        items: {
          type: "object" as const,
          properties: {
            question: { type: "string" as const },
            what_would_resolve: { type: "string" as const },
            change_type: {
              type: "string" as const,
              enum: ["added", "resolved"] as const,
            },
          },
          required: ["question", "what_would_resolve", "change_type"],
        },
      },
    },
  },
} as const;

export interface DealTheoryWorkingHypothesisChange {
  new_claim: string;
  shift_from_prior?: string | null;
  triggered_by_quote: string;
}

export interface DealTheoryThreatChange {
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  trend: "new" | "escalating" | "steady" | "resolving";
  supporting_evidence: string[];
  change_type: "added" | "modified" | "resolved";
}

export interface DealTheoryTailwindChange {
  description: string;
  trend: "new" | "strengthening" | "steady" | "weakening";
  supporting_evidence: string[];
  change_type: "added" | "modified" | "removed";
}

export interface DealTheoryMeddpiccTrajectoryChange {
  dimension: MeddpiccDimension;
  current_confidence: number;
  direction: "improving" | "steady" | "weakening";
  triggered_by_quote: string;
}

export interface DealTheoryStakeholderConfidenceChange {
  contact_name: string;
  engagement_read: "hot" | "warm" | "cold" | "departed";
  direction:
    | "strengthening"
    | "steady"
    | "weakening"
    | "newly_introduced"
    | "newly_silent";
  triggered_by_quote: string;
}

export interface DealTheoryOpenQuestionChange {
  question: string;
  what_would_resolve: string;
  change_type: "added" | "resolved";
}

/**
 * The change-set output from one 06a invocation. Per the .md body's
 * omitted-equals-unchanged semantics, every top-level field is optional;
 * an empty object `{}` is a valid output meaning "no theory changes
 * triggered by this data point" (matches the .md's "Empty changes are
 * valid output" discipline).
 */
export interface UpdateDealTheoryOutput {
  working_hypothesis?: DealTheoryWorkingHypothesisChange | null;
  threats_changed?: DealTheoryThreatChange[] | null;
  tailwinds_changed?: DealTheoryTailwindChange[] | null;
  meddpicc_trajectory_changed?: DealTheoryMeddpiccTrajectoryChange[] | null;
  stakeholder_confidence_changed?:
    | DealTheoryStakeholderConfidenceChange[]
    | null;
  open_questions_changed?: DealTheoryOpenQuestionChange[] | null;
}
