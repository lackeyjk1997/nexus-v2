/**
 * Phase 2 Day 2 — PATCH the live HubSpot `nexus_role_in_deal` contact property
 * to carry all 9 ContactRole options (matching the schema + prompt canonical).
 *
 * Day-5 provisioned this property with a 6-value option set from the original
 * ROLE_OPTIONS. Phase 2 Day 1 broadened the schema + adapter types to 9 values
 * without updating HubSpot; Day 2's alignment pass closes that gap.
 *
 * HubSpot's Properties API supports PATCH with a full `options` array — we
 * send the 9-value set; HubSpot overlays it on the existing property. Existing
 * contact-level property values remain valid (all 6 old values are in the new
 * 9-value set).
 *
 * Usage:
 *   pnpm --filter @nexus/db align:hubspot-role-options
 */

import {
  HUBSPOT_CUSTOM_PROPERTIES,
  HubSpotClient,
  type HubSpotPropertyDefinition,
} from "@nexus/shared";

import { loadDevEnv, requireEnv } from "./hubspot-env";

function findRoleDef(): HubSpotPropertyDefinition {
  const def = HUBSPOT_CUSTOM_PROPERTIES.find(
    (p) => p.objectType === "contacts" && p.name === "nexus_role_in_deal",
  );
  if (!def) {
    throw new Error("nexus_role_in_deal definition missing from properties.ts");
  }
  return def;
}

async function main(): Promise<void> {
  loadDevEnv();
  const token = requireEnv("NEXUS_HUBSPOT_TOKEN");
  const portalId = requireEnv("HUBSPOT_PORTAL_ID");
  const http = new HubSpotClient({ token });

  const def = findRoleDef();

  // Fetch current state for audit.
  const { body: current } = await http.request<{
    options: Array<{ label: string; value: string; displayOrder: number }>;
  }>({
    method: "GET",
    path: `/crm/v3/properties/contacts/${def.name}`,
  });
  console.log(
    `portal ${portalId} · current nexus_role_in_deal options (${current.options.length}):`,
  );
  for (const opt of current.options) {
    console.log(`  ${opt.displayOrder} ${opt.value} (${opt.label})`);
  }

  const existingValues = new Set(current.options.map((o) => o.value));
  const canonicalValues = new Set((def.options ?? []).map((o) => o.value));
  const toAdd = [...canonicalValues].filter((v) => !existingValues.has(v));
  const toRemove = [...existingValues].filter((v) => !canonicalValues.has(v));

  if (toAdd.length === 0 && toRemove.length === 0) {
    console.log("already aligned — no-op.");
    return;
  }

  console.log(`  +add:    ${JSON.stringify(toAdd)}`);
  console.log(`  -remove: ${JSON.stringify(toRemove)}`);
  if (toRemove.length > 0) {
    console.log(
      "  (removing options that existing contacts may still reference — manual check required)",
    );
  }

  // PATCH with the full canonical option set.
  await http.request({
    method: "PATCH",
    path: `/crm/v3/properties/contacts/${def.name}`,
    body: { options: def.options },
  });

  const { body: after } = await http.request<{
    options: Array<{ label: string; value: string; displayOrder: number }>;
  }>({
    method: "GET",
    path: `/crm/v3/properties/contacts/${def.name}`,
  });
  console.log(
    `after · nexus_role_in_deal options (${after.options.length}):`,
  );
  for (const opt of after.options) {
    console.log(`  ${opt.displayOrder} ${opt.value} (${opt.label})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
