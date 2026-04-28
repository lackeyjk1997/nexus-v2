/**
 * Tool-use schema for prompt #27 (10-cluster-observations, NEW for
 * Phase 4 Day 3). Tool name matches the prompt body verbatim:
 * `cluster_observation`.
 *
 * Per DECISIONS.md §1.16 (admission thresholds — 3+ similar candidates
 * by prompt-generated signature) + §1.18 (silence-as-feature — low
 * confidence rows logged but not surfaced) + §2.13.1 Principle 6
 * (`reasoning_trace` first property).
 *
 * Output ceiling defense (Phase 4 Day 3 kickoff Decision 4):
 *   reasoning_trace ~400 tokens + signature ~30 + category ~30 +
 *   confidence ~10 + signature_basis ~80 = ~550 tokens expected;
 *   max_tokens=1500 provides ~2.7x headroom. Reactive bump per §2.13.1
 *   if first live exercise hits stop_reason=max_tokens.
 */

export const clusterObservationTool = {
  name: "cluster_observation",
  description:
    "Generate a normalized clustering signature for an uncategorized observation, with confidence calibration and signature basis.",
  input_schema: {
    type: "object" as const,
    properties: {
      reasoning_trace: {
        type: "string" as const,
        description:
          "3-5 sentences walking through the signature choice: what concrete shape did you identify in the observation, what alternatives did you consider, why this signature and not a more general or more specific one. Not shown to the user. First property per §2.13.1 Principle 6.",
      },
      normalized_signature: {
        type: "string" as const,
        maxLength: 60,
        pattern: "^[a-z][a-z0-9_]*$",
        description:
          "snake_case slug, lowercase, ≤60 chars. Determinism over expressiveness — observations sharing the same shape must produce the same signature.",
      },
      candidate_category: {
        type: "string" as const,
        description:
          "Title-case human-readable form of the signature. Used in the surfaces UI when surfacing candidates to Marcus.",
      },
      confidence: {
        type: "string" as const,
        enum: ["low", "medium", "high"] as const,
        description:
          "Confidence in the signature choice. low → system filters this row out per §1.18 silence-as-feature.",
      },
      signature_basis: {
        type: "string" as const,
        description:
          "One sentence stating what shape of language in the observation drove the signature choice. Visible in the diagnostic UI.",
      },
    },
    required: [
      "reasoning_trace",
      "normalized_signature",
      "candidate_category",
      "confidence",
      "signature_basis",
    ] as const,
  },
} as const;

export type ClusterConfidence = "low" | "medium" | "high";

export interface ClusterObservationOutput {
  /**
   * 3-5 sentences walking the signature choice. First property per
   * §2.13.1 Principle 6.
   */
  reasoning_trace: string;
  normalized_signature: string;
  candidate_category: string;
  confidence: ClusterConfidence;
  signature_basis: string;
}
