/**
 * Tool-use schema for prompt #25 (04-coordinator-synthesis). Tool name
 * matches the prompt body verbatim: `synthesize_coordinator_pattern`.
 *
 * Output shape mirrors `packages/prompts/files/04-coordinator-synthesis.md`
 * Tool-Use Schema section. Phase 4 Day 2 Session A wires this tool into
 * the new coordinator_synthesis job handler. Per §2.13.1 Principle 6
 * `reasoning_trace` is the first property.
 *
 * Output ceiling defense — synthesis-class temp 0.3, max_tokens=2500 per
 * prompt front-matter. Reactive bump per §2.13.1 only if first live run
 * hits stop_reason=max_tokens.
 */

export const coordinatorSynthesisTool = {
  name: "synthesize_coordinator_pattern",
  description:
    "Synthesize the cross-deal pattern with mechanism diagnosis, per-deal recommendations, and calibrated portfolio impact.",
  input_schema: {
    type: "object" as const,
    properties: {
      reasoning_trace: {
        type: "string" as const,
        description:
          "Walk through the 5 reasoning steps from the system prompt: mechanism, lineage, per-deal application, portfolio impact, constraint check. Three to six sentences. Not shown to the user.",
      },
      synthesis: {
        type: "object" as const,
        properties: {
          headline: {
            type: "string" as const,
            description:
              "One sentence stating the mechanism in concrete terms. Will appear in the Intelligence dashboard pattern card.",
          },
          mechanism: {
            type: "string" as const,
            description:
              "Two to four sentences naming what is actually driving the convergence across these deals. Cite specific signals (speakers, quotes, deal names).",
          },
          lineage: {
            type: "object" as const,
            properties: {
              is_extension_of_prior: { type: "boolean" as const },
              prior_pattern_id: {
                type: ["string", "null"] as const,
                description:
                  "If is_extension_of_prior is true, the patternId from PRIOR SYNTHESIZED PATTERNS that this evolves.",
              },
              lineage_explanation: {
                type: ["string", "null"] as const,
                description:
                  "If is_extension_of_prior is true, one sentence explaining how this pattern extends/intensifies/branches the prior.",
              },
            },
            required: ["is_extension_of_prior"] as const,
          },
        },
        required: ["headline", "mechanism", "lineage"] as const,
      },
      recommendations: {
        type: "array" as const,
        minItems: 1,
        maxItems: 6,
        items: {
          type: "object" as const,
          properties: {
            target_deal_id: {
              type: ["string", "null"] as const,
              description:
                "UUID of the affected deal this recommendation is for. Null only when application is vertical_wide or org_level.",
            },
            target_deal_name: {
              type: ["string", "null"] as const,
              description: "Human-readable name corresponding to target_deal_id.",
            },
            priority: {
              type: "string" as const,
              enum: ["urgent", "this_week", "queued"] as const,
              description:
                "urgent: action needed before next call (within ~48h). this_week: needed within the week. queued: longer horizon.",
            },
            application: {
              type: "string" as const,
              enum: ["deal_specific", "vertical_wide", "org_level"] as const,
            },
            action: {
              type: "string" as const,
              description:
                "Specific, deal-grounded action. Must name a person, an artifact, or a window. Generic playbook language is rejected.",
            },
            references_experiment_id: {
              type: ["string", "null"] as const,
              description:
                "If this recommendation amplifies/extends an active experiment, the experiment's playbook_ideas ID.",
            },
            cited_signal_quotes: {
              type: "array" as const,
              items: { type: "string" as const },
              minItems: 1,
              description:
                "Verbatim quotes from the affected deals' signals that justify this recommendation.",
            },
          },
          required: [
            "priority",
            "application",
            "action",
            "cited_signal_quotes",
          ] as const,
        },
      },
      arr_impact: {
        type: "object" as const,
        properties: {
          directly_affected_deals: { type: "integer" as const, minimum: 1 },
          at_risk_comparable_deals: { type: "integer" as const, minimum: 0 },
          multiplier: {
            type: "number" as const,
            minimum: 1.0,
            description:
              "(directly_affected + at_risk) / directly_affected. Floor at 1.0.",
          },
          calculation: {
            type: "string" as const,
            description:
              "Explicit math: '(N + M) / N = X.X'. Names which at-risk deals contributed.",
          },
          confidence: {
            type: "string" as const,
            enum: ["high", "medium", "low"] as const,
            description:
              "How confident the multiplier is. Low when at-risk identification relied on heuristic matching with limited signal.",
          },
        },
        required: [
          "directly_affected_deals",
          "at_risk_comparable_deals",
          "multiplier",
          "calculation",
          "confidence",
        ] as const,
      },
      constraint_acknowledgment: {
        type: "object" as const,
        properties: {
          conflicts_with_directive: {
            type: ["string", "null"] as const,
            description:
              "If any recommendation conflicts with an active manager directive, name the directive. Null otherwise.",
          },
          amplifies_experiment_ids: {
            type: "array" as const,
            items: { type: "string" as const },
            description:
              "Experiment IDs whose tactics this synthesis recommends amplifying.",
          },
        },
        required: ["amplifies_experiment_ids"] as const,
      },
    },
    required: [
      "reasoning_trace",
      "synthesis",
      "recommendations",
      "arr_impact",
      "constraint_acknowledgment",
    ] as const,
  },
} as const;

export interface CoordinatorSynthesisRecommendation {
  target_deal_id?: string | null;
  target_deal_name?: string | null;
  priority: "urgent" | "this_week" | "queued";
  application: "deal_specific" | "vertical_wide" | "org_level";
  action: string;
  references_experiment_id?: string | null;
  cited_signal_quotes: string[];
}

export interface CoordinatorSynthesisOutput {
  reasoning_trace: string;
  synthesis: {
    headline: string;
    mechanism: string;
    lineage: {
      is_extension_of_prior: boolean;
      prior_pattern_id?: string | null;
      lineage_explanation?: string | null;
    };
  };
  recommendations: CoordinatorSynthesisRecommendation[];
  arr_impact: {
    directly_affected_deals: number;
    at_risk_comparable_deals: number;
    multiplier: number;
    calculation: string;
    confidence: "high" | "medium" | "low";
  };
  constraint_acknowledgment: {
    conflicts_with_directive?: string | null;
    amplifies_experiment_ids: string[];
  };
}
