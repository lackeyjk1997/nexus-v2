/**
 * Tool-use schema for prompt #15 (05-deal-fitness). Tool name matches the
 * prompt body verbatim: `analyze_deal_fitness`.
 *
 * Output shape mirrors `packages/prompts/files/05-deal-fitness.md`
 * Tool-Use Schema section (v1.2.0). Demo 2026-06-10 Run 2 wires this into
 * the new deal_fitness job handler. Per §2.13.1 Principle 6 the reasoning
 * scaffold (`analysis_passes`) is the first property.
 *
 * Numeric category scores are NOT model output — the handler computes them
 * deterministically from detected events + confidence (the model detects,
 * the service scores).
 */

import { ODEAL_CATEGORY } from "../../enums/odeal-category";

export const ODEAL_EVENT_KEYS = [
  // business_fit
  "buyer_shares_kpis",
  "buyer_volunteers_metrics",
  "buyer_asks_pricing",
  "buyer_introduces_economic_buyer",
  "buyer_co_creates_business_case",
  "buyer_references_competitors",
  // emotional_fit
  "buyer_initiates_contact",
  "buyer_response_accelerating",
  "buyer_shares_personal_context",
  "buyer_gives_coaching",
  "buyer_uses_ownership_language",
  "buyer_follows_through",
  // technical_fit
  "buyer_shares_architecture",
  "buyer_grants_access",
  "buyer_technical_team_joins",
  "buyer_asks_integration",
  "buyer_security_review",
  "buyer_shares_compliance",
  // readiness_fit
  "buyer_identifies_sponsor",
  "buyer_discusses_rollout",
  "buyer_asks_onboarding",
  "buyer_shares_timeline",
  "buyer_introduces_implementation",
  "buyer_addresses_blockers",
  "buyer_asks_references",
] as const;

export type OdealEventKey = (typeof ODEAL_EVENT_KEYS)[number];

export const dealFitnessTool = {
  name: "analyze_deal_fitness",
  description:
    "Analyze the deal timeline for the 25 canonical oDeal events. Return all 25 (detected + not_yet) plus commitment tracking, language progression, stakeholder engagement, buyer momentum, conversation signals.",
  input_schema: {
    type: "object" as const,
    properties: {
      analysis_passes: {
        type: "object" as const,
        description:
          "Walk through the 5 reasoning passes. Not shown to the user; used to validate that the analysis is grounded.",
        properties: {
          pass_1_participants: { type: "string" as const },
          pass_2_events_summary: { type: "string" as const },
          pass_3_commitments_summary: { type: "string" as const },
          pass_4_language_summary: { type: "string" as const },
          pass_5_stakeholders_summary: { type: "string" as const },
        },
        required: [
          "pass_1_participants",
          "pass_2_events_summary",
          "pass_3_commitments_summary",
          "pass_4_language_summary",
          "pass_5_stakeholders_summary",
        ] as const,
      },
      events: {
        type: "array" as const,
        minItems: 25,
        maxItems: 25,
        description:
          "All 25 canonical events; status either detected or not_yet for each.",
        items: {
          type: "object" as const,
          properties: {
            event_key: {
              type: "string" as const,
              enum: [...ODEAL_EVENT_KEYS],
            },
            fit_category: {
              type: "string" as const,
              enum: [...ODEAL_CATEGORY],
            },
            status: { type: "string" as const, enum: ["detected", "not_yet"] },
            confidence: {
              type: ["number", "null"] as const,
              minimum: 0.5,
              maximum: 1.0,
              description: "Required when status is detected; null when not_yet.",
            },
            detected_at: { type: ["string", "null"] as const },
            contact_name: { type: ["string", "null"] as const },
            contact_title: { type: ["string", "null"] as const },
            detection_sources: {
              type: ["array", "null"] as const,
              items: { type: "string" as const, enum: ["transcript", "email"] },
            },
            evidence_snippets: {
              type: ["array", "null"] as const,
              minItems: 1,
              items: {
                type: "object" as const,
                properties: {
                  source_label: { type: "string" as const },
                  source_type: {
                    type: "string" as const,
                    enum: ["transcript", "email"],
                  },
                  source_id: { type: "string" as const },
                  quote: {
                    type: "string" as const,
                    description: "Verbatim quote from the source.",
                  },
                  context: { type: "string" as const },
                },
                required: [
                  "source_label",
                  "source_type",
                  "source_id",
                  "quote",
                  "context",
                ] as const,
              },
              description: "Required when status is detected.",
            },
            event_description: { type: ["string", "null"] as const },
            coaching_note: {
              type: ["string", "null"] as const,
              description:
                "Required when status is not_yet. Specific to this deal's context.",
            },
          },
          required: ["event_key", "fit_category", "status"] as const,
        },
      },
      commitment_tracking: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            promise: { type: "string" as const },
            promised_by: { type: "string" as const },
            promised_on: { type: "string" as const },
            promise_source_label: { type: "string" as const },
            promise_source_id: { type: "string" as const },
            status: {
              type: "string" as const,
              enum: ["kept", "broken", "pending"],
            },
            resolution: { type: ["string", "null"] as const },
            resolution_source_label: { type: ["string", "null"] as const },
            resolution_source_id: { type: ["string", "null"] as const },
          },
          required: [
            "promise",
            "promised_by",
            "promised_on",
            "promise_source_label",
            "promise_source_id",
            "status",
          ] as const,
        },
      },
      language_progression: {
        type: "object" as const,
        properties: {
          per_call_ownership: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                call_index: { type: "integer" as const, minimum: 1 },
                call_label: { type: "string" as const },
                we_our_pct: { type: "integer" as const, minimum: 0, maximum: 100 },
                your_product_pct: {
                  type: "integer" as const,
                  minimum: 0,
                  maximum: 100,
                },
                sample_quotes: {
                  type: "array" as const,
                  items: { type: "string" as const },
                },
              },
              required: [
                "call_index",
                "call_label",
                "we_our_pct",
                "your_product_pct",
                "sample_quotes",
              ] as const,
            },
          },
          trend: { type: "string" as const },
          overall_ownership_percent: {
            type: "integer" as const,
            minimum: 0,
            maximum: 100,
          },
        },
        required: ["per_call_ownership", "trend", "overall_ownership_percent"] as const,
      },
      stakeholder_engagement: {
        type: "object" as const,
        properties: {
          contacts: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                name: { type: "string" as const },
                title: { type: ["string", "null"] as const },
                first_appearance: { type: "string" as const },
                introduced_by: { type: "string" as const },
                role: {
                  type: "string" as const,
                  enum: [
                    "champion",
                    "economic_buyer",
                    "decision_maker",
                    "technical_evaluator",
                    "end_user",
                    "procurement",
                    "influencer",
                    "blocker",
                    "coach",
                  ],
                },
                weeks_active: { type: "integer" as const, minimum: 0 },
                calls_joined: { type: "integer" as const, minimum: 0 },
              },
              required: [
                "name",
                "first_appearance",
                "introduced_by",
                "role",
                "weeks_active",
                "calls_joined",
              ] as const,
            },
          },
          expansion_pattern: { type: "string" as const },
          multithreading_score: { type: "integer" as const, minimum: 1, maximum: 10 },
        },
        required: ["contacts", "expansion_pattern", "multithreading_score"] as const,
      },
      buyer_momentum: {
        type: "object" as const,
        properties: {
          response_time_by_week: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                week: { type: "integer" as const, minimum: 0 },
                avg_hours: { type: "number" as const, minimum: 0 },
              },
              required: ["week", "avg_hours"] as const,
            },
          },
          buyer_initiated_pct: {
            type: "integer" as const,
            minimum: 0,
            maximum: 100,
          },
          trend: {
            type: "string" as const,
            enum: ["accelerating", "steady", "decelerating", "insufficient_data"],
          },
          insight: { type: "string" as const },
        },
        required: [
          "response_time_by_week",
          "buyer_initiated_pct",
          "trend",
          "insight",
        ] as const,
      },
      conversation_signals: {
        type: "object" as const,
        properties: {
          ownership_trajectory: { type: "string" as const },
          deal_temperament: { type: "string" as const },
          key_moments: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                date: { type: "string" as const },
                source_label: { type: "string" as const },
                signal_strength: {
                  type: "string" as const,
                  enum: ["positive", "neutral", "concerning"],
                },
                description: { type: "string" as const },
              },
              required: [
                "date",
                "source_label",
                "signal_strength",
                "description",
              ] as const,
            },
          },
          deal_insight: { type: "string" as const },
        },
        required: ["ownership_trajectory", "deal_temperament", "deal_insight"] as const,
      },
      overall_assessment: { type: "string" as const },
    },
    required: [
      "analysis_passes",
      "events",
      "commitment_tracking",
      "language_progression",
      "stakeholder_engagement",
      "buyer_momentum",
      "conversation_signals",
      "overall_assessment",
    ] as const,
  },
};

export interface DealFitnessEvidenceSnippet {
  source_label: string;
  source_type: "transcript" | "email";
  source_id: string;
  quote: string;
  context: string;
}

export interface DealFitnessEvent {
  event_key: OdealEventKey;
  fit_category: (typeof ODEAL_CATEGORY)[number];
  status: "detected" | "not_yet";
  confidence?: number | null;
  detected_at?: string | null;
  contact_name?: string | null;
  contact_title?: string | null;
  detection_sources?: Array<"transcript" | "email"> | null;
  evidence_snippets?: DealFitnessEvidenceSnippet[] | null;
  event_description?: string | null;
  coaching_note?: string | null;
}

export interface DealFitnessOutput {
  analysis_passes: Record<string, string>;
  events: DealFitnessEvent[];
  commitment_tracking: Array<{
    promise: string;
    promised_by: string;
    promised_on: string;
    promise_source_label: string;
    promise_source_id: string;
    status: "kept" | "broken" | "pending";
    resolution?: string | null;
    resolution_source_label?: string | null;
    resolution_source_id?: string | null;
  }>;
  language_progression: {
    per_call_ownership: Array<{
      call_index: number;
      call_label: string;
      we_our_pct: number;
      your_product_pct: number;
      sample_quotes: string[];
    }>;
    trend: string;
    overall_ownership_percent: number;
  };
  stakeholder_engagement: {
    contacts: Array<Record<string, unknown>>;
    expansion_pattern: string;
    multithreading_score: number;
  };
  buyer_momentum: {
    response_time_by_week: Array<{ week: number; avg_hours: number }>;
    buyer_initiated_pct: number;
    trend: "accelerating" | "steady" | "decelerating" | "insufficient_data";
    insight: string;
  };
  conversation_signals: {
    ownership_trajectory: string;
    deal_temperament: string;
    key_moments?: Array<Record<string, unknown>>;
    deal_insight: string;
  };
  overall_assessment: string;
}
