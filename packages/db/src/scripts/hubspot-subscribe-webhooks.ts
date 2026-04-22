/**
 * 07C Step 6 — subscribe the private app to the 12 webhook events Nexus
 * handles (Section 5.1).
 *
 * Endpoint: POST /webhooks/v3/{appId}/subscriptions
 * Requires the private app's numeric App ID (different from Portal ID).
 * HubSpot surfaces it in the Settings URL:
 *   https://app.hubspot.com/private-apps/{portalId}/{appId}
 *
 * Idempotent: 409 on duplicate subscription is treated as success.
 *
 * Usage:
 *   pnpm --filter @nexus/db subscribe:hubspot-webhooks
 */

import { CrmValidationError, HubSpotClient } from "@nexus/shared";

import { loadDevEnv, requireEnv } from "./hubspot-env";

interface SubscriptionSpec {
  eventType: string;
  propertyName?: string;
  active: boolean;
}

const SUBSCRIPTIONS: SubscriptionSpec[] = [
  { eventType: "deal.creation", active: true },
  { eventType: "deal.propertyChange", propertyName: "dealstage", active: true },
  { eventType: "deal.propertyChange", propertyName: "amount", active: true },
  { eventType: "deal.propertyChange", propertyName: "closedate", active: true },
  {
    eventType: "deal.propertyChange",
    propertyName: "hubspot_owner_id",
    active: true,
  },
  { eventType: "deal.deletion", active: true },
  { eventType: "contact.creation", active: true },
  { eventType: "contact.propertyChange", propertyName: "email", active: true },
  {
    eventType: "contact.propertyChange",
    propertyName: "firstname",
    active: true,
  },
  { eventType: "contact.deletion", active: true },
  { eventType: "company.creation", active: true },
  { eventType: "company.propertyChange", propertyName: "name", active: true },
];

async function main(): Promise<void> {
  loadDevEnv();
  const token = requireEnv("NEXUS_HUBSPOT_TOKEN");
  const appId = requireEnv("HUBSPOT_APP_ID");

  const http = new HubSpotClient({ token });

  console.log(
    `Subscribing ${SUBSCRIPTIONS.length} webhook events on app ${appId}...`,
  );
  let created = 0;
  let existed = 0;
  for (const sub of SUBSCRIPTIONS) {
    const label = sub.propertyName
      ? `${sub.eventType}:${sub.propertyName}`
      : sub.eventType;
    try {
      await http.request({
        method: "POST",
        path: `/webhooks/v3/${appId}/subscriptions`,
        body: sub,
      });
      created++;
      console.log(`  [+] ${label}`);
    } catch (err) {
      if (err instanceof CrmValidationError) {
        existed++;
        console.log(`  [=] ${label} already subscribed`);
        continue;
      }
      throw err;
    }
  }

  console.log(
    `Done. Created ${created}, already subscribed ${existed}, total ${SUBSCRIPTIONS.length}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
