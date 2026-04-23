import { SIGNAL_TAXONOMY, type SignalTaxonomy } from "../../enums/signal-taxonomy";

/**
 * Tool-use schema for prompt #21 (detect-signals, rewritten in 04C).
 * Tool name matches the prompt body verbatim: `record_detected_signals`.
 * signal_type enum is the single source of truth — any rogue value fails
 * schema validation before it can reach the database.
 */
export const detectSignalsTool = {
  name: "record_detected_signals",
  description:
    "Record the signals detected in this transcript and the per-stakeholder insights for buyer-side participants.",
  input_schema: {
    type: "object" as const,
    properties: {
      reasoning_trace: {
        type: "string" as const,
        description:
          "2-4 sentences: which candidate signals you considered, which you admitted into the final set, and why. Per 04C Principle 6 — reasoning-first field for classification-with-judgment prompts. Populated BEFORE the signals array. Required even when signals array is empty — explain the empty-output case.",
      },
      signals: {
        type: "array" as const,
        maxItems: 10,
        items: {
          type: "object" as const,
          properties: {
            signal_type: {
              type: "string" as const,
              enum: SIGNAL_TAXONOMY,
              description: "Single canonical signal type from SignalTaxonomy.",
            },
            summary: {
              type: "string" as const,
              description: "One-sentence summary of the signal in the rep's voice.",
            },
            evidence_quote: {
              type: "string" as const,
              description:
                "Verbatim quote from the transcript supporting this signal. Must be the actual words spoken.",
            },
            source_speaker: {
              type: "string" as const,
              description:
                "Name of the buyer-side speaker who said the quote, exactly as listed in KNOWN BUYER-SIDE CONTACTS, or 'unidentified speaker' if attribution is uncertain.",
            },
            urgency: {
              type: "string" as const,
              enum: ["low", "medium", "high", "critical"] as const,
            },
            confidence: {
              type: "number" as const,
              minimum: 0.5,
              maximum: 1.0,
              description:
                "Per the calibration scale in the system prompt. Below 0.5 do not emit.",
            },
            rationale: {
              type: "string" as const,
              description:
                "One sentence explaining why this classification fits per the type definitions and current deal context.",
            },
            competitor_name: {
              type: ["string", "null"] as const,
              description:
                "If signal_type is competitive_intel, the competitor named. Otherwise null.",
            },
            recurs_open_signal_id: {
              type: ["string", "null"] as const,
              description:
                "If this signal is a recurrence of an open signal on the deal, the existing observation ID. Otherwise null.",
            },
            matches_pattern_id: {
              type: ["string", "null"] as const,
              description:
                "If this signal aligns with an active coordinator pattern for the vertical, the coordinator_patterns row ID. Otherwise null.",
            },
            matches_experiment_id: {
              type: ["string", "null"] as const,
              description:
                "If this signal aligns with a tactic from an active experiment the rep is testing, the playbook_ideas row ID. Otherwise null.",
            },
          },
          required: [
            "signal_type",
            "summary",
            "evidence_quote",
            "source_speaker",
            "urgency",
            "confidence",
            "rationale",
          ],
        },
      },
      stakeholder_insights: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            contact_name: {
              type: "string" as const,
              description:
                "Buyer-side contact name exactly as listed in KNOWN BUYER-SIDE CONTACTS, or a new name if the speaker was not previously known.",
            },
            is_new_contact: {
              type: "boolean" as const,
              description: "True if this person was NOT in the known-buyer-side-contacts list.",
            },
            sentiment: {
              type: "string" as const,
              enum: ["positive", "neutral", "cautious", "negative", "mixed"] as const,
            },
            engagement: {
              type: "string" as const,
              enum: ["high", "medium", "low"] as const,
            },
            key_priorities: {
              type: "array" as const,
              items: { type: "string" as const },
              maxItems: 3,
            },
            key_concerns: {
              type: "array" as const,
              items: { type: "string" as const },
              maxItems: 3,
            },
            notable_quote: {
              type: ["string", "null"] as const,
              description:
                "One verbatim quote (under 30 words) that captures this stakeholder's stance on the call. Null if no single quote is representative.",
            },
          },
          required: [
            "contact_name",
            "is_new_contact",
            "sentiment",
            "engagement",
            "key_priorities",
            "key_concerns",
          ],
        },
      },
    },
    required: ["reasoning_trace", "signals", "stakeholder_insights"],
  },
} as const;

export interface DetectedSignal {
  signal_type: SignalTaxonomy;
  summary: string;
  evidence_quote: string;
  source_speaker: string;
  urgency: "low" | "medium" | "high" | "critical";
  confidence: number;
  rationale: string;
  competitor_name?: string | null;
  recurs_open_signal_id?: string | null;
  matches_pattern_id?: string | null;
  matches_experiment_id?: string | null;
}

export interface StakeholderInsight {
  contact_name: string;
  is_new_contact: boolean;
  sentiment: "positive" | "neutral" | "cautious" | "negative" | "mixed";
  engagement: "high" | "medium" | "low";
  key_priorities: string[];
  key_concerns: string[];
  notable_quote?: string | null;
}

export interface DetectSignalsOutput {
  /**
   * 2-4 sentences of classification reasoning that precedes the signals
   * array. Required per 04C Principle 6 and §2.13.1 calendared resolution
   * (Phase 3 Day 2 Session A). Populated even when `signals` is empty —
   * the prompt is expected to explain the empty-output case rather than
   * emit an empty reasoning_trace.
   */
  reasoning_trace: string;
  signals: DetectedSignal[];
  stakeholder_insights: StakeholderInsight[];
}
