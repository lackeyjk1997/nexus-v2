/**
 * Contact roles for deal-stakeholder modeling — per-deal assignment stored in
 * Nexus `deal_contact_roles` (custom association labels require HubSpot
 * Professional, see DECISIONS.md 2.18 / 07C §4.3).
 *
 * Tuple order matches packages/db/src/schema.ts contactRoleEnum. 9 values.
 *
 * Day-5 crm/types.ts ContactRole was narrowed to 6 values; Phase 2 Day 1
 * broadens to the schema-canonical 9 so adapter + DB never drift.
 */
export const CONTACT_ROLE = [
  "champion",
  "economic_buyer",
  "decision_maker",
  "technical_evaluator",
  "end_user",
  "procurement",
  "influencer",
  "blocker",
  "coach",
] as const satisfies readonly [string, ...string[]];

export type ContactRole = (typeof CONTACT_ROLE)[number];

export function isContactRole(value: unknown): value is ContactRole {
  return (
    typeof value === "string" &&
    (CONTACT_ROLE as readonly string[]).includes(value)
  );
}
