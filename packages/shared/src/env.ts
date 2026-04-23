/**
 * Shared dev-env helper — Phase 3 Day 1 Session A consolidation.
 *
 * Background (DECISIONS.md §2.13.1). Claude Code's shell exports
 * `ANTHROPIC_API_KEY=""` (empty string) to prevent subagents from calling
 * Claude with the parent's credentials. Dotenv's default `override: false`
 * preserves that empty value even when `.env.local` has a real one, silently
 * breaking the wrapper's `!process.env.ANTHROPIC_API_KEY` guard. Every
 * Phase 3+ script that calls the Claude wrapper (transcript pipeline tests,
 * coordinator synthesis triggers, intervention probes, give-back dry-runs,
 * close-analysis one-offs) must therefore load env with `override: true`.
 *
 * This module is the single source for that pattern. Scripts import
 * `loadDevEnv` + `requireEnv` from `@nexus/shared` and never re-implement
 * the dotenv call site. Retires `packages/db/src/scripts/hubspot-env.ts`
 * (the local Day-5 copy).
 *
 * Scripts that don't call Claude (pure seeds, pure migrations, verification
 * utilities) can still import this helper for consistency — the
 * `override: true` behavior is harmless when no shadowing env is present.
 *
 * Runtime note: this module is scripts-only. `apps/web` runtime code
 * receives env via Next.js's built-in `.env.local` loading; it must not
 * call `loadDevEnv()` on a request path. `"sideEffects": false` on
 * `@nexus/shared` keeps tree-shaking clean so transitive imports don't
 * drag dotenv into serverless bundles.
 */
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Load `.env.local` from the nexus-v2 repo root with `override: true`.
 *
 * The path resolves from this module's location: `packages/shared/src/env.ts`
 * → `../../../.env.local` → repo root. Works identically from tsx-run
 * scripts (`@nexus/db/src/scripts/*.ts` importing `@nexus/shared`) and
 * from any future workspace.
 *
 * Idempotent — calling twice does not double-load. `dotenv.config` is
 * itself idempotent on a given process when `override: true` is used,
 * because the second call just re-sets the same values.
 */
export function loadDevEnv(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  loadEnv({ path: resolve(here, "../../../.env.local"), override: true });
}

/**
 * Read a required env var, throwing a loud error if missing. Scripts
 * should call `loadDevEnv()` first, then `requireEnv(...)` for each var.
 *
 * Distinguishes "not set" from "empty string": the Claude-Code guard sets
 * `ANTHROPIC_API_KEY=""`, which reads as `"" → falsy`. Empty-string vars
 * throw the same way as undefined vars, which is the behavior every
 * script needs post-`override: true`.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Check .env.local / Vercel env pull.`,
    );
  }
  return value;
}
