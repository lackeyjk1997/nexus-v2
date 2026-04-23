/**
 * Tool-use schema for prompt #20 (pipeline-score-meddpicc, PORT-WITH-CLEANUPS).
 * Tool name matches the prompt body verbatim: `record_meddpicc_scores`.
 *
 * Port discipline per §2.13.1 + 04C Principle 6 + Guardrail 22:
 * - `reasoning_trace` is the first required property per Principle 6
 *   (scoring is classification-with-judgment).
 * - `dimension` enum imports MEDDPICC_DIMENSION from the shared enum so
 *   schema validation rejects any rogue value (e.g., v1's camelCase
 *   `economicBuyer` or the 7-vs-8 drift closed by §2.13.1).
 * - No transcript truncation at the prompt layer (Principle 13).
 * - `contradicts_prior` captures new-vs-prior-evidence conflict explicitly;
 *   downstream consumers (persist-meddpicc) may use it to flag score
 *   reversals for human review.
 */
import { MEDDPICC_DIMENSION, type MeddpiccDimension } from "../../enums/meddpicc-dimension";

export const scoreMeddpiccTool = {
  name: "record_meddpicc_scores",
  description:
    "Record MEDDPICC dimension scores where the transcript provides NEW evidence. Omit dimensions with no new evidence.",
  input_schema: {
    type: "object" as const,
    properties: {
      reasoning_trace: {
        type: "string" as const,
        description:
          "2-4 sentences: which dimensions had new evidence, judgment calls on borderline ones, cross-dimension interactions. Populated BEFORE the scores array. Required even when scores array is empty — explain the no-new-evidence case.",
      },
      scores: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            dimension: {
              type: "string" as const,
              enum: MEDDPICC_DIMENSION,
              description:
                "Snake_case dimension ID matching MEDDPICC_DIMENSION enum. camelCase (economicBuyer, identifyPain) is rejected.",
            },
            score: {
              type: "integer" as const,
              minimum: 0,
              maximum: 100,
              description:
                "0-100 discovery completeness per the calibration guidance in the system prompt.",
            },
            evidence_quote: {
              type: "string" as const,
              description:
                "Verbatim quote from the transcript supporting this score, OR a close paraphrase explicitly marked '(paraphrase)'.",
            },
            confidence: {
              type: "number" as const,
              minimum: 0.5,
              maximum: 1.0,
              description:
                "Per the calibration scale in the system prompt. Below 0.5 do not emit.",
            },
            contradicts_prior: {
              type: "boolean" as const,
              description:
                "True if new evidence contradicts prior evidence; false if it extends or refines. Default false.",
            },
            rationale: {
              type: "string" as const,
              description:
                "One sentence explaining why this score fits per the dimension's definition and the new evidence. If contradicts_prior, explain which evidence wins and why.",
            },
          },
          required: [
            "dimension",
            "score",
            "evidence_quote",
            "confidence",
            "contradicts_prior",
            "rationale",
          ],
        },
      },
    },
    required: ["reasoning_trace", "scores"],
  },
} as const;

export interface MeddpiccDimensionScore {
  dimension: MeddpiccDimension;
  score: number;
  evidence_quote: string;
  confidence: number;
  contradicts_prior: boolean;
  rationale: string;
}

export interface ScoreMeddpiccOutput {
  /**
   * 2-4 sentences of scoring reasoning that precedes the scores array.
   * Required per 04C Principle 6 — scoring is classification-with-judgment.
   * Populated even when `scores` is empty (the prompt is expected to explain
   * the no-new-evidence case rather than emit an empty reasoning_trace).
   */
  reasoning_trace: string;
  scores: MeddpiccDimensionScore[];
}
