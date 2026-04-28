/**
 * coordinator_synthesis handler unit tests — Phase 4 Day 2 Session A.
 *
 * 3 PHASES per kickoff Decision 9:
 *   PHASE 1 — empty signals → 0 patterns + silence-as-feature.
 *             Asserts telemetry trail: coordinator_synthesis_started +
 *             coordinator_synthesis_completed{patterns_emitted=0}. NO
 *             pattern_below_threshold (because no groups existed).
 *
 *   PHASE 2 — 1 vertical + 3-deals same signal → 1 pattern emitted.
 *             Asserts telemetry trail: coordinator_synthesis_started +
 *             pattern_detected + coordinator_synthesis_completed
 *             {patterns_emitted=1}.
 *
 *   PHASE 3 — 1 vertical + 1-deal signal (below threshold) + 1 vertical
 *             + 3-deals same signal → 1 pattern emitted. Telemetry trail
 *             includes BOTH pattern_below_threshold (for the 1-deal group)
 *             AND pattern_detected (for the 3-deal group).
 *
 * No DB; no Claude; deterministic. Mocks both `sql` (via JobHandlerHooks
 * extension) and `callClaude` (via MockClaudeWrapper). Asserts the
 * telemetry contract per Decision 8 — silence-path verification at the
 * unit level mirrors the live exercise's silence-path verification (Item
 * 3) so a "silently bailed without evaluating threshold" failure is
 * detectable in BOTH layers per Decision 10's spirit.
 *
 * Usage:
 *   pnpm --filter @nexus/shared test:coordinator-synthesis
 */
import type postgres from "postgres";

import {
  HANDLERS,
  makeMockCallClaude,
  type CoordinatorSynthesisOutput,
} from "@nexus/shared";

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
// coordinator_synthesis handler issues these query shapes:
//   (a) SELECT ... FROM deal_events WHERE type='signal_detected' AND ...
//       (the "recent signals" read)
//   (b) INSERT INTO coordinator_patterns ... ON CONFLICT (pattern_key)
//       DO NOTHING RETURNING id
//   (c) INSERT INTO coordinator_pattern_deals ... ON CONFLICT DO NOTHING

interface SignalEventFixture {
  hubspot_deal_id: string;
  vertical: string;
  signal_type: string;
  evidence_quote: string;
  source_speaker: string;
  urgency: string;
  deal_size_band: string;
  created_at: string;
}

interface MockSqlState {
  signalEvents: SignalEventFixture[];
  patternsInserted: Array<{
    id: string;
    pattern_key: string;
    signal_type: string;
    vertical: string;
    synthesis: string;
  }>;
  joinRowsInserted: Array<{ pattern_id: string; hubspot_deal_id: string }>;
  nextPatternId: number;
}

function makeMockSql(state: MockSqlState): postgres.Sql {
  const fn = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sqlText = strings.join("?");
    if (sqlText.includes("FROM deal_events") && sqlText.includes("signal_detected")) {
      return Promise.resolve(state.signalEvents);
    }
    if (sqlText.includes("INSERT INTO coordinator_patterns")) {
      const patternKey = String(values[0]);
      const signalType = String(values[1]);
      const vertical = String(values[2]);
      const synthesis = String(values[3]);
      // Idempotency check.
      if (state.patternsInserted.some((p) => p.pattern_key === patternKey)) {
        return Promise.resolve([]); // ON CONFLICT DO NOTHING returns empty
      }
      const id = `mock-pattern-${state.nextPatternId++}`;
      state.patternsInserted.push({ id, pattern_key: patternKey, signal_type: signalType, vertical, synthesis });
      return Promise.resolve([{ id }]);
    }
    if (sqlText.includes("SELECT id FROM coordinator_patterns WHERE pattern_key")) {
      const patternKey = String(values[0]);
      const found = state.patternsInserted.find((p) => p.pattern_key === patternKey);
      return Promise.resolve(found ? [{ id: found.id }] : []);
    }
    if (sqlText.includes("INSERT INTO coordinator_pattern_deals")) {
      const patternId = String(values[0]);
      const hubspotDealId = String(values[1]);
      const exists = state.joinRowsInserted.some(
        (r) => r.pattern_id === patternId && r.hubspot_deal_id === hubspotDealId,
      );
      if (!exists) {
        state.joinRowsInserted.push({ pattern_id: patternId, hubspot_deal_id: hubspotDealId });
      }
      return Promise.resolve([]);
    }
    throw new Error(`Mock sql: unrecognized query: ${sqlText.slice(0, 200)}`);
  };
  // postgres.js sql.json() passthrough.
  (fn as unknown as { json: (v: unknown) => unknown; unsafe: (v: string) => string }).json = (v) => v;
  (fn as unknown as { unsafe: (v: string) => string }).unsafe = (v) => v;
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

function eventsOfType(name: string): Array<Record<string, unknown>> {
  return telemetryEvents.filter((e) => e.event === name);
}

// ── Mock claude fixture (reused across phases) ───────────────────────

const claudeFixture: CoordinatorSynthesisOutput = {
  reasoning_trace:
    "Three healthcare deals all surfaced Microsoft DAX pricing pressure within 10 days. Mechanism is Microsoft's quarter-end discount push, not product fit. Lineage: novel — no prior pattern of this type/vertical. Per-deal application: each deal needs a TCO comparison sized to the buyer's specific concern. Portfolio impact: 1 at-risk healthcare deal noted in the at-risk block. Constraint: no active manager directive conflicts.",
  synthesis: {
    headline: "Microsoft DAX Q-end discount pressure across three Healthcare deals.",
    mechanism:
      "Three Healthcare AEs cited Microsoft DAX 25% discount in the past 10 days; all three buyers identified pricing as the gating criterion. Mechanism is commercial urgency from Microsoft's quarter close, not product-fit erosion.",
    lineage: { is_extension_of_prior: false, prior_pattern_id: null, lineage_explanation: null },
  },
  recommendations: [
    {
      target_deal_id: null,
      target_deal_name: null,
      priority: "this_week",
      application: "vertical_wide",
      action: "Deploy the Microsoft price-hold bundle to Healthcare deals citing DAX discounting.",
      cited_signal_quotes: ["they cited Microsoft", "Microsoft's discount"],
    },
  ],
  arr_impact: {
    directly_affected_deals: 3,
    at_risk_comparable_deals: 1,
    multiplier: 1.33,
    calculation: "(3 + 1) / 3 = 1.33",
    confidence: "medium",
  },
  constraint_acknowledgment: {
    conflicts_with_directive: null,
    amplifies_experiment_ids: [],
  },
};

// ── Phase runner helpers ──────────────────────────────────────────────

function freshState(signals: SignalEventFixture[]): MockSqlState {
  return {
    signalEvents: signals,
    patternsInserted: [],
    joinRowsInserted: [],
    nextPatternId: 1,
  };
}

function makeSignal(
  dealId: string,
  vertical: string,
  signalType: string,
  daysAgo: number,
  evidenceQuote = "evidence quote",
  speaker = "Buyer",
): SignalEventFixture {
  const created = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  return {
    hubspot_deal_id: dealId,
    vertical,
    signal_type: signalType,
    evidence_quote: evidenceQuote,
    source_speaker: speaker,
    urgency: "medium",
    deal_size_band: "1m-5m",
    created_at: created,
  };
}

// ── Phases ────────────────────────────────────────────────────────────

async function phase1_empty() {
  console.log("PHASE 1 — empty signals → 0 patterns + silence-as-feature…");
  telemetryEvents = [];
  const state = freshState([]);
  const mockClaude = makeMockCallClaude({
    fixtures: { "04-coordinator-synthesis": claudeFixture },
  });

  const result = (await HANDLERS.coordinator_synthesis(
    {},
    { jobId: "job-phase-1", jobType: "coordinator_synthesis", hooks: { sql: makeMockSql(state), callClaude: mockClaude.call } },
  )) as { patternsEmitted: number; groupsEvaluated: number; signalsRead: number };

  assertEqual(result.patternsEmitted, 0, "patternsEmitted=0 (silence)");
  assertEqual(result.groupsEvaluated, 0, "groupsEvaluated=0 (no groups)");
  assertEqual(result.signalsRead, 0, "signalsRead=0");
  assertEqual(state.patternsInserted.length, 0, "no DB writes");

  // Telemetry trail check — the SILENCE PATH discipline.
  const startedEvents = eventsOfType("coordinator_synthesis_started");
  const completedEvents = eventsOfType("coordinator_synthesis_completed");
  const belowEvents = eventsOfType("pattern_below_threshold");
  const detectedEvents = eventsOfType("pattern_detected");
  assertEqual(startedEvents.length, 1, "exactly 1 coordinator_synthesis_started");
  assertEqual(completedEvents.length, 1, "exactly 1 coordinator_synthesis_completed");
  assertEqual(belowEvents.length, 0, "no pattern_below_threshold (no groups existed)");
  assertEqual(detectedEvents.length, 0, "no pattern_detected (silence path)");
  assertEqual(completedEvents[0]!.patterns_emitted, 0, "completed.patterns_emitted=0");
  assertEqual(mockClaude.history.length, 0, "no Claude calls (no groups)");
  console.log("      OK — silence-as-feature with full telemetry trail");
}

async function phase2_one_pattern() {
  console.log("PHASE 2 — 1 vertical + 3-deals same signal → 1 pattern emitted…");
  telemetryEvents = [];
  // Three healthcare deals, all with competitive_intel signals.
  const signals: SignalEventFixture[] = [
    makeSignal("deal-A", "healthcare", "competitive_intel", 3, "they cited Microsoft DAX"),
    makeSignal("deal-A", "healthcare", "competitive_intel", 5, "Microsoft pricing pressure"),
    makeSignal("deal-B", "healthcare", "competitive_intel", 4, "DAX is closing Q-end"),
    makeSignal("deal-C", "healthcare", "competitive_intel", 2, "Microsoft 25% discount"),
  ];
  const state = freshState(signals);
  const mockClaude = makeMockCallClaude({
    fixtures: { "04-coordinator-synthesis": claudeFixture },
  });

  const result = (await HANDLERS.coordinator_synthesis(
    {},
    { jobId: "job-phase-2", jobType: "coordinator_synthesis", hooks: { sql: makeMockSql(state), callClaude: mockClaude.call } },
  )) as { patternsEmitted: number; groupsEvaluated: number; signalsRead: number };

  assertEqual(result.patternsEmitted, 1, "patternsEmitted=1");
  assertEqual(result.groupsEvaluated, 1, "groupsEvaluated=1");
  assertEqual(result.signalsRead, 4, "signalsRead=4");
  assertEqual(state.patternsInserted.length, 1, "exactly 1 pattern row inserted");
  assertEqual(state.joinRowsInserted.length, 3, "3 join rows (one per affected deal)");
  assertEqual(mockClaude.history.length, 1, "exactly 1 Claude call");
  assertEqual(mockClaude.history[0]!.input.promptFile, "04-coordinator-synthesis", "promptFile");

  const detectedEvents = eventsOfType("pattern_detected");
  const completedEvents = eventsOfType("coordinator_synthesis_completed");
  const belowEvents = eventsOfType("pattern_below_threshold");
  assertEqual(detectedEvents.length, 1, "1 pattern_detected event");
  assertEqual(detectedEvents[0]!.deals_affected, 3, "deals_affected=3");
  assertEqual(detectedEvents[0]!.vertical, "healthcare", "vertical");
  assertEqual(detectedEvents[0]!.signal_type, "competitive_intel", "signal_type");
  assertEqual(belowEvents.length, 0, "no pattern_below_threshold (group cleared)");
  assertEqual(completedEvents[0]!.patterns_emitted, 1, "completed.patterns_emitted=1");
  console.log("      OK — 1 pattern emitted with full telemetry trail");
}

async function phase3_mixed() {
  console.log("PHASE 3 — mixed: 1-deal sub-threshold group + 3-deal qualifying group…");
  telemetryEvents = [];
  // Healthcare/competitive_intel — 3 deals (qualifies)
  // Healthcare/process_friction — 1 deal (below threshold)
  const signals: SignalEventFixture[] = [
    makeSignal("deal-A", "healthcare", "competitive_intel", 3, "Microsoft pricing"),
    makeSignal("deal-B", "healthcare", "competitive_intel", 4, "Microsoft DAX"),
    makeSignal("deal-C", "healthcare", "competitive_intel", 5, "Microsoft discount"),
    makeSignal("deal-D", "healthcare", "process_friction", 2, "security questionnaire"),
  ];
  const state = freshState(signals);
  const mockClaude = makeMockCallClaude({
    fixtures: { "04-coordinator-synthesis": claudeFixture },
  });

  const result = (await HANDLERS.coordinator_synthesis(
    {},
    { jobId: "job-phase-3", jobType: "coordinator_synthesis", hooks: { sql: makeMockSql(state), callClaude: mockClaude.call } },
  )) as { patternsEmitted: number; groupsEvaluated: number; signalsRead: number };

  assertEqual(result.patternsEmitted, 1, "patternsEmitted=1 (only competitive_intel qualifies)");
  assertEqual(result.groupsEvaluated, 2, "groupsEvaluated=2");
  assertEqual(result.signalsRead, 4, "signalsRead=4");
  assertEqual(state.patternsInserted.length, 1, "exactly 1 pattern row");
  assertEqual(mockClaude.history.length, 1, "1 Claude call (only for qualifying group)");

  // Telemetry trail must show BOTH below_threshold AND pattern_detected.
  const detectedEvents = eventsOfType("pattern_detected");
  const belowEvents = eventsOfType("pattern_below_threshold");
  assertEqual(detectedEvents.length, 1, "1 pattern_detected (competitive_intel)");
  assertEqual(belowEvents.length, 1, "1 pattern_below_threshold (process_friction)");
  assertEqual(belowEvents[0]!.signal_type, "process_friction", "below.signal_type");
  assertEqual(belowEvents[0]!.deals_affected, 1, "below.deals_affected=1");
  assertEqual(belowEvents[0]!.threshold, 2, "below.threshold=2 (default)");
  console.log("      OK — mixed groups; below + detected events both emitted");
}

async function main() {
  captureTelemetry();
  try {
    await phase1_empty();
    await phase2_one_pattern();
    await phase3_mixed();
    console.log("\ncoordinator_synthesis handler: ALL 3/3 PHASES PASS.");
  } finally {
    restoreTelemetry();
  }
}

main().catch((err) => {
  restoreTelemetry();
  console.error("test:coordinator-synthesis FAILED:", err);
  process.exit(1);
});
