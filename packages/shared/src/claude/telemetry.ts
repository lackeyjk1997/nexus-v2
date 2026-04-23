/**
 * Claude-wrapper telemetry — Phase 3 Day 1 Session B.
 *
 * Every `callClaude` invocation emits a telemetry entry on both success and
 * failure paths. Two sinks:
 *
 *   1. stderr — one JSON line per call. Downstream log collectors tail this.
 *      Pre-existing behavior from Phase 1 Day 4; shape preserved.
 *   2. `prompt_call_log` table — one row per call, 19 columns per DECISIONS.md
 *      §2.16.1 decision 3 (locked shape). Writes via the process-wide shared
 *      postgres.js client (service-role-level connection; bypasses RLS per
 *      Pattern D).
 *
 * The DB write is best-effort: if the pool is unavailable or the INSERT
 * fails, we emit a diagnostic stderr line but do NOT throw. The wrapper's
 * contract is "call Claude, return typed output"; telemetry failure must
 * not break the caller. Production monitoring alerts on the diagnostic
 * lines.
 *
 * The wrapper awaits the DB write rather than fire-and-forget. Serverless
 * kill windows (Vercel Fluid Compute) can terminate detached promises
 * mid-flight, which would lose audit rows. The ~10–50ms await cost is
 * budgeted against the enterprise-compliance ("every Claude call that
 * touched this customer's deal data") surface §2.16.1 decision 3 exists
 * for.
 *
 * Separation from `client.ts`: this module is the side-effect layer.
 * `client.ts` is the Claude protocol layer (tool-use forcing, retry,
 * tool_use block extraction). Splitting means `buildLogEntry` + the DB
 * insert are unit-testable without invoking Anthropic.
 */
import { getSharedSql } from "../db/pool";
import type { TaskType } from "./client";

/**
 * Foreign-anchor identifiers callers pass on each `callClaude` invocation.
 * None are FK-constrained on the table; cross-object audit survives child
 * deletion (demo-reset, test scripts). The enterprise compliance query
 * "every AI decision about deal X" is a JOIN across these anchors.
 */
export interface CallClaudeLogAnchors {
  hubspotDealId?: string | null;
  observationId?: string | null;
  transcriptId?: string | null;
  jobId?: string | null;
  actorUserId?: string | null;
}

/**
 * Full 19-column shape of a `prompt_call_log` row at write time. Shape
 * matches `schema.promptCallLog` exactly; column naming mirrors the
 * camelCase Drizzle fields, which the writer maps to snake_case SQL
 * columns.
 *
 * `id` + `createdAt` default on the DB side — omitted from the insert.
 */
export interface PromptCallLogEntry {
  promptFile: string;
  promptVersion: string;
  toolName: string;
  model: string;
  taskType: TaskType | null;
  temperature: number;
  maxTokens: number;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
  attempts: number;
  stopReason: string | null;
  errorClass: string | null;
  anchors: CallClaudeLogAnchors;
}

/**
 * Options for constructing a log entry from a wrapper-internal context.
 * Split from the entry shape because the wrapper holds some values as
 * the invocation input (model, maxTokens, task) and some as response
 * state (inputTokens, stopReason, error).
 */
export interface BuildLogEntryInput {
  promptFile: string;
  promptVersion: string;
  toolName: string;
  model: string;
  task: TaskType | undefined;
  temperature: number;
  maxTokens: number;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
  attempts: number;
  stopReason: string | null;
  error: unknown;
  anchors: CallClaudeLogAnchors | undefined;
}

/**
 * Pure function: assemble a `PromptCallLogEntry` from a wrapper-internal
 * context bag. Separated for unit-testability — no I/O, no side effects.
 */
export function buildLogEntry(input: BuildLogEntryInput): PromptCallLogEntry {
  return {
    promptFile: input.promptFile,
    promptVersion: input.promptVersion,
    toolName: input.toolName,
    model: input.model,
    taskType: input.task ?? null,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    durationMs: input.durationMs,
    attempts: input.attempts,
    stopReason: input.stopReason,
    errorClass: input.error
      ? input.error instanceof Error
        ? input.error.constructor.name
        : "UnknownError"
      : null,
    anchors: input.anchors ?? {},
  };
}

/**
 * Write one row into `prompt_call_log` via the shared postgres.js pool.
 *
 * Best-effort: catches DB errors, emits a diagnostic to stderr, resolves
 * successfully. Callers never see a rejected promise from this function.
 *
 * Connection:
 *   - Uses `getSharedSql()` — lazy process-wide postgres.js pool, Pattern D
 *     table so the write goes via service-role-level connection (bypasses
 *     RLS by design).
 *   - No explicit transaction; one-row INSERT is atomic on its own.
 *
 * `DATABASE_URL` missing:
 *   - `getSharedSql()` throws. Caught here; treated as a no-op DB write
 *     (stderr diagnostic still emitted). Keeps the wrapper usable in
 *     test environments that haven't set up the DB.
 */
export async function writePromptCallLog(
  entry: PromptCallLogEntry,
): Promise<void> {
  let sql;
  try {
    sql = getSharedSql();
  } catch (err) {
    process.stderr.write(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "claude_call_log_skipped",
        reason: "no_db",
        error: err instanceof Error ? err.message : String(err),
      }) + "\n",
    );
    return;
  }

  try {
    await sql`
      INSERT INTO prompt_call_log (
        prompt_file, prompt_version, tool_name, model, task_type,
        temperature, max_tokens, input_tokens, output_tokens, duration_ms,
        attempts, stop_reason, error_class,
        hubspot_deal_id, observation_id, transcript_id, job_id, actor_user_id
      ) VALUES (
        ${entry.promptFile},
        ${entry.promptVersion},
        ${entry.toolName},
        ${entry.model},
        ${entry.taskType},
        ${entry.temperature},
        ${entry.maxTokens},
        ${entry.inputTokens},
        ${entry.outputTokens},
        ${entry.durationMs},
        ${entry.attempts},
        ${entry.stopReason},
        ${entry.errorClass},
        ${entry.anchors.hubspotDealId ?? null},
        ${entry.anchors.observationId ?? null},
        ${entry.anchors.transcriptId ?? null},
        ${entry.anchors.jobId ?? null},
        ${entry.anchors.actorUserId ?? null}
      )
    `;
  } catch (err) {
    process.stderr.write(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "claude_call_log_write_failed",
        promptFile: entry.promptFile,
        error: err instanceof Error ? err.message : String(err),
      }) + "\n",
    );
  }
}

/**
 * Unified telemetry emission: one stderr line + one `prompt_call_log`
 * row. Called from the wrapper's success path AND every failure path.
 *
 * stderr line shape is preserved from Phase 1 Day 4 for log-collector
 * continuity. `error_class` is a new field; `inputTokens` / `outputTokens`
 * may be null on pre-response failure paths.
 */
export async function emitTelemetry(
  entry: PromptCallLogEntry,
): Promise<void> {
  const stderrLine = {
    ts: new Date().toISOString(),
    event: "claude_call",
    promptFile: entry.promptFile,
    promptVersion: entry.promptVersion,
    toolName: entry.toolName,
    model: entry.model,
    taskType: entry.taskType,
    temperature: entry.temperature,
    maxTokens: entry.maxTokens,
    attempts: entry.attempts,
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    durationMs: entry.durationMs,
    stopReason: entry.stopReason,
    errorClass: entry.errorClass,
  };
  process.stderr.write(JSON.stringify(stderrLine) + "\n");

  await writePromptCallLog(entry);
}
