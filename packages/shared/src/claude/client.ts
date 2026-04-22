import Anthropic from "@anthropic-ai/sdk";
import { loadPrompt, interpolate } from "@nexus/prompts";
import { PromptResponseError } from "./errors";

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
 */
export async function callClaude<TToolInput = unknown>(
  input: CallClaudeInput,
): Promise<CallClaudeOutput<TToolInput>> {
  const prompt = loadPrompt(input.promptFile);
  const fm = prompt.frontmatter;

  const model = input.model ?? process.env.ANTHROPIC_MODEL ?? fm.model;
  const temperature =
    input.temperature ??
    (input.task ? TEMPERATURE_DEFAULTS[input.task] : fm.temperature);
  const maxTokens = input.maxTokens ?? fm.max_tokens;

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY missing — set it in .env.local.");
  }

  const userMessage = interpolate(prompt.userTemplate, input.vars, input.promptFile);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const startedAt = Date.now();
  let attempts = 0;
  let response: Anthropic.Messages.Message | null = null;
  let lastError: unknown;

  while (attempts < 3) {
    attempts++;
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
      if (attempts < 3 && isRetryable(err)) {
        await sleep(2 ** (attempts - 1) * 1000);
        continue;
      }
      throw err;
    }
  }

  if (!response) throw lastError ?? new Error("no response from Anthropic");

  const durationMs = Date.now() - startedAt;

  const toolUse = response.content.find(
    (c): c is Anthropic.Messages.ToolUseBlock =>
      c.type === "tool_use" && c.name === input.tool.name,
  );
  if (!toolUse) {
    const contentTypes = response.content.map((c) => c.type);
    throw new PromptResponseError(
      `Expected tool_use(${input.tool.name}); got content types [${contentTypes.join(", ")}] with stop_reason=${response.stop_reason}`,
      {
        promptFile: input.promptFile,
        expectedToolName: input.tool.name,
        stopReason: response.stop_reason ?? undefined,
        contentTypes,
      },
    );
  }

  const log = {
    ts: new Date().toISOString(),
    event: "claude_call",
    promptFile: input.promptFile,
    promptVersion: fm.version,
    toolName: input.tool.name,
    model,
    temperature,
    maxTokens,
    attempts,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    durationMs,
    stopReason: response.stop_reason ?? "unknown",
  };
  // One JSON line per call on stderr. Downstream log collectors can tail this.
  process.stderr.write(JSON.stringify(log) + "\n");

  return {
    toolInput: toolUse.input as TToolInput,
    stopReason: response.stop_reason ?? "unknown",
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
    durationMs,
    attempts,
    model,
    temperature,
    maxTokens,
    promptVersion: fm.version,
    promptFile: input.promptFile,
    toolName: input.tool.name,
  };
}
