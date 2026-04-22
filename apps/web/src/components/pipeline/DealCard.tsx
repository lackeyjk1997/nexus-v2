import Link from "next/link";

import type { Deal } from "@nexus/shared";

import { formatAmount, formatDate } from "./stage-display";

interface DealCardProps {
  deal: Deal;
  companyName: string | null;
}

/**
 * Compact kanban-card view of a deal. Wrapped in <Link> so the full card is
 * a click-target to /pipeline/[dealId]. Hover lift intentionally omitted —
 * cards live inside a column whose own elevation provides contrast; stacking
 * a second shadow reads as muddy. Revisit in Phase 2 Day 4 once a richer
 * hover affordance (owner avatar, next-step hint) justifies the lift.
 */
export function DealCard({ deal, companyName }: DealCardProps) {
  return (
    <Link
      href={`/pipeline/${deal.hubspotId}`}
      className="bg-surface hover:border-default flex flex-col gap-2 rounded-md border border-subtle p-3 shadow-sm transition-colors duration-fast ease-out-soft"
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-primary text-sm font-medium leading-snug">
          {deal.name}
        </span>
        {companyName && (
          <span className="text-tertiary text-xs">{companyName}</span>
        )}
      </div>
      <div className="flex items-center justify-between pt-1 text-xs">
        <span className="text-primary font-mono tabular-nums">
          {formatAmount(deal.amount, deal.currency)}
        </span>
        <span className="text-tertiary font-mono">
          {formatDate(deal.closeDate)}
        </span>
      </div>
    </Link>
  );
}
