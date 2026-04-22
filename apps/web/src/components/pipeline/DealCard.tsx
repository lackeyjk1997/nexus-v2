import type { Deal } from "@nexus/shared";

import { formatAmount, formatDate } from "./stage-display";

interface DealCardProps {
  deal: Deal;
  companyName: string | null;
}

/**
 * Compact kanban-card view of a deal. No hover lift / shadow change — cards
 * live inside a column whose own Card provides elevation. Kept deliberately
 * dense: name, company, amount, close date. Phase 2 Day 3 may add an owner
 * avatar + next-step summary once the deal detail page lands.
 */
export function DealCard({ deal, companyName }: DealCardProps) {
  return (
    <article className="bg-surface flex flex-col gap-2 rounded-md border border-subtle p-3 shadow-sm">
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
    </article>
  );
}
