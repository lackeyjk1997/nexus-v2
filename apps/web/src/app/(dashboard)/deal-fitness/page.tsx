import Link from "next/link";
import { redirect } from "next/navigation";

import { getSharedSql } from "@nexus/shared";

import { env } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Deal Fitness portfolio — UI BONES (Demo 2026-06-10 Run 2).
 *
 * One row per scored deal: stage, value, the four fit dimensions, overall,
 * velocity, last-scored. Joins deal_fitness_scores against the hubspot_cache
 * mirror for name/stage/amount. Rows link to the deal page, where the full
 * evidence breakdown lives (DealFitnessSection). Plain semantic structure;
 * the v1-style radar/committee/momentum treatment is the later design pass.
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
  detected_events: number;
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
           (SELECT count(*)::int FROM deal_fitness_events e
             WHERE e.hubspot_deal_id = s.hubspot_deal_id AND e.detected) AS detected_events
      FROM deal_fitness_scores s
      LEFT JOIN hubspot_cache c
        ON c.object_type = 'deal' AND c.hubspot_id = s.hubspot_deal_id
     ORDER BY s.overall_score DESC NULLS LAST
  `;

  const fmtUsd = (v: string | null): string => {
    const n = Number(v);
    return Number.isFinite(n) && v !== null ? `$${Math.round(n).toLocaleString("en-US")}` : "—";
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <header>
        <h1 className="text-primary text-3xl font-semibold tracking-tight">
          Deal Fitness
        </h1>
        <p className="text-secondary mt-1 text-sm">
          Buyer-inspectable events across the portfolio — scored from call
          transcripts, re-scored on every new call.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="text-secondary rounded-md border border-subtle bg-muted px-4 py-3 text-sm">
          No scored deals yet. Fitness computes automatically when a call
          transcript lands on a deal.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-subtle text-left">
              <th className="text-tertiary py-2 pr-4 text-xs font-medium uppercase tracking-wide">Deal</th>
              <th className="text-tertiary py-2 pr-4 text-xs font-medium uppercase tracking-wide">Value</th>
              <th className="text-tertiary py-2 pr-4 text-xs font-medium uppercase tracking-wide">Business</th>
              <th className="text-tertiary py-2 pr-4 text-xs font-medium uppercase tracking-wide">Emotional</th>
              <th className="text-tertiary py-2 pr-4 text-xs font-medium uppercase tracking-wide">Technical</th>
              <th className="text-tertiary py-2 pr-4 text-xs font-medium uppercase tracking-wide">Readiness</th>
              <th className="text-tertiary py-2 pr-4 text-xs font-medium uppercase tracking-wide">Overall</th>
              <th className="text-tertiary py-2 pr-4 text-xs font-medium uppercase tracking-wide">Velocity</th>
              <th className="text-tertiary py-2 text-xs font-medium uppercase tracking-wide">Events</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.hubspot_deal_id} className="border-b border-subtle">
                <td className="py-3 pr-4">
                  <Link
                    href={`/pipeline/${r.hubspot_deal_id}`}
                    className="text-primary font-medium hover:underline"
                  >
                    {r.deal_name ?? r.hubspot_deal_id}
                  </Link>
                  {r.fit_imbalance_flag && (
                    <span className="text-tertiary ml-2 text-xs">imbalanced</span>
                  )}
                </td>
                <td className="text-secondary py-3 pr-4 tabular-nums">{fmtUsd(r.amount)}</td>
                <td className="text-secondary py-3 pr-4 tabular-nums">{r.business_fit_score ?? "—"}</td>
                <td className="text-secondary py-3 pr-4 tabular-nums">{r.emotional_fit_score ?? "—"}</td>
                <td className="text-secondary py-3 pr-4 tabular-nums">{r.technical_fit_score ?? "—"}</td>
                <td className="text-secondary py-3 pr-4 tabular-nums">{r.readiness_fit_score ?? "—"}</td>
                <td className="text-primary py-3 pr-4 font-semibold tabular-nums">
                  {r.overall_score ?? "—"}
                </td>
                <td className="text-secondary py-3 pr-4">{r.velocity_trend ?? "—"}</td>
                <td className="text-secondary py-3 tabular-nums">{r.detected_events}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
