/**
 * prompt_call_log shape smoke — Phase 3 Day 1 Session B.
 *
 * Directly exercises `writePromptCallLog` with synthetic entries, reads
 * each row back, and verifies every one of the 19 columns maps correctly
 * to the `PromptCallLogEntry` field it came from.
 *
 * Why this exists:
 *   - The wrapper's success + failure paths both call `emitTelemetry →
 *     writePromptCallLog`, but a live Claude call to exercise both paths
 *     would cost real money and require network access. This script
 *     covers the DB shape without invoking Anthropic.
 *   - §2.16.1 decision 3 locks the 19-column shape. If a future migration
 *     renames or drops a column without updating `writePromptCallLog`,
 *     this smoke fails loudly at commit time. Same canary role as
 *     `test-rls-*.ts` for RLS drift.
 *   - Seeds both success and failure shapes so the error_class + null
 *     token-count paths are exercised too.
 *
 * Usage:
 *   pnpm --filter @nexus/db test:prompt-call-log
 *
 * Requires DATABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import postgres from "postgres";

import {
  loadDevEnv,
  requireEnv,
  writePromptCallLog,
  type PromptCallLogEntry,
} from "@nexus/shared";

const SENTINEL_DEAL_ID = "test-prompt-call-log-deal";
const SENTINEL_TRANSCRIPT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const SENTINEL_JOB_ID = "11111111-2222-3333-4444-555555555555";
const SENTINEL_OBSERVATION_ID = "99999999-8888-7777-6666-555555555555";
const SENTINEL_ACTOR_USER_ID = "77777777-6666-5555-4444-333333333333";

interface CallLogRow {
  id: string;
  prompt_file: string;
  prompt_version: string;
  tool_name: string;
  model: string;
  task_type: string | null;
  temperature: string | null;
  max_tokens: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number | null;
  attempts: number;
  stop_reason: string | null;
  error_class: string | null;
  hubspot_deal_id: string | null;
  observation_id: string | null;
  transcript_id: string | null;
  job_id: string | null;
  actor_user_id: string | null;
  created_at: Date;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERT: ${message}`);
}

async function main(): Promise<void> {
  loadDevEnv();
  const url = requireEnv("DATABASE_URL");
  const verify = postgres(url, { max: 1, prepare: false });

  try {
    console.log("prompt_call_log shape smoke — Phase 3 Day 1 Session B\n");

    console.log("[0/5] Cleanup prior test rows via direct connection…");
    await verify`
      DELETE FROM prompt_call_log
       WHERE hubspot_deal_id = ${SENTINEL_DEAL_ID}
    `;

    // ---------------------------------------------------------------
    // Case 1 — success-shape entry.
    // ---------------------------------------------------------------
    console.log("[1/5] Write success-shape entry…");
    const successEntry: PromptCallLogEntry = {
      promptFile: "01-detect-signals",
      promptVersion: "1.0.0",
      toolName: "record_detected_signals",
      model: "claude-sonnet-4-20250514",
      taskType: "classification",
      temperature: 0.2,
      maxTokens: 6000,
      inputTokens: 5128,
      outputTokens: 3029,
      durationMs: 58123,
      attempts: 1,
      stopReason: "tool_use",
      errorClass: null,
      anchors: {
        hubspotDealId: SENTINEL_DEAL_ID,
        transcriptId: SENTINEL_TRANSCRIPT_ID,
        jobId: SENTINEL_JOB_ID,
        observationId: SENTINEL_OBSERVATION_ID,
        actorUserId: SENTINEL_ACTOR_USER_ID,
      },
    };
    await writePromptCallLog(successEntry);
    console.log("      OK");

    console.log("[2/5] Read back success row; verify all 19 columns…");
    const successRows = await verify<CallLogRow[]>`
      SELECT * FROM prompt_call_log
       WHERE hubspot_deal_id = ${SENTINEL_DEAL_ID}
         AND error_class IS NULL
       LIMIT 1
    `;
    assert(successRows.length === 1, "expected exactly one success row");
    const s = successRows[0]!;
    assert(s.prompt_file === successEntry.promptFile, "prompt_file mismatch");
    assert(s.prompt_version === successEntry.promptVersion, "prompt_version mismatch");
    assert(s.tool_name === successEntry.toolName, "tool_name mismatch");
    assert(s.model === successEntry.model, "model mismatch");
    assert(s.task_type === successEntry.taskType, "task_type mismatch");
    // temperature returns from postgres.js as string for decimal — parse.
    assert(
      s.temperature !== null && Number(s.temperature) === successEntry.temperature,
      `temperature mismatch (got ${s.temperature})`,
    );
    assert(s.max_tokens === successEntry.maxTokens, "max_tokens mismatch");
    assert(s.input_tokens === successEntry.inputTokens, "input_tokens mismatch");
    assert(s.output_tokens === successEntry.outputTokens, "output_tokens mismatch");
    assert(s.duration_ms === successEntry.durationMs, "duration_ms mismatch");
    assert(s.attempts === successEntry.attempts, "attempts mismatch");
    assert(s.stop_reason === successEntry.stopReason, "stop_reason mismatch");
    assert(s.error_class === null, "error_class should be null on success");
    assert(s.hubspot_deal_id === SENTINEL_DEAL_ID, "hubspot_deal_id mismatch");
    assert(s.observation_id === SENTINEL_OBSERVATION_ID, "observation_id mismatch");
    assert(s.transcript_id === SENTINEL_TRANSCRIPT_ID, "transcript_id mismatch");
    assert(s.job_id === SENTINEL_JOB_ID, "job_id mismatch");
    assert(s.actor_user_id === SENTINEL_ACTOR_USER_ID, "actor_user_id mismatch");
    assert(s.id !== null && typeof s.id === "string", "id should be a uuid string");
    assert(s.created_at instanceof Date, "created_at should be a Date");
    console.log(
      `      OK — 19/19 columns match (id=${s.id.slice(0, 8)}…, created_at=${s.created_at.toISOString()})`,
    );

    // ---------------------------------------------------------------
    // Case 2 — failure-shape entry (API error, no response → null tokens).
    // ---------------------------------------------------------------
    console.log("[3/5] Write failure-shape entry (pre-response exception)…");
    const failureEntry: PromptCallLogEntry = {
      promptFile: "04-coordinator-synthesis",
      promptVersion: "1.1.0",
      toolName: "synthesize_coordinator_pattern",
      model: "claude-sonnet-4-20250514",
      taskType: "synthesis",
      temperature: 0.3,
      maxTokens: 2500,
      inputTokens: null,
      outputTokens: null,
      durationMs: 1240,
      attempts: 3,
      stopReason: null,
      errorClass: "APIError",
      anchors: {
        hubspotDealId: SENTINEL_DEAL_ID,
        jobId: SENTINEL_JOB_ID,
      },
    };
    await writePromptCallLog(failureEntry);
    console.log("      OK");

    console.log("[4/5] Read back failure row; verify null/error shape…");
    const failureRows = await verify<CallLogRow[]>`
      SELECT * FROM prompt_call_log
       WHERE hubspot_deal_id = ${SENTINEL_DEAL_ID}
         AND error_class = 'APIError'
       LIMIT 1
    `;
    assert(failureRows.length === 1, "expected exactly one failure row");
    const f = failureRows[0]!;
    assert(f.input_tokens === null, "input_tokens should be null on pre-response failure");
    assert(f.output_tokens === null, "output_tokens should be null on pre-response failure");
    assert(f.stop_reason === null, "stop_reason should be null on pre-response failure");
    assert(f.error_class === "APIError", "error_class should reflect the thrown class");
    assert(f.attempts === 3, "attempts should reflect retry count");
    assert(f.duration_ms === 1240, "duration_ms should still be recorded");
    assert(
      f.observation_id === null &&
        f.transcript_id === null &&
        f.actor_user_id === null,
      "unset anchors should be null",
    );
    console.log(
      `      OK — error_class=${f.error_class} attempts=${f.attempts} input_tokens=${f.input_tokens}`,
    );

    // ---------------------------------------------------------------
    // Cleanup.
    // ---------------------------------------------------------------
    console.log("[5/5] Cleanup test rows…");
    const deleted = await verify`
      DELETE FROM prompt_call_log
       WHERE hubspot_deal_id = ${SENTINEL_DEAL_ID}
    `;
    console.log(`      OK — ${deleted.count} rows cleaned up`);

    console.log("");
    console.log("prompt_call_log shape smoke: PASS.");
  } finally {
    await verify.end({ timeout: 5 });
    // The shared pool used by writePromptCallLog is process-wide; closing
    // it on script exit ensures the tsx process can terminate cleanly.
    const { closeSharedSql } = await import("@nexus/shared");
    await closeSharedSql();
  }
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
