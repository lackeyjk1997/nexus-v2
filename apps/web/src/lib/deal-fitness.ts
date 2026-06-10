import { getSharedSql } from "@nexus/shared";

import { env } from "./env";

/**
 * Deal Fitness read model (Demo 2026-06-10 Run 2 — UI bones).
 *
 * Plain reads over deal_fitness_scores + deal_fitness_events + the deal's
 * transcripts/notes. No Claude on the render path (Guardrail 5); the
 * deal_fitness job is the only writer. Structure-first: a later design
 * pass reskins these shapes without re-plumbing.
 */

export interface FitnessEvidence {
  source_label?: string;
  source_type?: string;
  source_id?: string;
  quote?: string;
  context?: string;
}

export interface FitnessEventRow {
  eventKey: string;
  fitCategory: string;
  label: string;
  description: string | null;
  detected: boolean;
  detectedAt: Date | null;
  confidence: number | null;
  evidence: FitnessEvidence[];
  coachingText: string | null;
}

export interface FitnessCommitment {
  promise?: string;
  promised_by?: string;
  promised_on?: string;
  promise_source_label?: string;
  status?: "kept" | "broken" | "pending";
  resolution?: string | null;
}

export interface FitnessStakeholderEngagement {
  contacts?: Array<{
    name?: string;
    title?: string | null;
    first_appearance?: string;
    introduced_by?: string;
    role?: string;
    weeks_active?: number;
    calls_joined?: number;
  }>;
  expansion_pattern?: string;
  multithreading_score?: number;
}

export interface FitnessBuyerMomentum {
  response_time_by_week?: Array<{ week: number; avg_hours: number }>;
  buyer_initiated_pct?: number;
  trend?: string;
  insight?: string;
}

export interface FitnessConversationSignals {
  ownership_trajectory?: string;
  deal_temperament?: string;
  key_moments?: Array<{
    date?: string;
    source_label?: string;
    signal_strength?: string;
    description?: string;
  }>;
  deal_insight?: string;
  language_progression?: {
    per_call_ownership?: Array<{
      call_index?: number;
      call_label?: string;
      we_our_pct?: number;
      your_product_pct?: number;
    }>;
    trend?: string;
    overall_ownership_percent?: number;
  };
  commitment_tracking?: FitnessCommitment[];
  overall_assessment?: string;
}

export interface FitnessScores {
  overall: number | null;
  business: number | null;
  emotional: number | null;
  technical: number | null;
  readiness: number | null;
  velocityTrend: string | null;
  fitImbalance: boolean;
  dealInsight: string | null;
  overallAssessment: string | null;
  stakeholderEngagement: FitnessStakeholderEngagement | null;
  buyerMomentum: FitnessBuyerMomentum | null;
  conversationSignals: FitnessConversationSignals | null;
  updatedAt: Date;
}

export interface DealCallRow {
  transcriptId: string;
  title: string;
  source: string;
  recordedAt: Date | null;
  textLength: number;
  transcriptText: string;
  summaryMarkdown: string | null;
}

export interface FitnessActivity {
  /** A granola_ingest job is fetching a new call for this deal. */
  ingesting: boolean;
  /** A deal_fitness job is scoring this deal right now. */
  scoring: boolean;
  /** Oldest in-flight job start, for an elapsed-time hint. */
  since: Date | null;
}

export interface DealFitnessView {
  scores: FitnessScores | null;
  events: FitnessEventRow[];
  calls: DealCallRow[];
  activity: FitnessActivity;
}

export async function getDealFitness(dealId: string): Promise<DealFitnessView> {
  const sql = getSharedSql({ databaseUrl: env.databaseUrl });

  const [scoreRows, eventRows, callRows, activityRows] = await Promise.all([
    sql<
      Array<{
        overall_score: number | null;
        business_fit_score: number | null;
        emotional_fit_score: number | null;
        technical_fit_score: number | null;
        readiness_fit_score: number | null;
        velocity_trend: string | null;
        fit_imbalance_flag: boolean;
        deal_insight: string | null;
        conversation_signals: Record<string, unknown> | null;
        stakeholder_engagement: Record<string, unknown> | null;
        buyer_momentum: Record<string, unknown> | null;
        updated_at: Date;
      }>
    >`
      SELECT overall_score, business_fit_score, emotional_fit_score,
             technical_fit_score, readiness_fit_score, velocity_trend,
             fit_imbalance_flag, deal_insight, conversation_signals,
             stakeholder_engagement, buyer_momentum, updated_at
        FROM deal_fitness_scores
       WHERE hubspot_deal_id = ${dealId}
       LIMIT 1
    `,
    sql<
      Array<{
        event_key: string;
        fit_category: string;
        label: string;
        description: string | null;
        detected: boolean;
        detected_at: Date | null;
        confidence: string | null;
        evidence_snippets: unknown;
        coaching_text: string | null;
      }>
    >`
      SELECT event_key, fit_category, label, description, detected,
             detected_at, confidence, evidence_snippets, coaching_text
        FROM deal_fitness_events
       WHERE hubspot_deal_id = ${dealId}
       ORDER BY detected DESC, fit_category, event_key
    `,
    sql<
      Array<{
        id: string;
        title: string;
        source: string;
        recorded_at: Date | null;
        transcript_text: string;
        summary_markdown: string | null;
      }>
    >`
      SELECT t.id, t.title, t.source::text AS source, t.recorded_at,
             t.transcript_text,
             e.payload->>'summaryMarkdown' AS summary_markdown
        FROM transcripts t
        LEFT JOIN deal_events e
          ON e.type = 'transcript_ingested' AND e.source_ref = t.id::text
       WHERE t.hubspot_deal_id = ${dealId}
       ORDER BY t.recorded_at DESC NULLS LAST, t.created_at DESC
    `,
    sql<Array<{ type: string; created_at: Date }>>`
      SELECT type, created_at FROM jobs
       WHERE status IN ('queued', 'running')
         AND (
           (type = 'deal_fitness' AND input->>'hubspotDealId' = ${dealId})
           OR (type = 'granola_ingest' AND EXISTS (
                 SELECT 1 FROM granola_watch_config
                  WHERE id = 'default' AND hubspot_deal_id = ${dealId}))
         )
       ORDER BY created_at ASC
    `,
  ]);

  const s = scoreRows[0] ?? null;
  const signals = (s?.conversation_signals ?? null) as
    | (Record<string, unknown> & { overall_assessment?: string })
    | null;

  return {
    scores: s
      ? {
          overall: s.overall_score,
          business: s.business_fit_score,
          emotional: s.emotional_fit_score,
          technical: s.technical_fit_score,
          readiness: s.readiness_fit_score,
          velocityTrend: s.velocity_trend,
          fitImbalance: s.fit_imbalance_flag,
          dealInsight: s.deal_insight,
          overallAssessment:
            typeof signals?.overall_assessment === "string"
              ? signals.overall_assessment
              : null,
          stakeholderEngagement:
            (s.stakeholder_engagement as FitnessStakeholderEngagement | null) ?? null,
          buyerMomentum: (s.buyer_momentum as FitnessBuyerMomentum | null) ?? null,
          conversationSignals:
            (s.conversation_signals as FitnessConversationSignals | null) ?? null,
          updatedAt: s.updated_at,
        }
      : null,
    events: eventRows.map((e) => ({
      eventKey: e.event_key,
      fitCategory: e.fit_category,
      label: e.label,
      description: e.description,
      detected: e.detected,
      detectedAt: e.detected_at,
      confidence: e.confidence === null ? null : Number(e.confidence),
      evidence: Array.isArray(e.evidence_snippets)
        ? (e.evidence_snippets as FitnessEvidence[])
        : [],
      coachingText: e.coaching_text,
    })),
    activity: {
      ingesting: activityRows.some((a) => a.type === "granola_ingest"),
      scoring: activityRows.some((a) => a.type === "deal_fitness"),
      since: activityRows[0]?.created_at ?? null,
    },
    calls: callRows.map((c) => ({
      transcriptId: c.id,
      title: c.title,
      source: c.source,
      recordedAt: c.recorded_at,
      textLength: c.transcript_text.length,
      transcriptText: c.transcript_text,
      summaryMarkdown: c.summary_markdown,
    })),
  };
}
