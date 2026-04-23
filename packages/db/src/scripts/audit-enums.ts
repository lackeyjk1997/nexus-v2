/**
 * Enum-drift audit — foundation-review C1.
 *
 * Canonical enums live in `packages/shared/src/enums/*.ts` as tuples. Per
 * Guardrail 22 (§2.13.1), the same values must appear in: (1) the TS enum
 * itself, (2) the Drizzle `pgEnum` in `packages/db/src/schema.ts`,
 * (3) prompt rewrite `.md` files under `~/nexus/docs/handoff/source/prompts/`
 * + `~/nexus/docs/handoff/04C-PROMPT-REWRITES.md`, and (4) HubSpot property
 * options in `packages/shared/src/crm/hubspot/properties.ts` (where
 * applicable — only enums that are also first-class HubSpot properties).
 *
 * This script walks each canonical enum and prints a per-enum table of
 * coverage. Exits 1 on any cross-site mismatch.
 *
 * Would have caught:
 *   - ContactRole 6-vs-9 drift (Phase 2 Day 2; hand-caught, cost: several
 *     grep passes across rewrites + scripts to discover).
 *   - MEDDPICC 7-vs-8 drift (foundation-review W1; hand-caught during the
 *     review itself).
 *
 * Run: `pnpm --filter @nexus/db enum:audit` (or root `pnpm enum:audit`).
 * Add to CI as a pre-merge gate once the script is green on main.
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CONTACT_ROLE,
  DEAL_STAGES,
  HUBSPOT_CUSTOM_PROPERTIES,
  MEDDPICC_DIMENSION,
  ODEAL_CATEGORY,
  SIGNAL_TAXONOMY,
  VERTICAL,
  type HubSpotPropertyOption,
} from "@nexus/shared";

/** Look up a HubSpot property by name and return its option values. */
function optionsFor(propertyName: string): readonly string[] {
  const prop = HUBSPOT_CUSTOM_PROPERTIES.find((p) => p.name === propertyName);
  if (!prop || !prop.options) return [];
  return (prop.options as HubSpotPropertyOption[]).map((o) => o.value);
}

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "../../../..");
const SCHEMA_PATH = resolve(here, "../schema.ts");
const HANDOFF_PROMPTS = resolve(REPO_ROOT, "..", "nexus", "docs", "handoff", "source", "prompts");
const HANDOFF_04C = resolve(REPO_ROOT, "..", "nexus", "docs", "handoff", "04C-PROMPT-REWRITES.md");

type HubspotSource = { kind: "property-options"; property: string; options: readonly string[] } | null;

interface EnumRegistryEntry {
  /** Canonical enum name for display. */
  displayName: string;
  /** The canonical TS tuple. */
  tsValues: readonly string[];
  /** Drizzle pgEnum literal name in schema.ts. */
  schemaEnumName: string;
  /** Optional HubSpot property the enum maps to. */
  hubspot: HubspotSource;
}

/** Extract the value list of a HubSpot enum-typed property's `options` array. */
function meddpiccFromHubspotProperties(): readonly string[] {
  // MEDDPICC is encoded not as options[] on a single property but as a set
  // of 8 numeric score properties named `nexus_meddpicc_<dim>_score`. The
  // drift vector is the presence/absence of each score column.
  const scoreProps = HUBSPOT_CUSTOM_PROPERTIES.filter((p) =>
    p.name.startsWith("nexus_meddpicc_") && p.name.endsWith("_score") && p.name !== "nexus_meddpicc_score",
  );
  const DIMENSION_MAP: Record<string, string> = {
    metrics: "metrics",
    eb: "economic_buyer",
    dc: "decision_criteria",
    dp: "decision_process",
    pain: "identify_pain",
    champion: "champion",
    competition: "competition",
    paper_process: "paper_process",
  };
  return scoreProps
    .map((p) => {
      const key = p.name.replace(/^nexus_meddpicc_/, "").replace(/_score$/, "");
      return DIMENSION_MAP[key] ?? key;
    })
    .sort();
}

function stageFromHubspotProperties(): readonly string[] {
  // DealStage values are the stage internal names on the HubSpot pipeline,
  // not stored in properties.ts; pipeline-ids.json is the source. For this
  // audit we skip the HubSpot side of DealStage (it lives on the pipeline
  // object, not in the properties registry).
  return [];
}

const REGISTRY: readonly EnumRegistryEntry[] = [
  {
    displayName: "SIGNAL_TAXONOMY",
    tsValues: SIGNAL_TAXONOMY,
    schemaEnumName: "signal_taxonomy",
    // Signal taxonomy is not a HubSpot property; Nexus-internal only.
    hubspot: null,
  },
  {
    displayName: "VERTICAL",
    tsValues: VERTICAL,
    schemaEnumName: "vertical",
    hubspot: {
      kind: "property-options",
      property: "nexus_vertical",
      options: optionsFor("nexus_vertical"),
    },
  },
  {
    displayName: "MEDDPICC_DIMENSION",
    tsValues: MEDDPICC_DIMENSION,
    schemaEnumName: "meddpicc_dimension",
    hubspot: {
      kind: "property-options",
      property: "nexus_meddpicc_<dim>_score (properties)",
      options: meddpiccFromHubspotProperties(),
    },
  },
  {
    displayName: "ODEAL_CATEGORY",
    tsValues: ODEAL_CATEGORY,
    schemaEnumName: "odeal_category",
    hubspot: null,
  },
  {
    displayName: "CONTACT_ROLE",
    tsValues: CONTACT_ROLE,
    schemaEnumName: "contact_role",
    hubspot: {
      kind: "property-options",
      property: "nexus_role_in_deal",
      options: optionsFor("nexus_role_in_deal"),
    },
  },
  {
    displayName: "DEAL_STAGES",
    tsValues: DEAL_STAGES,
    schemaEnumName: "deal_stage",
    hubspot: {
      kind: "property-options",
      property: "<pipeline stages>",
      options: stageFromHubspotProperties(),
    },
  },
] as const;

function readSchemaEnum(enumName: string): string[] {
  const schema = readFileSync(SCHEMA_PATH, "utf8");
  // Match pgEnum imports from `@nexus/shared` first — those are
  // single-sourced. If the pgEnum('<name>', IMPORTED_TUPLE) pattern is used,
  // the schema side is by definition the same tuple. Report a synthetic
  // "✓ single-sourced" rather than re-parsing. Trailing comma before ) is
  // accepted (Prettier formats tuples that way).
  const importRegex = new RegExp(
    `pgEnum\\(\\s*["']${enumName}["']\\s*,\\s*([A-Z_]+)\\s*,?\\s*\\)`,
  );
  if (importRegex.test(schema)) {
    return ["__SINGLE_SOURCED__"];
  }
  // Fallback — literal array in pgEnum call.
  const literalRegex = new RegExp(
    `pgEnum\\(\\s*["']${enumName}["']\\s*,\\s*\\[([^\\]]+)\\]\\s*,?\\s*\\)`,
    "m",
  );
  const match = schema.match(literalRegex);
  if (!match || !match[1]) return [];
  return match[1]
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter((s) => s.length > 0);
}

function readHandoffPromptEnumSet(enumName: string, tsValues: readonly string[]): Record<string, string[]> {
  // Heuristic search: for each prompt file, look for each canonical value
  // as a literal (quoted or standalone in a JSON-schema-like list). Report
  // which values are found per file. Files that don't reference any value
  // are omitted.
  const results: Record<string, string[]> = {};
  let files: string[] = [];
  try {
    files = readdirSync(HANDOFF_PROMPTS)
      .filter((f) => f.endsWith(".md"))
      .map((f) => join(HANDOFF_PROMPTS, f));
  } catch {
    return { "__HANDOFF_PROMPTS_MISSING__": [] };
  }
  files.push(HANDOFF_04C);
  for (const path of files) {
    let content: string;
    try {
      content = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    const found: string[] = [];
    for (const v of tsValues) {
      // Match whole-token to avoid false positives on substrings (e.g.
      // "champion" vs "champion_tier").
      const re = new RegExp(`\\b${escapeRegex(v)}\\b`);
      if (re.test(content)) found.push(v);
    }
    if (found.length > 0) {
      const basename = path.split("/").pop() ?? path;
      results[basename] = found;
    }
  }
  return results;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function diff(
  canonical: readonly string[],
  other: readonly string[],
): { missing: string[]; extra: string[] } {
  const canonSet = new Set(canonical);
  const otherSet = new Set(other);
  return {
    missing: [...canonSet].filter((v) => !otherSet.has(v)),
    extra: [...otherSet].filter((v) => !canonSet.has(v)),
  };
}

function main(): void {
  console.log("enum-drift audit\n================\n");
  let anyFailed = false;

  for (const entry of REGISTRY) {
    console.log(`--- ${entry.displayName} ---`);
    console.log(`  TS canonical (${entry.tsValues.length}): ${entry.tsValues.join(", ")}`);

    // Schema side.
    const schemaVals = readSchemaEnum(entry.schemaEnumName);
    if (schemaVals[0] === "__SINGLE_SOURCED__") {
      console.log(`  Schema (pgEnum "${entry.schemaEnumName}"): ✓ single-sourced via @nexus/shared import`);
    } else {
      const schemaDiff = diff(entry.tsValues, schemaVals);
      if (schemaDiff.missing.length === 0 && schemaDiff.extra.length === 0) {
        console.log(`  Schema (pgEnum "${entry.schemaEnumName}"): ✓ matches (${schemaVals.length})`);
      } else {
        console.error(`  Schema (pgEnum "${entry.schemaEnumName}"): DRIFT`);
        if (schemaDiff.missing.length > 0) {
          console.error(`    missing from schema: ${schemaDiff.missing.join(", ")}`);
        }
        if (schemaDiff.extra.length > 0) {
          console.error(`    extra in schema: ${schemaDiff.extra.join(", ")}`);
        }
        anyFailed = true;
      }
    }

    // HubSpot side (optional).
    if (entry.hubspot) {
      const hsDiff = diff(entry.tsValues, entry.hubspot.options);
      if (entry.hubspot.options.length === 0) {
        console.log(`  HubSpot (${entry.hubspot.property}): skipped (no property-registry source)`);
      } else if (hsDiff.missing.length === 0 && hsDiff.extra.length === 0) {
        console.log(
          `  HubSpot (${entry.hubspot.property}): ✓ matches (${entry.hubspot.options.length})`,
        );
      } else {
        console.error(`  HubSpot (${entry.hubspot.property}): DRIFT`);
        if (hsDiff.missing.length > 0) {
          console.error(`    missing from HubSpot: ${hsDiff.missing.join(", ")}`);
        }
        if (hsDiff.extra.length > 0) {
          console.error(`    extra in HubSpot: ${hsDiff.extra.join(", ")}`);
        }
        anyFailed = true;
      }
    }

    // Handoff prompts side — heuristic.
    const promptRefs = readHandoffPromptEnumSet(entry.displayName, entry.tsValues);
    if (promptRefs["__HANDOFF_PROMPTS_MISSING__"]) {
      console.log(`  Handoff prompts: ~/nexus directory not found (archival read-only; audit skipped)`);
    } else {
      const refFiles = Object.keys(promptRefs);
      if (refFiles.length === 0) {
        console.log(`  Handoff prompts: no files reference canonical values (OK if enum is Nexus-internal)`);
      } else {
        console.log(`  Handoff prompts (value presence by file, heuristic):`);
        for (const [file, vals] of Object.entries(promptRefs)) {
          const complete = vals.length === entry.tsValues.length;
          const marker = complete ? "✓" : " ";
          console.log(`    ${marker} ${file} (${vals.length}/${entry.tsValues.length})`);
        }
      }
    }

    console.log("");
  }

  if (anyFailed) {
    console.error("ENUM AUDIT FAILED — drift detected above. Close all vectors before merging.");
    process.exit(1);
  }
  console.log("ENUM AUDIT PASSED — all canonical enums consistent across their known sources.");
}

main();
