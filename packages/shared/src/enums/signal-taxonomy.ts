/**
 * Canonical signal-type taxonomy — 9 values.
 *
 * Source of truth per DECISIONS.md 2.13 and Guardrail 22. Every prompt
 * classifier (#1, #21) and every tool-use schema that references a signal type
 * imports from here. @nexus/db's `signal_taxonomy` pgEnum also imports this
 * tuple so the database enum cannot drift from the application enum.
 *
 * The 7-vs-9 drift that plagued v1 (where prompt #1 and prompt #21 classified
 * against different-sized enums) is structurally impossible here: a rogue
 * value fails the tool-schema validator AND the Postgres enum cast.
 *
 * Order is intentional — priority / operational consequence descending. The
 * prompt's tie-break rule ("deal_blocker > process_friction; competitive_intel
 * > field_intelligence") matches this order.
 */
export const SIGNAL_TAXONOMY = [
  "deal_blocker",
  "competitive_intel",
  "process_friction",
  "content_gap",
  "win_pattern",
  "field_intelligence",
  "process_innovation",
  "agent_tuning",
  "cross_agent",
] as const satisfies readonly [string, ...string[]];

export type SignalTaxonomy = (typeof SIGNAL_TAXONOMY)[number];

export function isSignalTaxonomy(value: unknown): value is SignalTaxonomy {
  return typeof value === "string" && (SIGNAL_TAXONOMY as readonly string[]).includes(value);
}
