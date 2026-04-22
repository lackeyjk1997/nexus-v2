/**
 * HubSpot webhook v3 signature verification.
 *
 * Per HubSpot docs: signature is HMAC-SHA256(clientSecret, method + uri + body + timestamp),
 * base64-encoded. Replay protection: reject if timestamp > 5 minutes old.
 *
 * The "webhook secret" IS the private app's client secret. Historical ambiguity
 * flagged and resolved in Phase 1 Day 5 — see DECISIONS.md 2.6.1-era note.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { CrmAuthError } from "../errors";

export interface VerifyInput {
  clientSecret: string;
  signatureHeader: string | null;
  timestampHeader: string | null;
  requestMethod: string;
  /** Full canonical URL HubSpot invoked (scheme + host + path + query). */
  requestUri: string;
  rawBody: string;
  maxAgeMs?: number;
  /** Override for tests. */
  now?: () => number;
}

export function verifyHubSpotSignature(input: VerifyInput): void {
  const maxAgeMs = input.maxAgeMs ?? 5 * 60 * 1000;
  const now = input.now ?? Date.now;

  if (!input.signatureHeader) {
    throw new CrmAuthError("Missing X-HubSpot-Signature-V3 header");
  }
  if (!input.timestampHeader) {
    throw new CrmAuthError("Missing X-HubSpot-Request-Timestamp header");
  }

  const timestampMs = Number(input.timestampHeader);
  if (!Number.isFinite(timestampMs)) {
    throw new CrmAuthError(
      `Invalid X-HubSpot-Request-Timestamp: ${input.timestampHeader}`,
    );
  }
  if (now() - timestampMs > maxAgeMs) {
    throw new CrmAuthError(
      `Webhook timestamp too old: ${Math.round((now() - timestampMs) / 1000)}s`,
    );
  }

  const signingString =
    input.requestMethod +
    input.requestUri +
    input.rawBody +
    input.timestampHeader;
  const computed = createHmac("sha256", input.clientSecret)
    .update(signingString, "utf8")
    .digest("base64");

  const provided = Buffer.from(input.signatureHeader, "utf8");
  const expected = Buffer.from(computed, "utf8");
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    throw new CrmAuthError("HubSpot signature mismatch");
  }
}
