/**
 * 07C Step 6 — manually add 12 webhook event subscriptions to the private app.
 *
 * HubSpot's legacy private apps do not expose a public API for managing
 * subscriptions; 07C §5.3 specified POST /webhooks/v3/{appId}/subscriptions,
 * which returns 401 for private-app bearer tokens. Per HubSpot's current docs:
 *
 *   "Managing your private app's webhook subscriptions via API is not
 *    currently supported. Subscriptions can only be managed in your private
 *    app settings."
 *
 *   https://developers.hubspot.com/docs/apps/legacy-apps/private-apps/
 *     create-and-edit-webhook-subscriptions-in-private-apps
 *
 * This script prints the canonical subscription list + HubSpot UI steps so an
 * operator (Jeff) can paste/click through the ~12 subscriptions. Idempotent by
 * design — HubSpot's UI will not duplicate existing subscriptions.
 *
 * Usage:
 *   pnpm --filter @nexus/db subscribe:hubspot-webhooks
 */

import { loadDevEnv, requireEnv } from "./hubspot-env";

interface SubscriptionSpec {
  eventType: string;
  propertyName?: string;
}

const SUBSCRIPTIONS: SubscriptionSpec[] = [
  { eventType: "deal.creation" },
  { eventType: "deal.propertyChange", propertyName: "dealstage" },
  { eventType: "deal.propertyChange", propertyName: "amount" },
  { eventType: "deal.propertyChange", propertyName: "closedate" },
  { eventType: "deal.propertyChange", propertyName: "hubspot_owner_id" },
  { eventType: "deal.deletion" },
  { eventType: "contact.creation" },
  { eventType: "contact.propertyChange", propertyName: "email" },
  { eventType: "contact.propertyChange", propertyName: "firstname" },
  { eventType: "contact.deletion" },
  { eventType: "company.creation" },
  { eventType: "company.propertyChange", propertyName: "name" },
];

function main(): void {
  loadDevEnv();
  const portalId = requireEnv("HUBSPOT_PORTAL_ID");
  const appId = requireEnv("HUBSPOT_APP_ID");

  console.log("HubSpot private-app webhook subscriptions are UI-only.");
  console.log(
    "Open: https://app.hubspot.com/private-apps/" +
      `${portalId}/${appId}/webhooks`,
  );
  console.log("");
  console.log(
    'Click "Create subscription" and add each of the 12 rows below:',
  );
  console.log("");
  console.log("   #  Event type              Property name");
  console.log("  ──  ──────────────────────  ─────────────────────");
  SUBSCRIPTIONS.forEach((s, i) => {
    const num = String(i + 1).padStart(2, " ");
    const evt = s.eventType.padEnd(22, " ");
    const prop = s.propertyName ?? "";
    console.log(`  ${num}  ${evt}  ${prop}`);
  });
  console.log("");
  console.log("For deal.propertyChange / contact.propertyChange, select");
  console.log('"Only changes to specific properties" and name the property.');
  console.log("");
  console.log(
    "After saving: check the Webhooks tab shows target URL",
  );
  console.log(
    "  https://nexus-v2-five.vercel.app/api/hubspot/webhook",
  );
  console.log("and that subscriptions show a green check.");
}

main();
