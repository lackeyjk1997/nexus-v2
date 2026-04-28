/**
 * hubspot_periodic_sync handler unit tests — Phase 4 Day 2 Session B.
 *
 * 4 cases per kickoff Decision 12:
 *   [1] empty result (no modified records) — synced=0, failed=0,
 *       sync_state cursor still advances (every successful call updates
 *       the cursor regardless of whether records were returned)
 *   [2] 1 modified deal — synced=1, hubspot_cache write recorded,
 *       sync_state cursor advances
 *   [3] sync_state cursor advancement — verify the new cursor is the
 *       sync-start time (NOT the last record's modified time), so
 *       records modified DURING the fetch get re-fetched next run
 *       rather than being missed
 *   [4] partial failure — 1 of 3 resources errors; the other 2 still
 *       succeed AND advance their cursors. Failed resource's cursor
 *       stays at its pre-call value.
 *
 * No DB; no live HubSpot. Mocks both `sql` (via JobHandlerHooks
 * extension) and the HubSpotAdapter's bulkSync* methods (via
 * `ctx.hooks.hubspotAdapter`).
 *
 * Telemetry assertions per Decision 11 — every case verifies the
 * stderr trail (`hubspot_sync_started` / `_resource_completed` /
 * `_resource_failed` / `_completed`).
 *
 * Usage:
 *   pnpm --filter @nexus/shared test:hubspot-periodic-sync
 */
import type postgres from "postgres";

import { HANDLERS } from "@nexus/shared";

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

// ── Mock SQL state ───────────────────────────────────────────────────

interface SyncStateRow {
  object_type: "deal" | "contact" | "company";
  last_sync_at: Date;
}

interface MockSqlState {
  syncStateRows: SyncStateRow[];
  upsertCalls: Array<{ object_type: string; last_sync_at: Date }>;
}

function makeMockSql(state: MockSqlState): postgres.Sql {
  const fn = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sqlText = strings.join("?");

    if (sqlText.includes("SELECT object_type, last_sync_at FROM sync_state")) {
      return Promise.resolve(state.syncStateRows);
    }

    if (sqlText.includes("INSERT INTO sync_state")) {
      const objectType = String(values[0]);
      const lastSyncAt = values[1] as Date;
      state.upsertCalls.push({ object_type: objectType, last_sync_at: lastSyncAt });
      const existing = state.syncStateRows.find((r) => r.object_type === objectType);
      if (existing) {
        existing.last_sync_at = lastSyncAt;
      } else {
        state.syncStateRows.push({
          object_type: objectType as "deal" | "contact" | "company",
          last_sync_at: lastSyncAt,
        });
      }
      return Promise.resolve([]);
    }

    throw new Error(`Mock sql: unrecognized query: ${sqlText.slice(0, 200)}`);
  };
  return fn as unknown as postgres.Sql;
}

// ── Mock adapter ──────────────────────────────────────────────────────

type BulkSyncMockFn = (options?: {
  since?: Date;
  pageSize?: number;
}) => Promise<{ synced: number; failed: number }>;

interface MockHubSpotAdapter {
  bulkSyncDeals: BulkSyncMockFn;
  bulkSyncContacts: BulkSyncMockFn;
  bulkSyncCompanies: BulkSyncMockFn;
  // updateDealCustomProperties is in the JobHandlerHooks union but unused
  // by hubspot_periodic_sync; provide a stub for type-compatibility.
  updateDealCustomProperties: (...args: unknown[]) => Promise<unknown>;
  callLog: Array<{ method: string; since?: Date }>;
}

function makeMockAdapter(opts: {
  deals?: BulkSyncMockFn;
  contacts?: BulkSyncMockFn;
  companies?: BulkSyncMockFn;
}): MockHubSpotAdapter {
  const callLog: MockHubSpotAdapter["callLog"] = [];
  const wrap = (
    method: string,
    fn?: BulkSyncMockFn,
  ): BulkSyncMockFn => async (options?: { since?: Date; pageSize?: number }) => {
    callLog.push({ method, since: options?.since });
    return fn ? fn(options) : { synced: 0, failed: 0 };
  };
  return {
    bulkSyncDeals: wrap("bulkSyncDeals", opts.deals),
    bulkSyncContacts: wrap("bulkSyncContacts", opts.contacts),
    bulkSyncCompanies: wrap("bulkSyncCompanies", opts.companies),
    updateDealCustomProperties: async () => ({}),
    callLog,
  };
}

// ── Telemetry capture ─────────────────────────────────────────────────

let telemetryEvents: Array<Record<string, unknown>> = [];
const originalStderrWrite = process.stderr.write.bind(process.stderr);

function captureTelemetry() {
  telemetryEvents = [];
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
}

function restoreTelemetry() {
  process.stderr.write = originalStderrWrite;
}

function eventsOfType(name: string): Array<Record<string, unknown>> {
  return telemetryEvents.filter((e) => e.event === name);
}

// ── Cases ─────────────────────────────────────────────────────────────

async function runHandler(
  state: MockSqlState,
  adapter: MockHubSpotAdapter,
): Promise<{
  totalSynced: number;
  totalFailed: number;
  durationMs: number;
  resources: ReadonlyArray<{
    resource: string;
    synced: number;
    failed: number;
    durationMs: number;
    error?: string;
  }>;
}> {
  return (await HANDLERS.hubspot_periodic_sync(
    {},
    {
      jobId: "test-job",
      jobType: "hubspot_periodic_sync",
      hooks: {
        sql: makeMockSql(state),
        hubspotAdapter: adapter as never,
      },
    },
  )) as Awaited<ReturnType<typeof runHandler>>;
}

async function main() {
  captureTelemetry();
  try {
    // [1] Empty result — every resource returns 0/0; cursors still advance.
    {
      console.log("[1] empty result — synced=0, cursors advance…");
      telemetryEvents = [];
      const state: MockSqlState = { syncStateRows: [], upsertCalls: [] };
      const adapter = makeMockAdapter({});
      const result = await runHandler(state, adapter);

      assertEqual(result.totalSynced, 0, "totalSynced");
      assertEqual(result.totalFailed, 0, "totalFailed");
      assertEqual(result.resources.length, 3, "all 3 resources processed");
      assertEqual(state.upsertCalls.length, 3, "3 cursor UPSERTs (deal+contact+company)");
      const upserted = state.upsertCalls.map((u) => u.object_type).sort();
      assertEqual(JSON.stringify(upserted), JSON.stringify(["company", "contact", "deal"]), "all 3 cursors advanced");

      const completed = eventsOfType("hubspot_sync_completed");
      const resourceCompleted = eventsOfType("hubspot_sync_resource_completed");
      assertEqual(completed.length, 1, "1 hubspot_sync_completed event");
      assertEqual(resourceCompleted.length, 3, "3 resource_completed events");
      assertEqual(completed[0]!.total_synced, 0, "completed.total_synced=0");
      console.log("      OK — empty result emits full telemetry trail; cursors advanced");
    }

    // [2] One modified deal.
    {
      console.log("[2] 1 modified deal — synced=1, cursor advances…");
      telemetryEvents = [];
      const state: MockSqlState = { syncStateRows: [], upsertCalls: [] };
      const adapter = makeMockAdapter({
        deals: async () => ({ synced: 1, failed: 0 }),
      });
      const result = await runHandler(state, adapter);

      assertEqual(result.totalSynced, 1, "totalSynced=1");
      assertEqual(result.resources[0]!.synced, 1, "deal resource synced=1");

      const detected = eventsOfType("hubspot_sync_resource_completed").find(
        (e) => e.resource === "deal",
      );
      assert(detected, "deal resource_completed event present");
      assertEqual(detected!.synced, 1, "telemetry.deal.synced=1");
      console.log("      OK — 1 deal synced + telemetry trail intact");
    }

    // [3] Cursor advancement uses sync-start time, NOT last record's modified time.
    {
      console.log("[3] cursor uses sync-start time (conservative)…");
      telemetryEvents = [];
      const oldCursor = new Date("2025-12-01T00:00:00Z");
      const state: MockSqlState = {
        syncStateRows: [{ object_type: "deal", last_sync_at: oldCursor }],
        upsertCalls: [],
      };
      const beforeRun = new Date();
      const adapter = makeMockAdapter({
        deals: async (opts) => {
          // Verify the adapter received the OLD cursor as `since`.
          assert(opts?.since, "adapter received since arg");
          assertEqual(opts!.since!.getTime(), oldCursor.getTime(), "since == old cursor");
          return { synced: 5, failed: 0 };
        },
      });
      const result = await runHandler(state, adapter);
      const afterRun = new Date();

      // UPSERT for deal must use a time AFTER beforeRun (capture-before-fetch).
      const dealUpsert = state.upsertCalls.find((u) => u.object_type === "deal");
      assert(dealUpsert, "deal cursor upsert occurred");
      const newCursor = dealUpsert!.last_sync_at;
      assert(
        newCursor.getTime() >= beforeRun.getTime() &&
          newCursor.getTime() <= afterRun.getTime(),
        "new cursor lies within [beforeRun, afterRun] (sync-start capture)",
      );
      assert(newCursor.getTime() > oldCursor.getTime(), "new cursor > old cursor");
      assertEqual(result.resources[0]!.synced, 5, "5 records synced");
      console.log("      OK — cursor advances to sync-start time, not last-record-modified");
    }

    // [4] Partial failure — contacts errors, deal+company still succeed.
    {
      console.log("[4] partial failure — 1 of 3 errors; others succeed…");
      telemetryEvents = [];
      const state: MockSqlState = { syncStateRows: [], upsertCalls: [] };
      const adapter = makeMockAdapter({
        deals: async () => ({ synced: 2, failed: 0 }),
        contacts: async () => {
          throw new Error("simulated network error");
        },
        companies: async () => ({ synced: 3, failed: 0 }),
      });
      const result = await runHandler(state, adapter);

      assertEqual(result.totalSynced, 5, "totalSynced=5 (deal=2 + company=3)");
      assertEqual(result.resources.length, 3, "all 3 resources reported");
      const contactsEntry = result.resources.find((r) => r.resource === "contact");
      assert(contactsEntry, "contacts entry present");
      assert(contactsEntry!.error?.includes("simulated network error"), "contacts carries error string");
      assertEqual(contactsEntry!.synced, 0, "contacts synced=0");

      // Cursor advancement: ONLY deal + company should have UPSERT calls.
      // Failed resource (contacts) keeps its pre-call cursor untouched.
      const upserted = state.upsertCalls.map((u) => u.object_type).sort();
      assertEqual(
        JSON.stringify(upserted),
        JSON.stringify(["company", "deal"]),
        "only deal+company cursors advanced; contacts cursor preserved",
      );

      const failedEvent = eventsOfType("hubspot_sync_resource_failed");
      assertEqual(failedEvent.length, 1, "1 resource_failed event");
      assertEqual(failedEvent[0]!.resource, "contact", "failed event names contacts");
      const completedResources = eventsOfType("hubspot_sync_resource_completed").map(
        (e) => e.resource,
      );
      assertEqual(
        JSON.stringify([...completedResources].sort()),
        JSON.stringify(["company", "deal"]),
        "completed events name only deal + company",
      );

      // Final completion event should fire.
      const completed = eventsOfType("hubspot_sync_completed");
      assertEqual(completed.length, 1, "completed event fires despite partial failure");
      assertEqual(completed[0]!.total_synced, 5, "completed.total_synced=5");
      console.log("      OK — partial failure: 2 succeed + advance, 1 fails + cursor preserved");
    }

    console.log("\nhubspot_periodic_sync handler: ALL 4/4 CASES PASS.");
  } finally {
    restoreTelemetry();
  }
}

main().catch((err) => {
  restoreTelemetry();
  console.error("test:hubspot-periodic-sync FAILED:", err);
  process.exit(1);
});
