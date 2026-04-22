/**
 * Rate-limit-aware HubSpot HTTP client.
 *
 * Responsibilities:
 *   - Apply Bearer auth from private app access token.
 *   - Enforce Starter-tier burst budget (100 req per rolling 10s window) via a
 *     sliding-window wait. Daily (250k/day) is headroom we do not track in-process
 *     — HubSpot surfaces 429 if we ever approach it and we map that to
 *     CrmRateLimitError.
 *   - Map HTTP status codes to the CrmAdapter error hierarchy.
 *   - Surface the `X-HubSpot-RateLimit-Remaining` header to callers (healthCheck).
 */

import {
  CrmAuthError,
  CrmNotFoundError,
  CrmRateLimitError,
  CrmTransientError,
  CrmValidationError,
} from "../errors";

export interface HubSpotClientOptions {
  token: string;
  baseUrl?: string;
  /** Max in-flight requests inside the rolling 10-second window. Default 90 (10% safety margin under 100). */
  burstLimit?: number;
  /** Max total wait (ms) when backpressure holds a request before giving up. Default 20000. */
  maxWaitMs?: number;
  /** Optional fetch implementation (injected for tests). */
  fetchFn?: typeof fetch;
}

export interface HubSpotRequest {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  /** Already serialized query string (without the leading `?`). */
  query?: string;
  body?: unknown;
  /** Parse the response as JSON? Default true; set false for 204 endpoints. */
  parseJson?: boolean;
}

export interface HubSpotResponse<T> {
  status: number;
  body: T;
  rateLimitRemaining: number | null;
}

export class HubSpotClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly burstLimit: number;
  private readonly maxWaitMs: number;
  private readonly fetchFn: typeof fetch;

  /** Timestamps (ms) of the last N calls. Sliding 10-second window. */
  private readonly callLog: number[] = [];

  private lastRateLimitRemaining: number | null = null;

  constructor(options: HubSpotClientOptions) {
    this.token = options.token;
    this.baseUrl = options.baseUrl ?? "https://api.hubapi.com";
    this.burstLimit = options.burstLimit ?? 90;
    this.maxWaitMs = options.maxWaitMs ?? 20_000;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  get rateLimitRemaining(): number | null {
    return this.lastRateLimitRemaining;
  }

  async request<T = unknown>(req: HubSpotRequest): Promise<HubSpotResponse<T>> {
    await this.waitForSlot();
    const startedAt = Date.now();

    const url = `${this.baseUrl}${req.path}${req.query ? `?${req.query}` : ""}`;
    const init: RequestInit = {
      method: req.method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
    };
    if (req.body !== undefined) init.body = JSON.stringify(req.body);

    let response: Response;
    try {
      response = await this.fetchFn(url, init);
    } catch (err) {
      throw new CrmTransientError(
        `HubSpot request failed: ${req.method} ${req.path}`,
        err,
      );
    }

    this.callLog.push(startedAt);
    const rawRemaining = response.headers.get("X-HubSpot-RateLimit-Remaining");
    this.lastRateLimitRemaining = rawRemaining ? Number(rawRemaining) : null;

    const text = await response.text();
    const parseJson = req.parseJson ?? true;
    let body: unknown = text;
    if (parseJson && text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch (err) {
        throw new CrmTransientError(
          `HubSpot returned non-JSON body (${response.status}): ${text.slice(0, 200)}`,
          err,
        );
      }
    }

    if (response.status >= 200 && response.status < 300) {
      return {
        status: response.status,
        body: body as T,
        rateLimitRemaining: this.lastRateLimitRemaining,
      };
    }

    throw this.mapError(response.status, req, body, response.headers);
  }

  private mapError(
    status: number,
    req: HubSpotRequest,
    body: unknown,
    headers: Headers,
  ): Error {
    const summary =
      typeof body === "object" && body && "message" in body
        ? String((body as { message: unknown }).message)
        : typeof body === "string"
        ? body.slice(0, 200)
        : `HTTP ${status}`;
    const ctx = `${req.method} ${req.path} → ${status}: ${summary}`;

    switch (status) {
      case 400:
      case 422:
        return new CrmValidationError(ctx);
      case 401:
      case 403:
        return new CrmAuthError(ctx);
      case 404:
        return new CrmNotFoundError(req.method, req.path);
      case 429: {
        const retryAfter = Number(headers.get("Retry-After") ?? "10");
        return new CrmRateLimitError(ctx, retryAfter);
      }
      default:
        if (status >= 500 && status < 600) return new CrmTransientError(ctx);
        return new CrmTransientError(ctx);
    }
  }

  /**
   * Sliding-window rate limiter. If `burstLimit` calls have happened in the last
   * 10 seconds, wait until the oldest falls out. Caps total wait at `maxWaitMs`;
   * beyond that, throws CrmRateLimitError so the job queue can back off.
   */
  private async waitForSlot(): Promise<void> {
    const waitedStart = Date.now();
    while (true) {
      const now = Date.now();
      const windowStart = now - 10_000;
      while (this.callLog.length > 0 && (this.callLog[0] ?? Infinity) < windowStart) {
        this.callLog.shift();
      }
      if (this.callLog.length < this.burstLimit) return;

      const oldest = this.callLog[0] ?? now;
      const sleepMs = Math.max(50, oldest + 10_000 - now);
      const waitedSoFar = now - waitedStart;
      if (waitedSoFar + sleepMs > this.maxWaitMs) {
        throw new CrmRateLimitError(
          `HubSpot burst budget exhausted; in-process wait would exceed ${this.maxWaitMs}ms`,
          Math.ceil(sleepMs / 1000),
        );
      }
      await new Promise((r) => setTimeout(r, sleepMs));
    }
  }
}
