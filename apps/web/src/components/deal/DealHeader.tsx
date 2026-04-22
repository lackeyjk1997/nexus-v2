import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import type { Company, Deal } from "@nexus/shared";

import { Badge } from "@/components/ui/badge";
import {
  STAGE_LABELS,
  STAGE_VARIANTS,
  formatAmount,
  formatDate,
} from "@/components/pipeline/stage-display";

interface DealHeaderProps {
  deal: Deal;
  company: Company | null;
}

/**
 * Deal detail header — name + company + stage badge + amount + close date.
 * Type-driven hierarchy per DESIGN-SYSTEM §1.2 (no color-by-default).
 */
export function DealHeader({ deal, company }: DealHeaderProps) {
  return (
    <header className="flex flex-col gap-3">
      <Link
        href="/pipeline"
        className="text-tertiary hover:text-secondary inline-flex w-fit items-center gap-1 text-sm transition-colors duration-fast ease-out-soft"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Pipeline
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-primary text-3xl font-semibold tracking-tight">
          {deal.name}
        </h1>
        {company && (
          <p className="text-secondary text-base">{company.name}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 pt-1 text-sm">
        <Badge variant={STAGE_VARIANTS[deal.stage]}>
          {STAGE_LABELS[deal.stage]}
        </Badge>
        <span className="text-tertiary">·</span>
        <span className="text-primary font-mono tabular-nums">
          {formatAmount(deal.amount, deal.currency)}
        </span>
        <span className="text-tertiary">·</span>
        <span className="text-secondary font-mono">
          Closes {formatDate(deal.closeDate)}
        </span>
      </div>
    </header>
  );
}
