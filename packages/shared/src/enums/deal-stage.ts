/**
 * Canonical deal-stage names — the 9 internal stage identifiers used across
 * Nexus (DB enum, CrmAdapter types, HubSpot pipeline config, UI labels).
 *
 * Tuple order matches HubSpot's Nexus Sales pipeline (portal 245978261,
 * pipeline 2215843570) and packages/shared/src/crm/hubspot/pipeline-ids.json.
 *
 * Day-5 originally placed these in packages/shared/src/crm/types.ts while
 * schema.ts still had "prospect" as the first value. Phase 2 Day 2
 * reconciliation moved the canonical tuple here and landed a migration to
 * rename the schema enum's first value (`prospect` → `new_lead`), completing
 * the single-source-of-truth pattern per DECISIONS.md 2.13 / Guardrail 22.
 */
export const DEAL_STAGES = [
  "new_lead",
  "qualified",
  "discovery",
  "technical_validation",
  "proposal",
  "negotiation",
  "closing",
  "closed_won",
  "closed_lost",
] as const satisfies readonly [string, ...string[]];

export type DealStage = (typeof DEAL_STAGES)[number];

export function isDealStage(value: unknown): value is DealStage {
  return (
    typeof value === "string" &&
    (DEAL_STAGES as readonly string[]).includes(value)
  );
}
