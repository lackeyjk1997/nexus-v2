/**
 * oDeal fit categories — the four axes of deal-fitness composition
 * (business, emotional, technical, readiness). Tuple order matches schema.ts.
 */
export const ODEAL_CATEGORY = [
  "business_fit",
  "emotional_fit",
  "technical_fit",
  "readiness_fit",
] as const satisfies readonly [string, ...string[]];

export type OdealCategory = (typeof ODEAL_CATEGORY)[number];

export function isOdealCategory(value: unknown): value is OdealCategory {
  return (
    typeof value === "string" &&
    (ODEAL_CATEGORY as readonly string[]).includes(value)
  );
}
