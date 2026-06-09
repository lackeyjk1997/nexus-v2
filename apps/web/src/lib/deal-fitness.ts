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

export interface DealFitnessView {
  scores: FitnessScores | null;
  events: FitnessEventRow[];
  calls: DealCallRow[];
}

export async function getDealFitness(dealId: string): Promise<DealFitnessView> {
  const sql = getSharedSql({ databaseUrl: env.databaseUrl });

  const [scoreRows, eventRows, callRows] = await Promise.all([
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
        updated_at: Date;
      }>
    >`
      SELECT overall_score, business_fit_score, emotional_fit_score,
             technical_fit_score, readiness_fit_score, velocity_trend,
             fit_imbalance_flag, deal_insight, conversation_signals, updated_at
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
