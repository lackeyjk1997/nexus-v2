/**
 * MockClaudeWrapper — Phase 3 Day 1 Session B (foundation-review C3).
 *
 * Drop-in replacement for `callClaude` returning fixture-backed tool
 * outputs. Enables deterministic, free testing of every Claude-calling
 * consumer — transcript pipeline step (Phase 3 Day 2), coordinator
 * synthesis job (Phase 4 Day 2), close-analysis continuous updater
 * (Phase 5 Day 1+), call-prep orchestrator (Phase 5 Day 2+).
 *
 * Why separate from `callClaude`:
 *   - Live Claude calls cost real money (~$0.06–0.12 per pipeline run at
 *     Day-4 fixture volumes) and are flaky (network, rate limits,
 *     protocol variations).
 *   - Unit/integration tests want to assert "given this context, does the
 *     consumer handle this exact tool output correctly?" — that requires
 *     a predetermined response, not a live API call.
 *   - Mocking at the `@anthropic-ai/sdk` layer is brittle (multiple
 *     response shapes, content-block type unions); mocking at the
 *     wrapper boundary is clean.
 *
 * Design posture:
 *   - Pure: no I/O, no stderr noise (except on fixture-miss errors),
 *     no `prompt_call_log` writes. The mock is the test seam; consumers
 *     that want to assert logging behavior test `writePromptCallLog`
 *     directly.
 *   - Callers substitute `mock.call` for `callClaude` at the injection
 *     point their code exposes (a factory arg, a module-level fn ref,
 *     whatever pattern the consumer adopts).
 *   - Mock exposes a `history` array for assertions: each call captures
 *     the `input` + synthesized `output`. `reset()` clears it.
 *
 * Fixture shape: a Record keyed by `promptFile` (the same string the
 * caller passes to `callClaude({ promptFile })`). Value is the object
 * that would appear as `toolInput` in the real wrapper's response — i.e.
 * the Claude tool-use block's parsed `input`. Fixture author is
 * responsible for shape correctness; the mock does not validate against
 * the tool's `input_schema` (see "Deferred" below).
 *
 * Fixture-miss handling: if a call asks for a `promptFile` that isn't in
 * the fixture map, the mock throws. This is the loud-and-fast behavior
 * integration tests want — a missing fixture is always a test-author
 * mistake.
 *
 * Deferred (possible future extension, not MVP):
 *   - Function-form fixtures `(input) => output` for reactive tests.
 *   - Schema validation against `input.tool.input_schema` to catch
 *     drift between fixture shape and tool contract. Today's `AJV`-or-
 *     similar dependency would be the MVP's only new dep; not worth
 *     until a real test fails this way.
 *   - Simulated latency / simulated errors. Callers can wrap the mock
 *     in a timer or a proxy if they need those behaviors.
 */
import type {
  CallClaudeInput,
  CallClaudeOutput,
} from "./client";

/**
 * Fixture map: `promptFile` → the `toolInput` object the mock returns.
 *
 * The fixture object is the Claude-tool-use parsed input — the same
 * shape the caller destructures from `callClaude`'s `toolInput`.
 */
export type MockFixtures = Record<string, unknown>;

export interface MockCallRecord<TToolInput = unknown> {
  input: CallClaudeInput;
  output: CallClaudeOutput<TToolInput>;
  timestamp: number;
}

export interface MockClaudeOptions {
  fixtures: MockFixtures;
  /** Simulated duration value returned in every output. Default: 0. */
  durationMs?: number;
  /** Simulated attempt count returned in every output. Default: 1. */
  attempts?: number;
  /** Model string returned in every output. Default: "mock". */
  model?: string;
  /**
   * Prompt-version string returned in every output. Default: "mock".
   * Tests that need the real version can pass the canonical value.
   */
  promptVersion?: string;
}

export interface MockClaude {
  /** Drop-in replacement for `callClaude`. Same signature. */
  call: <TToolInput = unknown>(
    input: CallClaudeInput,
  ) => Promise<CallClaudeOutput<TToolInput>>;
  /**
   * Every invocation is appended. Tests assert against this array —
   * e.g. `expect(mock.history).toHaveLength(1)` or
   * `expect(mock.history[0].input.vars.transcriptText).toContain("HIPAA")`.
   */
  history: MockCallRecord[];
  /** Clear history between test cases. */
  reset: () => void;
}

/**
 * Construct a MockClaudeWrapper bound to a fixture map.
 *
 * Example:
 *   const mock = makeMockCallClaude({
 *     fixtures: {
 *       "01-detect-signals": {
 *         signals: [{ signal_type: "competitive_intel", ... }],
 *         stakeholder_insights: [],
 *       },
 *     },
 *   });
 *
 *   const result = await mock.call({ promptFile: "01-detect-signals", ... });
 *   expect(result.toolInput).toEqual(mock.fixtures["01-detect-signals"]);
 *   expect(mock.history).toHaveLength(1);
 */
export function makeMockCallClaude(options: MockClaudeOptions): MockClaude {
  const history: MockCallRecord[] = [];

  const call = async <TToolInput = unknown>(
    input: CallClaudeInput,
  ): Promise<CallClaudeOutput<TToolInput>> => {
    const fixture = options.fixtures[input.promptFile];
    if (fixture === undefined) {
      throw new Error(
        `MockClaudeWrapper: no fixture for promptFile="${input.promptFile}". ` +
          `Known fixtures: [${Object.keys(options.fixtures).join(", ") || "<empty>"}]`,
      );
    }

    const output: CallClaudeOutput<TToolInput> = {
      toolInput: fixture as TToolInput,
      stopReason: "tool_use",
      usage: { inputTokens: 0, outputTokens: 0 },
      durationMs: options.durationMs ?? 0,
      attempts: options.attempts ?? 1,
      model: options.model ?? "mock",
      temperature: input.temperature ?? 0,
      maxTokens: input.maxTokens ?? 0,
      promptVersion: options.promptVersion ?? "mock",
      promptFile: input.promptFile,
      toolName: input.tool.name,
    };

    history.push({ input, output, timestamp: Date.now() });
    return output;
  };

  return {
    call,
    history,
    reset() {
      history.length = 0;
    },
  };
}
