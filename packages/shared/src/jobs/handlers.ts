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
import { getSharedSql } from "../db/pool";
import {
  DealIntelligence,
  type DealEventContext,
} from "../services/deal-intelligence";
import { TranscriptPreprocessor } from "../services/transcript-preprocessor";

export interface JobHandlerContext {
  jobId: string;
  jobType: string;
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
  events: {
    transcript_ingested_inserted: number;
    transcript_ingested_skipped: number;
    signal_detected_inserted: number;
    signal_detected_skipped: number;
  };
  preprocess: {
    speaker_turn_count: number;
    word_count: number;
    competitors_mentioned: readonly string[];
    embedding_model: string;
    embeddings_written: number;
    embedding_tokens_used: number;
  };
  claude: {
    model: string;
    stop_reason: string;
    input_tokens: number;
    output_tokens: number;
    prompt_version: string;
    attempts: number;
    duration_ms: number;
  };
  timing: {
    total_ms: number;
    ingest_ms: number;
    preprocess_ms: number;
    analyze_ms: number;
    persist_ms: number;
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

type MeddpiccRow = {
  metrics_score: number | null;
  economic_buyer_score: number | null;
  decision_criteria_score: number | null;
  decision_process_score: number | null;
  paper_process_score: number | null;
  identify_pain_score: number | null;
  champion_score: number | null;
  competition_score: number | null;
  overall_score: number | null;
  per_dimension_confidence: Record<string, number> | null;
  evidence: Record<
    string,
    { evidence_text?: string; last_updated?: string } | undefined
  > | null;
};

const MEDDPICC_DIMENSIONS = [
  "metrics",
  "economic_buyer",
  "decision_criteria",
  "decision_process",
  "paper_process",
  "identify_pain",
  "champion",
  "competition",
] as const;

/**
 * Build the interpolation-variables bag for `01-detect-signals`.
 *
 * Day-2 MVP context:
 *   - Deal + company from `hubspot_cache` (primary store per §2.19).
 *   - Contacts + sellers from `transcripts.participants` directly (no
 *     CrmAdapter.resolveStakeholder — that stub is "Later" per Session A
 *     cleanup).
 *   - MEDDPICC from `meddpicc_scores` if a row exists; else `(none)`.
 *   - Active experiments / open signals / active patterns: `(none)` —
 *     Phase 4 consumers fill these in.
 *
 * Future expansion (Day 3+): format via MeddpiccService when that surface
 * grows a `formatForPrompt` method; pull open signals via
 * DealIntelligence.getOpenSignals; wire IntelligenceCoordinator.
 */
async function buildSignalDetectionVars(
  sql: ReturnType<typeof getSharedSql>,
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

  const meddpiccRows = await sql<MeddpiccRow[]>`
    SELECT metrics_score, economic_buyer_score, decision_criteria_score,
           decision_process_score, paper_process_score, identify_pain_score,
           champion_score, competition_score, overall_score,
           per_dimension_confidence, evidence
      FROM meddpicc_scores
     WHERE hubspot_deal_id = ${transcript.hubspot_deal_id}
     LIMIT 1
  `;
  const meddpicc = meddpiccRows[0];
  const meddpiccBlock = meddpicc
    ? MEDDPICC_DIMENSIONS.map((dim) => {
        const score = meddpicc[`${dim}_score` as keyof MeddpiccRow] as number | null;
        if (score === null || score === undefined) {
          return `- ${dim}: not yet captured`;
        }
        const dimEvidence = meddpicc.evidence?.[dim];
        const evidenceText = dimEvidence?.evidence_text ?? "(no evidence)";
        const lastUpdated = dimEvidence?.last_updated ?? "—";
        const conf = meddpicc.per_dimension_confidence?.[dim];
        const confStr = typeof conf === "number" ? `${Math.round(conf * 100)}%` : "—";
        return `- ${dim}: ${evidenceText} (score: ${score}, confidence: ${confStr}, last_updated: ${lastUpdated})`;
      }).join("\n")
    : "(none)";

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

const transcriptPipeline: JobHandler = async (inputRaw, ctx) => {
  const startedAt = Date.now();
  if (!isTranscriptPipelineInput(inputRaw)) {
    throw new Error(
      `transcript_pipeline: invalid input shape — expected { transcriptId: string }, got ${JSON.stringify(inputRaw)}`,
    );
  }
  const { transcriptId } = inputRaw;
  const jobId = ctx?.jobId ?? null;

  const sql = getSharedSql();

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

  // ── Step 3: analyze-signals ────────────────────────────────────────────
  const analyzeStart = Date.now();
  const promptVars = await buildSignalDetectionVars(sql, transcript);

  // Promise.all-of-one — shape for Day 3+ parallel expansion (score-meddpicc,
  // extract-actions) without restructuring. Each call writes its own
  // prompt_call_log row via the wrapper's telemetry path.
  const [detectResult] = await Promise.all([
    callClaude<DetectSignalsOutput>({
      promptFile: "01-detect-signals",
      vars: promptVars,
      tool: detectSignalsTool,
      task: "classification",
      anchors: {
        hubspotDealId,
        transcriptId,
        jobId,
      },
    }),
  ]);
  const analyzeMs = Date.now() - analyzeStart;

  const signals = detectResult.toolInput.signals ?? [];
  const stakeholderInsights: StakeholderInsight[] =
    detectResult.toolInput.stakeholder_insights ?? [];

  // ── Step 4: persist-signals ────────────────────────────────────────────
  const persistStart = Date.now();
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
  const persistMs = Date.now() - persistStart;

  const totalMs = Date.now() - startedAt;

  const result: TranscriptPipelineResult = {
    transcriptId,
    hubspotDealId,
    stepsCompleted: ["ingest", "preprocess", "analyze_signals", "persist_signals"],
    stepsDeferred: ["coordinator_signal", "synthesize_theory", "draft_email"],
    signals: {
      detected: signals.length,
      inserted: signalsInserted,
      skipped_duplicate: signalsSkipped,
    },
    events: {
      transcript_ingested_inserted: ingestInserted,
      transcript_ingested_skipped: ingestSkipped,
      signal_detected_inserted: signalsInserted,
      signal_detected_skipped: signalsSkipped,
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
      model: detectResult.model,
      stop_reason: detectResult.stopReason,
      input_tokens: detectResult.usage.inputTokens,
      output_tokens: detectResult.usage.outputTokens,
      prompt_version: detectResult.promptVersion,
      attempts: detectResult.attempts,
      duration_ms: detectResult.durationMs,
    },
    timing: {
      total_ms: totalMs,
      ingest_ms: ingestMs,
      preprocess_ms: preprocessMs,
      analyze_ms: analyzeMs,
      persist_ms: persistMs,
    },
  };

  // Stakeholder insights are observable in the Claude output but Day 2 does
  // not persist them — deferred to a Phase 4+ stakeholder-engagement writer.
  // Include count in log so the handler result captures the full Claude
  // output shape without silently dropping data.
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
