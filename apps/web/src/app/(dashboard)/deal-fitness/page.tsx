import Link from "next/link";
import { redirect } from "next/navigation";

import {
  DEAL_STAGES,
  getSharedSql,
  loadPipelineIds,
  type DealStage,
} from "@nexus/shared";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FitBar, ScoreRing } from "@/components/deal/fitness-viz";
import { env } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Deal Fitness portfolio (Demo 2026-06-10 Run 2 — v1-parity layout):
 * KPI strip (portfolio fitness, deals tracked, imbalances, events this
 * week) + one row per scored deal with stage chip, per-dimension fit bars,
 * overall ring, velocity, and days-quiet. Rows link to the deal page's
 * full evidence breakdown.
 */

interface FitnessPortfolioRow {
  hubspot_deal_id: string;
  overall_score: number | null;
  business_fit_score: number | null;
  emotional_fit_score: number | null;
  technical_fit_score: number | null;
  readiness_fit_score: number | null;
  velocity_trend: string | null;
  fit_imbalance_flag: boolean;
  updated_at: Date;
  deal_name: string | null;
  amount: string | null;
  stage_id: string | null;
  detected_events: number;
  events_this_week: number;
  last_call_at: Date | null;
}

function humanize(slug: string): string {
  return slug
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

let stageById: Map<string, DealStage> | null = null;
function resolveStage(raw: string | null): string {
  if (!raw) return "—";
  if (!stageById) {
    try {
      const ids = loadPipelineIds();
      stageById = new Map();
      for (const stage of DEAL_STAGES) {
        const id = ids.stageIds[stage];
        if (id) stageById.set(id, stage);
      }
    } catch {
      stageById = new Map();
    }
  }
  const stage = stageById.get(raw);
  if (stage) return humanize(stage);
  // Raw value may already be a readable slug (seed data) vs a numeric id.
  return /^\d+$/.test(raw) ? "—" : humanize(raw);
}

function velocityCell(trend: string | null) {
  if (trend === "accelerating")
    return <span className="text-success text-sm">↗ Accelerating</span>;
  if (trend === "decelerating")
    return <span className="text-warning text-sm">↘ Decelerating</span>;
  if (trend === "stalled") return <span className="text-error text-sm">Stalled</span>;
  return <span className="text-secondary text-sm">→ Stable</span>;
}

export default async function DealFitnessPage() {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const sql = getSharedSql({ databaseUrl: env.databaseUrl });
  const rows = await sql<FitnessPortfolioRow[]>`
    SELECT s.hubspot_deal_id, s.overall_score, s.business_fit_score,
           s.emotional_fit_score, s.technical_fit_score, s.readiness_fit_score,
           s.velocity_trend, s.fit_imbalance_flag, s.updated_at,
           c.payload->'properties'->>'dealname' AS deal_name,
           c.payload->'properties'->>'amount' AS amount,
           c.payload->'properties'->>'dealstage' AS stage_id,
           (SELECT count(*)::int FROM deal_fitness_events e
             WHERE e.hubspot_deal_id = s.hubspot_deal_id AND e.detected) AS detected_events,
           (SELECT count(*)::int FROM deal_fitness_events e
             WHERE e.hubspot_deal_id = s.hubspot_deal_id AND e.detected
               AND e.updated_at > now() - interval '7 days') AS events_this_week,
           (SELECT max(coalesce(t.recorded_at, t.created_at)) FROM transcripts t
             WHERE t.hubspot_deal_id = s.hubspot_deal_id) AS last_call_at
      FROM deal_fitness_scores s
      LEFT JOIN hubspot_cache c
        ON c.object_type = 'deal' AND c.hubspot_id = s.hubspot_deal_id
     ORDER BY s.overall_score DESC NULLS LAST
  `;

  const scored = rows.filter((r) => r.overall_score !== null);
  const portfolioFitness =
    scored.length > 0
      ? Math.round(scored.reduce((a, r) => a + (r.overall_score ?? 0), 0) / scored.length)
      : null;
  const imbalances = rows.filter((r) => r.fit_imbalance_flag).length;
  const eventsThisWeek = rows.reduce((a, r) => a + r.events_this_week, 0);

  const fmtUsd = (v: string | null): string => {
    const n = Number(v);
    return Number.isFinite(n) && v !== null
      ? `$${Math.round(n).toLocaleString("en-US")}`
      : "—";
  };
  const daysQuiet = (d: Date | null): string => {
    if (!d) return "—";
    const days = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
    return `${days}d`;
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-primary font-display text-3xl tracking-tight">
            Deal Fitness
          </h1>
          <p className="text-secondary mt-1 text-sm">
            Buyer-inspectable events across your portfolio — scored from call
            transcripts, re-scored on every new call.
          </p>
        </div>
        <Badge variant="signal">oDeal Framework</Badge>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-tertiary text-xs uppercase tracking-wide">Portfolio Fitness</p>
            <p className="text-primary mt-1 text-3xl font-semibold tabular-nums">
              {portfolioFitness !== null ? `${portfolioFitness}%` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-tertiary text-xs uppercase tracking-wide">Deals Tracked</p>
            <p className="text-primary mt-1 text-3xl font-semibold tabular-nums">{rows.length}</p>
          </CardContent>
        </Card>
        <Card className={imbalances > 0 ? "border-warning-light bg-warning-light/30" : undefined}>
          <CardContent className="py-4">
            <p className="text-tertiary text-xs uppercase tracking-wide">Fit Imbalances</p>
            <p className="text-primary mt-1 text-3xl font-semibold tabular-nums">{imbalances}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-tertiary text-xs uppercase tracking-wide">Events This Week</p>
            <p className="text-primary mt-1 text-3xl font-semibold tabular-nums">
              {eventsThisWeek}
            </p>
          </CardContent>
        </Card>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-secondary text-sm">
              No scored deals yet. Fitness computes automatically when a call
              transcript lands on a deal.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto px-0 py-0">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-subtle bg-muted text-left">
                  <th className="text-tertiary px-4 py-3 text-xs font-medium uppercase tracking-wide">Deal</th>
                  <th className="text-tertiary px-4 py-3 text-xs font-medium uppercase tracking-wide">Stage</th>
                  <th className="text-tertiary px-4 py-3 text-xs font-medium uppercase tracking-wide">Value</th>
                  <th className="text-tertiary px-4 py-3 text-xs font-medium uppercase tracking-wide">Fit Scores</th>
                  <th className="text-tertiary px-4 py-3 text-xs font-medium uppercase tracking-wide">Overall</th>
                  <th className="text-tertiary px-4 py-3 text-xs font-medium uppercase tracking-wide">Velocity</th>
                  <th className="text-tertiary px-4 py-3 text-xs font-medium uppercase tracking-wide">Days Quiet</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.hubspot_deal_id} className="border-b border-subtle align-middle">
                    <td className="px-4 py-4">
                      <Link
                        href={`/pipeline/${r.hubspot_deal_id}`}
                        className="text-primary font-medium hover:underline"
                      >
                        {r.deal_name ?? r.hubspot_deal_id}
                      </Link>
                      {r.fit_imbalance_flag && (
                        <Badge variant="warning" className="ml-2">
                          Imbalanced
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant="outline">{resolveStage(r.stage_id)}</Badge>
                    </td>
                    <td className="text-secondary px-4 py-4 font-mono text-sm tabular-nums">
                      {fmtUsd(r.amount)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-3">
                        <FitBar label="B" score={r.business_fit_score} />
                        <FitBar label="E" score={r.emotional_fit_score} />
                        <FitBar label="T" score={r.technical_fit_score} />
                        <FitBar label="R" score={r.readiness_fit_score} />
                      </div>
                    </td>
                    <td className="text-primary px-4 py-4">
                      <ScoreRing score={r.overall_score} size={52} strokeWidth={5} />
                    </td>
                    <td className="px-4 py-4">{velocityCell(r.velocity_trend)}</td>
                    <td className="text-secondary px-4 py-4 tabular-nums">
                      {daysQuiet(r.last_call_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
