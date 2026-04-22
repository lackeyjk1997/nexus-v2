/**
 * 07C Step 5 — create the `nexus_intelligence` property group on each of
 * deals/contacts/companies, then create each of the 38 custom properties.
 *
 * Idempotent: group + property creation 409s are caught and treated as success.
 *
 * Usage:
 *   pnpm --filter @nexus/db provision:hubspot-properties
 */

import {
  CrmNotFoundError,
  CrmValidationError,
  HUBSPOT_CUSTOM_PROPERTIES,
  HubSpotClient,
  type HubSpotPropertyDefinition,
} from "@nexus/shared";

import { loadDevEnv, requireEnv } from "./hubspot-env";

async function propertyExists(
  http: HubSpotClient,
  objectType: string,
  name: string,
): Promise<boolean> {
  try {
    await http.request({
      method: "GET",
      path: `/crm/v3/properties/${objectType}/${name}`,
    });
    return true;
  } catch (err) {
    if (err instanceof CrmNotFoundError) return false;
    throw err;
  }
}

async function ensureGroup(
  http: HubSpotClient,
  objectType: "deals" | "contacts" | "companies",
): Promise<void> {
  try {
    await http.request({
      method: "POST",
      path: `/crm/v3/properties/${objectType}/groups`,
      body: {
        name: "nexus_intelligence",
        label: "Nexus Intelligence",
        displayOrder: 10,
      },
    });
    console.log(`  ${objectType}: created group "nexus_intelligence"`);
  } catch (err) {
    // HubSpot returns 409 with CONFLICT for duplicates; our client maps
    // non-400/401/403/404/429/5xx to CrmTransientError — cheaper than parsing,
    // accept either for idempotency.
    const message = (err as Error).message ?? "";
    if (/already exists/i.test(message) || /409/.test(message)) {
      console.log(`  ${objectType}: group "nexus_intelligence" already exists`);
      return;
    }
    if (err instanceof CrmValidationError) {
      console.log(`  ${objectType}: group "nexus_intelligence" exists (400)`);
      return;
    }
    throw err;
  }
}

function propertyBody(def: HubSpotPropertyDefinition): Record<string, unknown> {
  return {
    name: def.name,
    label: def.label,
    description: def.description,
    type: def.type,
    fieldType: def.fieldType,
    groupName: def.groupName,
    displayOrder: def.displayOrder,
    hasUniqueValue: def.hasUniqueValue ?? false,
    formField: def.formField ?? false,
    ...(def.options ? { options: def.options } : {}),
  };
}

async function ensureProperty(
  http: HubSpotClient,
  def: HubSpotPropertyDefinition,
): Promise<"created" | "exists"> {
  if (await propertyExists(http, def.objectType, def.name)) {
    return "exists";
  }
  await http.request({
    method: "POST",
    path: `/crm/v3/properties/${def.objectType}`,
    body: propertyBody(def),
  });
  return "created";
}

async function main(): Promise<void> {
  loadDevEnv();
  const token = requireEnv("NEXUS_HUBSPOT_TOKEN");
  const portalId = requireEnv("HUBSPOT_PORTAL_ID");

  const http = new HubSpotClient({ token });

  console.log(`Provisioning property groups on portal ${portalId}...`);
  for (const objectType of ["deals", "contacts", "companies"] as const) {
    await ensureGroup(http, objectType);
  }

  console.log(
    `Provisioning ${HUBSPOT_CUSTOM_PROPERTIES.length} custom properties...`,
  );
  let created = 0;
  let existed = 0;
  for (const def of HUBSPOT_CUSTOM_PROPERTIES) {
    const outcome = await ensureProperty(http, def);
    if (outcome === "created") {
      created++;
      console.log(`  [+] ${def.objectType}.${def.name} (${def.type})`);
    } else {
      existed++;
      console.log(`  [=] ${def.objectType}.${def.name} already exists`);
    }
  }

  console.log(
    `Done. Created ${created}, already existed ${existed}, total ${HUBSPOT_CUSTOM_PROPERTIES.length}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
