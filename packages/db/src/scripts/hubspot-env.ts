/**
 * Local env loader for Day-5 HubSpot scripts.
 *
 * Per DECISIONS.md 2.13.1, scripts loading Claude or HubSpot creds must set
 * `override: true` on dotenv to clobber Claude Code's intentional empty-string
 * ANTHROPIC_API_KEY guard. HubSpot env vars obey the same rule for consistency.
 *
 * Phase 3 Day 1 consolidates this into packages/shared/src/env.ts. Until then,
 * scripts import from this local helper.
 */

import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export function loadDevEnv(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  loadEnv({ path: resolve(here, "../../../../.env.local"), override: true });
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Check .env.local / Vercel env pull.`,
    );
  }
  return value;
}
