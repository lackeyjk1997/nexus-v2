/**
 * MEDDPICC dimensions — 8 axes scored during transcript analysis and
 * surfaced on deal detail. Tuple order matches schema.ts.
 */
export const MEDDPICC_DIMENSION = [
  "metrics",
  "economic_buyer",
  "decision_criteria",
  "decision_process",
  "paper_process",
  "identify_pain",
  "champion",
  "competition",
] as const satisfies readonly [string, ...string[]];

export type MeddpiccDimension = (typeof MEDDPICC_DIMENSION)[number];

export function isMeddpiccDimension(value: unknown): value is MeddpiccDimension {
  return (
    typeof value === "string" &&
    (MEDDPICC_DIMENSION as readonly string[]).includes(value)
  );
}
