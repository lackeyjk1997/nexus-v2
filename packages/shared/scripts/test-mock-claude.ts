/**
 * MockClaudeWrapper harness — Phase 3 Day 1 Session B.
 *
 * Exercises `makeMockCallClaude` end-to-end with a realistic fixture for
 * `01-detect-signals`. Verifies:
 *
 *   1. The mock's `call` drops into `callClaude`'s signature — the type
 *      check alone proves this; runtime assertion follows.
 *   2. Fixture lookup by promptFile works; the returned `toolInput`
 *      equals the fixture value by reference.
 *   3. History accumulates per call; `reset()` clears it.
 *   4. Fixture-miss throws with a helpful error message.
 *   5. Structural output fields (stopReason, usage, attempts, model,
 *      promptVersion, promptFile, toolName) carry the synthesized
 *      defaults the mock promises.
 *
 * Consumer pattern this harness demonstrates (for Phase 3 Day 2 + later):
 *   const mock = makeMockCallClaude({
 *     fixtures: { "01-detect-signals": { signals: [...], ... } },
 *   });
 *   const consumer = buildTranscriptPipelineConsumer({ callClaude: mock.call });
 *   await consumer.runStep(transcriptId);
 *   expect(mock.history[0].input.vars.transcriptText).toContain("HIPAA");
 *
 * Usage:
 *   pnpm --filter @nexus/shared test:mock-claude
 *
 * No env vars required — pure in-memory test.
 */
import {
  detectSignalsTool,
  makeMockCallClaude,
  type DetectSignalsOutput,
} from "@nexus/shared";

const DETECT_SIGNALS_FIXTURE: DetectSignalsOutput = {
  reasoning_trace:
    "I identified two salient signals: Microsoft DAX Copilot as a named competitive evaluator (competitive_intel, high urgency — direct vendor short-list reference) and the buyer's 6-8 week security review as a process-timing constraint (process_friction, medium urgency — acknowledged early by Jennifer Wu as a known gating step). No deal_blocker, content_gap, or win_pattern signals met the 0.5 confidence floor in this discovery call.",
  signals: [
    {
      signal_type: "competitive_intel",
      summary: "Buyer named Microsoft DAX Copilot as incumbent in short-list.",
      evidence_quote:
        "we're also looking at Microsoft DAX Copilot for the ambient documentation piece",
      source_speaker: "Dr. Michael Chen",
      urgency: "high",
      confidence: 0.92,
      rationale:
        "Direct mention of a named competitor in Discovery-stage eval; stage + attribution clear.",
      competitor_name: "Microsoft DAX Copilot",
      recurs_open_signal_id: null,
      matches_pattern_id: null,
      matches_experiment_id: null,
    },
    {
      signal_type: "process_friction",
      summary: "Security review expected to run 6-8 weeks.",
      evidence_quote:
        "our InfoSec team typically takes six to eight weeks for anything new",
      source_speaker: "Dr. Michael Chen",
      urgency: "medium",
      confidence: 0.85,
      rationale:
        "Explicit process timeline threatens proposal-to-close velocity.",
      competitor_name: null,
      recurs_open_signal_id: null,
      matches_pattern_id: null,
      matches_experiment_id: null,
    },
  ],
  stakeholder_insights: [
    {
      contact_name: "Dr. Michael Chen",
      is_new_contact: false,
      sentiment: "cautious",
      engagement: "high",
      key_priorities: ["clinical adoption", "InfoSec approval"],
      key_concerns: ["integration risk", "timeline to value"],
      notable_quote:
        "If we can't get a clean security review by August, we'll have to defer.",
    },
  ],
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`ASSERT: ${message}`);
  }
}

async function main(): Promise<void> {
  console.log("MockClaudeWrapper harness — Phase 3 Day 1 Session B\n");

  const mock = makeMockCallClaude({
    fixtures: { "01-detect-signals": DETECT_SIGNALS_FIXTURE },
    promptVersion: "1.0.0-mock",
    durationMs: 42,
  });

  // -------------------------------------------------------------------
  // Case 1 — fixture hit returns the fixture as toolInput.
  // -------------------------------------------------------------------
  console.log("[1/5] Fixture lookup by promptFile…");
  const result1 = await mock.call<DetectSignalsOutput>({
    promptFile: "01-detect-signals",
    vars: { transcriptText: "…HIPAA compliance…" },
    tool: detectSignalsTool,
    task: "classification",
  });
  assert(
    result1.toolInput === DETECT_SIGNALS_FIXTURE,
    "toolInput must be the exact fixture reference",
  );
  assert(result1.stopReason === "tool_use", "stopReason must be 'tool_use'");
  assert(result1.durationMs === 42, "durationMs must mirror options.durationMs");
  assert(result1.attempts === 1, "attempts defaults to 1");
  assert(result1.model === "mock", "model defaults to 'mock'");
  assert(
    result1.promptVersion === "1.0.0-mock",
    "promptVersion mirrors options.promptVersion",
  );
  assert(result1.promptFile === "01-detect-signals", "promptFile echoes input");
  assert(
    result1.toolName === detectSignalsTool.name,
    "toolName mirrors input.tool.name",
  );
  console.log(
    `      OK — 2 signals + 1 stakeholder insight echoed (tool=${result1.toolName})`,
  );

  // -------------------------------------------------------------------
  // Case 2 — history accumulates; reset clears.
  // -------------------------------------------------------------------
  console.log("[2/5] History accumulation…");
  const lengthAfterFirst = mock.history.length;
  assert(lengthAfterFirst === 1, "history should have 1 entry after 1 call");
  await mock.call({
    promptFile: "01-detect-signals",
    vars: { transcriptText: "second call" },
    tool: detectSignalsTool,
  });
  const lengthAfterSecond = mock.history.length;
  assert(lengthAfterSecond === 2, "history should have 2 entries after 2 calls");
  assert(
    mock.history[1]!.input.vars.transcriptText === "second call",
    "history preserves exact input vars",
  );
  console.log(`      OK — history=${lengthAfterSecond} after 2 calls`);

  console.log("[3/5] history reset…");
  mock.reset();
  const lengthAfterReset = mock.history.length;
  assert(lengthAfterReset === 0, "reset() should empty history");
  console.log(`      OK — history cleared`);

  // -------------------------------------------------------------------
  // Case 3 — fixture miss throws with a helpful message.
  // -------------------------------------------------------------------
  console.log("[4/5] Fixture miss throws…");
  let caught: Error | null = null;
  try {
    await mock.call({
      promptFile: "04-coordinator-synthesis",
      vars: {},
      tool: { name: "synthesize_coordinator_pattern", input_schema: {} },
    });
  } catch (err) {
    caught = err instanceof Error ? err : new Error(String(err));
  }
  assert(caught !== null, "fixture miss must throw");
  assert(
    caught.message.includes("04-coordinator-synthesis"),
    "error message must name the missing promptFile",
  );
  assert(
    caught.message.includes("01-detect-signals"),
    "error message must enumerate known fixtures",
  );
  console.log(`      OK — error: ${caught.message}`);

  // -------------------------------------------------------------------
  // Case 4 — drop-in via a consumer that accepts `callClaude`-shaped fn.
  // -------------------------------------------------------------------
  console.log("[5/5] Drop-in via consumer that accepts a callClaude-shaped fn…");
  type CallFn = typeof mock.call;
  async function fakeConsumer(fn: CallFn): Promise<number> {
    const r = await fn<DetectSignalsOutput>({
      promptFile: "01-detect-signals",
      vars: { transcriptText: "consumer smoke" },
      tool: detectSignalsTool,
    });
    return r.toolInput.signals.length;
  }
  mock.reset();
  const nSignals = await fakeConsumer(mock.call);
  assert(
    nSignals === DETECT_SIGNALS_FIXTURE.signals.length,
    "consumer should see the fixture's signals",
  );
  assert(mock.history.length === 1, "consumer's call should register in history");
  console.log(`      OK — consumer received ${nSignals} signals via mock.call`);

  console.log("");
  console.log("MockClaudeWrapper harness: ALL PASS.");
  process.exit(0);
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
