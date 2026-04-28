/**
 * Wrapper retry-on-protocol-violation unit tests — Phase 4 Day 2 Session B
 * Item 4.
 *
 * 4 cases per kickoff Decision 12:
 *   [1] Success first try → no retry, attempts=1, no protocol-retry telemetry
 *   [2] PromptResponseError on first attempt → wrapper retries → second
 *       attempt succeeds → returns toolInput; emits claude_protocol_retry
 *       once; final telemetry shows attempts=2 (one transport call per
 *       protocol attempt)
 *   [3] PromptResponseError on both attempts → wrapper rethrows
 *       PromptResponseError; emits claude_protocol_retry once +
 *       claude_protocol_retry_exhausted once
 *   [4] Transport error retry path unchanged (regression check) — a 429
 *       on first attempt + 200-with-tool_use on retry produces a single
 *       successful return with attempts=2 (transport-retry path), and
 *       NO claude_protocol_retry events fire
 *
 * Mocks the Anthropic SDK by stubbing `client.messages.create` via a
 * jest-style call counter.  No live API.
 *
 * Usage:
 *   pnpm --filter @nexus/shared test:wrapper-protocol-retry
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const here = fileURLToPath(import.meta.url);
loadEnv({ path: resolve(dirname(here), "../../../.env.local"), override: false });

// Set a fake API key so the wrapper's preflight passes; the mocked
// Anthropic client is what gets called downstream.
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "sk-test-fake";

import Anthropic from "@anthropic-ai/sdk";
import {
  callClaude,
  PromptResponseError,
  scoreInsightTool,
  type CallClaudeInternalOptions,
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

// ── Mock Anthropic SDK ────────────────────────────────────────────────
//
// Phase 4 Day 2 Session B Item 4 added a `_internal.sdk` injection seam
// to `callClaude` for testing. We construct a fake Anthropic instance
// whose `messages.create` returns canned responses per a CallScript.

interface CallScript {
  responses: Array<
    | { kind: "tool_use"; toolName: string; input: unknown; stopReason?: string }
    | { kind: "no_tool"; stopReason?: string; contentTypes?: string[] }
    | { kind: "throw_transport"; status: number }
  >;
}

function makeMockSdk(script: CallScript): Anthropic {
  let callIndex = 0;
  const create = async () => {
    const step = script.responses[callIndex++];
    if (!step) {
      throw new Error(`mock SDK: ran out of script responses at call ${callIndex}`);
    }

    if (step.kind === "throw_transport") {
      throw new Anthropic.APIError(step.status, undefined, "transport stub", undefined);
    }

    const usage = { input_tokens: 100, output_tokens: 50 };

    if (step.kind === "tool_use") {
      return {
        id: `msg-${callIndex}`,
        model: "mock",
        role: "assistant",
        type: "message",
        stop_reason: step.stopReason ?? "tool_use",
        stop_sequence: null,
        usage,
        content: [
          {
            type: "tool_use",
            id: `tool-${callIndex}`,
            name: step.toolName,
            input: step.input,
          },
        ],
      };
    }

    // no_tool — return a content block that's not the expected tool_use.
    const contentTypes = step.contentTypes ?? ["text"];
    return {
      id: `msg-${callIndex}`,
      model: "mock",
      role: "assistant",
      type: "message",
      stop_reason: step.stopReason ?? "end_turn",
      stop_sequence: null,
      usage,
      content: contentTypes.map((t) =>
        t === "text"
          ? { type: "text", text: "(no tool_use returned)" }
          : { type: t, name: "wrong_tool_name", input: {}, id: "x" },
      ),
    };
  };

  return {
    messages: { create },
  } as unknown as Anthropic;
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

// ── Helpers ───────────────────────────────────────────────────────────

const FIXTURE_TOOL_INPUT = {
  reasoning_trace: "test reasoning",
  score: 75,
  score_explanation: "test",
};

async function runWrapper(internal: CallClaudeInternalOptions) {
  return callClaude(
    {
      promptFile: "09-score-insight",
      vars: {
        // 09-score-insight expects a bunch of vars — we pass minimal ones.
        // The wrapper's interpolate() will throw if any required var is
        // missing; for this test we just need enough to reach the mocked
        // SDK call.
        surfaceId: "test",
        dealId: "deal-001",
        candidateBlock: "test",
        surfaceContextBlock: "test",
        portfolioContextBlock: "test",
        candidateInsightBlock: "test",
        dealStateBlock: "test",
        recentEventsBlock: "test",
      },
      tool: {
        name: scoreInsightTool.name,
        description: scoreInsightTool.description,
        input_schema: scoreInsightTool.input_schema,
      },
      task: "classification",
    },
    internal,
  );
}

async function main() {
  captureTelemetry();
  try {
    // [1] Success first try → no retry telemetry.
    {
      console.log("[1] success first try → no protocol-retry telemetry…");
      telemetryEvents = [];
      const sdk = makeMockSdk({
        responses: [
          {
            kind: "tool_use",
            toolName: scoreInsightTool.name,
            input: FIXTURE_TOOL_INPUT,
          },
        ],
      });
      const result = await runWrapper({ sdk });
      assertEqual(result.toolName, scoreInsightTool.name, "toolName");
      assertEqual(result.attempts, 1, "attempts=1 (no retry)");
      assertEqual(eventsOfType("claude_protocol_retry").length, 0, "no protocol_retry events");
      assertEqual(
        eventsOfType("claude_protocol_retry_exhausted").length,
        0,
        "no protocol_retry_exhausted events",
      );
      console.log("      OK — success first try");
    }

    // [2] PromptResponseError on first → retry succeeds.
    {
      console.log("[2] first protocol violation → second attempt succeeds…");
      telemetryEvents = [];
      const sdk = makeMockSdk({
        responses: [
          { kind: "no_tool", stopReason: "end_turn" }, // first attempt: no tool_use
          {
            kind: "tool_use", // retry: returns tool_use
            toolName: scoreInsightTool.name,
            input: FIXTURE_TOOL_INPUT,
          },
        ],
      });
      const result = await runWrapper({ sdk });
      assertEqual(result.toolName, scoreInsightTool.name, "toolName");
      assertEqual(result.attempts, 2, "attempts=2 (one per protocol attempt)");
      assertEqual(
        eventsOfType("claude_protocol_retry").length,
        1,
        "exactly 1 claude_protocol_retry event",
      );
      assertEqual(
        eventsOfType("claude_protocol_retry_exhausted").length,
        0,
        "no exhausted event (retry succeeded)",
      );
      const retry = eventsOfType("claude_protocol_retry")[0]!;
      assertEqual(retry.attempt, 1, "retry telemetry: attempt=1 (first failure)");
      console.log("      OK — first violation retried; second attempt succeeded");
    }

    // [3] PromptResponseError on both → rethrow.
    {
      console.log("[3] both attempts protocol-violate → wrapper rethrows…");
      telemetryEvents = [];
      const sdk = makeMockSdk({
        responses: [
          { kind: "no_tool", stopReason: "end_turn" },
          { kind: "no_tool", stopReason: "end_turn" },
        ],
      });
      let threw: unknown = null;
      try {
        await runWrapper({ sdk });
      } catch (err) {
        threw = err;
      }
      assert(threw instanceof PromptResponseError, "threw PromptResponseError");
      assertEqual(
        eventsOfType("claude_protocol_retry").length,
        1,
        "1 claude_protocol_retry event (the first failure)",
      );
      assertEqual(
        eventsOfType("claude_protocol_retry_exhausted").length,
        1,
        "1 claude_protocol_retry_exhausted event (the final failure)",
      );
      const exhausted = eventsOfType("claude_protocol_retry_exhausted")[0]!;
      assertEqual(exhausted.protocol_attempts, 2, "exhausted telemetry: protocol_attempts=2");
      console.log("      OK — both violations exhaust retries; PromptResponseError rethrown");
    }

    // [4] Transport error retry path (regression).
    {
      console.log("[4] 429 transport error → retry → success (no protocol events)…");
      telemetryEvents = [];
      const sdk = makeMockSdk({
        responses: [
          { kind: "throw_transport", status: 429 }, // first transport call: rate-limit
          {
            kind: "tool_use", // transport retry: succeeds with tool_use
            toolName: scoreInsightTool.name,
            input: FIXTURE_TOOL_INPUT,
          },
        ],
      });
      const result = await runWrapper({ sdk });
      assertEqual(result.toolName, scoreInsightTool.name, "toolName");
      // transport retry within the SAME protocol attempt → totalAttempts=2
      assertEqual(result.attempts, 2, "attempts=2 (transport retry; same protocol attempt)");
      assertEqual(
        eventsOfType("claude_protocol_retry").length,
        0,
        "NO claude_protocol_retry events (transport path)",
      );
      assertEqual(
        eventsOfType("claude_protocol_retry_exhausted").length,
        0,
        "NO claude_protocol_retry_exhausted events",
      );
      console.log("      OK — transport retry path unchanged");
    }

    console.log("\nWrapper retry-on-protocol-violation: ALL 4/4 CASES PASS.");
  } finally {
    restoreTelemetry();
  }
}

main().catch((err) => {
  restoreTelemetry();
  console.error("test:wrapper-protocol-retry FAILED:", err);
  process.exit(1);
});
