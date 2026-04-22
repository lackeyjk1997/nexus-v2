/**
 * MeddpiccService — the first purely-Nexus service (no HubSpot round-trip).
 *
 * Reads and writes `public.meddpicc_scores` directly via postgres.js.
 * Mirrors HubSpotAdapter's instance/close pattern for consistency.
 *
 * HubSpot custom-property write (updateDealCustomProperties) lands Phase 3
 * Day 2 per the existing stub message in packages/shared/src/crm/hubspot/adapter.ts;
 * Phase 2 Day 3's UI writes Nexus-only.
 *
 * RLS: `meddpicc_scores` is Pattern D per DECISIONS.md §2.2.1 (read-all
 * authenticated, writes via service role / Postgres-direct connection that
 * bypasses RLS). Callers must have already authenticated the session at the
 * route boundary (precedent: apps/web/src/app/api/jobs/enqueue/route.ts).
 */
import postgres from "postgres";

import {
  MEDDPICC_DIMENSION,
  type MeddpiccDimension,
} from "../enums/meddpicc-dimension";

export type MeddpiccScores = Partial<Record<MeddpiccDimension, number | null>>;
export type MeddpiccEvidence = Partial<Record<MeddpiccDimension, string>>;

export interface MeddpiccRecord {
  hubspotDealId: string;
  scores: Record<MeddpiccDimension, number | null>;
  evidence: MeddpiccEvidence;
  overallScore: number | null;
  updatedAt: Date;
}

export interface MeddpiccServiceOptions {
  databaseUrl: string;
  /** Inject a pre-built postgres client (tests, reuse across requests). */
  sql?: postgres.Sql;
}

type MeddpiccRow = {
  hubspot_deal_id: string;
  metrics_score: number | null;
  economic_buyer_score: number | null;
  decision_criteria_score: number | null;
  decision_process_score: number | null;
  paper_process_score: number | null;
  identify_pain_score: number | null;
  champion_score: number | null;
  competition_score: number | null;
  overall_score: number | null;
  evidence: Record<string, unknown> | null;
  updated_at: string | Date;
};

export class MeddpiccService {
  private readonly sql: postgres.Sql;
  private readonly ownedSql: boolean;

  constructor(options: MeddpiccServiceOptions) {
    this.sql =
      options.sql ??
      postgres(options.databaseUrl, {
        max: 3,
        idle_timeout: 30,
        prepare: false,
      });
    this.ownedSql = !options.sql;
  }

  async getByDealId(dealId: string): Promise<MeddpiccRecord | null> {
    const rows = await this.sql<MeddpiccRow[]>`
      SELECT hubspot_deal_id,
             metrics_score, economic_buyer_score, decision_criteria_score,
             decision_process_score, paper_process_score, identify_pain_score,
             champion_score, competition_score, overall_score,
             evidence, updated_at
        FROM meddpicc_scores
       WHERE hubspot_deal_id = ${dealId}
       LIMIT 1
    `;
    const row = rows[0];
    return row ? this.rowToRecord(row) : null;
  }

  async upsert(input: {
    dealId: string;
    scores: MeddpiccScores;
    evidence: MeddpiccEvidence;
  }): Promise<MeddpiccRecord> {
    // Overall = rounded mean of present non-null scores; null if none provided.
    const presentScores = MEDDPICC_DIMENSION
      .map((d) => input.scores[d])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const overallScore = presentScores.length
      ? Math.round(
          presentScores.reduce((a, b) => a + b, 0) / presentScores.length,
        )
      : null;

    // Only persist non-empty evidence keys.
    const evidenceJson: Record<string, string> = {};
    for (const dim of MEDDPICC_DIMENSION) {
      const text = input.evidence[dim];
      if (typeof text === "string" && text.trim().length > 0) {
        evidenceJson[dim] = text.trim();
      }
    }

    const rows = await this.sql<MeddpiccRow[]>`
      INSERT INTO meddpicc_scores (
        hubspot_deal_id,
        metrics_score, economic_buyer_score, decision_criteria_score,
        decision_process_score, paper_process_score, identify_pain_score,
        champion_score, competition_score, overall_score,
        evidence, updated_at
      )
      VALUES (
        ${input.dealId},
        ${input.scores.metrics ?? null},
        ${input.scores.economic_buyer ?? null},
        ${input.scores.decision_criteria ?? null},
        ${input.scores.decision_process ?? null},
        ${input.scores.paper_process ?? null},
        ${input.scores.identify_pain ?? null},
        ${input.scores.champion ?? null},
        ${input.scores.competition ?? null},
        ${overallScore},
        ${this.sql.json(evidenceJson as unknown as postgres.JSONValue)},
        NOW()
      )
      ON CONFLICT (hubspot_deal_id) DO UPDATE SET
        metrics_score            = EXCLUDED.metrics_score,
        economic_buyer_score     = EXCLUDED.economic_buyer_score,
        decision_criteria_score  = EXCLUDED.decision_criteria_score,
        decision_process_score   = EXCLUDED.decision_process_score,
        paper_process_score      = EXCLUDED.paper_process_score,
        identify_pain_score      = EXCLUDED.identify_pain_score,
        champion_score           = EXCLUDED.champion_score,
        competition_score        = EXCLUDED.competition_score,
        overall_score            = EXCLUDED.overall_score,
        evidence                 = EXCLUDED.evidence,
        updated_at               = NOW()
      RETURNING hubspot_deal_id,
                metrics_score, economic_buyer_score, decision_criteria_score,
                decision_process_score, paper_process_score, identify_pain_score,
                champion_score, competition_score, overall_score,
                evidence, updated_at
    `;
    if (!rows[0]) {
      throw new Error("MeddpiccService.upsert returned no row");
    }
    return this.rowToRecord(rows[0]);
  }

  async close(): Promise<void> {
    if (this.ownedSql) {
      await this.sql.end({ timeout: 5 });
    }
  }

  private rowToRecord(row: MeddpiccRow): MeddpiccRecord {
    const evidenceIn = row.evidence ?? {};
    const evidence: MeddpiccEvidence = {};
    for (const dim of MEDDPICC_DIMENSION) {
      const v = (evidenceIn as Record<string, unknown>)[dim];
      if (typeof v === "string" && v.length > 0) evidence[dim] = v;
    }
    return {
      hubspotDealId: row.hubspot_deal_id,
      scores: {
        metrics: row.metrics_score,
        economic_buyer: row.economic_buyer_score,
        decision_criteria: row.decision_criteria_score,
        decision_process: row.decision_process_score,
        paper_process: row.paper_process_score,
        identify_pain: row.identify_pain_score,
        champion: row.champion_score,
        competition: row.competition_score,
      },
      evidence,
      overallScore: row.overall_score,
      updatedAt: new Date(row.updated_at),
    };
  }
}
