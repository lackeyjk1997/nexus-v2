import {
  SurfaceAdmission,
  getSharedSql,
  loadPipelineIds,
  DEAL_STAGES,
  type DealStage,
  type ScoreInsightFn,
} from "@nexus/shared";

import { env } from "./env";

/**
 * Intelligence dashboard data assembly — Phase 4 Day 5 B.
 *
 * Renders the admitted sets for the two portfolio surfaces
 * (`intelligence_dashboard_patterns` + `category_candidates`) through
 * `SurfaceAdmission.admit`, with a DETERMINISTIC scoreFn instead of the
 * default per-candidate 09-score-insight Claude fanout:
 *
 *  - Guardrail 5 / DECISIONS §2.6: never block UI on a synchronous Claude
 *    call. The default scoreFn is one live Claude call per candidate per
 *    page render — multi-second, metered, and non-deterministic mid-demo.
 *  - §1.16's intent (Claude orders, thresholds admit) is preserved: the
 *    inputs to this ordering are themselves Claude-authored at synthesis /
 *    clustering time (coordinator reasoning, cluster confidence). The
 *    deterministic mapping just renders that stored judgment stable.
 *
 * Productization arc: re-scoring belongs in a periodic job that caches
 * 09-score-insight outputs (post-demo backlog; noted in the Day 5 A
 * checkpoint log).
 */

export interface AffectedDeal {
  hubspotDealId: string;
  name: string;
  amount: number | null;
  stage: DealStage | null;
}

export interface PatternRecommendation {
  priority: "urgent" | "this_week" | "queued";
  application: "deal_specific" | "vertical_wide" | "org_level";
  action: string;
  targetDealId: string | null;
  targetDealName: string | null;
  citedQuotes: readonly string[];
}

export interface PatternView {
  id: string;
  headline: string;
  mechanism: string;
  signalType: string;
  vertical: string | null;
  score: number;
  scoreExplanation: string;
  aggregateArr: number;
  multiplier: number | null;
  multiplierCalculation: string | null;
  arrConfidence: string | null;
  detectedAt: Date;
  deals: AffectedDeal[];
  recommendations: PatternRecommendation[];
}

export interface CandidateView {
  id: string;
  title: string;
  signature: string;
  basis: string;
  confidence: "low" | "medium" | "high";
  memberCount: number;
  vertical: string | null;
  score: number;
}

export interface IntelligenceBriefing {
  patterns: PatternView[];
  candidates: CandidateView[];
  heldBackCount: number;
  stats: {
    callsProcessed: number;
    signalsDetected: number;
    dealsWatched: number;
  };
}

/**
 * Deterministic ordering score from stored Claude judgment (see module
 * docblock). Patterns: deal breadth + dollar exposure + blocker urgency.
 * Candidates: cluster confidence + corroboration count.
 */
const deterministicScoreFn: ScoreInsightFn = async ({ candidate }) => {
  if (candidate.kind === "pattern") {
    const p = candidate.pattern;
    if (p.score !== null) {
      return { score: p.score, explanation: p.reasoning ?? "" };
    }
    const arr = (p.arrImpact as Record<string, unknown>)?.aggregate_arr;
    const arrMillions = typeof arr === "number" ? arr / 1_000_000 : 0;
    const blockerBump = p.signalType === "deal_blocker" ? 10 : 0;
    const score = Math.min(
      98,
      40 + p.dealsAffectedCount * 8 + Math.round(arrMillions) * 3 + blockerBump,
    );
    return { score, explanation: p.reasoning ?? "" };
  }
  if (candidate.kind === "category_candidate") {
    const c = candidate.cluster;
    const confidenceBase = { low: 40, medium: 60, high: 75 }[c.confidence];
    return {
      score: Math.min(95, confidenceBase + c.memberCount * 4),
      explanation: c.signatureBasis,
    };
  }
  return { score: 50, explanation: "" };
};

function splitSynthesis(synthesis: string): { headline: string; mechanism: string } {
  const marker = "\n\nMechanism:\n";
  const idx = synthesis.indexOf(marker);
  if (idx === -1) return { headline: synthesis, mechanism: "" };
  return {
    headline: synthesis.slice(0, idx),
    mechanism: synthesis.slice(idx + marker.length),
  };
}

let stageById: Map<string, DealStage> | null = null;
function resolveStage(rawStageId: string | null): DealStage | null {
  if (!rawStageId) return null;
  if (!stageById) {
    const ids = loadPipelineIds();
    stageById = new Map();
    for (const stage of DEAL_STAGES) {
      const id = ids.stageIds[stage];
      if (id) stageById.set(id, stage);
    }
  }
  return stageById.get(rawStageId) ?? null;
}

interface RecommendationRow {
  priority?: unknown;
  application?: unknown;
  action?: unknown;
  target_deal_id?: unknown;
  target_deal_name?: unknown;
  cited_signal_quotes?: unknown;
}

function parseRecommendations(raw: unknown): PatternRecommendation[] {
  if (!Array.isArray(raw)) return [];
  const out: PatternRecommendation[] = [];
  for (const r of raw as RecommendationRow[]) {
    if (typeof r?.action !== "string") continue;
    const priority =
      r.priority === "urgent" || r.priority === "this_week" || r.priority === "queued"
        ? r.priority
        : "queued";
    const application =
      r.application === "deal_specific" ||
      r.application === "vertical_wide" ||
      r.application === "org_level"
        ? r.application
        : "deal_specific";
    out.push({
      priority,
      application,
      action: r.action,
      targetDealId: typeof r.target_deal_id === "string" ? r.target_deal_id : null,
      targetDealName: typeof r.target_deal_name === "string" ? r.target_deal_name : null,
      citedQuotes: Array.isArray(r.cited_signal_quotes)
        ? (r.cited_signal_quotes as unknown[]).filter(
            (q): q is string => typeof q === "string",
          )
        : [],
    });
  }
  return out;
}

export async function getIntelligenceBriefing(
  userId: string,
): Promise<IntelligenceBriefing> {
  const sql = getSharedSql({ databaseUrl: env.databaseUrl });
  const admission = new SurfaceAdmission({
    databaseUrl: env.databaseUrl,
    sql,
    scoreFn: deterministicScoreFn,
  });

  try {
    const [patternResult, candidateResult] = [
      await admission.admit({ surfaceId: "intelligence_dashboard_patterns", userId }),
      await admission.admit({ surfaceId: "category_candidates", userId }),
    ];

    // Affected-deal context per admitted pattern, from the cache.
    const patternIds = patternResult.admitted
      .filter((a) => a.kind === "pattern")
      .map((a) => (a.kind === "pattern" ? a.pattern.id : ""));
    const dealRows: Array<{
      pattern_id: string;
      hubspot_deal_id: string;
      name: string | null;
      amount: string | null;
      stage_id: string | null;
    }> =
      patternIds.length === 0
        ? []
        : await sql`
            SELECT pd.pattern_id, pd.hubspot_deal_id,
                   hc.payload->'properties'->>'dealname' AS name,
                   hc.payload->'properties'->>'amount' AS amount,
                   hc.payload->'properties'->>'dealstage' AS stage_id
              FROM coordinator_pattern_deals pd
              LEFT JOIN hubspot_cache hc
                ON hc.object_type = 'deal' AND hc.hubspot_id = pd.hubspot_deal_id
             WHERE pd.pattern_id = ANY(${patternIds})
             ORDER BY (hc.payload->'properties'->>'amount')::numeric DESC NULLS LAST
          `;
    const dealsByPattern = new Map<string, AffectedDeal[]>();
    for (const row of dealRows) {
      const list = dealsByPattern.get(row.pattern_id) ?? [];
      list.push({
        hubspotDealId: row.hubspot_deal_id,
        name: row.name ?? row.hubspot_deal_id,
        amount: row.amount === null ? null : Number(row.amount),
        stage: resolveStage(row.stage_id),
      });
      dealsByPattern.set(row.pattern_id, list);
    }

    const patterns: PatternView[] = patternResult.admitted
      .filter((a): a is typeof a & { kind: "pattern" } => a.kind === "pattern")
      .map((a) => {
        const p = a.pattern;
        const { headline, mechanism } = splitSynthesis(p.synthesis);
        const arrImpact = p.arrImpact as Record<string, unknown>;
        const aggregate = arrImpact?.aggregate_arr;
        const multiplier = arrImpact?.multiplier;
        return {
          id: p.id,
          headline,
          mechanism,
          signalType: p.signalType,
          vertical: p.vertical,
          score: a.score,
          scoreExplanation: a.scoreExplanation,
          aggregateArr: typeof aggregate === "number" ? aggregate : 0,
          multiplier: typeof multiplier === "number" ? multiplier : null,
          multiplierCalculation:
            typeof arrImpact?.calculation === "string" ? arrImpact.calculation : null,
          arrConfidence:
            typeof arrImpact?.confidence === "string" ? arrImpact.confidence : null,
          detectedAt: p.detectedAt,
          deals: dealsByPattern.get(p.id) ?? [],
          recommendations: parseRecommendations(p.recommendations),
        };
      });

    const candidates: CandidateView[] = candidateResult.admitted
      .filter(
        (a): a is typeof a & { kind: "category_candidate" } =>
          a.kind === "category_candidate",
      )
      .map((a) => ({
        id: a.cluster.id,
        title: a.cluster.title,
        signature: a.cluster.normalizedSignature,
        basis: a.cluster.signatureBasis,
        confidence: a.cluster.confidence,
        memberCount: a.cluster.memberCount,
        vertical: a.cluster.vertical,
        score: a.score,
      }));

    // The silence ledger: clusters Nexus saw and held below the evidence
    // threshold (§1.18 — rendered as a count only, never as content).
    const heldBack = await sql<Array<{ n: number }>>`
      SELECT count(*)::int AS n
        FROM observation_clusters
       WHERE status = 'candidate' AND member_count < 3
    `;

    const stats = await sql<
      Array<{ calls: number; signals: number; deals: number }>
    >`
      SELECT
        (SELECT count(*)::int FROM transcripts WHERE pipeline_processed = true) AS calls,
        (SELECT count(*)::int FROM deal_events
          WHERE type = 'signal_detected'
            AND created_at > now() - interval '30 days') AS signals,
        (SELECT count(DISTINCT hubspot_deal_id)::int FROM deal_events
          WHERE type = 'signal_detected'
            AND created_at > now() - interval '30 days') AS deals
    `;

    return {
      patterns,
      candidates,
      heldBackCount: heldBack[0]?.n ?? 0,
      stats: {
        callsProcessed: stats[0]?.calls ?? 0,
        signalsDetected: stats[0]?.signals ?? 0,
        dealsWatched: stats[0]?.deals ?? 0,
      },
    };
  } finally {
    // Shared pool injected → close() is a no-op for the pool; keeps the
    // request-scoped service hygiene consistent with /lib/meddpicc.ts.
    await admission.close();
  }
}
