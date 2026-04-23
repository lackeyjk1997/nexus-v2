/**
 * transcript_pipeline — sub-step 1 (mock) — Phase 3 Day 3 Session B.
 *
 * The first rung of the oversight-adjudicated 3-step verification staircase.
 * Exercises the full transcript_pipeline handler against the seeded MedVista
 * transcript with NO live Claude and NO live HubSpot writes:
 *
 *   - Claude is mocked via MockClaudeWrapper using the three fixtures already
 *     registered in packages/shared/scripts/test-mock-claude.ts (reused here
 *     so the two harnesses can't drift).
 *   - HubSpot is mocked via a capturing no-op adapter — the handler calls
 *     `updateDealCustomProperties(id, props)` which records the invocation
 *     for shape verification but does not PATCH the live portal.
 *
 * Scope per the adjudicated Day 3 kickoff:
 *   - Sub-step 1 verifies handler shape + idempotency + MEDDPICC persistence
 *     to Nexus DB.
 *   - Fanout verification + HubSpot-live-writeback are SUB-STEPS 2 + 3 (this
 *     harness intentionally does not touch `prompt_call_log` fanout —
 *     MockClaudeWrapper bypasses the wrapper's telemetry, which is correct
 *     by design; the live test-transcript-pipeline harness verifies fanout
 *     against real prompt_call_log writes).
 *
 * Three phases:
 *
 *   PHASE 1 — Direct invocation with mocks.
 *     Seeds the MedVista transcript (idempotent), constructs the mock
 *     wrappers, invokes HANDLERS.transcript_pipeline with ctx.hooks
 *     pointing at the mocks, asserts the 7-step result shape.
 *
 *   PHASE 2 — Idempotency via second invocation (same mocks).
 *     Same transcriptId + same mock fixtures. transcript_ingested +
 *     signal_detected dedup via source_ref. meddpicc_scores PK upsert
 *     overwrites identically. meddpicc_scored event appended per run
 *     (append-only per §2.16 — new jobId → new source_ref).
 *
 *   PHASE 3 — HubSpot bag shape verification.
 *     The capturing adapter recorded the writeback payload. Asserts:
 *       • The bag contains only nexus_meddpicc_* score keys + overall.
 *       • Each key maps to the expected dimension from the mock fixture
 *         (metrics, competition, paper_process — 3 dims from the mock).
 *       • nexus_meddpicc_score (overall) is present and numeric.
 *       • No null/undefined values leak through (null-skip contract).
 *
 * Cost: $0. No live Claude, no live HubSpot, no Voyage (preprocessor
 * skips re-embedding if pipeline_processed=true on the transcript; first
 * run does embed the MedVista fixture, ~$0.01 Voyage).
 *
 * Usage:
 *   # Seed the transcript first (idempotent):
 *   pnpm --filter @nexus/db seed:medvista-transcript
 *
 *   # Then run the mock staircase:
 *   pnpm --filter @nexus/db test:transcript-pipeline-mock
 */
import crypto from "node:crypto";

import { loadDevEnv, requireEnv } from "@nexus/shared";

loadDevEnv();

// Force shared pool to use DIRECT_URL for this test process only (same
// rationale as test-transcript-pipeline.ts). See Session A's
// pooler-saturation operational note.
if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

import postgres from "postgres";

// Handler + shared-pool shutdown must import AFTER DATABASE_URL is
// swapped so the shared pool picks up DIRECT_URL on first access.
const {
  HANDLERS,
  closeSharedSql,
  makeMockCallClaude,
  detectSignalsTool,
  extractActionsTool,
  scoreMeddpiccTool,
} = await import("@nexus/shared");

import type {
  TranscriptPipelineResult,
  DetectSignalsOutput,
  ExtractActionsOutput,
  ScoreMeddpiccOutput,
} from "@nexus/shared";

const SENTINEL_ENGAGEMENT_ID = "fixture-medvista-discovery-01";

// ──────── Mock fixtures ────────────────────────────────────────────────
// Kept in sync with packages/shared/scripts/test-mock-claude.ts by
// convention — same three fixtures exercise the same three tools so the
// two harnesses never disagree on expected tool-shape. If either
// harness edits its fixtures, update the other.

const DETECT_SIGNALS_FIXTURE: DetectSignalsOutput = {
  reasoning_trace:
    "Two salient signals in the mock fixture: Microsoft DAX Copilot as a named competitive evaluator and the 6-8 week InfoSec review as a process-timing constraint. Both meet the 0.85+ confidence threshold; nothing else in the fixture crosses the 0.5 floor.",
  signals: [
    {
      signal_type: "competitive_intel",
      summary: "Buyer named Microsoft DAX Copilot as incumbent in short-list.",
      evidence_quote:
        "we're also looking at Microsoft DAX Copilot for the ambient documentation piece",
      source_speaker: "Dr. Michael Chen",
      urgency: "high",
      confidence: 0.92,
      rationale: "Direct named-competitor mention in Discovery.",
      competitor_name: "Microsoft DAX Copilot",
      recurs_open_signal_id: null,
      matches_pattern_id: null,
      matches_experiment_id: null,
    },
    {
      signal_type: "process_friction",
      summary: "Security review expected to run 6-8 weeks.",
      evidence_quote:
        "our InfoSec team typically takes six to eight weeks for anything new",
      source_speaker: "Dr. Michael Chen",
      urgency: "medium",
      confidence: 0.85,
      rationale: "Explicit process timeline threatens proposal-to-close velocity.",
      competitor_name: null,
      recurs_open_signal_id: null,
      matches_pattern_id: null,
      matches_experiment_id: null,
    },
  ],
  stakeholder_insights: [
    {
      contact_name: "Dr. Michael Chen",
      is_new_contact: false,
      sentiment: "cautious",
      engagement: "high",
      key_priorities: ["clinical adoption", "InfoSec approval"],
      key_concerns: ["integration risk", "timeline to value"],
      notable_quote:
        "If we can't get a clean security review by August, we'll have to defer.",
    },
  ],
};

const EXTRACT_ACTIONS_FIXTURE: ExtractActionsOutput = {
  reasoning_trace:
    "Three load-bearing actions in the mock: one seller deliverable (SOC 2 report Friday), one mutual next-step (reconvene post-InfoSec), one buyer-owned blocker (InfoSec queue). Nothing else crosses the evidence threshold.",
  actions: [
    {
      action_type: "deliverable",
      owner_side: "seller",
      owner_name: "Sarah Chen",
      description: "Send the most recent SOC 2 Type II report.",
      evidence_quote: "I'll get our SOC 2 report over to you by end of day Friday",
      due_date: "by Friday",
    },
    {
      action_type: "next_step",
      owner_side: "buyer",
      owner_name: "unassigned",
      description: "Reconvene after MedVista's InfoSec review completes.",
      evidence_quote:
        "Let's circle back after we've had a chance to run this through InfoSec",
      due_date: null,
    },
    {
      action_type: "blocker",
      owner_side: "buyer",
      owner_name: "Dr. Michael Chen",
      description: "InfoSec queue gates the next step; no motion until it clears.",
      evidence_quote:
        "our InfoSec team typically takes six to eight weeks for anything new",
      due_date: null,
    },
  ],
};

const SCORE_MEDDPICC_FIXTURE: ScoreMeddpiccOutput = {
  reasoning_trace:
    "Three dimensions surfaced new evidence in the mock: economic_buyer (Dr. Chen named as CMIO with budget sign-off), competition (Microsoft DAX Copilot in the short-list), and paper_process (InfoSec 6-8 week timeline explicit). No new metrics / decision_criteria / decision_process / identify_pain / champion evidence beyond prior scores — omitting those per discipline. No contradictions with prior evidence.",
  scores: [
    {
      dimension: "economic_buyer",
      score: 70,
      evidence_quote:
        "As CMIO I'd own the budget for anything ambient-documentation shaped",
      confidence: 0.88,
      contradicts_prior: false,
      rationale: "Explicit budget-owner statement from named title.",
    },
    {
      dimension: "competition",
      score: 65,
      evidence_quote:
        "we're also looking at Microsoft DAX Copilot for the ambient documentation piece",
      confidence: 0.92,
      contradicts_prior: false,
      rationale: "Named competitor in active short-list.",
    },
    {
      dimension: "paper_process",
      score: 55,
      evidence_quote:
        "our InfoSec team typically takes six to eight weeks for anything new",
      confidence: 0.8,
      contradicts_prior: false,
      rationale: "Explicit procurement timeline from a named authority.",
    },
  ],
};

// ──────── Capturing no-op adapter ──────────────────────────────────────

type CapturedPatch = {
  dealId: string;
  props: Record<string, unknown>;
};

function makeCapturingAdapter(): {
  adapter: { updateDealCustomProperties: (id: string, p: Record<string, unknown>) => Promise<void> };
  history: CapturedPatch[];
  reset(): void;
} {
  const history: CapturedPatch[] = [];
  return {
    adapter: {
      async updateDealCustomProperties(dealId, props) {
        history.push({ dealId, props: { ...props } });
      },
    },
    history,
    reset() {
      history.length = 0;
    },
  };
}

// ──────── Harness ───────────────────────────────────────────────────────

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERT: ${message}`);
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? requireEnv("DIRECT_URL");
  const verify = postgres(url, { max: 1, prepare: false });

  try {
    console.log(
      "transcript_pipeline — mock staircase — Phase 3 Day 3 Session B sub-step 1\n",
    );

    console.log("[preflight] locate seeded MedVista transcript…");
    const seeded = await verify<
      Array<{ id: string; hubspot_deal_id: string }>
    >`
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

    // Clean slate for deterministic PHASE 3 key-set assertion. Prior
    // MEDDPICC state in Nexus (from Session A retro-verification runs or
    // UI edits) would cause the handler's merge-then-upsert to include
    // those dims in the HubSpot writeback bag, making the expected-keys
    // assertion non-deterministic. Wiping the row before PHASE 1 ensures
    // the bag contains exactly the fixture's 3 dims + overall. Signal
    // dedup + transcript_ingested dedup are independent of this wipe
    // (they use deal_events rows, which we preserve).
    await verify`DELETE FROM meddpicc_scores WHERE hubspot_deal_id = ${hubspotDealId}`;
    console.log(
      `      cleared meddpicc_scores row for clean-slate PHASE 1 (deal=${hubspotDealId})`,
    );

    const mock = makeMockCallClaude({
      fixtures: {
        "01-detect-signals": DETECT_SIGNALS_FIXTURE,
        "pipeline-extract-actions": EXTRACT_ACTIONS_FIXTURE,
        "pipeline-score-meddpicc": SCORE_MEDDPICC_FIXTURE,
      },
      promptVersion: "1.0.0-mock",
      durationMs: 1,
    });
    const capturing = makeCapturingAdapter();

    const handler = HANDLERS.transcript_pipeline;

    // ── PHASE 1 — Direct invocation with mocks ────────────────────────
    console.log("\n[PHASE 1/3] Direct handler invocation with mocks…");
    const phase1Start = Date.now();
    const phase1JobId = crypto.randomUUID();
    const result1 = (await handler(
      { transcriptId },
      {
        jobId: phase1JobId,
        jobType: "transcript_pipeline",
        hooks: {
          callClaude: mock.call,
          hubspotAdapter: capturing.adapter,
        },
      },
    )) as TranscriptPipelineResult;
    const phase1Ms = Date.now() - phase1Start;

    console.log(
      `      PHASE 1 complete in ${phase1Ms}ms`,
      `\n      stepsCompleted=${JSON.stringify(result1.stepsCompleted)}`,
      `\n      signals=${JSON.stringify(result1.signals)}`,
      `\n      actions.length=${result1.actions.length}`,
      `\n      meddpicc=${JSON.stringify(result1.meddpicc)}`,
      `\n      events=${JSON.stringify(result1.events)}`,
      `\n      mock.history.length=${mock.history.length} (expect 3 — one per parallel Claude call)`,
      `\n      adapter.captures=${capturing.history.length} (expect 1 — one MEDDPICC writeback per run)`,
    );

    assert(
      result1.stepsCompleted.length === 7,
      `PHASE 1: stepsCompleted should be 7, got ${result1.stepsCompleted.length}`,
    );
    assert(
      result1.stepsDeferred.length === 3,
      "PHASE 1: stepsDeferred should be 3",
    );
    assert(
      result1.signals.detected === DETECT_SIGNALS_FIXTURE.signals.length,
      `PHASE 1: signals.detected should match fixture count (${DETECT_SIGNALS_FIXTURE.signals.length}), got ${result1.signals.detected}`,
    );
    assert(
      result1.actions.length === EXTRACT_ACTIONS_FIXTURE.actions.length,
      `PHASE 1: actions.length should match fixture (${EXTRACT_ACTIONS_FIXTURE.actions.length}), got ${result1.actions.length}`,
    );
    assert(
      result1.meddpicc.scores_emitted === SCORE_MEDDPICC_FIXTURE.scores.length,
      `PHASE 1: meddpicc.scores_emitted should match fixture (${SCORE_MEDDPICC_FIXTURE.scores.length}), got ${result1.meddpicc.scores_emitted}`,
    );
    assert(
      result1.meddpicc.contradicts_prior_count === 0,
      `PHASE 1: mock fixture has contradicts_prior=false on all dims, got count=${result1.meddpicc.contradicts_prior_count}`,
    );
    assert(
      result1.events.meddpicc_scored_inserted === 1,
      `PHASE 1: meddpicc_scored should insert on first run, got ${result1.events.meddpicc_scored_inserted}`,
    );
    assert(
      mock.history.length === 3,
      `PHASE 1: MockClaudeWrapper should have seen 3 invocations (one per parallel call), got ${mock.history.length}`,
    );
    assert(
      capturing.history.length === 1,
      `PHASE 1: capturing adapter should record 1 writeback per run, got ${capturing.history.length}`,
    );

    // Verify MEDDPICC row was actually upserted to Nexus DB.
    const meddpiccRow = await verify<
      Array<{
        metrics_score: number | null;
        economic_buyer_score: number | null;
        competition_score: number | null;
        paper_process_score: number | null;
        overall_score: number | null;
        per_dimension_confidence: Record<string, number> | null;
      }>
    >`
      SELECT metrics_score, economic_buyer_score, competition_score,
             paper_process_score, overall_score, per_dimension_confidence
        FROM meddpicc_scores
       WHERE hubspot_deal_id = ${hubspotDealId}
       LIMIT 1
    `;
    assert(
      meddpiccRow.length === 1,
      "PHASE 1: meddpicc_scores row should exist after upsert",
    );
    const m = meddpiccRow[0]!;
    console.log(
      `      meddpicc_scores row: eb=${m.economic_buyer_score} competition=${m.competition_score} paper_process=${m.paper_process_score} overall=${m.overall_score}`,
      `\n      per_dimension_confidence=${JSON.stringify(m.per_dimension_confidence)}`,
    );
    assert(
      m.economic_buyer_score === 70,
      `PHASE 1: economic_buyer_score should be 70 from fixture, got ${m.economic_buyer_score}`,
    );
    assert(
      m.competition_score === 65,
      `PHASE 1: competition_score should be 65 from fixture, got ${m.competition_score}`,
    );
    assert(
      m.paper_process_score === 55,
      `PHASE 1: paper_process_score should be 55 from fixture, got ${m.paper_process_score}`,
    );
    assert(
      m.per_dimension_confidence?.economic_buyer === 0.88,
      `PHASE 1: per_dimension_confidence.economic_buyer should be 0.88, got ${m.per_dimension_confidence?.economic_buyer}`,
    );
    console.log("      ✓ meddpicc_scores row persisted with 3 fixture dims + confidences");

    // ── PHASE 2 — Idempotency via second mock invocation ──────────────
    console.log("\n[PHASE 2/3] Idempotency (second invocation with same mocks)…");
    mock.reset();
    capturing.reset();
    const phase2JobId = crypto.randomUUID();
    const result2 = (await handler(
      { transcriptId },
      {
        jobId: phase2JobId,
        jobType: "transcript_pipeline",
        hooks: {
          callClaude: mock.call,
          hubspotAdapter: capturing.adapter,
        },
      },
    )) as TranscriptPipelineResult;
    console.log(
      `      signals=${JSON.stringify(result2.signals)}`,
      `\n      events=${JSON.stringify(result2.events)}`,
    );
    assert(
      result2.events.transcript_ingested_skipped === 1,
      `PHASE 2: transcript_ingested should dedup on re-run, got skipped=${result2.events.transcript_ingested_skipped}`,
    );
    assert(
      result2.events.transcript_ingested_inserted === 0,
      `PHASE 2: transcript_ingested should NOT insert on re-run, got inserted=${result2.events.transcript_ingested_inserted}`,
    );
    assert(
      result2.signals.skipped_duplicate === DETECT_SIGNALS_FIXTURE.signals.length,
      `PHASE 2: same-fixture re-run should hit signal_hash dedup for every fixture signal. Expected skipped=${DETECT_SIGNALS_FIXTURE.signals.length}, got skipped=${result2.signals.skipped_duplicate}`,
    );
    assert(
      result2.signals.inserted === 0,
      `PHASE 2: no new signals should insert on same-fixture re-run, got inserted=${result2.signals.inserted}`,
    );
    assert(
      result2.events.meddpicc_scored_inserted === 1,
      `PHASE 2: meddpicc_scored should append per run (new jobId → new source_ref), got ${result2.events.meddpicc_scored_inserted}`,
    );
    console.log(
      `      ✓ transcript_ingested skipped (source_ref dedup)`,
      `\n      ✓ signal_detected all skipped (signal_hash dedup; ${DETECT_SIGNALS_FIXTURE.signals.length}/${DETECT_SIGNALS_FIXTURE.signals.length})`,
      `\n      ✓ meddpicc_scored appended (append-only per §2.16; new jobId)`,
    );

    // ── PHASE 3 — HubSpot writeback bag shape ─────────────────────────
    console.log("\n[PHASE 3/3] HubSpot writeback payload shape verification…");
    const captured = capturing.history[0]!;
    console.log(
      `      adapter captured: dealId=${captured.dealId}`,
      `\n      props=${JSON.stringify(captured.props)}`,
    );
    assert(
      captured.dealId === hubspotDealId,
      `PHASE 3: captured dealId must match. Expected ${hubspotDealId}, got ${captured.dealId}`,
    );
    // Expected keys: 3 dim scores from the fixture (economic_buyer →
    // nexus_meddpicc_eb_score, competition → nexus_meddpicc_competition_score,
    // paper_process → nexus_meddpicc_paper_process_score) + nexus_meddpicc_score
    // (overall). Four keys total.
    const expectedKeys = [
      "nexus_meddpicc_eb_score",
      "nexus_meddpicc_competition_score",
      "nexus_meddpicc_paper_process_score",
      "nexus_meddpicc_score",
    ].sort();
    const actualKeys = Object.keys(captured.props).sort();
    assert(
      JSON.stringify(actualKeys) === JSON.stringify(expectedKeys),
      `PHASE 3: HubSpot bag keys mismatch. Expected ${JSON.stringify(expectedKeys)}, got ${JSON.stringify(actualKeys)}`,
    );
    for (const [k, v] of Object.entries(captured.props)) {
      assert(
        v !== null && v !== undefined,
        `PHASE 3: null/undefined leaked through to HubSpot bag for key "${k}"`,
      );
      assert(
        typeof v === "number" && Number.isFinite(v),
        `PHASE 3: MEDDPICC score values must be numeric. Key "${k}" got ${typeof v} ${String(v)}`,
      );
    }
    assert(
      captured.props["nexus_meddpicc_eb_score"] === 70,
      `PHASE 3: eb_score should be 70, got ${String(captured.props["nexus_meddpicc_eb_score"])}`,
    );
    assert(
      captured.props["nexus_meddpicc_competition_score"] === 65,
      `PHASE 3: competition_score should be 65, got ${String(captured.props["nexus_meddpicc_competition_score"])}`,
    );
    assert(
      captured.props["nexus_meddpicc_paper_process_score"] === 55,
      `PHASE 3: paper_process_score should be 55, got ${String(captured.props["nexus_meddpicc_paper_process_score"])}`,
    );
    // Overall = rounded mean of (70 + 65 + 55) / 3 = 63.33 → 63
    const expectedOverall = Math.round((70 + 65 + 55) / 3);
    assert(
      captured.props["nexus_meddpicc_score"] === expectedOverall,
      `PHASE 3: nexus_meddpicc_score should be ${expectedOverall} (rounded mean of 3 fixture dims), got ${String(captured.props["nexus_meddpicc_score"])}`,
    );
    console.log(
      `      ✓ bag has exactly 4 keys (3 dims + overall)`,
      `\n      ✓ no null/undefined leaks (null-skip contract)`,
      `\n      ✓ all values numeric integers`,
      `\n      ✓ values match fixture: eb=70 competition=65 paper_process=55 overall=${expectedOverall}`,
    );

    console.log("");
    console.log("transcript_pipeline mock staircase: ALL 3 PHASES PASS.");
  } finally {
    await verify.end({ timeout: 5 });
    await closeSharedSql();
  }
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
