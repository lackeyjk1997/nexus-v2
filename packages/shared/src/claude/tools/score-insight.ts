/**
 * Tool-use schema for prompt #26 (09-score-insight, NEW for Phase 4 Day 1
 * Session B). Tool name matches the prompt body verbatim: `score_insight`.
 *
 * Per DECISIONS.md §1.16 (admission thresholds + Claude scores ordering
 * only) + §2.13.1 Principle 6 (`reasoning_trace` first property).
 *
 * Output ceiling defense (Phase 4 Day 1 Session B kickoff Decision 1):
 *   reasoning_trace ~500 tokens + score ~10 + score_explanation ~80 +
 *   score_components ~100 = ~700 tokens expected; max_tokens=2500
 *   provides ~3.5x headroom. Reactive bump per §2.13.1 if first live
 *   exercise hits stop_reason=max_tokens.
 */

export const scoreInsightTool = {
  name: "score_insight",
  description:
    "Score an admitted candidate insight 0-100 for importance, with a short visible explanation citing concrete factors.",
  input_schema: {
    type: "object" as const,
    properties: {
      reasoning_trace: {
        type: "string" as const,
        description:
          "3-5 sentences walking through the calibration: which factors did you weight, how did the surface context shift the weighting, why this number and not 10 higher or lower. Not shown to the user. First property per §2.13.1 Principle 6.",
      },
      score: {
        type: "integer" as const,
        minimum: 0,
        maximum: 100,
        description:
          "Importance score 0-100 used for ordering within an admitted set on this surface. Higher = ranked higher.",
      },
      score_explanation: {
        type: "string" as const,
        description:
          "1-2 sentences citing at least 2 concrete factors using actual numbers from the input. Visible to the rep per §1.16.",
      },
      score_components: {
        type: "object" as const,
        description:
          "Optional per-factor breakdown for downstream surfacing. Populate fields that materially influenced the score; omit fields that didn't.",
        properties: {
          deals_affected: { type: "integer" as const, minimum: 0 },
          aggregate_arr_band: {
            type: "string" as const,
            description: "ARR band string e.g. '1m-5m', '500k-1m', or 'unknown'.",
          },
          recency_days: {
            type: "integer" as const,
            minimum: 0,
            description: "Days since latest contributing signal.",
          },
          stage_relevance: {
            type: "string" as const,
            description:
              "Free-text qualifier: 'decision_shaping', 'decision_defending', 'observation_only', etc.",
          },
        },
      },
    },
    required: ["reasoning_trace", "score", "score_explanation"],
  },
} as const;

export interface ScoreComponents {
  deals_affected?: number;
  aggregate_arr_band?: string;
  recency_days?: number;
  stage_relevance?: string;
}

export interface ScoreInsightOutput {
  /**
   * 3-5 sentences walking the calibration. First property per
   * §2.13.1 Principle 6 (reasoning-first for classification-with-
   * judgment prompts).
   */
  reasoning_trace: string;
  score: number;
  score_explanation: string;
  score_components?: ScoreComponents;
}
