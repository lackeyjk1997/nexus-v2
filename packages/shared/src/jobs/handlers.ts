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
  draftEmailTool,
  type DraftEmailOutput,
} from "../claude/tools/draft-email";
import {
  extractActionsTool,
  type ExtractActionsOutput,
  type ExtractedAction,
} from "../claude/tools/extract-actions";
import {
  scoreMeddpiccTool,
  type ScoreMeddpiccOutput,
  type MeddpiccDimensionScore,
} from "../claude/tools/score-meddpicc";
import {
  updateDealTheoryTool,
  type UpdateDealTheoryOutput,
} from "../claude/tools/update-deal-theory";
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
  type DealTheory,
  type RecentEventSummary,
} from "../services/deal-intelligence";
import {
  coordinatorSynthesisTool,
  type CoordinatorSynthesisOutput,
} from "../claude/tools/coordinator-synthesis";
import {
  IntelligenceCoordinator,
  type ActivePatternSummary,
} from "../services/intelligence-coordinator";
import { isSignalTaxonomy, type SignalTaxonomy } from "../enums/signal-taxonomy";
import { isVertical, type Vertical } from "../enums/vertical";
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
  hubspotAdapter?: Pick<
    HubSpotAdapter,
    | "updateDealCustomProperties"
    | "bulkSyncDeals"
    | "bulkSyncContacts"
    | "bulkSyncCompanies"
  >;
  /**
   * Test-time DB seam (Phase 4 Day 2 Session A — coordinator_synthesis).
   * Production handlers fall back to `getSharedSql()`. The mock harness
   * passes a captured-call dispatcher to assert SQL surface without DB.
   */
  sql?: import("postgres").Sql;
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
 * Per-Claude-call telemetry summary. Day 4 Session B: 5 entries per pipeline
 * run — 3 from step 3's `analyze` fanout (detect-signals + extract-actions +
 * score-meddpicc) + 2 from step 6's `synthesize` fanout (update-deal-theory +
 * draft-email). The 5-call shape is load-bearing per the kickoff's "5
 * `prompt_call_log` rows per pipeline run" requirement.
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
   * jsonb only — no table write per oversight-adjudicated Decision 2. Day 4
   * Session B's email-draft step is the first consumer (renders these into
   * the post_pipeline trigger section).
   */
  actions: readonly ExtractedAction[];
  meddpicc: {
    scores_emitted: number;
    overall_score: number | null;
    hubspot_properties_written: number;
    contradicts_prior_count: number;
  };
  /**
   * Day 4 Session B — coordinator step 5 fanout summary. Today's
   * `IntelligenceCoordinator.receiveSignal` is a no-op; this counts the
   * fanout invocations so future-session callers can verify the call site
   * stays in place when Phase 4 Day 2 wires the real implementation.
   */
  coordinator: {
    signals_received: number;
  };
  /**
   * Day 4 Session B — 06a-close-analysis-continuous summary metadata.
   * `update_emitted` is true when 06a returned at least one change-set
   * field (working_hypothesis, threats_changed, etc.).
   * `working_hypothesis_changed` mirrors the truthiness of the
   * working_hypothesis section. Counters are 0 when 06a returned the
   * matching null/missing section.
   */
  theory: {
    update_emitted: boolean;
    working_hypothesis_changed: boolean;
    threats_added: number;
    meddpicc_trajectory_changed: number;
    deal_theory_updated_inserted: number;
  };
  /**
   * Day 4 Session B — email-draft summary metadata. The summary fields
   * mirror Day 3's `meddpicc` summary pattern. The full structured payload
   * lives at `email_full` (separate top-level field per oversight Decision
   * 2 — duplication of subject is intentional).
   */
  email: {
    subject: string;
    body_length: number;
    recipient: string;
    has_attachments: boolean;
    email_drafted_inserted: number;
  };
  /**
   * Day 4 Session B — full DraftEmailOutput per oversight Decision 2.
   * Persisted in BOTH `deal_events.email_drafted.payload.draft` AND
   * `jobs.result.email_full`. Subject + body + recipient + notes_for_rep +
   * attached_resources flow through unchanged from the prompt.
   */
  email_full: DraftEmailOutput;
  events: {
    transcript_ingested_inserted: number;
    transcript_ingested_skipped: number;
    signal_detected_inserted: number;
    signal_detected_skipped: number;
    meddpicc_scored_inserted: number;
    deal_theory_updated_inserted: number;
    email_drafted_inserted: number;
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
   * Per-call telemetry. Day 4 Session B: 5 entries — 3 from step 3's
   * `analyze` fanout + 2 from step 6's `synthesize` fanout. The
   * test-transcript-pipeline harness cross-references these against
   * `prompt_call_log` to verify the 5-way fanout produced 5 distinct rows
   * with matching tool_name + prompt_file.
   */
  claude: {
    detect_signals: PipelineClaudeCallSummary;
    extract_actions: PipelineClaudeCallSummary;
    score_meddpicc: PipelineClaudeCallSummary;
    update_deal_theory: PipelineClaudeCallSummary;
    draft_email: PipelineClaudeCallSummary;
  };
  timing: {
    total_ms: number;
    ingest_ms: number;
    preprocess_ms: number;
    analyze_ms: number;
    persist_signals_ms: number;
    persist_meddpicc_ms: number;
    coordinator_signal_ms: number;
    synthesize_ms: number;
    persist_theory_email_ms: number;
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
 * Format a transcript participant as `Name` or `Name (Role, Org)` per the
 * convention shared with `buildSignalDetectionVars`. Used for both the
 * email-draft recipient (first buyer-side participant) and rep-name
 * resolution (first seller-side participant).
 */
function formatParticipant(p: TranscriptRow["participants"][number]): string {
  const role = p.role ? ` (${p.role}` : "";
  const org = p.org ? `, ${p.org}` : "";
  const closing = p.role || p.org ? ")" : "";
  return `${p.name}${role}${org}${closing}`;
}

/**
 * Render the current deal theory as 06a's `${currentTheoryBlock}`. Null
 * theory → first-update sentinel per the .md spec. Otherwise emit a
 * 6-section block with last-updated timestamp on the working_hypothesis
 * line. Empty sections render as `- (none)` so the structure stays legible
 * to the model.
 */
function renderCurrentTheoryBlock(theory: DealTheory | null): string {
  if (theory === null) {
    return "(no prior theory — this is the first update for this deal)";
  }
  const wh = theory.workingHypothesis ?? "(not yet articulated)";
  const asOf = theory.asOf ? ` (last updated ${theory.asOf})` : "";
  const lines: string[] = [
    `Working hypothesis: ${wh}${asOf}`,
    "",
    `Threats (${theory.threats.length}):`,
  ];
  if (theory.threats.length === 0) {
    lines.push("- (none)");
  } else {
    for (const t of theory.threats) {
      lines.push(`- [${t.severity}/${t.trend}] ${t.description}`);
      for (const e of t.supportingEvidence) lines.push(`    evidence: ${e}`);
    }
  }
  lines.push("", `Tailwinds (${theory.tailwinds.length}):`);
  if (theory.tailwinds.length === 0) {
    lines.push("- (none)");
  } else {
    for (const tw of theory.tailwinds) {
      lines.push(`- [${tw.trend}] ${tw.description}`);
      for (const e of tw.supportingEvidence) lines.push(`    evidence: ${e}`);
    }
  }
  lines.push("", `MEDDPICC trajectory (${theory.meddpiccTrajectory.length}):`);
  if (theory.meddpiccTrajectory.length === 0) {
    lines.push("- (none)");
  } else {
    for (const m of theory.meddpiccTrajectory) {
      lines.push(
        `- ${m.dimension}: confidence ${m.currentConfidence}, direction ${m.direction}`,
      );
    }
  }
  lines.push(
    "",
    `Stakeholder confidence (${theory.stakeholderConfidence.length}):`,
  );
  if (theory.stakeholderConfidence.length === 0) {
    lines.push("- (none)");
  } else {
    for (const s of theory.stakeholderConfidence) {
      lines.push(`- ${s.contactName}: ${s.engagementRead}, ${s.direction}`);
    }
  }
  lines.push("", `Open questions (${theory.openQuestions.length}):`);
  if (theory.openQuestions.length === 0) {
    lines.push("- (none)");
  } else {
    for (const q of theory.openQuestions) {
      lines.push(`- ${q.question} (resolves via: ${q.whatWouldResolve})`);
    }
  }
  return lines.join("\n");
}

/**
 * Render `${recentEventsBlock}` per 06a's spec: one line per event,
 * `- [{type}, {createdAt.toISOString()}] {summary}`. Empty array → "(none)".
 */
function renderRecentEventsBlock(
  events: readonly RecentEventSummary[],
): string {
  if (events.length === 0) return "(none)";
  return events
    .map((e) => `- [${e.type}, ${e.createdAt.toISOString()}] ${e.summary}`)
    .join("\n");
}

/**
 * Render `${activePatternsBlock}` per 01/05/07/06a's shared convention:
 * one line per pattern, `- [{signalType}] {synthesisHeadline} (affecting
 * {dealCount} deals)`. Day 4: empty array → "(none)" since the coordinator
 * skeleton returns []. Phase 4 Day 2 fills in the real patterns.
 */
function renderActivePatternsBlock(
  patterns: readonly ActivePatternSummary[],
): string {
  if (patterns.length === 0) return "(none)";
  return patterns
    .map(
      (p) =>
        `- [${p.signalType}] ${p.synthesisHeadline} (affecting ${p.dealCount} deals)`,
    )
    .join("\n");
}

/**
 * Render `${dataPointBlock}` for the transcript variant — Day 4 MVP. Folds
 * preprocessor stats + step 3 outputs (signals, actions, MEDDPICC scoring
 * deltas, stakeholder reads) into a single block 06a consumes as the new
 * data point that triggered the theory update.
 *
 * Other dataPointTypes (email, observation, fitness_analysis, meddpicc_update)
 * land when their drivers ship — Day 4 only exercises the transcript path.
 */
function renderTranscriptDataPointBlock(
  transcript: TranscriptRow,
  preprocess: {
    speakerTurnCount: number;
    wordCount: number;
    competitorsMentioned: readonly string[];
  },
  signals: readonly DetectedSignal[],
  actions: readonly ExtractedAction[],
  meddpiccScores: readonly MeddpiccDimensionScore[],
  stakeholders: readonly StakeholderInsight[],
): string {
  const competitors =
    preprocess.competitorsMentioned.length === 0
      ? "(none)"
      : preprocess.competitorsMentioned.join(", ");

  const sigBlock =
    signals.length === 0
      ? "(none)"
      : signals
          .map(
            (s) =>
              `- [${s.signal_type}] ${s.summary} (urgency: ${s.urgency}, confidence: ${s.confidence})\n    evidence: "${s.evidence_quote}" — ${s.source_speaker}`,
          )
          .join("\n");

  const actBlock =
    actions.length === 0
      ? "(none)"
      : actions
          .map(
            (a) =>
              `- [${a.action_type}] ${a.owner_name} (${a.owner_side}): ${a.description}${a.due_date ? ` — by ${a.due_date}` : ""}`,
          )
          .join("\n");

  const scoreBlock =
    meddpiccScores.length === 0
      ? "(no new MEDDPICC evidence)"
      : meddpiccScores
          .map(
            (s) =>
              `- ${s.dimension}: ${s.score} (confidence ${s.confidence})\n    evidence: "${s.evidence_quote}"`,
          )
          .join("\n");

  const stakBlock =
    stakeholders.length === 0
      ? "(none)"
      : stakeholders
          .map(
            (s) =>
              `- ${s.contact_name}: ${s.sentiment} sentiment / ${s.engagement} engagement; priorities: ${s.key_priorities.length ? s.key_priorities.join(", ") : "none stated"}; concerns: ${s.key_concerns.length ? s.key_concerns.join(", ") : "none stated"}`,
          )
          .join("\n");

  return [
    `TITLE: ${transcript.title}`,
    `STATS: ${preprocess.speakerTurnCount} speaker turns, ${preprocess.wordCount} words`,
    `COMPETITORS NAMED: ${competitors}`,
    "",
    `DETECTED SIGNALS (${signals.length}):`,
    sigBlock,
    "",
    `ACTION ITEMS (${actions.length}):`,
    actBlock,
    "",
    `MEDDPICC SCORE UPDATES (${meddpiccScores.length}):`,
    scoreBlock,
    "",
    `STAKEHOLDER READS (${stakeholders.length}):`,
    stakBlock,
  ].join("\n");
}

/**
 * Render the post_pipeline `${triggerSection}` for the email-draft prompt
 * per the .md template at packages/prompts/files/email-draft.md:75-94.
 * Pipeline-step-7 caller assembles this from the run's own outputs.
 */
function renderTriggerSectionPostPipeline(
  recipientFormatted: string,
  actions: readonly ExtractedAction[],
  stakeholders: readonly StakeholderInsight[],
  callDateIso: string,
): string {
  const actionsBlock =
    actions.length === 0
      ? "(none extracted)"
      : actions
          .map(
            (a) =>
              `- [${a.action_type}] ${a.owner_name} (${a.owner_side}): ${a.description}${a.due_date ? ` — by ${a.due_date}` : ""}`,
          )
          .join("\n");
  const stakeholdersBlock =
    stakeholders.length === 0
      ? "(none captured)"
      : stakeholders
          .map(
            (s) =>
              `- ${s.contact_name}: ${s.sentiment}/${s.engagement} — concerns: ${s.key_concerns.length > 0 ? s.key_concerns.join(", ") : "none stated"}`,
          )
          .join("\n");
  return [
    "TRIGGER: post_pipeline (follow-up to recent call)",
    `RECIPIENT: ${recipientFormatted}`,
    "",
    "ACTION ITEMS extracted from the call (#19 output):",
    actionsBlock,
    "",
    "KEY STAKEHOLDERS who spoke on the call (#01 output):",
    stakeholdersBlock,
    "",
    `CALL DATE: ${callDateIso}`,
    "",
    'EMAIL GOAL: A follow-up that references specific commitments from the call. Include any seller-owned actions as concrete near-term deliverables. If a buyer-owned action gates the next step, name it as the "what we\'re waiting on" without sounding accusatory.',
  ].join("\n");
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

  // ── Step 5: coordinator_signal ─────────────────────────────────────────
  //
  // Day 4 no-op: receiveSignal returns immediately without writing. Phase 4
  // Day 2 wires the real coordinator implementation behind this same
  // interface. Per-signal fanout matches Phase 4's expected pattern (one
  // coordinator scan per detected signal); today the cost is essentially
  // zero so a forEach-loop is fine.
  //
  // The coordinator's vertical filter expects a `Vertical` value if
  // available; we extract it from the deal's hubspot_cache vertical
  // (already resolved in eventContext during step 1).
  const coordinatorSignalStart = Date.now();
  const coordinator = new IntelligenceCoordinator({
    databaseUrl: process.env.DATABASE_URL ?? "",
    sql,
  });
  for (const signal of signals) {
    await coordinator.receiveSignal({
      hubspotDealId,
      signalType: signal.signal_type,
      evidenceQuote: signal.evidence_quote,
      sourceSpeaker: signal.source_speaker,
      transcriptId,
      vertical: eventContext.vertical,
    });
  }
  await coordinator.close();
  const coordinatorSignalMs = Date.now() - coordinatorSignalStart;

  // ── Step 6: synthesize (2-way Promise.all over 06a + email-draft) ──────
  //
  // Both calls consume step-3 outputs (signals, actions, MEDDPICC scoring
  // deltas, stakeholder insights) as common context with no inter-call
  // dependency. The shape mirrors step 3's 3-way fanout: anchors are
  // identical, Promise.all error semantics propagate any rejection into
  // job failure (no graceful degrade across the 5 calls per §2.24).
  //
  // 06a-close-analysis-continuous (synthesis task, temp 0.3) reads the
  // current rolling theory + 14 days of recent events + active coordinator
  // patterns + the formatted new data point. Output: incremental theory
  // change-set with omitted-equals-unchanged semantics.
  //
  // email-draft (voice task, temp 0.5) reads the rep's voice context +
  // deal context + MEDDPICC + the post_pipeline trigger section assembled
  // from the action items + stakeholder insights. Output: subject + body +
  // recipient + notes_for_rep + optional attached_resources.
  const synthesizeStart = Date.now();
  const callDateIso = new Date().toISOString();

  // 06a context vars.
  const currentTheory = await dealIntel.getCurrentTheory(hubspotDealId);
  const recentEvents = await dealIntel.getRecentEvents(hubspotDealId, {
    sinceDays: 14,
    limit: 15,
  });
  const activePatterns = await new IntelligenceCoordinator({
    databaseUrl: process.env.DATABASE_URL ?? "",
    sql,
  }).getActivePatterns({ vertical: eventContext.vertical ?? undefined });
  const dataPointBlock = renderTranscriptDataPointBlock(
    transcript,
    {
      speakerTurnCount: preprocessResult.speakerTurnCount,
      wordCount: preprocessResult.wordCount,
      competitorsMentioned: preprocessResult.competitorsMentioned,
    },
    signals,
    actions,
    meddpiccScoresEmitted,
    stakeholderInsights,
  );
  const theoryVars: Record<string, unknown> = {
    dealId: hubspotDealId,
    dealName: promptVars.dealName,
    companyName: promptVars.companyName,
    vertical: promptVars.vertical,
    stage: promptVars.stage,
    formattedDealValue: promptVars.formattedDealValue,
    currentTheoryBlock: renderCurrentTheoryBlock(currentTheory),
    dataPointType: "transcript",
    dataPointDate: callDateIso,
    dataPointBlock,
    recentEventsBlock: renderRecentEventsBlock(recentEvents),
    activePatternsBlock: renderActivePatternsBlock(activePatterns),
  };

  // email-draft context vars. Rep is the first seller-side participant;
  // recipient is the first buyer-side participant. Hardcoded fallbacks
  // for repCommunicationStyle + repGuardrails until Phase 5+ rep-tooling
  // surfaces real per-rep config.
  const participants = Array.isArray(transcript.participants)
    ? transcript.participants
    : [];
  const primarySeller = participants.find((p) => p.side === "seller");
  const primaryBuyer = participants.find((p) => p.side === "buyer");
  const repName = primarySeller?.name ?? "the rep";
  const recipientFormatted = primaryBuyer
    ? formatParticipant(primaryBuyer)
    : "the buyer team";
  const triggerSection = renderTriggerSectionPostPipeline(
    recipientFormatted,
    actions,
    stakeholderInsights,
    callDateIso,
  );
  const emailVars: Record<string, unknown> = {
    repName,
    repCommunicationStyle: "professional and concise",
    repGuardrails: "(none specified)",
    dealName: promptVars.dealName,
    companyName: promptVars.companyName,
    vertical: promptVars.vertical,
    stage: promptVars.stage,
    meddpiccBlock: promptVars.meddpiccBlock,
    triggerSection,
    trigger: "post_pipeline",
  };

  const [theoryResult, emailResult] = await Promise.all([
    effectiveCallClaude<UpdateDealTheoryOutput>({
      promptFile: "06a-close-analysis-continuous",
      vars: theoryVars,
      tool: updateDealTheoryTool,
      task: "synthesis",
      anchors: baseAnchors,
    }),
    effectiveCallClaude<DraftEmailOutput>({
      promptFile: "email-draft",
      vars: emailVars,
      tool: draftEmailTool,
      task: "voice",
      anchors: baseAnchors,
    }),
  ]);
  const synthesizeMs = Date.now() - synthesizeStart;

  // ── Step 7: persist_theory_email ───────────────────────────────────────
  //
  // Append `deal_theory_updated` event via DealIntelligence.appendTheoryUpdate
  // (Guardrail 25 — DealIntelligence is the only write surface for
  // intelligence data per §2.16). source_ref = ${transcriptId}:theory:${jobId}
  // so each pipeline invocation appends one event per the §2.16 append-only
  // discipline.
  //
  // Append `email_drafted` event directly via sql — no service helper today
  // (Phase 4+ may add `dealIntel.appendEmailDraft`). source_ref =
  // ${transcriptId}:email:${jobId}; payload carries the FULL DraftEmailOutput
  // per oversight Decision 2 (also surfaced at jobs.result.email_full).
  //
  // refreshSnapshot is a Day 4 no-op stub; Phase 4+ implements
  // event-stream replay materialization into deal_snapshots.
  const persistTheoryEmailStart = Date.now();
  const theoryUpdate = theoryResult.toolInput;
  const theorySourceRef = `${transcriptId}:theory:${jobId ?? "no-job"}`;
  await dealIntel.appendTheoryUpdate(
    hubspotDealId,
    {
      update: theoryUpdate as unknown as Record<string, unknown>,
      dataPointType: "transcript",
      dataPointId: transcriptId,
      emittedBy: jobId,
      promptVersion: theoryResult.promptVersion,
      stopReason: theoryResult.stopReason,
    },
    { eventContext, sourceRef: theorySourceRef },
  );
  await dealIntel.refreshSnapshot(hubspotDealId);
  const dealTheoryUpdatedInserted = 1;

  const emailDraft = emailResult.toolInput;
  const emailSourceRef = `${transcriptId}:email:${jobId ?? "no-job"}`;
  await sql`
    INSERT INTO deal_events (
      hubspot_deal_id, type, payload, event_context, source_kind, source_ref
    ) VALUES (
      ${hubspotDealId},
      'email_drafted',
      ${sql.json({
        draft: emailDraft,
        dataPointType: "transcript",
        dataPointId: transcriptId,
        emittedBy: jobId,
        promptVersion: emailResult.promptVersion,
        stopReason: emailResult.stopReason,
      } as unknown as Parameters<typeof sql.json>[0])},
      ${sql.json(eventContext as unknown as Parameters<typeof sql.json>[0])},
      'prompt',
      ${emailSourceRef}
    )
  `;
  const emailDraftedInserted = 1;
  const persistTheoryEmailMs = Date.now() - persistTheoryEmailStart;

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

  // Theory summary metadata for jobs.result.theory.
  const workingHypothesisChanged =
    theoryUpdate.working_hypothesis !== null &&
    theoryUpdate.working_hypothesis !== undefined;
  const threatsAdded = (theoryUpdate.threats_changed ?? []).filter(
    (t) => t.change_type === "added",
  ).length;
  const meddpiccTrajectoryChanged = (
    theoryUpdate.meddpicc_trajectory_changed ?? []
  ).length;
  const updateEmitted =
    workingHypothesisChanged ||
    (theoryUpdate.threats_changed?.length ?? 0) > 0 ||
    (theoryUpdate.tailwinds_changed?.length ?? 0) > 0 ||
    meddpiccTrajectoryChanged > 0 ||
    (theoryUpdate.stakeholder_confidence_changed?.length ?? 0) > 0 ||
    (theoryUpdate.open_questions_changed?.length ?? 0) > 0;

  const result: TranscriptPipelineResult = {
    transcriptId,
    hubspotDealId,
    stepsCompleted: [
      "ingest",
      "preprocess",
      "analyze",
      "persist_signals",
      "persist_meddpicc",
      "coordinator_signal",
      "synthesize",
      "persist_theory_email",
    ],
    stepsDeferred: [],
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
    coordinator: {
      signals_received: signals.length,
    },
    theory: {
      update_emitted: updateEmitted,
      working_hypothesis_changed: workingHypothesisChanged,
      threats_added: threatsAdded,
      meddpicc_trajectory_changed: meddpiccTrajectoryChanged,
      deal_theory_updated_inserted: dealTheoryUpdatedInserted,
    },
    email: {
      subject: emailDraft.subject,
      body_length: emailDraft.body.length,
      recipient: emailDraft.recipient,
      has_attachments:
        Array.isArray(emailDraft.attached_resources) &&
        emailDraft.attached_resources.length > 0,
      email_drafted_inserted: emailDraftedInserted,
    },
    email_full: emailDraft,
    events: {
      transcript_ingested_inserted: ingestInserted,
      transcript_ingested_skipped: ingestSkipped,
      signal_detected_inserted: signalsInserted,
      signal_detected_skipped: signalsSkipped,
      meddpicc_scored_inserted: meddpiccScoredInserted,
      deal_theory_updated_inserted: dealTheoryUpdatedInserted,
      email_drafted_inserted: emailDraftedInserted,
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
      update_deal_theory: summarize(theoryResult),
      draft_email: summarize(emailResult),
    },
    timing: {
      total_ms: totalMs,
      ingest_ms: ingestMs,
      preprocess_ms: preprocessMs,
      analyze_ms: analyzeMs,
      persist_signals_ms: persistSignalsMs,
      persist_meddpicc_ms: persistMeddpiccMs,
      coordinator_signal_ms: coordinatorSignalMs,
      synthesize_ms: synthesizeMs,
      persist_theory_email_ms: persistTheoryEmailMs,
    },
  };

  return result;
};

// ─── coordinator_synthesis (Phase 4 Day 2 Session A) ───────────────────────
//
// Reads recent `signal_detected` events (last 30 days), groups by
// (vertical, signal_type), and for each group with >= minDealsAffected
// distinct deals: calls 04-coordinator-synthesis via callClaude and
// writes a coordinator_patterns row + coordinator_pattern_deals join
// rows. Idempotent on `pattern_key = sha256(vertical:signal_type:sorted-deal-ids)`.
//
// Per Phase 4 Day 2 Session A kickoff Decision 4: input.vertical +
// input.signalType narrow the scope. When neither is supplied, the
// handler scans all (vertical, signal_type) groups in the recent
// signal stream — exercised by the mock harness's PHASE 3 fixture.
//
// Telemetry per Decision 8 — stderr JSON line per event:
//   - coordinator_synthesis_started
//   - pattern_below_threshold     (per group below minDealsAffected)
//   - pattern_detected            (per group at/above threshold; one Claude call)
//   - coordinator_synthesis_completed (with patterns_emitted count)
//
// minDealsAffected default = 2 per Decision 3. Per-group cost: ~1
// Claude synthesis call (~$0.05-0.10). Pre-deploy synthetic harness
// uses MockClaudeWrapper; live exercise uses the real wrapper.

interface CoordinatorSynthesisInput {
  vertical?: Vertical | null;
  signalType?: SignalTaxonomy | null;
  minDealsAffected?: number;
  triggeringDealId?: string | null;
  triggeringTranscriptId?: string | null;
  enqueuedAt?: string | null;
}

function parseCoordinatorSynthesisInput(v: unknown): CoordinatorSynthesisInput {
  if (typeof v !== "object" || v === null) return {};
  const obj = v as Record<string, unknown>;
  const out: CoordinatorSynthesisInput = {};
  if (typeof obj.vertical === "string" && isVertical(obj.vertical)) {
    out.vertical = obj.vertical;
  }
  if (typeof obj.signalType === "string" && isSignalTaxonomy(obj.signalType)) {
    out.signalType = obj.signalType;
  }
  if (typeof obj.minDealsAffected === "number" && obj.minDealsAffected >= 1) {
    out.minDealsAffected = Math.floor(obj.minDealsAffected);
  }
  if (typeof obj.triggeringDealId === "string") {
    out.triggeringDealId = obj.triggeringDealId;
  }
  if (typeof obj.triggeringTranscriptId === "string") {
    out.triggeringTranscriptId = obj.triggeringTranscriptId;
  }
  return out;
}

interface RecentSignalRow {
  hubspot_deal_id: string;
  vertical: string;
  signal_type: string;
  evidence_quote: string | null;
  source_speaker: string | null;
  urgency: string | null;
  deal_size_band: string | null;
  created_at: string;
}

export interface CoordinatorSynthesisResult {
  patternsEmitted: number;
  groupsEvaluated: number;
  groupsAboveThreshold: number;
  signalsRead: number;
  durationMs: number;
  patterns: Array<{
    patternId: string;
    patternKey: string;
    vertical: string;
    signalType: string;
    dealsAffected: number;
  }>;
}

const COORDINATOR_DAY_WINDOW = 30;

function computePatternKey(
  vertical: string,
  signalType: string,
  sortedDealIds: readonly string[],
): string {
  const material = `${vertical}:${signalType}:${sortedDealIds.join(",")}`;
  return crypto.createHash("sha256").update(material).digest("hex").slice(0, 32);
}

function renderAffectedDealsBlock(
  dealsMap: Map<string, RecentSignalRow[]>,
): string {
  const blocks: string[] = [];
  for (const [dealId, rows] of dealsMap) {
    const lines: string[] = [`--- Deal ${dealId} ---`];
    lines.push(
      "Stage: (unknown) | ARR: (size band " +
        (rows[0]?.deal_size_band ?? "unknown") +
        ") | AE: (unknown)",
    );
    lines.push("Key stakeholders: (not enriched in MVP)");
    lines.push("Signals contributing to this pattern:");
    const recent = rows.slice(0, 5);
    for (const row of recent) {
      const urgency = row.urgency ?? "medium";
      const quote = (row.evidence_quote ?? "").slice(0, 240);
      const speaker = row.source_speaker ?? "unknown";
      const callDate = row.created_at.split("T")[0] ?? row.created_at;
      lines.push(`  - [${urgency}] "${quote}" — ${speaker} on ${callDate}`);
    }
    lines.push("Active experiments rep is testing on this deal: (none enriched in MVP)");
    lines.push("Open MEDDPICC gaps: (not enriched in MVP)");
    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n\n");
}

function summarizeArrBands(dealsMap: Map<string, RecentSignalRow[]>): string {
  const bandCounts = new Map<string, number>();
  for (const rows of dealsMap.values()) {
    const band = rows[0]?.deal_size_band ?? "unknown";
    bandCounts.set(band, (bandCounts.get(band) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const [band, count] of bandCounts) {
    parts.push(`${count}× ${band}`);
  }
  return parts.length > 0 ? `aggregate size bands: ${parts.join(", ")}` : "size bands: unknown";
}

const coordinatorSynthesis: JobHandler = async (rawInput, ctx) => {
  const input = parseCoordinatorSynthesisInput(rawInput);
  const minDealsAffected = input.minDealsAffected ?? 2;
  const sql = ctx?.hooks?.sql ?? getSharedSql();
  const effectiveCallClaude = ctx?.hooks?.callClaude ?? callClaude;
  const jobId = ctx?.jobId ?? null;
  const startTs = Date.now();

  // ── Read recent signals (last 30 days), with optional vertical+signalType
  // narrowing. Postgres jsonb-path operators: `payload->'signal'->>'signal_type'`
  // matches the transcript_pipeline write shape (handlers.ts step 4a).
  const verticalFilter = input.vertical ?? null;
  const signalTypeFilter = input.signalType ?? null;
  const recent = await sql<RecentSignalRow[]>`
    SELECT
      hubspot_deal_id,
      event_context->>'vertical' AS vertical,
      payload->'signal'->>'signal_type' AS signal_type,
      payload->'signal'->>'evidence_quote' AS evidence_quote,
      payload->'signal'->>'source_speaker' AS source_speaker,
      payload->'signal'->>'urgency' AS urgency,
      event_context->>'deal_size_band' AS deal_size_band,
      created_at
     FROM deal_events
    WHERE type = 'signal_detected'
      AND created_at > now() - interval '${sql.unsafe(String(COORDINATOR_DAY_WINDOW))} days'
      AND (${verticalFilter}::text IS NULL OR event_context->>'vertical' = ${verticalFilter}::text)
      AND (${signalTypeFilter}::text IS NULL OR payload->'signal'->>'signal_type' = ${signalTypeFilter}::text)
      AND event_context->>'vertical' IS NOT NULL
      AND payload->'signal'->>'signal_type' IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 5000
  `;

  // ── Group by (vertical, signal_type) → dealId → rows.
  type GroupKey = string;
  const groups = new Map<GroupKey, Map<string, RecentSignalRow[]>>();
  for (const row of recent) {
    const groupKey = `${row.vertical}|${row.signal_type}`;
    let dealsMap = groups.get(groupKey);
    if (!dealsMap) {
      dealsMap = new Map();
      groups.set(groupKey, dealsMap);
    }
    let rowList = dealsMap.get(row.hubspot_deal_id);
    if (!rowList) {
      rowList = [];
      dealsMap.set(row.hubspot_deal_id, rowList);
    }
    rowList.push(row);
  }

  console.error(
    JSON.stringify({
      event: "coordinator_synthesis_started",
      job_id: jobId,
      input_groups_count: groups.size,
      total_signals: recent.length,
      vertical_filter: verticalFilter,
      signal_type_filter: signalTypeFilter,
      min_deals_affected: minDealsAffected,
      ts: new Date().toISOString(),
    }),
  );

  let patternsEmitted = 0;
  let groupsAboveThreshold = 0;
  const emittedPatterns: CoordinatorSynthesisResult["patterns"] = [];

  for (const [groupKey, dealsMap] of groups) {
    const sepIdx = groupKey.indexOf("|");
    const groupVertical = groupKey.slice(0, sepIdx);
    const groupSignalType = groupKey.slice(sepIdx + 1);
    const dealsAffected = dealsMap.size;

    if (dealsAffected < minDealsAffected) {
      console.error(
        JSON.stringify({
          event: "pattern_below_threshold",
          job_id: jobId,
          vertical: groupVertical,
          signal_type: groupSignalType,
          deals_affected: dealsAffected,
          threshold: minDealsAffected,
          ts: new Date().toISOString(),
        }),
      );
      continue;
    }
    groupsAboveThreshold++;

    const sortedDealIds = [...dealsMap.keys()].sort();
    const patternKey = computePatternKey(groupVertical, groupSignalType, sortedDealIds);

    // ── Build prompt vars.
    const affectedDealsBlock = renderAffectedDealsBlock(dealsMap);
    const arrSummary = summarizeArrBands(dealsMap);

    // The prompt expects `patternId` for its own narrative — pre-allocate
    // a UUID; the actual `coordinator_patterns.id` is generated server-side
    // on INSERT. The UUIDs aren't required to match — `patternId` in the
    // prompt is read for the synthesis text only, not for FK.
    const patternIdForPrompt = crypto.randomUUID();

    const promptVars: Record<string, unknown> = {
      patternId: patternIdForPrompt,
      signalType: groupSignalType,
      vertical: groupVertical,
      competitor: "n/a",
      dealCount: dealsAffected,
      formattedAffectedArr: arrSummary,
      priorPatternsBlock:
        "(no prior patterns of this type/vertical in 90 days — this is novel)",
      affectedDealsBlock,
      atRiskDealsBlock: "(no comparable at-risk deals identified)",
      relatedExperimentsBlock: "(no related experiments active)",
      activeDirectivesBlock: "(no active directives)",
      systemIntelligenceBlock: "(none)",
    };

    // ── Call Claude.
    const claudeResult = await effectiveCallClaude<CoordinatorSynthesisOutput>({
      promptFile: "04-coordinator-synthesis",
      vars: promptVars,
      tool: coordinatorSynthesisTool,
      task: "synthesis",
      anchors: jobId ? { jobId } : {},
    });

    const synth = claudeResult.toolInput.synthesis;
    const synthesisText = `${synth.headline}\n\nMechanism:\n${synth.mechanism}`;
    const reasoningText = claudeResult.toolInput.reasoning_trace;

    // ── Insert coordinator_patterns row idempotent on pattern_key.
    const inserted = await sql<Array<{ id: string }>>`
      INSERT INTO coordinator_patterns (
        pattern_key, signal_type, vertical, synthesis,
        recommendations, arr_impact, reasoning,
        status, detected_at, synthesized_at
      ) VALUES (
        ${patternKey},
        ${groupSignalType}::signal_taxonomy,
        ${groupVertical}::vertical,
        ${synthesisText},
        ${sql.json(claudeResult.toolInput.recommendations as unknown as Parameters<typeof sql.json>[0])},
        ${sql.json(claudeResult.toolInput.arr_impact as unknown as Parameters<typeof sql.json>[0])},
        ${reasoningText},
        'synthesized',
        now(),
        now()
      )
      ON CONFLICT (pattern_key) DO NOTHING
      RETURNING id
    `;

    let patternId: string;
    if (inserted.length > 0) {
      patternId = inserted[0]!.id;
    } else {
      const existing = await sql<Array<{ id: string }>>`
        SELECT id FROM coordinator_patterns WHERE pattern_key = ${patternKey} LIMIT 1
      `;
      if (existing.length === 0) {
        // Race-impossible after INSERT ON CONFLICT — but if it happens, skip.
        continue;
      }
      patternId = existing[0]!.id;
    }

    // ── Insert join rows (idempotent on (pattern_id, hubspot_deal_id) PK).
    for (const dealId of sortedDealIds) {
      await sql`
        INSERT INTO coordinator_pattern_deals (pattern_id, hubspot_deal_id)
        VALUES (${patternId}, ${dealId})
        ON CONFLICT (pattern_id, hubspot_deal_id) DO NOTHING
      `;
    }

    emittedPatterns.push({
      patternId,
      patternKey,
      vertical: groupVertical,
      signalType: groupSignalType,
      dealsAffected,
    });
    patternsEmitted++;

    console.error(
      JSON.stringify({
        event: "pattern_detected",
        job_id: jobId,
        vertical: groupVertical,
        signal_type: groupSignalType,
        deals_affected: dealsAffected,
        pattern_id: patternId,
        pattern_key: patternKey,
        arr_multiplier: claudeResult.toolInput.arr_impact?.multiplier ?? null,
        recommendation_count: claudeResult.toolInput.recommendations?.length ?? 0,
        ts: new Date().toISOString(),
      }),
    );
  }

  const durationMs = Date.now() - startTs;
  console.error(
    JSON.stringify({
      event: "coordinator_synthesis_completed",
      job_id: jobId,
      patterns_emitted: patternsEmitted,
      groups_evaluated: groups.size,
      groups_above_threshold: groupsAboveThreshold,
      signals_read: recent.length,
      duration_ms: durationMs,
      ts: new Date().toISOString(),
    }),
  );

  const result: CoordinatorSynthesisResult = {
    patternsEmitted,
    groupsEvaluated: groups.size,
    groupsAboveThreshold,
    signalsRead: recent.length,
    durationMs,
    patterns: emittedPatterns,
  };
  return result;
};

// ─── hubspot_periodic_sync (Phase 4 Day 2 Session B) ───────────────────────
//
// Scheduled by pg_cron every 15 minutes (configure-cron extension): inserts
// a `hubspot_periodic_sync` jobs row that the existing nexus-worker (10s
// cron) picks up via the same atomic-claim path. Handler reads `sync_state`
// per resource (deal/contact/company), calls the adapter's bulk-sync method
// with `since: last_sync_at`, then UPSERTs sync_state with the START time of
// each resource's fetch as the new cursor (conservative — covers any records
// modified DURING the fetch window via UPSERT idempotency on hubspot_cache).
//
// Per Phase 4 Day 2 Session B kickoff Decision 2: single jobs table + worker.
// Per Decision 3 (revised): sync_state already exists from migration 0005
// with a (object_type PK, last_sync_at) shape — cleaner than the
// single-row-three-columns shape originally proposed. No migration needed.
// Per Decision 4: bulkSync* methods on HubSpotAdapter exist + are tested.
// Per Decision 5: 429 rate-limit responses bubble up as "hubspot_rate_limit"
// — escalates per ESCALATION RULES (rethrows so the worker marks the job
// failed, retry policy gets the standard backoff).
//
// Telemetry per Decision 11 — stderr JSON line per event:
//   - hubspot_sync_started        (job_id)
//   - hubspot_sync_resource_completed (resource, synced, failed, duration_ms)
//   - hubspot_sync_resource_failed    (resource, error, duration_ms)
//   - hubspot_sync_completed     (total_synced, total_failed, duration_ms)

const HUBSPOT_SYNC_RESOURCES = ["deal", "contact", "company"] as const;
type HubSpotSyncResource = (typeof HUBSPOT_SYNC_RESOURCES)[number];

interface HubSpotSyncResourceResult {
  resource: HubSpotSyncResource;
  synced: number;
  failed: number;
  durationMs: number;
  error?: string;
}

export interface HubSpotPeriodicSyncResult {
  totalSynced: number;
  totalFailed: number;
  durationMs: number;
  resources: readonly HubSpotSyncResourceResult[];
}

const hubspotPeriodicSync: JobHandler = async (_input, ctx) => {
  const sql = ctx?.hooks?.sql ?? getSharedSql();
  const adapter = ctx?.hooks?.hubspotAdapter ?? createHubSpotAdapterFromEnv(sql);
  const jobId = ctx?.jobId ?? null;
  const startTs = Date.now();

  console.error(
    JSON.stringify({
      event: "hubspot_sync_started",
      job_id: jobId,
      ts: new Date().toISOString(),
    }),
  );

  // Read existing cursors. Rows missing for a resource type → first sync,
  // use epoch (matches schema default '1970-01-01'). The default ensures
  // a brand-new install gets full history sync on the first run.
  const cursorRows = await sql<
    Array<{ object_type: HubSpotSyncResource; last_sync_at: Date }>
  >`
    SELECT object_type, last_sync_at FROM sync_state
     WHERE object_type = ANY(${HUBSPOT_SYNC_RESOURCES as readonly HubSpotSyncResource[]}::hubspot_object_type[])
  `;
  const cursorByType = new Map<HubSpotSyncResource, Date>();
  for (const row of cursorRows) {
    cursorByType.set(row.object_type, new Date(row.last_sync_at));
  }

  const resourceResults: HubSpotSyncResourceResult[] = [];
  let totalSynced = 0;
  let totalFailed = 0;

  // Sequential per-resource — Decision 5 + pool-pressure discipline. Each
  // call hits the HubSpot REST API + writes back via the shared sql pool.
  // Parallelism would multiply pool footprint × HubSpot rate-limit pressure.
  for (const resource of HUBSPOT_SYNC_RESOURCES) {
    const since = cursorByType.get(resource) ?? new Date(0);
    const resourceStartTs = Date.now();
    // Capture sync-start time BEFORE the fetch — this becomes the new
    // last_sync_at. Conservative: records modified DURING the fetch may
    // be re-fetched next run (idempotent UPSERT on hubspot_cache handles
    // the duplicate gracefully). The opposite ordering (capture AFTER
    // the fetch) could MISS records modified during the window.
    const syncStartTime = new Date();

    try {
      const result =
        resource === "deal"
          ? await adapter.bulkSyncDeals({ since })
          : resource === "contact"
            ? await adapter.bulkSyncContacts({ since })
            : await adapter.bulkSyncCompanies({ since });

      // UPSERT cursor advancement. ON CONFLICT covers both first-run insert
      // and subsequent-run update.
      await sql`
        INSERT INTO sync_state (object_type, last_sync_at)
        VALUES (${resource}::hubspot_object_type, ${syncStartTime})
        ON CONFLICT (object_type) DO UPDATE
          SET last_sync_at = EXCLUDED.last_sync_at
      `;

      const durationMs = Date.now() - resourceStartTs;
      totalSynced += result.synced;
      totalFailed += result.failed;
      resourceResults.push({
        resource,
        synced: result.synced,
        failed: result.failed,
        durationMs,
      });

      console.error(
        JSON.stringify({
          event: "hubspot_sync_resource_completed",
          job_id: jobId,
          resource,
          synced: result.synced,
          failed: result.failed,
          duration_ms: durationMs,
          ts: new Date().toISOString(),
        }),
      );
    } catch (err) {
      const durationMs = Date.now() - resourceStartTs;
      const message = err instanceof Error ? err.message : String(err);

      // Per Decision 5: 429 rate-limit breach is a NEW investigation
      // (per ESCALATION RULES). Rethrow so the worker marks the job
      // failed; retry policy will retry per Decision 6's backoff.
      if (message.includes("429") || /rate[ _-]?limit/i.test(message)) {
        console.error(
          JSON.stringify({
            event: "hubspot_sync_rate_limit_warned",
            job_id: jobId,
            resource,
            error: message.slice(0, 240),
            duration_ms: durationMs,
            ts: new Date().toISOString(),
          }),
        );
        throw new Error(`hubspot_rate_limit_breach (${resource}): ${message}`);
      }

      // Other resource errors: log + continue with remaining resources
      // (partial-success semantics). Each resource's success/failure is
      // independent at the data layer; one failure shouldn't block the
      // others' cursor advancement. Failed resource's cursor stays at
      // its pre-call value — next run retries from the same since.
      resourceResults.push({
        resource,
        synced: 0,
        failed: 0,
        durationMs,
        error: message.slice(0, 240),
      });
      console.error(
        JSON.stringify({
          event: "hubspot_sync_resource_failed",
          job_id: jobId,
          resource,
          error: message.slice(0, 240),
          duration_ms: durationMs,
          ts: new Date().toISOString(),
        }),
      );
    }
  }

  const durationMs = Date.now() - startTs;
  console.error(
    JSON.stringify({
      event: "hubspot_sync_completed",
      job_id: jobId,
      total_synced: totalSynced,
      total_failed: totalFailed,
      duration_ms: durationMs,
      resources_count: resourceResults.length,
      ts: new Date().toISOString(),
    }),
  );

  const result: HubSpotPeriodicSyncResult = {
    totalSynced,
    totalFailed,
    durationMs,
    resources: resourceResults,
  };
  return result;
};

// ─── Registry ──────────────────────────────────────────────────────────────

export const HANDLERS = {
  noop,
  transcript_pipeline: transcriptPipeline,
  coordinator_synthesis: coordinatorSynthesis,
  observation_cluster: notYet("observation_cluster", "Phase 4 Day 3"),
  daily_digest: notYet("daily_digest", "Phase 5 Day 4"),
  deal_health_check: notYet("deal_health_check", "Phase 5 Day 3"),
  hubspot_periodic_sync: hubspotPeriodicSync,
} satisfies Record<string, JobHandler>;

export type JobType = keyof typeof HANDLERS;

export const JOB_TYPES = Object.keys(HANDLERS) as JobType[];
