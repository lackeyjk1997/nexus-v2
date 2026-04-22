/**
 * Canonical list of deal / company verticals.
 *
 * Tuple order matches packages/db/src/schema.ts verticalEnum so
 * drizzle-kit generate reports no schema changes when schema.ts
 * imports this tuple.
 *
 * Extended at: Phase 2 Day 1 (single-sourcing per DECISIONS.md 2.13
 * and Guardrail 22, following the Day-4 signal-taxonomy pattern).
 */
export const VERTICAL = [
  "healthcare",
  "financial_services",
  "technology",
  "retail",
  "manufacturing",
  "general",
] as const satisfies readonly [string, ...string[]];

export type Vertical = (typeof VERTICAL)[number];

export function isVertical(value: unknown): value is Vertical {
  return (
    typeof value === "string" && (VERTICAL as readonly string[]).includes(value)
  );
}
