/**
 * IntelligenceCoordinator.receiveSignal unit tests — Phase 4 Day 2 Session A.
 *
 * 8 cases per kickoff Decision 9:
 *   [1] happy path enqueue
 *   [2] dedup hit (existing in-flight job)
 *   [3] dedup window expired (no in-flight job >1 hour old)
 *   [4] signal validation failure: missing hubspotDealId
 *   [5] invalid signal type
 *   [6] vertical absent (null)
 *   [7] sequential receiveSignal calls (no race; second sees first's enqueue)
 *   [8] payload normalization (vertical+signalType land in jobs.input correctly)
 *
 * No DB; no Claude; deterministic. Mocks the `sql` parameter via the
 * `{databaseUrl, sql}` injection seam by feeding queries through a small
 * in-memory dispatcher.
 *
 * Usage:
 *   pnpm --filter @nexus/shared test:coordinator-receive-signal
 */
import type postgres from "postgres";

import { IntelligenceCoordinator } from "@nexus/shared";

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

// ── Mock SQL dispatcher ──────────────────────────────────────────────
//
// receiveSignal issues two query shapes:
//   (a) SELECT id FROM jobs WHERE type = 'coordinator_synthesis' AND status IN
//       ('queued','running') AND input->>'vertical' = $... AND
//       input->>'signalType' = $... AND created_at > now() - interval '1 hour'
//   (b) INSERT INTO jobs (type, status, input) VALUES (...) RETURNING id
//
// The mock recognizes these by SQL fragments and returns shaped results.
// State lives in `inFlightJobs` (queued|running rows that match the dedup
// window) and `insertedJobs` (every successful enqueue).

interface JobRow {
  id: string;
  vertical: string;
  signalType: string;
}

interface MockSqlState {
  inFlightJobs: JobRow[];
  insertedJobs: Array<{ id: string; input: Record<string, unknown> }>;
  nextId: number;
}

function makeMockSql(state: MockSqlState): postgres.Sql {
  const fn = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sqlText = strings.join("?");

    if (sqlText.includes("SELECT id FROM jobs") && sqlText.includes("type = 'coordinator_synthesis'")) {
      const verticalArg = String(values[0]);
      const signalTypeArg = String(values[1]);
      const match = state.inFlightJobs.find(
        (row) => row.vertical === verticalArg && row.signalType === signalTypeArg,
      );
      return Promise.resolve<Array<{ id: string }>>(match ? [{ id: match.id }] : []);
    }

    if (sqlText.includes("INSERT INTO jobs")) {
      const id = `mock-job-${state.nextId++}`;
      const inputArg = values[0] as Record<string, unknown> | undefined;
      state.insertedJobs.push({ id, input: inputArg ?? {} });
      return Promise.resolve<Array<{ id: string }>>([{ id }]);
    }

    throw new Error(`Mock sql: unrecognized query: ${sqlText.slice(0, 200)}`);
  };

  // postgres.js exposes sql.json() as a passthrough marker. The real client
  // returns an internal sentinel; the mock just forwards the value so the
  // INSERT branch can read it back as input. The receiveSignal code calls
  // `this.sql.json(jobInput as ...)` exactly once per insert so the value
  // arrives at the INSERT VALUES position above.
  (fn as unknown as { json: (v: unknown) => unknown }).json = (v: unknown) => v;

  return fn as unknown as postgres.Sql;
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
        // not JSON — ignore
      }
    }
    return originalStderrWrite(chunk as never, ...(rest as []));
  }) as typeof process.stderr.write;
}

function restoreTelemetry() {
  process.stderr.write = originalStderrWrite;
}

function lastTelemetryEvent(name: string): Record<string, unknown> | undefined {
  return telemetryEvents.filter((e) => e.event === name).pop();
}

// ── Helpers ───────────────────────────────────────────────────────────

function freshState(): MockSqlState {
  return { inFlightJobs: [], insertedJobs: [], nextId: 1 };
}

function makeCoordinator(state: MockSqlState): IntelligenceCoordinator {
  return new IntelligenceCoordinator({
    databaseUrl: "ignored://test",
    sql: makeMockSql(state),
  });
}

// ── Cases ─────────────────────────────────────────────────────────────

async function main() {
  captureTelemetry();
  try {
    // [1] Happy path enqueue.
    {
      console.log("[1] happy path enqueue…");
      telemetryEvents = [];
      const state = freshState();
      const coord = makeCoordinator(state);
      const outcome = await coord.receiveSignal({
        hubspotDealId: "deal-001",
        signalType: "competitive_intel",
        evidenceQuote: "they cited Microsoft",
        sourceSpeaker: "Buyer A",
        vertical: "healthcare",
      });
      assertEqual(outcome.kind, "enqueued", "outcome kind");
      assertEqual(state.insertedJobs.length, 1, "inserted job count");
      assertEqual(state.insertedJobs[0]!.input.vertical, "healthcare", "input.vertical");
      assertEqual(state.insertedJobs[0]!.input.signalType, "competitive_intel", "input.signalType");
      assert(lastTelemetryEvent("signal_received"), "signal_received telemetry emitted");
      console.log("      OK — enqueued mock-job-1, signal_received event emitted");
    }

    // [2] Dedup hit (existing in-flight job).
    {
      console.log("[2] dedup hit (existing in-flight)…");
      telemetryEvents = [];
      const state = freshState();
      state.inFlightJobs.push({
        id: "existing-job-99",
        vertical: "healthcare",
        signalType: "competitive_intel",
      });
      const coord = makeCoordinator(state);
      const outcome = await coord.receiveSignal({
        hubspotDealId: "deal-002",
        signalType: "competitive_intel",
        evidenceQuote: "another mention",
        sourceSpeaker: "Buyer B",
        vertical: "healthcare",
      });
      assertEqual(outcome.kind, "deduped", "outcome kind");
      assertEqual(
        outcome.kind === "deduped" ? outcome.existingJobId : null,
        "existing-job-99",
        "existing job id surfaces",
      );
      assertEqual(state.insertedJobs.length, 0, "no new job inserted");
      const dedupEvent = lastTelemetryEvent("signal_dedup_skipped");
      assert(dedupEvent, "signal_dedup_skipped telemetry emitted");
      assertEqual(dedupEvent!.existing_job_id, "existing-job-99", "telemetry carries existing job id");
      console.log("      OK — dedup hit returned existing-job-99, no insert");
    }

    // [3] Dedup window expired — no in-flight job means a fresh enqueue runs.
    //     Mock dispatcher's dedup check only matches in-flight rows; an
    //     empty in-flight list models the "expired-or-completed" case.
    {
      console.log("[3] dedup window expired (empty in-flight list)…");
      telemetryEvents = [];
      const state = freshState();
      const coord = makeCoordinator(state);
      const outcome = await coord.receiveSignal({
        hubspotDealId: "deal-003",
        signalType: "deal_blocker",
        evidenceQuote: "they said no",
        sourceSpeaker: "Buyer C",
        vertical: "financial_services",
      });
      assertEqual(outcome.kind, "enqueued", "outcome kind");
      assertEqual(state.insertedJobs.length, 1, "inserted job count");
      console.log("      OK — empty in-flight set → fresh enqueue");
    }

    // [4] Validation failure: missing hubspotDealId.
    {
      console.log("[4] missing hubspotDealId rejected…");
      telemetryEvents = [];
      const state = freshState();
      const coord = makeCoordinator(state);
      const outcome = await coord.receiveSignal({
        hubspotDealId: "",
        signalType: "competitive_intel",
        evidenceQuote: "x",
        sourceSpeaker: "y",
        vertical: "healthcare",
      });
      assertEqual(outcome.kind, "rejected", "outcome kind");
      assertEqual(
        outcome.kind === "rejected" ? outcome.reason : null,
        "missing_hubspot_deal_id",
        "reason",
      );
      assertEqual(state.insertedJobs.length, 0, "no insert on rejection");
      const invalid = lastTelemetryEvent("signal_received_invalid");
      assert(invalid, "signal_received_invalid telemetry emitted");
      assertEqual(invalid!.reason, "missing_hubspot_deal_id", "telemetry reason");
      console.log("      OK — missing hubspotDealId rejected cleanly");
    }

    // [5] Invalid signal type.
    {
      console.log("[5] invalid signal type rejected…");
      telemetryEvents = [];
      const state = freshState();
      const coord = makeCoordinator(state);
      const outcome = await coord.receiveSignal({
        hubspotDealId: "deal-005",
        signalType: "made_up_signal_type",
        evidenceQuote: "x",
        sourceSpeaker: "y",
        vertical: "healthcare",
      });
      assertEqual(outcome.kind, "rejected", "outcome kind");
      assertEqual(
        outcome.kind === "rejected" ? outcome.reason : null,
        "invalid_signal_type",
        "reason",
      );
      assertEqual(state.insertedJobs.length, 0, "no insert on invalid signal type");
      console.log("      OK — invalid signal type rejected");
    }

    // [6] Vertical absent (null).
    {
      console.log("[6] vertical absent (null) rejected…");
      telemetryEvents = [];
      const state = freshState();
      const coord = makeCoordinator(state);
      const outcome = await coord.receiveSignal({
        hubspotDealId: "deal-006",
        signalType: "competitive_intel",
        evidenceQuote: "x",
        sourceSpeaker: "y",
        vertical: null,
      });
      assertEqual(outcome.kind, "rejected", "outcome kind");
      assertEqual(
        outcome.kind === "rejected" ? outcome.reason : null,
        "missing_vertical",
        "reason",
      );
      assertEqual(state.insertedJobs.length, 0, "no insert on missing vertical");
      console.log("      OK — null vertical rejected");
    }

    // [7] Sequential receiveSignal calls — second call's dedup query MUST
    //     see the first call's enqueue. Models the post-Day-2 transcript
    //     pipeline where receiveSignal fans over multiple signals
    //     sequentially in a forEach loop.
    {
      console.log("[7] sequential calls — second sees first's job…");
      telemetryEvents = [];
      const state = freshState();
      const coord = makeCoordinator(state);

      // Wire mock to lift inserted jobs into the in-flight list (so the
      // next call's dedup check sees it).
      const sqlAdapter = makeMockSql(state);
      const coordWithLifecycle = new IntelligenceCoordinator({
        databaseUrl: "ignored://test",
        sql: ((strings: TemplateStringsArray, ...values: unknown[]) => {
          const sqlText = strings.join("?");
          if (sqlText.includes("INSERT INTO jobs")) {
            const result = (sqlAdapter as unknown as Function).call(null, strings, ...values) as Promise<
              Array<{ id: string }>
            >;
            return result.then((rows) => {
              const newRow = rows[0]!;
              const inserted = state.insertedJobs[state.insertedJobs.length - 1]!;
              state.inFlightJobs.push({
                id: newRow.id,
                vertical: inserted.input.vertical as string,
                signalType: inserted.input.signalType as string,
              });
              return rows;
            });
          }
          return (sqlAdapter as unknown as Function).call(null, strings, ...values);
        }) as unknown as postgres.Sql,
      });
      // Patch sql.json on the lifecycle adapter (postgres.js sentinel).
      ((coordWithLifecycle as unknown as { sql: { json: (v: unknown) => unknown } }).sql).json =
        (v: unknown) => v;

      const o1 = await coordWithLifecycle.receiveSignal({
        hubspotDealId: "deal-007a",
        signalType: "process_friction",
        evidenceQuote: "x",
        sourceSpeaker: "y",
        vertical: "manufacturing",
      });
      const o2 = await coordWithLifecycle.receiveSignal({
        hubspotDealId: "deal-007b",
        signalType: "process_friction",
        evidenceQuote: "x",
        sourceSpeaker: "y",
        vertical: "manufacturing",
      });
      assertEqual(o1.kind, "enqueued", "first call enqueues");
      assertEqual(o2.kind, "deduped", "second call dedups");
      assertEqual(state.insertedJobs.length, 1, "exactly one job inserted across the pair");
      console.log("      OK — sequential calls dedup correctly");
    }

    // [8] Payload normalization — input shape lands as expected on jobs.input.
    {
      console.log("[8] payload normalization…");
      telemetryEvents = [];
      const state = freshState();
      const coord = makeCoordinator(state);
      const before = new Date().toISOString();
      const outcome = await coord.receiveSignal({
        hubspotDealId: "deal-008",
        signalType: "win_pattern",
        evidenceQuote: "they renewed",
        sourceSpeaker: "AE",
        transcriptId: "transcript-123",
        vertical: "technology",
      });
      const after = new Date().toISOString();
      assertEqual(outcome.kind, "enqueued", "outcome kind");
      const inserted = state.insertedJobs[0]!.input;
      assertEqual(inserted.vertical, "technology", "vertical preserved");
      assertEqual(inserted.signalType, "win_pattern", "signalType preserved");
      assertEqual(inserted.triggeringDealId, "deal-008", "triggeringDealId preserved");
      assertEqual(inserted.triggeringTranscriptId, "transcript-123", "triggeringTranscriptId preserved");
      assert(typeof inserted.enqueuedAt === "string", "enqueuedAt is iso string");
      assert(
        (inserted.enqueuedAt as string) >= before && (inserted.enqueuedAt as string) <= after,
        "enqueuedAt within plausible window",
      );
      console.log("      OK — payload shape matches expected job.input contract");
    }

    console.log("\nIntelligenceCoordinator.receiveSignal: ALL 8/8 CASES PASS.");
  } finally {
    restoreTelemetry();
  }
}

main().catch((err) => {
  restoreTelemetry();
  console.error("test:coordinator-receive-signal FAILED:", err);
  process.exit(1);
});
