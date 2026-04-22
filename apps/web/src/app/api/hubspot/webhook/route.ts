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

  // HubSpot signs with the URL configured in the private app's Webhooks tab —
  // the stable production alias, NOT a per-deployment URL. VERCEL_URL rotates
  // per deploy and would make the signing string diverge. Prefer
  // VERCEL_PROJECT_PRODUCTION_URL (stable), then NEXT_PUBLIC_SITE_URL, then the
  // origin extracted from the incoming request as a last resort for local dev.
  const canonicalHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/^https?:\/\//, "") ??
    new URL(req.url).host;
  const baseUrl = `https://${canonicalHost.replace(/^https?:\/\//, "")}`;
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
