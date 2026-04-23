/**
 * transcript_pipeline handler end-to-end — Phase 3 Day 2 Session B.
 *
 * Three phases run sequentially against the live MedVista fixture
 * (seeded Session A; transcripts.hubspot_engagement_id =
 * "fixture-medvista-discovery-01"):
 *
 *   PHASE 1 — Direct handler invocation.
 *     Imports HANDLERS + calls transcript_pipeline({ transcriptId },
 *     { jobId, jobType }) directly. Skips worker + enqueue surfaces.
 *     Fast iteration path; verifies the core handler logic.
 *
 *   PHASE 2 — Idempotency via second direct invocation.
 *     Re-runs the handler against the same transcriptId. Expected:
 *     signals.skipped_duplicate > 0 (or all signals re-detected with
 *     skipped_duplicate matching inserted from phase 1), events
 *     .transcript_ingested_skipped = 1, embeddings count unchanged.
 *     Idempotency gap surfaces here as a test failure before any
 *     customer re-delivery hits the same code path.
 *
 *   PHASE 3 — Full enqueue → worker → handler → completion flow.
 *     Auth as Sarah (magic-link), POST /api/jobs/enqueue, subscribe to
 *     Realtime on jobs.id, curl the worker, wait for succeeded. This is
 *     the only mode that exercises: user-auth enqueue, worker claim via
 *     FOR UPDATE SKIP LOCKED, handler dispatch via HANDLERS registry,
 *     result jsonb persistence, Realtime event emission, RLS. Precedent:
 *     test-e2e-job.ts. Requires the dev server running on port 3001
 *     (preflight check; hard fail with instructions if not).
 *
 * Dev-Mac DATABASE_URL note: this script forces DATABASE_URL =
 * DIRECT_URL before requiring the handler (which lazily initializes the
 * shared postgres.js pool on first call). Supabase's transaction pooler
 * has saturated under cumulative session load during Phase 3 Day 2
 * sessions; the direct host bypasses the 200-client cap at the cost of
 * IPv6-only connectivity (dev Macs have IPv6). The dev server used by
 * PHASE 3 continues to use its own DATABASE_URL (pooler) so that path
 * exercises production-equivalent behavior.
 *
 * Usage:
 *   # Terminal 1: start dev server (required for PHASE 3)
 *   pnpm dev
 *
 *   # Terminal 2:
 *   pnpm --filter @nexus/db test:transcript-pipeline
 */
import crypto from "node:crypto";

import { loadDevEnv, requireEnv } from "@nexus/shared";

loadDevEnv();

// Force shared pool to use DIRECT_URL for this test process only.
// See the module header for rationale.
if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// Handler + shared-pool shutdown must import AFTER DATABASE_URL is
// swapped so the shared pool picks up DIRECT_URL on first access.
const { HANDLERS, closeSharedSql } = await import("@nexus/shared");

// Type import is erased at build time; importing from the barrel is safe
// here even though the runtime import is dynamic above.
import type { TranscriptPipelineResult as SharedPipelineResult } from "@nexus/shared";

const SENTINEL_ENGAGEMENT_ID = "fixture-medvista-discovery-01";
const BASE_URL = process.env.WORKER_URL ?? "http://localhost:3001";
const IS_LOCALHOST = BASE_URL.includes("localhost") || BASE_URL.includes("127.0.0.1");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERT: ${message}`);
}

type TranscriptPipelineResult = SharedPipelineResult;

async function signIn(email: string): Promise<{
  cookieHeader: string;
  accessToken: string;
}> {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: link, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${BASE_URL}/auth/callback` },
  });
  if (error || !link.properties?.email_otp) {
    throw error ?? new Error("generateLink returned no OTP");
  }

  const jar = new Map<string, { value: string; options: CookieOptions }>();
  const client = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      get: (n: string) => jar.get(n)?.value,
      set: (n: string, v: string, o: CookieOptions) =>
        jar.set(n, { value: v, options: o }),
      remove: (n: string, o: CookieOptions) =>
        jar.set(n, { value: "", options: o }),
    },
  });
  const { data: verified, error: vErr } = await client.auth.verifyOtp({
    email,
    token: link.properties.email_otp,
    type: "email",
  });
  if (vErr || !verified.session) {
    throw vErr ?? new Error("verifyOtp returned no session");
  }

  const cookieHeader = Array.from(jar.entries())
    .map(([n, { value }]) => `${n}=${encodeURIComponent(value)}`)
    .join("; ");
  return { cookieHeader, accessToken: verified.session.access_token };
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? requireEnv("DIRECT_URL");
  const verify = postgres(url, { max: 1, prepare: false });

  try {
    console.log("transcript_pipeline end-to-end — Phase 3 Day 2 Session B\n");

    // ── Preflight ────────────────────────────────────────────────────────
    console.log("[preflight/A] locate seeded MedVista transcript…");
    const seeded = await verify<Array<{ id: string; hubspot_deal_id: string }>>`
      SELECT id, hubspot_deal_id FROM transcripts
       WHERE hubspot_engagement_id = ${SENTINEL_ENGAGEMENT_ID}
       LIMIT 1
    `;
    if (seeded.length === 0) {
      throw new Error(
        `No MedVista transcript seeded. Run: pnpm --filter @nexus/db seed:medvista-transcript`,
      );
    }
    const transcriptId = seeded[0]!.id;
    const hubspotDealId = seeded[0]!.hubspot_deal_id;
    console.log(
      `      transcript=${transcriptId}`,
      `\n      hubspot_deal=${hubspotDealId}`,
    );

    // Baseline counts BEFORE any test runs.
    const baseline = await verify<
      Array<{ ingest: number; signal: number; emb: number }>
    >`
      SELECT
        (SELECT COUNT(*)::int FROM deal_events
          WHERE type='transcript_ingested' AND source_ref = ${transcriptId}) AS ingest,
        (SELECT COUNT(*)::int FROM deal_events
          WHERE type='signal_detected' AND source_ref LIKE ${transcriptId + ":%"}) AS signal,
        (SELECT COUNT(*)::int FROM transcript_embeddings
          WHERE transcript_id = ${transcriptId}) AS emb
    `;
    console.log(
      `[preflight/B] baseline state before PHASE 1:`,
      `\n      transcript_ingested=${baseline[0]!.ingest}`,
      `\n      signal_detected=${baseline[0]!.signal}`,
      `\n      transcript_embeddings=${baseline[0]!.emb}`,
    );

    // ── PHASE 1 — Direct invocation ──────────────────────────────────────
    console.log("\n[PHASE 1/3] Direct handler invocation…");
    const handler = HANDLERS.transcript_pipeline;
    const phase1Start = Date.now();
    // Real UUIDs so prompt_call_log's job_id uuid column accepts them.
    // String identifiers like "test-direct-phase-1" fail the DB insert's
    // type check and produce a stderr claude_call_log_write_failed line
    // (best-effort path; caller still succeeds but audit row is lost).
    const phase1JobId = crypto.randomUUID();
    const result1 = (await handler(
      { transcriptId },
      { jobId: phase1JobId, jobType: "transcript_pipeline" },
    )) as TranscriptPipelineResult;
    const phase1Ms = Date.now() - phase1Start;
    console.log(
      `      PHASE 1 complete in ${phase1Ms}ms`,
      `\n      stepsCompleted=${JSON.stringify(result1.stepsCompleted)}`,
      `\n      stepsDeferred=${JSON.stringify(result1.stepsDeferred)}`,
      `\n      signals=${JSON.stringify(result1.signals)}`,
      `\n      events=${JSON.stringify(result1.events)}`,
      `\n      preprocess.turns=${result1.preprocess.speaker_turn_count} embeddings=${result1.preprocess.embeddings_written}`,
      `\n      claude.detect_signals: model=${result1.claude.detect_signals.model} in=${result1.claude.detect_signals.input_tokens} out=${result1.claude.detect_signals.output_tokens}`,
      `\n      claude.extract_actions: in=${result1.claude.extract_actions.input_tokens} out=${result1.claude.extract_actions.output_tokens}`,
      `\n      claude.score_meddpicc: in=${result1.claude.score_meddpicc.input_tokens} out=${result1.claude.score_meddpicc.output_tokens}`,
      `\n      actions=${result1.actions.length} meddpicc.scores_emitted=${result1.meddpicc.scores_emitted} hubspot_writeback=${result1.meddpicc.hubspot_properties_written}`,
    );

    assert(
      result1.stepsCompleted.length === 7,
      `PHASE 1: stepsCompleted should have 7 entries (Day 3 Session B fanout), got ${result1.stepsCompleted.length}`,
    );
    assert(
      result1.stepsDeferred.length === 3,
      "PHASE 1: stepsDeferred should have 3 entries",
    );
    assert(
      result1.signals.detected >= 1,
      "PHASE 1: expected at least 1 detected signal from MedVista fixture",
    );
    assert(
      result1.preprocess.speaker_turn_count >= 10,
      "PHASE 1: expected at least 10 speaker turns",
    );
    assert(
      result1.claude.detect_signals.prompt_version === "1.1.0",
      `PHASE 1: detect-signals prompt_version 1.1.0 expected, got ${result1.claude.detect_signals.prompt_version}`,
    );
    assert(
      result1.claude.extract_actions.prompt_version === "1.0.0",
      `PHASE 1: extract-actions prompt_version 1.0.0 expected, got ${result1.claude.extract_actions.prompt_version}`,
    );
    assert(
      result1.claude.score_meddpicc.prompt_version === "1.0.0",
      `PHASE 1: score-meddpicc prompt_version 1.0.0 expected, got ${result1.claude.score_meddpicc.prompt_version}`,
    );
    assert(
      Array.isArray(result1.actions),
      "PHASE 1: result.actions must be present (jobs.result.actions jsonb)",
    );
    assert(
      result1.meddpicc.hubspot_properties_written >= 1,
      `PHASE 1: MEDDPICC writeback expected ≥1 property, got ${result1.meddpicc.hubspot_properties_written}`,
    );
    assert(
      result1.events.meddpicc_scored_inserted === 1,
      `PHASE 1: meddpicc_scored event should insert once per run, got ${result1.events.meddpicc_scored_inserted}`,
    );

    // ── PHASE 1.5 — Fanout verification — three distinct prompt_call_log rows
    // per pipeline invocation. Day 2 Session B confirmed the telemetry
    // design supports per-call fanout structurally; Day 3 Session B is the
    // first live exercise. The three rows share (hubspot_deal_id,
    // transcript_id, job_id) anchors and are distinguished by
    // (prompt_file, tool_name). No race artifacts: no duplicates on any
    // (anchor, prompt_file) pair, no missing anchors, no partial writes.
    console.log("\n[PHASE 1.5/3] Fanout verification — 3 prompt_call_log rows…");
    const fanoutRows = await verify<
      Array<{
        prompt_file: string;
        tool_name: string;
        hubspot_deal_id: string | null;
        transcript_id: string | null;
        job_id: string | null;
        error_class: string | null;
      }>
    >`
      SELECT prompt_file, tool_name, hubspot_deal_id, transcript_id, job_id, error_class
        FROM prompt_call_log
       WHERE job_id = ${phase1JobId}
       ORDER BY prompt_file ASC
    `;
    console.log(
      `      found ${fanoutRows.length} prompt_call_log rows with job_id=${phase1JobId.slice(0, 8)}…`,
    );
    for (const r of fanoutRows) {
      console.log(
        `      • ${r.prompt_file} (tool=${r.tool_name}, anchors={deal:${r.hubspot_deal_id?.slice(0, 12) ?? "null"}, transcript:${r.transcript_id?.slice(0, 8) ?? "null"}}, error_class=${r.error_class ?? "null"})`,
      );
    }
    assert(
      fanoutRows.length === 3,
      `PHASE 1.5: expected exactly 3 prompt_call_log rows (one per parallel Claude call), got ${fanoutRows.length}`,
    );
    const fanoutPromptFiles = fanoutRows.map((r) => r.prompt_file).sort();
    const expectedPromptFiles = [
      "01-detect-signals",
      "pipeline-extract-actions",
      "pipeline-score-meddpicc",
    ].sort();
    assert(
      JSON.stringify(fanoutPromptFiles) === JSON.stringify(expectedPromptFiles),
      `PHASE 1.5: prompt_file set must match three Day-3 prompts. Expected ${JSON.stringify(expectedPromptFiles)}, got ${JSON.stringify(fanoutPromptFiles)}`,
    );
    const fanoutToolNames = fanoutRows.map((r) => r.tool_name).sort();
    const expectedToolNames = [
      "record_detected_signals",
      "record_extracted_actions",
      "record_meddpicc_scores",
    ].sort();
    assert(
      JSON.stringify(fanoutToolNames) === JSON.stringify(expectedToolNames),
      `PHASE 1.5: tool_name set must match three Day-3 tools. Expected ${JSON.stringify(expectedToolNames)}, got ${JSON.stringify(fanoutToolNames)}`,
    );
    for (const r of fanoutRows) {
      assert(
        r.hubspot_deal_id === hubspotDealId,
        `PHASE 1.5: every row must carry hubspot_deal_id anchor. Row ${r.prompt_file} got ${r.hubspot_deal_id ?? "null"}`,
      );
      assert(
        r.transcript_id === transcriptId,
        `PHASE 1.5: every row must carry transcript_id anchor. Row ${r.prompt_file} got ${r.transcript_id ?? "null"}`,
      );
      assert(
        r.job_id === phase1JobId,
        `PHASE 1.5: every row must carry job_id anchor. Row ${r.prompt_file} got ${r.job_id ?? "null"}`,
      );
      assert(
        r.error_class === null,
        `PHASE 1.5: no call should have errored. Row ${r.prompt_file} error_class=${r.error_class}`,
      );
    }
    console.log(
      `      ✓ exactly 3 rows, distinct prompt_file + tool_name, matching anchors, no errors — per-call fanout verified live.`,
    );

    // Verify DB state after PHASE 1.
    const afterPhase1 = await verify<
      Array<{ ingest: number; signal: number; emb: number }>
    >`
      SELECT
        (SELECT COUNT(*)::int FROM deal_events
          WHERE type='transcript_ingested' AND source_ref = ${transcriptId}) AS ingest,
        (SELECT COUNT(*)::int FROM deal_events
          WHERE type='signal_detected' AND source_ref LIKE ${transcriptId + ":%"}) AS signal,
        (SELECT COUNT(*)::int FROM transcript_embeddings
          WHERE transcript_id = ${transcriptId}) AS emb
    `;
    console.log(
      `      DB state after PHASE 1:`,
      `\n      transcript_ingested=${afterPhase1[0]!.ingest}`,
      `\n      signal_detected=${afterPhase1[0]!.signal}`,
      `\n      transcript_embeddings=${afterPhase1[0]!.emb}`,
    );
    assert(
      afterPhase1[0]!.ingest === Math.max(1, baseline[0]!.ingest),
      "PHASE 1: should have exactly 1 transcript_ingested row (or preserve existing if present)",
    );
    assert(
      afterPhase1[0]!.signal >= baseline[0]!.signal + result1.signals.inserted,
      "PHASE 1: signal_detected row count should grow by inserted count",
    );

    // Pull one signal_detected row and verify shape.
    console.log("      sample signal_detected row shape:");
    const sampleRow = await verify<
      Array<{
        source_ref: string;
        source_kind: string;
        event_context: unknown;
        payload: unknown;
      }>
    >`
      SELECT source_ref, source_kind, event_context, payload
        FROM deal_events
       WHERE type='signal_detected'
         AND source_ref LIKE ${transcriptId + ":%"}
       ORDER BY created_at DESC
       LIMIT 1
    `;
    assert(sampleRow.length === 1, "expected at least 1 signal_detected row");
    const s = sampleRow[0]!;
    assert(
      s.source_ref.startsWith(`${transcriptId}:`),
      "source_ref must follow <transcriptId>:<signal_hash> convention",
    );
    assert(s.source_kind === "prompt", "signal_detected rows must carry source_kind='prompt'");
    assert(
      typeof s.event_context === "object" && s.event_context !== null,
      "event_context should be populated, not null",
    );
    const payload = s.payload as { signal?: unknown; reasoning_trace?: string; signal_hash?: string };
    assert(payload.signal !== undefined, "payload should carry the signal");
    assert(
      typeof payload.reasoning_trace === "string" && payload.reasoning_trace.length > 0,
      "payload should carry the reasoning_trace from the Claude response",
    );
    assert(
      typeof payload.signal_hash === "string" && payload.signal_hash.length === 16,
      "payload should carry the 16-char signal_hash",
    );
    console.log(
      `      ✓ source_ref=${s.source_ref.slice(0, 50)}…`,
      `\n      ✓ source_kind=${s.source_kind}`,
      `\n      ✓ event_context populated`,
      `\n      ✓ payload carries signal + reasoning_trace (${(payload.reasoning_trace as string).slice(0, 60)}…) + signal_hash`,
    );

    // ── PHASE 2 — Idempotency via second direct invocation ──────────────
    console.log("\n[PHASE 2/3] Idempotency (second direct invocation)…");
    const phase2Start = Date.now();
    const phase2JobId = crypto.randomUUID();
    const result2 = (await handler(
      { transcriptId },
      { jobId: phase2JobId, jobType: "transcript_pipeline" },
    )) as TranscriptPipelineResult;
    const phase2Ms = Date.now() - phase2Start;
    console.log(
      `      PHASE 2 complete in ${phase2Ms}ms`,
      `\n      signals=${JSON.stringify(result2.signals)}`,
      `\n      events=${JSON.stringify(result2.events)}`,
    );

    assert(
      result2.events.transcript_ingested_skipped === 1,
      `PHASE 2: transcript_ingested should skip on re-run, got skipped=${result2.events.transcript_ingested_skipped}`,
    );
    assert(
      result2.events.transcript_ingested_inserted === 0,
      `PHASE 2: transcript_ingested should NOT insert on re-run, got inserted=${result2.events.transcript_ingested_inserted}`,
    );

    // Signal-level idempotency: signals that matched the hash of a row
    // already present (from PHASE 1) should be skipped. If Claude emits
    // the same signal twice across runs, skipped > 0. If Claude emits
    // different signals (which can happen due to model non-determinism
    // at temperature 0.2 over long transcripts), inserted > 0 is also
    // acceptable — the invariant is: no DUPLICATE rows for the same
    // signal_hash. Verify via DB state delta.
    const afterPhase2 = await verify<
      Array<{ signal: number; emb: number }>
    >`
      SELECT
        (SELECT COUNT(*)::int FROM deal_events
          WHERE type='signal_detected' AND source_ref LIKE ${transcriptId + ":%"}) AS signal,
        (SELECT COUNT(*)::int FROM transcript_embeddings
          WHERE transcript_id = ${transcriptId}) AS emb
    `;
    console.log(
      `      DB state after PHASE 2:`,
      `\n      signal_detected=${afterPhase2[0]!.signal}`,
      `\n      transcript_embeddings=${afterPhase2[0]!.emb}`,
    );

    // Embeddings should NEVER grow on re-run (preprocessor DELETE+INSERT
    // inside a transaction replaces with the same N+1 count).
    assert(
      afterPhase2[0]!.emb === afterPhase1[0]!.emb,
      `PHASE 2: transcript_embeddings count should be stable on re-run (before=${afterPhase1[0]!.emb}, after=${afterPhase2[0]!.emb})`,
    );

    // Signal rows grow by result2.signals.inserted ONLY. skipped_duplicate
    // reflects the dedup-via-source_ref path.
    const signalDelta = afterPhase2[0]!.signal - afterPhase1[0]!.signal;
    assert(
      signalDelta === result2.signals.inserted,
      `PHASE 2: signal_detected delta (${signalDelta}) must equal result.signals.inserted (${result2.signals.inserted}) — any mismatch means dedup is broken`,
    );
    console.log(
      `      ✓ transcript_ingested skipped on re-run`,
      `\n      ✓ transcript_embeddings count stable (${afterPhase2[0]!.emb})`,
      `\n      ✓ signal_detected dedup respects source_ref (inserted=${result2.signals.inserted}, skipped=${result2.signals.skipped_duplicate})`,
    );

    // ── PHASE 3 — Full enqueue → worker → handler → completion ──────────
    console.log("\n[PHASE 3/3] Full enqueue → worker → handler flow…");
    console.log(`      target: ${BASE_URL}`);

    // Preflight: is the dev server up?
    try {
      const ping = await fetch(`${BASE_URL}/api/jobs/worker`, {
        headers: { Authorization: "Bearer __invalid__" },
      });
      // 401 with our invalid token is the correct "up" signal.
      if (ping.status !== 401) {
        console.log(
          `      ⚠ worker endpoint returned ${ping.status} on bad auth — expected 401. Continuing but may fail.`,
        );
      } else {
        console.log(`      ✓ dev server up (worker endpoint returned 401 as expected)`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `PHASE 3 requires dev server running on ${BASE_URL}. ` +
          `Start it with 'pnpm dev' in another terminal, then re-run. Ping error: ${msg}`,
      );
    }

    const sarahEmail = process.env.RLS_TEST_SARAH_EMAIL ?? "jeff.lackey97@gmail.com";
    const { cookieHeader, accessToken } = await signIn(sarahEmail);
    console.log(`      ✓ signed in as ${sarahEmail}`);

    const enqRes = await fetch(`${BASE_URL}/api/jobs/enqueue`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader },
      body: JSON.stringify({
        type: "transcript_pipeline",
        input: { transcriptId },
      }),
    });
    const enqText = await enqRes.text();
    let enqBody: { jobId?: string; error?: string } = {};
    try {
      enqBody = JSON.parse(enqText) as typeof enqBody;
    } catch {
      throw new Error(
        `enqueue returned non-JSON (status=${enqRes.status}): ${enqText.slice(0, 400)}`,
      );
    }
    if (!enqRes.ok || !enqBody.jobId) {
      throw new Error(`enqueue failed: ${enqRes.status} ${JSON.stringify(enqBody)}`);
    }
    const jobId = enqBody.jobId;
    console.log(`      ✓ enqueued jobId=${jobId}`);

    // Subscribe to Realtime under Sarah's token.
    const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const realtime = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    realtime.realtime.setAuth(accessToken);

    const transitions: Array<{ status: string; at: number }> = [];
    const t0 = Date.now();
    const channel = realtime.channel(`job:${jobId}`);
    const subscribed = new Promise<void>((resolveSub) => {
      channel
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "jobs",
            filter: `id=eq.${jobId}`,
          },
          (payload) => {
            const status = (payload.new as { status: string }).status;
            transitions.push({ status, at: Date.now() - t0 });
            console.log(`      ← realtime status=${status} at t+${Date.now() - t0}ms`);
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") resolveSub();
        });
    });
    await subscribed;
    console.log(`      ✓ realtime subscribed`);

    // Localhost: pg_cron cannot reach us, so trigger worker manually.
    if (IS_LOCALHOST) {
      console.log(`      triggering worker manually (localhost)…`);
      const cronSecret = requireEnv("CRON_SECRET");
      const wRes = await fetch(`${BASE_URL}/api/jobs/worker`, {
        headers: { Authorization: `Bearer ${cronSecret}` },
      });
      console.log(`      worker responded ${wRes.status}`);
    } else {
      console.log(`      waiting for pg_cron to fire…`);
    }

    // Pipeline runs ~60-90s; give 180s budget with headroom.
    const DEADLINE_MS = 180_000;
    const deadline = Date.now() + DEADLINE_MS;
    while (Date.now() < deadline) {
      const last = transitions[transitions.length - 1];
      if (last && (last.status === "succeeded" || last.status === "failed")) break;
      await new Promise((r) => setTimeout(r, 500));
    }

    await realtime.removeChannel(channel);

    const terminal = transitions[transitions.length - 1];
    if (!terminal) {
      throw new Error(
        `PHASE 3: no Realtime events received within ${DEADLINE_MS}ms. Check dev server logs.`,
      );
    }
    console.log(
      `      terminal status=${terminal.status} at t+${terminal.at}ms`,
      `\n      transitions: ${transitions.map((t) => `${t.status}@${t.at}ms`).join(" → ")}`,
    );
    if (terminal.status !== "succeeded") {
      // Read the jobs row for the error message.
      const failedRow = await verify<Array<{ error: string | null; result: unknown }>>`
        SELECT error, result FROM jobs WHERE id = ${jobId}
      `;
      throw new Error(
        `PHASE 3 job ended ${terminal.status}. error=${failedRow[0]?.error ?? "?"} result=${JSON.stringify(failedRow[0]?.result ?? null).slice(0, 500)}`,
      );
    }

    // Read the job's result jsonb and verify shape.
    const jobRow = await verify<Array<{ result: TranscriptPipelineResult }>>`
      SELECT result FROM jobs WHERE id = ${jobId}
    `;
    assert(jobRow.length === 1, "PHASE 3: job row not found after completion");
    const phase3Result = jobRow[0]!.result;
    assert(
      phase3Result.stepsCompleted.length === 7,
      `PHASE 3: stepsCompleted should have 7 entries in persisted result jsonb (Day 3 Session B fanout), got ${phase3Result.stepsCompleted.length}`,
    );
    assert(
      phase3Result.transcriptId === transcriptId,
      "PHASE 3: persisted result must carry the same transcriptId",
    );
    assert(
      Array.isArray(phase3Result.actions),
      "PHASE 3: persisted result.actions must be present",
    );
    assert(
      phase3Result.meddpicc.hubspot_properties_written >= 1,
      `PHASE 3: persisted MEDDPICC writeback ≥1 property expected, got ${phase3Result.meddpicc.hubspot_properties_written}`,
    );

    // Second-pass fanout verification against the persisted job's real
    // jobId — this one is the worker-dispatched run, distinct from
    // PHASE 1's direct-invocation run. Proves fanout works via the
    // worker path too, not just direct.
    const fanoutWorkerRows = await verify<
      Array<{ prompt_file: string; tool_name: string }>
    >`
      SELECT prompt_file, tool_name
        FROM prompt_call_log
       WHERE job_id = ${jobId}
       ORDER BY prompt_file ASC
    `;
    assert(
      fanoutWorkerRows.length === 3,
      `PHASE 3: worker-dispatched run should also produce 3 prompt_call_log rows, got ${fanoutWorkerRows.length}`,
    );
    console.log(
      `      ✓ job.result shape correct (stepsCompleted=${phase3Result.stepsCompleted.length}, stepsDeferred=${phase3Result.stepsDeferred.length})`,
      `\n      ✓ signals=${JSON.stringify(phase3Result.signals)}`,
      `\n      ✓ actions=${phase3Result.actions.length} (jobs.result.actions)`,
      `\n      ✓ meddpicc.hubspot_properties_written=${phase3Result.meddpicc.hubspot_properties_written}`,
      `\n      ✓ worker-path fanout produced 3 prompt_call_log rows`,
    );

    // Cleanup: remove the test job row so the jobs table stays clean.
    // deal_events rows stay (real pipeline output, idempotent going forward).
    await verify`DELETE FROM jobs WHERE id = ${jobId}`;
    console.log(`      ✓ cleanup: test job row deleted`);

    console.log("");
    console.log("transcript_pipeline end-to-end: ALL 3 PHASES PASS.");
    console.log(
      `  PHASE 1 direct:        ${phase1Ms}ms`,
      `\n  PHASE 2 idempotency:   ${phase2Ms}ms`,
      `\n  PHASE 3 full flow:     ${terminal.at}ms wall (jobId=${jobId.slice(0, 8)}…)`,
    );
  } finally {
    await verify.end({ timeout: 5 });
    await closeSharedSql();
  }
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
