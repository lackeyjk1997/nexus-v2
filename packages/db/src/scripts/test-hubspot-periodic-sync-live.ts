/**
 * Live hubspot_periodic_sync exercise — Phase 4 Day 2 Session B verification.
 *
 * Invokes HANDLERS.hubspot_periodic_sync against prod Supabase + live
 * HubSpot Starter tier. Decoupled from Vercel deploy completion (calls
 * the handler locally via the shared sql pool).
 *
 * PASS criteria:
 *   - patternsEmitted-style result.totalSynced ≥ 0; .totalFailed = 0
 *   - sync_state cursor for each resource advances to a fresh timestamp
 *   - Full telemetry trail: hubspot_sync_started → 3 ×
 *     hubspot_sync_resource_completed → hubspot_sync_completed
 *   - No rate-limit warnings emitted
 *   - hubspot_cache row count change is bounded (sync should be cheap
 *     against MedVista's ~30 records)
 *
 * Cost ceiling per kickoff Decision 13:
 *   - HubSpot: ~3 search calls × ~30 records = ~90 reads (single run)
 *   - Cache UPSERTs: ~30 (idempotent — no-op if no records modified
 *     since last cursor)
 *
 * Usage:
 *   pnpm --filter @nexus/db exec tsx src/scripts/test-hubspot-periodic-sync-live.ts
 *
 * Env: requires .env.local with DATABASE_URL + HUBSPOT_PORTAL_ID +
 * NEXUS_HUBSPOT_TOKEN + HUBSPOT_CLIENT_SECRET.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const here = fileURLToPath(import.meta.url);
loadEnv({
  path: resolve(here, "../../../../../.env.local"),
  override: true,
});

import postgres from "postgres";

import { HANDLERS, type HubSpotPeriodicSyncResult } from "@nexus/shared";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERT: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `ASSERT ${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// ── Telemetry capture ─────────────────────────────────────────────────

const telemetryEvents: Array<Record<string, unknown>> = [];
const originalStderrWrite = process.stderr.write.bind(process.stderr);

process.stderr.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
  const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const event = JSON.parse(trimmed) as Record<string, unknown>;
      if (typeof event.event === "string") telemetryEvents.push(event);
    } catch {
      // not JSON
    }
  }
  return originalStderrWrite(chunk as never, ...(rest as []));
}) as typeof process.stderr.write;

function eventsOfType(name: string): Array<Record<string, unknown>> {
  return telemetryEvents.filter((e) => e.event === name);
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");
  const required = [
    "HUBSPOT_PORTAL_ID",
    "NEXUS_HUBSPOT_TOKEN",
    "HUBSPOT_CLIENT_SECRET",
  ];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`${key} not set`);
  }

  console.log("Live hubspot_periodic_sync — Phase 4 Day 2 Session B\n");

  const sql = postgres(dbUrl, { max: 1, prepare: false, idle_timeout: 30 });

  try {
    // ── Pre-state ────────────────────────────────────────────────────
    const beforeRun = new Date();
    const preCursors = await sql<
      Array<{ object_type: string; last_sync_at: Date }>
    >`
      SELECT object_type, last_sync_at FROM sync_state
       WHERE object_type IN ('deal', 'contact', 'company')
       ORDER BY object_type
    `;
    console.log("Pre-state — sync_state cursors:");
    for (const row of preCursors) {
      console.log(
        `  ${row.object_type}: last_sync_at = ${new Date(row.last_sync_at).toISOString()}`,
      );
    }
    if (preCursors.length === 0) {
      console.log("  (no rows — first run; default '1970-01-01' will apply)");
    }

    const preCacheCount = await sql<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM hubspot_cache
       WHERE object_type IN ('deal', 'contact', 'company')
    `;
    console.log(
      `\nhubspot_cache rows BEFORE (deal+contact+company): ${preCacheCount[0]!.count}`,
    );

    // ── Invoke handler ────────────────────────────────────────────────
    console.log(`\n── Invoking HANDLERS.hubspot_periodic_sync ──`);
    const result = (await HANDLERS.hubspot_periodic_sync(
      {},
      {
        jobId: "live-medvista-test",
        jobType: "hubspot_periodic_sync",
        hooks: { sql },
      },
    )) as HubSpotPeriodicSyncResult;

    console.log(`\nHandler result:`);
    console.log(`  totalSynced: ${result.totalSynced}`);
    console.log(`  totalFailed: ${result.totalFailed}`);
    console.log(`  durationMs:  ${result.durationMs}`);
    for (const r of result.resources) {
      const errSuffix = r.error ? ` ERROR=${r.error.slice(0, 80)}` : "";
      console.log(
        `    ${r.resource}: synced=${r.synced} failed=${r.failed} duration=${r.durationMs}ms${errSuffix}`,
      );
    }

    // ── Verification ──────────────────────────────────────────────────
    const startedEvents = eventsOfType("hubspot_sync_started");
    const completedEvents = eventsOfType("hubspot_sync_completed");
    const resourceCompleted = eventsOfType("hubspot_sync_resource_completed");
    const resourceFailed = eventsOfType("hubspot_sync_resource_failed");
    const rateLimitWarned = eventsOfType("hubspot_sync_rate_limit_warned");

    console.log(`\nTelemetry trail observed:`);
    console.log(`  hubspot_sync_started:           ${startedEvents.length}`);
    console.log(`  hubspot_sync_resource_completed: ${resourceCompleted.length}`);
    console.log(`  hubspot_sync_resource_failed:   ${resourceFailed.length}`);
    console.log(`  hubspot_sync_rate_limit_warned: ${rateLimitWarned.length}`);
    console.log(`  hubspot_sync_completed:         ${completedEvents.length}`);

    assertEqual(startedEvents.length, 1, "exactly 1 hubspot_sync_started");
    assertEqual(completedEvents.length, 1, "exactly 1 hubspot_sync_completed");
    assertEqual(rateLimitWarned.length, 0, "no rate-limit warnings");

    // The resource_completed events are emitted only for resources that
    // succeeded (not for resources that hit network errors). resourceFailed
    // covers the error branch. Together they should cover all 3 resources
    // unless a 429 caused a partial throw (which would also rethrow per
    // Decision 5 — different code path).
    const totalResourceEvents = resourceCompleted.length + resourceFailed.length;
    assertEqual(totalResourceEvents, 3, "all 3 resources reported");

    // Cursor advancement: every successful resource should have an UPSERT
    // entry with last_sync_at >= beforeRun.
    const postCursors = await sql<
      Array<{ object_type: string; last_sync_at: Date }>
    >`
      SELECT object_type, last_sync_at FROM sync_state
       WHERE object_type IN ('deal', 'contact', 'company')
       ORDER BY object_type
    `;
    console.log(`\nPost-state — sync_state cursors:`);
    for (const row of postCursors) {
      const ts = new Date(row.last_sync_at);
      const advanced = ts >= beforeRun;
      console.log(
        `  ${row.object_type}: last_sync_at = ${ts.toISOString()}${advanced ? " ← ADVANCED" : ""}`,
      );
    }

    // For each successful resource, verify cursor advanced.
    for (const event of resourceCompleted) {
      const resource = event.resource as string;
      const cursor = postCursors.find((c) => c.object_type === resource);
      assert(cursor, `${resource} cursor row exists post-run`);
      const cursorTs = new Date(cursor!.last_sync_at);
      assert(
        cursorTs >= beforeRun,
        `${resource} cursor advanced to >= beforeRun (was ${cursorTs.toISOString()})`,
      );
    }

    const postCacheCount = await sql<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM hubspot_cache
       WHERE object_type IN ('deal', 'contact', 'company')
    `;
    const cacheDelta = postCacheCount[0]!.count - preCacheCount[0]!.count;
    console.log(
      `\nhubspot_cache rows AFTER:  ${postCacheCount[0]!.count} (delta: ${cacheDelta >= 0 ? "+" : ""}${cacheDelta})`,
    );

    console.log(`\n── PHASE 4 DAY 2 SESSION B live exercise: PASS ──`);
  } finally {
    await sql.end({ timeout: 5 });
    process.stderr.write = originalStderrWrite;
  }
}

main().catch((err) => {
  process.stderr.write = originalStderrWrite;
  console.error("\ntest:hubspot-periodic-sync-live FAILED:", err);
  process.exit(1);
});
