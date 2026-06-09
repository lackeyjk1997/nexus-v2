import Link from "next/link";

import type { PatternView } from "@/lib/intelligence";
import { Badge } from "@/components/ui/badge";

/**
 * One synthesized pattern, rendered as a kept note — typography-led,
 * notes-first per the Day 5 B design direction. Server component; the
 * only interaction is link-through to deal detail.
 */

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  competitive_intel: "Competitive pressure",
  deal_blocker: "Deal blockers",
  win_pattern: "Winning pattern",
  content_gap: "Content gap",
  field_intelligence: "Field intelligence",
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  this_week: "This week",
  queued: "Queued",
};

function signalTypeLabel(signalType: string): string {
  return (
    SIGNAL_TYPE_LABELS[signalType] ??
    signalType.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

function formatArr(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `$${m >= 10 ? Math.round(m) : m.toFixed(2).replace(/\.?0+$/, "")}M`;
  }
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}

function formatStage(stage: string | null): string | null {
  if (!stage) return null;
  return stage.replace(/_/g, " ");
}

export function PatternNote({
  pattern,
  index,
}: {
  pattern: PatternView;
  index: number;
}) {
  const visibleRecommendations = pattern.recommendations.slice(0, 3);

  return (
    <article className="border-b border-subtle pb-12 last:border-b-0">
      <div className="flex items-baseline gap-4">
        <span className="text-tertiary font-display text-2xl leading-none">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="signal">{signalTypeLabel(pattern.signalType)}</Badge>
          {pattern.vertical && (
            <span className="text-tertiary text-xs uppercase tracking-wide">
              {pattern.vertical}
            </span>
          )}
        </div>
      </div>

      <h2 className="text-primary font-display mt-4 text-[1.75rem] leading-snug">
        {pattern.headline}
      </h2>

      <p className="text-secondary mt-1.5 text-sm">
        {pattern.deals.length} deal{pattern.deals.length === 1 ? "" : "s"} ·{" "}
        {formatArr(pattern.aggregateArr)} in play
        {pattern.multiplier !== null && pattern.multiplier > 1 && (
          <> · {pattern.multiplier.toFixed(1)}× if it spreads</>
        )}
      </p>

      {pattern.mechanism && (
        <p className="text-primary mt-5 max-w-prose text-[0.9375rem] leading-relaxed">
          {pattern.mechanism}
        </p>
      )}

      {pattern.deals.length > 0 && (
        <ul className="mt-6 flex flex-col">
          {pattern.deals.map((deal) => (
            <li key={deal.hubspotDealId}>
              <Link
                href={`/pipeline/${deal.hubspotDealId}`}
                className="group flex items-baseline justify-between gap-4 rounded-md px-3 py-2 -mx-3 transition-colors duration-fast hover:bg-muted"
              >
                <span className="text-primary text-sm font-medium group-hover:underline group-hover:underline-offset-4">
                  {deal.name}
                </span>
                <span className="text-tertiary shrink-0 text-xs">
                  {formatStage(deal.stage)}
                  {deal.amount !== null && <> · {formatArr(deal.amount)}</>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {visibleRecommendations.length > 0 && (
        <div className="mt-6">
          <h3 className="text-tertiary text-xs font-medium uppercase tracking-wide">
            What to do with it
          </h3>
          <ul className="mt-3 flex flex-col gap-3">
            {visibleRecommendations.map((rec, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span
                  className={
                    rec.priority === "urgent"
                      ? "text-error-dark mt-0.5 shrink-0 text-xs font-medium"
                      : "text-tertiary mt-0.5 shrink-0 text-xs font-medium"
                  }
                >
                  {PRIORITY_LABELS[rec.priority]}
                </span>
                <span className="text-secondary leading-relaxed">
                  {rec.targetDealName && (
                    <span className="text-primary font-medium">
                      {rec.targetDealName} —{" "}
                    </span>
                  )}
                  {rec.action}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pattern.scoreExplanation && (
        <details className="mt-6 max-w-prose">
          <summary className="text-tertiary cursor-pointer text-xs hover:text-secondary">
            Why this surfaced (score {Math.round(pattern.score)})
          </summary>
          <p className="text-tertiary mt-2 text-xs leading-relaxed">
            {pattern.scoreExplanation}
          </p>
        </details>
      )}
    </article>
  );
}
