import { NextResponse } from "next/server";

import { CrmAuthError } from "@nexus/shared";

import { createHubSpotAdapter } from "@/lib/crm";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * HubSpot webhook receiver.
 *
 * Security: verifies X-HubSpot-Signature-V3 against the private app client
 * secret (07C §5.5, §6.3). Rejects requests older than 5 minutes (replay
 * protection). Unverifiable requests return 401.
 *
 * Behavior: parses events, refreshes `hubspot_cache`. Returns 200 under 300ms
 * so HubSpot's retry budget is not stressed (07C §7.3).
 *
 * Phase 3 layers in deal_events emission + `jobs` enqueues for intelligence
 * consequences (stage-change → close-analysis, etc.).
 */
export async function POST(req: Request): Promise<NextResponse> {
  const rawBody = await req.text();
  const signature = req.headers.get("X-HubSpot-Signature-V3");
  const timestamp = req.headers.get("X-HubSpot-Request-Timestamp");

  const baseUrl =
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : env.siteUrl;
  const requestUri = `${baseUrl}${new URL(req.url).pathname}`;

  const adapter = createHubSpotAdapter();
  try {
    const events = await adapter.parseWebhookPayload({
      rawBody,
      signature: signature ?? "",
      timestamp: timestamp ?? "",
      requestMethod: req.method,
      requestUri,
    });
    for (const event of events) {
      try {
        await adapter.handleWebhookEvent(event);
      } catch (err) {
        console.error(
          `hubspot-webhook: handler failed for ${event.eventType} ${event.objectId}`,
          err,
        );
      }
    }
    return NextResponse.json({ received: events.length });
  } catch (err) {
    if (err instanceof CrmAuthError) {
      console.warn(`hubspot-webhook: signature rejected (${err.message})`);
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    console.error("hubspot-webhook: handler error", err);
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500 },
    );
  } finally {
    await adapter.close();
  }
}
