/**
 * Job handler registry. Keyed by job_type enum value.
 *
 * `transcript_pipeline` landed Phase 3 Day 2 Session B. `noop` is the
 * Phase 1 Day 3 canary. Other types throw `not_implemented` in their own
 * targeted-phase owner until wired.
 *
 * Handler signature — expanded Phase 3 Day 2 Session B.
 *
 * Handlers receive `(input, ctx?)`:
 *   - `input`: the raw jobs.input jsonb value, opaque at dispatch time;
 *     per-handler type guards enforce shape.
 *   - `ctx`: optional `JobHandlerContext` carrying the job's id + type.
 *     The worker route passes it; direct-invocation tests pass it
 *     manually. Pre-Session-B handlers (noop) ignored a single-arg
 *     signature; the second arg is additive + backward-compatible.
 *
 * Motivation: the transcript_pipeline handler calls `callClaude` which
 * requires `anchors: { hubspotDealId, transcriptId, jobId }` per §2.13.1
 * Day-1 Session-B parked discipline. Without `jobId` plumbed through,
 * the compliance query "every Claude call tied to this job" from
 * §2.16.1 decision 3 loses a key anchor.
 *
 * Alternatives considered: (a) include jobId in the input payload at
 * enqueue time — awkward since jobId is generated at enqueue, not known
 * by the caller; (b) AsyncLocalStorage — ambient state is overengineered
 * for two call sites. Expanding the signature is cleanest.
 */
import crypto from "node:crypto";

// Relative imports within @nexus/shared — importing from the barrel
// `@nexus/shared` self-references and breaks Turbopack's module
// resolution. Peer-module imports are the convention for intra-package
// code.
import { callClaude } from "../claude/client";
import {
  detectSignalsTool,
  type DetectSignalsOutput,
  type DetectedSignal,
  type StakeholderInsight,
} from "../claude/tools/detect-signals";
import {
  extractActionsTool,
  type ExtractActionsOutput,
  type ExtractedAction,
} from "../claude/tools/extract-actions";
import {
  scoreMeddpiccTool,
  type ScoreMeddpiccOutput,
} from "../claude/tools/score-meddpicc";
import { HubSpotAdapter } from "../crm/hubspot/adapter";
import { loadPipelineIds } from "../crm/hubspot/pipeline-ids";
import { getSharedSql } from "../db/pool";
import {
  MEDDPICC_DIMENSION,
  type MeddpiccDimension,
} from "../enums/meddpicc-dimension";
import {
  DealIntelligence,
  type DealEventContext,
} from "../services/deal-intelligence";
import {
  MeddpiccService,
  type MeddpiccConfidence,
  type MeddpiccEvidence,
  type MeddpiccScores,
} from "../services/meddpicc";
import { TranscriptPreprocessor } from "../services/transcript-preprocessor";

/**
 * Narrow DI seam for test-time mocking (Phase 3 Day 3 Session B sub-step 1
 * — handler shape + idempotency + MEDDPICC persistence verification against
 * MockClaudeWrapper + no-op HubSpot adapter, without live-call cost or
 * blast radius). Production callers (worker route, enqueue route) never
 * pass hooks; the handler falls back to the real `callClaude` + a
 * fresh `HubSpotAdapter` constructed from env.
 */
export interface JobHandlerHooks {
  callClaude?: typeof callClaude;
  hubspotAdapter?: Pick<HubSpotAdapter, "updateDealCustomProperties">;
}

export interface JobHandlerContext {
  jobId: string;
  jobType: string;
  hooks?: JobHandlerHooks;
}

export type JobHandler = (
  input: unknown,
  ctx?: JobHandlerContext,
) => Promise<unknown>;

function notYet(type: string, owner: string): JobHandler {
  return async () => {
    throw new Error(`not_implemented: ${type} (scheduled for ${owner})`);
  };
}

const noop: JobHandler = async (input) => {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return { message: "hello", echoedInput: input };
};

// ─── transcript_pipeline (Phase 3 Day 2 Session B) ─────────────────────────

interface TranscriptPipelineInput {
  transcriptId: string;
}

function isTranscriptPipelineInput(v: unknown): v is TranscriptPipelineInput {
  return (
    typeof v === "object" &&
    v !== null &&
    "transcriptId" in v &&
    typeof (v as { transcriptId: unknown }).transcriptId === "string" &&
    (v as { transcriptId: string }).transcriptId.length > 0
  );
}

/**
 * Per-Claude-call telemetry summary, captured once per `callClaude` invocation
 * in step 3's three-way Promise.all fanout. The three-way shape is load-
 * bearing per Day 2 Session B's fanout verification + Day 3 kickoff's
 * explicit "three independent prompt_call_log rows per pipeline run"
 * requirement.
 */
export interface PipelineClaudeCallSummary {
  model: string;
  stop_reason: string;
  input_tokens: number;
  output_tokens: number;
  prompt_version: string;
  attempts: number;
  duration_ms: number;
}

export interface TranscriptPipelineResult {
  transcriptId: string;
  hubspotDealId: string;
  stepsCompleted: readonly string[];
  stepsDeferred: readonly string[];
  signals: {
    detected: number;
    inserted: number;
    skipped_duplicate: number;
  };
  /**
   * Day 3: action items from pipeline-extract-actions land in `jobs.result`
   * jsonb only — no table write per oversight-adjudicated Decision 2.
   * Day 4+ draft-email (consolidation of #12 + #18 + #24) is the first
   * consumer; persistence happens there against the rendered draft, not the
   * raw extraction.
   */
  actions: readonly ExtractedAction[];
  meddpicc: {
    scores_emitted: number;
    overall_score: number | null;
    hubspot_properties_written: number;
    contradicts_prior_count: number;
  };
  events: {
    transcript_ingested_inserted: number;
    transcript_ingested_skipped: number;
    signal_detected_inserted: number;
    signal_detected_skipped: number;
    meddpicc_scored_inserted: number;
  };
  preprocess: {
    speaker_turn_count: number;
    word_count: number;
    competitors_mentioned: readonly string[];
    embedding_model: string;
    embeddings_written: number;
    embedding_tokens_used: number;
  };
  /**
   * Per-call telemetry. Day 3 Session B: one entry per parallel Claude
   * call in step 3. The test-transcript-pipeline harness cross-references
   * these against `prompt_call_log` to verify the three-way fanout
   * produced three distinct rows with matching tool_name + prompt_file.
   */
  claude: {
    detect_signals: PipelineClaudeCallSummary;
    extract_actions: PipelineClaudeCallSummary;
    score_meddpicc: PipelineClaudeCallSummary;
  };
  timing: {
    total_ms: number;
    ingest_ms: number;
    preprocess_ms: number;
    analyze_ms: number;
    persist_signals_ms: number;
    persist_meddpicc_ms: number;
  };
}

/**
 * Stable fingerprint for signal-level idempotence. The tuple
 *   (signal_type, evidence_quote_normalized, source_speaker_normalized)
 * is the canonical dedup key; re-runs of the same transcript that
 * produce the same quote attributed to the same speaker are the same
 * signal. Truncated to 16 hex chars — plenty of collision margin at
 * per-transcript scale (~10 signals max).
 *
 * Convention locked Session A: source_ref on deal_events uses
 * `<transcriptId>:<signal_hash>` for signal_detected rows.
 */
function signalHash(signal: DetectedSignal): string {
  const normalized = [
    signal.signal_type,
    signal.evidence_quote.trim().toLowerCase().replace(/\s+/g, " "),
    signal.source_speaker.trim().toLowerCase(),
  ].join("|");
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

type TranscriptRow = {
  id: string;
  hubspot_deal_id: string;
  title: string;
  transcript_text: string;
  participants: Array<{
    name: string;
    role?: string;
    side?: "buyer" | "seller";
    org?: string;
  }>;
  duration_seconds: number | null;
};

type HubSpotCacheRow = {
  payload: Record<string, unknown> | null;
};

/**
 * Build the interpolation-variables bag for `01-detect-signals`.
 *
 * Day-2 MVP context:
 *   - Deal + company from `hubspot_cache` (primary store per §2.19).
 *   - Contacts + sellers from `transcripts.participants` directly (no
 *     CrmAdapter.resolveStakeholder — that stub is "Later" per Session A
 *     cleanup).
 *   - MEDDPICC from `DealIntelligence.formatMeddpiccForPrompt` (Phase 3
 *     Day 3 Session A refactor — the inline formatter now lives on
 *     DealIntelligence per Guardrail 25 + the documented contract in
 *     prompts 01, 05, 07). Byte-identical to pre-refactor output per
 *     test-meddpicc-format.ts.
 *   - Active experiments / open signals / active patterns: `(none)` —
 *     Phase 4 consumers fill these in.
 */
async function buildSignalDetectionVars(
  sql: ReturnType<typeof getSharedSql>,
  dealIntel: DealIntelligence,
  transcript: TranscriptRow,
): Promise<Record<string, unknown>> {
  const dealCache = await sql<HubSpotCacheRow[]>`
    SELECT payload FROM hubspot_cache
     WHERE object_type = 'deal' AND hubspot_id = ${transcript.hubspot_deal_id}
     LIMIT 1
  `;
  const dealPayload = dealCache[0]?.payload ?? {};

  const dealName = stringOr(dealPayload.name, transcript.title);
  const stage = stringOr(dealPayload.stage, "unknown");
  const amount = typeof dealPayload.amount === "number" ? dealPayload.amount : null;
  const formattedDealValue =
    amount !== null
      ? `$${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
      : "(value not set)";

  const companyId =
    typeof dealPayload.companyId === "string" ? dealPayload.companyId : null;
  let companyName = "(unknown)";
  let vertical = "unknown";
  if (companyId) {
    const companyCache = await sql<HubSpotCacheRow[]>`
      SELECT payload FROM hubspot_cache
       WHERE object_type = 'company' AND hubspot_id = ${companyId}
       LIMIT 1
    `;
    const companyPayload = companyCache[0]?.payload ?? {};
    companyName = stringOr(companyPayload.name, "(unknown)");
    vertical = stringOr(companyPayload.vertical, stringOr(dealPayload.vertical, "unknown"));
  } else {
    vertical = stringOr(dealPayload.vertical, "unknown");
  }

  const participants = Array.isArray(transcript.participants)
    ? transcript.participants
    : [];
  const buyers = participants.filter((p) => p.side === "buyer");
  const sellers = participants.filter((p) => p.side === "seller");
  const contactsBlock =
    buyers.length === 0
      ? "(none)"
      : buyers
          .map(
            (b) =>
              `- ${b.name}${b.role ? ` (${b.role}` : ""}${b.org ? `, ${b.org}` : ""}${b.role || b.org ? ")" : ""}`,
          )
          .join("\n");
  const sellersBlock =
    sellers.length === 0
      ? "(none)"
      : sellers.map((s) => `- ${s.name}${s.role ? ` (${s.role})` : ""}`).join("\n");

  const meddpiccBlock = await dealIntel.formatMeddpiccForPrompt(
    transcript.hubspot_deal_id,
  );

  return {
    dealId: transcript.hubspot_deal_id,
    dealName,
    companyName,
    vertical,
    stage,
    formattedDealValue,
    contactsBlock,
    sellersBlock,
    meddpiccBlock,
    activeExperimentsBlock: "(none)",
    openSignalsBlock: "(none)",
    activePatternsBlock: "(none)",
    transcriptText: transcript.transcript_text,
  };
}

function stringOr(v: unknown, fallback: string): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

/**
 * Canonical Nexus-dim → HubSpot-property-name map. Locked alongside the
 * `nexus_meddpicc_paper_process_score` Pre-Phase-3 Session 0-C provision
 * that closed the 7-vs-8 drift per §2.13.1 MEDDPICC canonical amendment.
 * Any change here requires coordinated edits to `properties.ts` + 07C §3.1.
 */
const MEDDPICC_DIM_TO_HUBSPOT_PROPERTY: Readonly<Record<MeddpiccDimension, string>> = {
  metrics: "nexus_meddpicc_metrics_score",
  economic_buyer: "nexus_meddpicc_eb_score",
  decision_criteria: "nexus_meddpicc_dc_score",
  decision_process: "nexus_meddpicc_dp_score",
  paper_process: "nexus_meddpicc_paper_process_score",
  identify_pain: "nexus_meddpicc_pain_score",
  champion: "nexus_meddpicc_champion_score",
  competition: "nexus_meddpicc_competition_score",
};

/**
 * In-handler factory for a HubSpotAdapter. Production callers (worker
 * route) land here via the default branch; test harnesses override via
 * `ctx.hooks.hubspotAdapter`. Reads env directly (no apps/web dependency
 * — handlers live in @nexus/shared and must not import across the
 * boundary). The `sql` parameter threads the process-wide shared pool
 * so the adapter doesn't open its own connection pool per pipeline run
 * (Pre-Phase-3 Session 0-B foundation-review A7).
 */
function createHubSpotAdapterFromEnv(
  sharedSql: ReturnType<typeof getSharedSql>,
): HubSpotAdapter {
  const token = process.env.NEXUS_HUBSPOT_TOKEN;
  const portalId = process.env.HUBSPOT_PORTAL_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  const databaseUrl = process.env.DATABASE_URL;
  if (!token || !portalId || !clientSecret || !databaseUrl) {
    throw new Error(
      "transcript_pipeline: HubSpotAdapter requires NEXUS_HUBSPOT_TOKEN + HUBSPOT_PORTAL_ID + HUBSPOT_CLIENT_SECRET + DATABASE_URL in env. Missing: " +
        [
          !token && "NEXUS_HUBSPOT_TOKEN",
          !portalId && "HUBSPOT_PORTAL_ID",
          !clientSecret && "HUBSPOT_CLIENT_SECRET",
          !databaseUrl && "DATABASE_URL",
        ]
          .filter(Boolean)
          .join(", "),
    );
  }
  return new HubSpotAdapter({
    token,
    portalId,
    clientSecret,
    databaseUrl,
    pipelineIds: loadPipelineIds(),
    sql: sharedSql,
  });
}

const transcriptPipeline: JobHandler = async (inputRaw, ctx) => {
  const startedAt = Date.now();
  if (!isTranscriptPipelineInput(inputRaw)) {
    throw new Error(
      `transcript_pipeline: invalid input shape — expected { transcriptId: string }, got ${JSON.stringify(inputRaw)}`,
    );
  }
  const { transcriptId } = inputRaw;
  const jobId = ctx?.jobId ?? null;

  // Resolve the effective Claude-wrapper + HubSpot-adapter via the optional
  // ctx.hooks DI seam. Production callers (worker route) never pass hooks;
  // sub-step-1 test harnesses pass a MockClaudeWrapper + a no-op adapter.
  const effectiveCallClaude = ctx?.hooks?.callClaude ?? callClaude;
  const sql = getSharedSql();
  const hubspotAdapter =
    ctx?.hooks?.hubspotAdapter ?? createHubSpotAdapterFromEnv(sql);

  // ── Step 1: ingest ─────────────────────────────────────────────────────
  const ingestStart = Date.now();
  const transcriptRows = await sql<TranscriptRow[]>`
    SELECT id, hubspot_deal_id, title, transcript_text, participants,
           duration_seconds
      FROM transcripts
     WHERE id = ${transcriptId}
     LIMIT 1
  `;
  if (transcriptRows.length === 0) {
    throw new Error(`transcript_pipeline: transcript not found id=${transcriptId}`);
  }
  const transcript = transcriptRows[0]!;
  const hubspotDealId = transcript.hubspot_deal_id;

  const dealIntel = new DealIntelligence({
    databaseUrl: process.env.DATABASE_URL ?? "",
    sql,
  });
  const eventContext: DealEventContext = await dealIntel.buildEventContext(
    hubspotDealId,
    [],
  );

  // Idempotency: transcript_ingested dedup on (transcript_id) via source_ref.
  const ingestSourceRef = transcriptId;
  const existingIngest = await sql<Array<{ id: string }>>`
    SELECT id FROM deal_events
     WHERE type = 'transcript_ingested'
       AND source_ref = ${ingestSourceRef}
     LIMIT 1
  `;
  let ingestInserted = 0;
  let ingestSkipped = 0;
  if (existingIngest.length === 0) {
    await sql`
      INSERT INTO deal_events (
        hubspot_deal_id, type, payload, event_context, source_kind, source_ref
      ) VALUES (
        ${hubspotDealId},
        'transcript_ingested',
        ${sql.json({
          transcriptId,
          title: transcript.title,
          textLength: transcript.transcript_text.length,
          participantCount: Array.isArray(transcript.participants)
            ? transcript.participants.length
            : 0,
          durationSeconds: transcript.duration_seconds,
        } as unknown as Parameters<typeof sql.json>[0])},
        ${sql.json(eventContext as unknown as Parameters<typeof sql.json>[0])},
        'service',
        ${ingestSourceRef}
      )
    `;
    ingestInserted = 1;
  } else {
    ingestSkipped = 1;
  }
  const ingestMs = Date.now() - ingestStart;

  // ── Step 2: preprocess ─────────────────────────────────────────────────
  const preprocessStart = Date.now();
  const preprocessor = new TranscriptPreprocessor({
    databaseUrl: process.env.DATABASE_URL ?? "",
    sql,
  });
  const preprocessResult = await preprocessor.preprocess(transcriptId);
  const preprocessMs = Date.now() - preprocessStart;

  // ── Step 3: analyze (three parallel Claude calls) ──────────────────────
  //
  // Day 3 Session B fanout: detect-signals + pipeline-extract-actions +
  // pipeline-score-meddpicc run in Promise.all. Each call passes matching
  // anchors so `prompt_call_log` rows tie back to the same pipeline
  // invocation via (hubspot_deal_id, transcript_id, job_id); rows are
  // distinguished by (prompt_file, tool_name). Day 2 Session B's telemetry
  // design supports per-call fanout structurally; Day 3 is the first live
  // exercise.
  //
  // Promise.all semantics: if any one call fails, the whole step 3 rejects
  // immediately and the job is marked failed (DECISIONS.md 2.24 — no
  // graceful degradation that fakes success). Per-call resilience via
  // Promise.allSettled is a Phase 4+ consideration if flaky classification
  // calls become load-bearing.
  //
  // All three calls receive the same `promptVars` superset — the prompt
  // loader's interpolator ignores extra vars and errors on missing ones,
  // so passing a single superset is both safe and cheap.
  const analyzeStart = Date.now();
  const promptVars = await buildSignalDetectionVars(sql, dealIntel, transcript);
  const baseAnchors = { hubspotDealId, transcriptId, jobId };

  const [detectResult, extractResult, scoreResult] = await Promise.all([
    effectiveCallClaude<DetectSignalsOutput>({
      promptFile: "01-detect-signals",
      vars: promptVars,
      tool: detectSignalsTool,
      task: "classification",
      anchors: baseAnchors,
    }),
    effectiveCallClaude<ExtractActionsOutput>({
      promptFile: "pipeline-extract-actions",
      vars: promptVars,
      tool: extractActionsTool,
      task: "classification",
      anchors: baseAnchors,
    }),
    effectiveCallClaude<ScoreMeddpiccOutput>({
      promptFile: "pipeline-score-meddpicc",
      vars: promptVars,
      tool: scoreMeddpiccTool,
      task: "classification",
      anchors: baseAnchors,
    }),
  ]);
  const analyzeMs = Date.now() - analyzeStart;

  const signals = detectResult.toolInput.signals ?? [];
  const stakeholderInsights: StakeholderInsight[] =
    detectResult.toolInput.stakeholder_insights ?? [];
  const actions: ExtractedAction[] = extractResult.toolInput.actions ?? [];
  const meddpiccScoresEmitted = scoreResult.toolInput.scores ?? [];

  // ── Step 4a: persist-signals ───────────────────────────────────────────
  const persistSignalsStart = Date.now();
  let signalsInserted = 0;
  let signalsSkipped = 0;

  for (const signal of signals) {
    const hash = signalHash(signal);
    const sourceRef = `${transcriptId}:${hash}`;
    const existing = await sql<Array<{ id: string }>>`
      SELECT id FROM deal_events
       WHERE type = 'signal_detected'
         AND source_ref = ${sourceRef}
       LIMIT 1
    `;
    if (existing.length > 0) {
      signalsSkipped++;
      continue;
    }
    await sql`
      INSERT INTO deal_events (
        hubspot_deal_id, type, payload, event_context, source_kind, source_ref
      ) VALUES (
        ${hubspotDealId},
        'signal_detected',
        ${sql.json({
          signal,
          reasoning_trace: detectResult.toolInput.reasoning_trace,
          signal_hash: hash,
          transcript_id: transcriptId,
          stop_reason: detectResult.stopReason,
          prompt_version: detectResult.promptVersion,
        } as unknown as Parameters<typeof sql.json>[0])},
        ${sql.json(eventContext as unknown as Parameters<typeof sql.json>[0])},
        'prompt',
        ${sourceRef}
      )
    `;
    signalsInserted++;
  }
  const persistSignalsMs = Date.now() - persistSignalsStart;

  // ── Step 4b: persist-meddpicc ──────────────────────────────────────────
  //
  // (i)  Read current MEDDPICC state (MeddpiccService.getByDealId). Null
  //      if no row exists yet.
  // (ii) Merge Claude's new scores on top of current state — Claude only
  //      emits dims with NEW evidence per prompt #20's discipline, so
  //      unspecified dims preserve their prior values.
  // (iii) MeddpiccService.upsert writes the merged state + computes the
  //       overall_score as the rounded mean of present non-null dims.
  // (iv) Build the HubSpot property bag from the merged record: only
  //      non-null dims land (updateDealCustomProperties null-skip
  //      contract leaves prior HubSpot values untouched for unscored
  //      dims; overall_score lands as `nexus_meddpicc_score`).
  // (v)  adapter.updateDealCustomProperties batches the PATCH per
  //      07C §7.5; A9's webhook echo-skip keeps the cache coherent
  //      without an echo refetch.
  // (vi) Append one `meddpicc_scored` event with source_ref including
  //      jobId — every pipeline invocation is a distinct scoring
  //      event per the event-sourced append-only discipline (§2.16);
  //      row-level dedup is via the meddpicc_scores PK upsert.
  const persistMeddpiccStart = Date.now();
  const meddpiccService = new MeddpiccService({
    databaseUrl: process.env.DATABASE_URL ?? "",
    sql,
  });

  const priorRecord = await meddpiccService.getByDealId(hubspotDealId);
  const mergedScores: MeddpiccScores = { ...(priorRecord?.scores ?? {}) };
  const mergedEvidence: MeddpiccEvidence = { ...(priorRecord?.evidence ?? {}) };
  const mergedConfidence: MeddpiccConfidence = {
    ...(priorRecord?.confidence ?? {}),
  };
  let contradictsPriorCount = 0;
  for (const s of meddpiccScoresEmitted) {
    mergedScores[s.dimension] = s.score;
    mergedEvidence[s.dimension] = s.evidence_quote;
    mergedConfidence[s.dimension] = s.confidence;
    if (s.contradicts_prior) contradictsPriorCount++;
  }

  const meddpiccRecord = await meddpiccService.upsert({
    dealId: hubspotDealId,
    scores: mergedScores,
    evidence: mergedEvidence,
    confidence: mergedConfidence,
  });

  const hubspotProps: Record<string, unknown> = {};
  for (const dim of MEDDPICC_DIMENSION) {
    const s = meddpiccRecord.scores[dim];
    if (typeof s === "number") {
      hubspotProps[MEDDPICC_DIM_TO_HUBSPOT_PROPERTY[dim]] = s;
    }
  }
  if (meddpiccRecord.overallScore !== null) {
    hubspotProps["nexus_meddpicc_score"] = meddpiccRecord.overallScore;
  }
  const hubspotPropertiesWritten = Object.keys(hubspotProps).length;
  if (hubspotPropertiesWritten > 0) {
    await hubspotAdapter.updateDealCustomProperties(hubspotDealId, hubspotProps);
  }

  const meddpiccScoredSourceRef = `${transcriptId}:meddpicc:${jobId ?? "no-job"}`;
  let meddpiccScoredInserted = 0;
  const existingMeddpiccEvent = await sql<Array<{ id: string }>>`
    SELECT id FROM deal_events
     WHERE type = 'meddpicc_scored'
       AND source_ref = ${meddpiccScoredSourceRef}
     LIMIT 1
  `;
  if (existingMeddpiccEvent.length === 0) {
    await sql`
      INSERT INTO deal_events (
        hubspot_deal_id, type, payload, event_context, source_kind, source_ref
      ) VALUES (
        ${hubspotDealId},
        'meddpicc_scored',
        ${sql.json({
          reasoning_trace: scoreResult.toolInput.reasoning_trace,
          scores_emitted: meddpiccScoresEmitted,
          overall_score: meddpiccRecord.overallScore,
          contradicts_prior_count: contradictsPriorCount,
          hubspot_properties_written: hubspotPropertiesWritten,
          transcript_id: transcriptId,
          stop_reason: scoreResult.stopReason,
          prompt_version: scoreResult.promptVersion,
        } as unknown as Parameters<typeof sql.json>[0])},
        ${sql.json(eventContext as unknown as Parameters<typeof sql.json>[0])},
        'prompt',
        ${meddpiccScoredSourceRef}
      )
    `;
    meddpiccScoredInserted = 1;
  }
  const persistMeddpiccMs = Date.now() - persistMeddpiccStart;
  await meddpiccService.close();

  const totalMs = Date.now() - startedAt;

  const summarize = (
    r: Awaited<ReturnType<typeof callClaude>>,
  ): PipelineClaudeCallSummary => ({
    model: r.model,
    stop_reason: r.stopReason,
    input_tokens: r.usage.inputTokens,
    output_tokens: r.usage.outputTokens,
    prompt_version: r.promptVersion,
    attempts: r.attempts,
    duration_ms: r.durationMs,
  });

  const result: TranscriptPipelineResult = {
    transcriptId,
    hubspotDealId,
    stepsCompleted: [
      "ingest",
      "preprocess",
      "analyze_signals",
      "analyze_actions",
      "analyze_meddpicc",
      "persist_signals",
      "persist_meddpicc",
    ],
    stepsDeferred: ["coordinator_signal", "synthesize_theory", "draft_email"],
    signals: {
      detected: signals.length,
      inserted: signalsInserted,
      skipped_duplicate: signalsSkipped,
    },
    actions,
    meddpicc: {
      scores_emitted: meddpiccScoresEmitted.length,
      overall_score: meddpiccRecord.overallScore,
      hubspot_properties_written: hubspotPropertiesWritten,
      contradicts_prior_count: contradictsPriorCount,
    },
    events: {
      transcript_ingested_inserted: ingestInserted,
      transcript_ingested_skipped: ingestSkipped,
      signal_detected_inserted: signalsInserted,
      signal_detected_skipped: signalsSkipped,
      meddpicc_scored_inserted: meddpiccScoredInserted,
    },
    preprocess: {
      speaker_turn_count: preprocessResult.speakerTurnCount,
      word_count: preprocessResult.wordCount,
      competitors_mentioned: preprocessResult.competitorsMentioned,
      embedding_model: preprocessResult.embeddingModel,
      embeddings_written: preprocessResult.embeddingsWritten,
      embedding_tokens_used: preprocessResult.embeddingTokensUsed,
    },
    claude: {
      detect_signals: summarize(detectResult),
      extract_actions: summarize(extractResult),
      score_meddpicc: summarize(scoreResult),
    },
    timing: {
      total_ms: totalMs,
      ingest_ms: ingestMs,
      preprocess_ms: preprocessMs,
      analyze_ms: analyzeMs,
      persist_signals_ms: persistSignalsMs,
      persist_meddpicc_ms: persistMeddpiccMs,
    },
  };

  // Stakeholder insights are observable in the Claude output but Day 3 does
  // not persist them — deferred to a Phase 4+ stakeholder-engagement writer
  // (parked from Day 2 Session B). `void` keeps the linter honest about
  // the deliberate drop.
  void stakeholderInsights;

  return result;
};

// ─── Registry ──────────────────────────────────────────────────────────────

export const HANDLERS = {
  noop,
  transcript_pipeline: transcriptPipeline,
  coordinator_synthesis: notYet("coordinator_synthesis", "Phase 4 Day 2"),
  observation_cluster: notYet("observation_cluster", "Phase 4 Day 3"),
  daily_digest: notYet("daily_digest", "Phase 5 Day 4"),
  deal_health_check: notYet("deal_health_check", "Phase 5 Day 3"),
  hubspot_periodic_sync: notYet("hubspot_periodic_sync", "Phase 1 Day 5"),
} satisfies Record<string, JobHandler>;

export type JobType = keyof typeof HANDLERS;

export const JOB_TYPES = Object.keys(HANDLERS) as JobType[];
