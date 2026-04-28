import Anthropic from "@anthropic-ai/sdk";
import { loadPrompt, interpolate } from "@nexus/prompts";
import { PromptResponseError } from "./errors";
import {
  buildLogEntry,
  emitTelemetry,
  type CallClaudeLogAnchors,
} from "./telemetry";

export type TaskType = "classification" | "synthesis" | "voice" | "voice_creative";

/**
 * Temperature defaults by task type (10-REBUILD-PLAN §8 Day 4).
 * Precedence: explicit input.temperature > task default > front-matter.
 */
export const TEMPERATURE_DEFAULTS: Record<TaskType, number> = {
  classification: 0.2,
  synthesis: 0.3,
  voice: 0.6,
  voice_creative: 0.7,
};

export interface ClaudeTool {
  name: string;
  description?: string;
  input_schema: unknown;
}

export interface CallClaudeInput {
  /** Base name of the prompt file in packages/prompts/files (no extension). */
  promptFile: string;
  vars: Record<string, unknown>;
  tool: ClaudeTool;
  task?: TaskType;
  temperature?: number;
  maxTokens?: number;
  /** Overrides env ANTHROPIC_MODEL and the prompt's front-matter model. */
  model?: string;
  /**
   * Optional foreign anchors persisted into `prompt_call_log` for audit.
   * Phase 3 Day 2 transcript pipeline passes `{hubspotDealId, transcriptId,
   * jobId}`; coordinator synthesis passes `{jobId}`; ad-hoc tests may pass
   * nothing. Missing anchors store as NULL; see §2.16.1 decision 3.
   */
  anchors?: CallClaudeLogAnchors;
}

export interface CallClaudeOutput<TToolInput = unknown> {
  toolInput: TToolInput;
  stopReason: string;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
  attempts: number;
  model: string;
  temperature: number;
  maxTokens: number;
  promptVersion: string;
  promptFile: string;
  toolName: string;
}

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

function isRetryable(err: unknown): boolean {
  if (err instanceof Anthropic.APIError) return RETRY_STATUSES.has(err.status ?? 0);
  return false;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Unified Claude wrapper. Every Claude call in v2 flows through this function
 * (DECISIONS.md 2.13, Guardrails 16-20). Retry is exponential backoff 3x on
 * transport errors only; protocol violations (missing tool_use block, wrong
 * tool name) throw PromptResponseError without retry — see Day 4 report
 * parked-for-later for Phase 3 policy revisit.
 *
 * Telemetry: every call — success AND failure — emits one stderr JSON line
 * plus one `prompt_call_log` row (§2.16.1 decision 3). DB write is
 * best-effort; telemetry failures never break the wrapper's contract.
 */
/**
 * Phase 4 Day 2 Session B Item 4: test-only seam for SDK injection. Tests
 * pass a mock Anthropic client to exercise the protocol-retry path without
 * a live API call. Production callers omit this parameter; the wrapper
 * constructs a real `new Anthropic(...)` instance.
 *
 * Underscore-prefixed by convention to flag as private to the wrapper +
 * its tests; never set this in handler code or app routes.
 */
export interface CallClaudeInternalOptions {
  sdk?: Anthropic;
}

export async function callClaude<TToolInput = unknown>(
  input: CallClaudeInput,
  _internal?: CallClaudeInternalOptions,
): Promise<CallClaudeOutput<TToolInput>> {
  const prompt = loadPrompt(input.promptFile);
  const fm = prompt.frontmatter;

  const model = input.model ?? process.env.ANTHROPIC_MODEL ?? fm.model;
  const temperature =
    input.temperature ??
    (input.task ? TEMPERATURE_DEFAULTS[input.task] : fm.temperature);
  const maxTokens = input.maxTokens ?? fm.max_tokens;
  const toolName = input.tool.name;

  if (!process.env.ANTHROPIC_API_KEY) {
    // Pre-flight guard: no API call yet, so inputTokens/outputTokens/
    // stopReason stay null. Still emit telemetry so the prompt_call_log
    // surfaces the misconfiguration.
    const err = new Error("ANTHROPIC_API_KEY missing — set it in .env.local.");
    await emitTelemetry(
      buildLogEntry({
        promptFile: input.promptFile,
        promptVersion: fm.version,
        toolName,
        model,
        task: input.task,
        temperature,
        maxTokens,
        inputTokens: null,
        outputTokens: null,
        durationMs: 0,
        attempts: 0,
        stopReason: null,
        error: err,
        anchors: input.anchors,
      }),
    );
    throw err;
  }

  const userMessage = interpolate(prompt.userTemplate, input.vars, input.promptFile);

  const client =
    _internal?.sdk ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const startedAt = Date.now();
  let totalAttempts = 0;
  let response: Anthropic.Messages.Message | null = null;
  let lastError: unknown;
  let toolUse: Anthropic.Messages.ToolUseBlock | undefined;

  // Phase 4 Day 2 Session B Item 4: outer protocol-retry loop. The inner
  // transport-retry loop (existing behavior) handles 429 + 5xx retries; the
  // outer loop adds a single retry on PromptResponseError (Claude returns
  // a response without the expected tool_use block, or with the wrong tool
  // name). Per Decision 8: 1 retry max — protocol violations twice in a row
  // are a real prompt issue, not a Claude flake; rethrow lets handler
  // surface treat it as a real error rather than masking systematic
  // problems. The retry shares the same prompt_call_log row — telemetry
  // is emitted ONCE at the end (success-after-retry OR exhausted-rethrow)
  // with `attempts` reflecting the total transport calls.
  const MAX_PROTOCOL_ATTEMPTS = 2;
  let protocolAttempt = 0;
  let lastProtocolError: PromptResponseError | null = null;

  protocolLoop: while (protocolAttempt < MAX_PROTOCOL_ATTEMPTS) {
    protocolAttempt++;

    // ── Inner transport-retry loop. Existing behavior preserved.
    let transportAttempts = 0;
    response = null;
    while (transportAttempts < 3) {
      transportAttempts++;
      totalAttempts++;
      try {
        response = await client.messages.create({
          model,
          max_tokens: maxTokens,
          temperature,
          system: prompt.systemPrompt,
          messages: [{ role: "user", content: userMessage }],
          tools: [
            {
              name: input.tool.name,
              description: input.tool.description,
              input_schema: input.tool.input_schema as Anthropic.Messages.Tool.InputSchema,
            },
          ],
          tool_choice: { type: "tool", name: input.tool.name },
        });
        break;
      } catch (err) {
        lastError = err;
        if (transportAttempts < 3 && isRetryable(err)) {
          await sleep(2 ** (transportAttempts - 1) * 1000);
          continue;
        }
        // Exhausted retries or non-retryable — transport error is terminal,
        // never protocol-retried. Emit telemetry then throw.
        const durationMs = Date.now() - startedAt;
        await emitTelemetry(
          buildLogEntry({
            promptFile: input.promptFile,
            promptVersion: fm.version,
            toolName,
            model,
            task: input.task,
            temperature,
            maxTokens,
            inputTokens: null,
            outputTokens: null,
            durationMs,
            attempts: totalAttempts,
            stopReason: null,
            error: err,
            anchors: input.anchors,
          }),
        );
        throw err;
      }
    }

    if (!response) {
      // Defensive — inner loop should have either set response or thrown.
      const err = lastError ?? new Error("no response from Anthropic");
      const durationMs = Date.now() - startedAt;
      await emitTelemetry(
        buildLogEntry({
          promptFile: input.promptFile,
          promptVersion: fm.version,
          toolName,
          model,
          task: input.task,
          temperature,
          maxTokens,
          inputTokens: null,
          outputTokens: null,
          durationMs,
          attempts: totalAttempts,
          stopReason: null,
          error: err,
          anchors: input.anchors,
        }),
      );
      throw err;
    }

    // Protocol check — find the tool_use block.
    toolUse = response.content.find(
      (c): c is Anthropic.Messages.ToolUseBlock =>
        c.type === "tool_use" && c.name === input.tool.name,
    );

    if (toolUse) {
      // Protocol success — break the outer loop.
      break protocolLoop;
    }

    // Protocol violation. Build the error; if not the last protocol
    // attempt, emit retry telemetry + loop. Otherwise emit exhausted
    // telemetry + throw.
    const contentTypes = response.content.map((c) => c.type);
    const protoErr = new PromptResponseError(
      `Expected tool_use(${input.tool.name}); got content types [${contentTypes.join(", ")}] with stop_reason=${response.stop_reason}`,
      {
        promptFile: input.promptFile,
        expectedToolName: input.tool.name,
        stopReason: response.stop_reason ?? undefined,
        contentTypes,
      },
    );
    lastProtocolError = protoErr;

    if (protocolAttempt < MAX_PROTOCOL_ATTEMPTS) {
      console.error(
        JSON.stringify({
          event: "claude_protocol_retry",
          prompt_file: input.promptFile,
          tool_name: input.tool.name,
          attempt: protocolAttempt,
          stop_reason: response.stop_reason ?? null,
          content_types: contentTypes,
          ts: new Date().toISOString(),
        }),
      );
      // Continue outer loop — retry the API call.
      continue;
    }

    // Exhausted protocol retries. Emit final telemetry then throw.
    const durationMs = Date.now() - startedAt;
    console.error(
      JSON.stringify({
        event: "claude_protocol_retry_exhausted",
        prompt_file: input.promptFile,
        tool_name: input.tool.name,
        protocol_attempts: protocolAttempt,
        ts: new Date().toISOString(),
      }),
    );
    await emitTelemetry(
      buildLogEntry({
        promptFile: input.promptFile,
        promptVersion: fm.version,
        toolName,
        model,
        task: input.task,
        temperature,
        maxTokens,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        durationMs,
        attempts: totalAttempts,
        stopReason: response.stop_reason ?? null,
        error: protoErr,
        anchors: input.anchors,
      }),
    );
    throw protoErr;
  }

  // After the protocol loop, response + toolUse must be set (the loop
  // either breaks with both set on success, or throws on exhausted retry).
  if (!response || !toolUse) {
    const err = lastProtocolError ?? new Error("no response from Anthropic");
    throw err;
  }
  const durationMs = Date.now() - startedAt;

  // Success path — emit telemetry with full response context.
  await emitTelemetry(
    buildLogEntry({
      promptFile: input.promptFile,
      promptVersion: fm.version,
      toolName,
      model,
      task: input.task,
      temperature,
      maxTokens,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      durationMs,
      attempts: totalAttempts,
      stopReason: response.stop_reason ?? null,
      error: null,
      anchors: input.anchors,
    }),
  );

  return {
    toolInput: toolUse.input as TToolInput,
    stopReason: response.stop_reason ?? "unknown",
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
    durationMs,
    attempts: totalAttempts,
    model,
    temperature,
    maxTokens,
    promptVersion: fm.version,
    promptFile: input.promptFile,
    toolName: input.tool.name,
  };
}
