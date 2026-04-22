import type { DealStage } from "@nexus/shared";

/**
 * Stage → human label + Badge variant mapping. Shared by PipelineTable,
 * PipelineKanban, DealCard. Source order matches DEAL_STAGES tuple.
 */

export const STAGE_LABELS: Record<DealStage, string> = {
  new_lead: "New Lead",
  qualified: "Qualified",
  discovery: "Discovery",
  technical_validation: "Technical Validation",
  proposal: "Proposal",
  negotiation: "Negotiation",
  closing: "Closing",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
};

export type StageBadgeVariant =
  | "neutral"
  | "slate"
  | "signal"
  | "success"
  | "error"
  | "warning";

export const STAGE_VARIANTS: Record<DealStage, StageBadgeVariant> = {
  new_lead: "slate",
  qualified: "slate",
  discovery: "neutral",
  technical_validation: "neutral",
  proposal: "signal",
  negotiation: "signal",
  closing: "warning",
  closed_won: "success",
  closed_lost: "error",
};

export function formatAmount(
  amount: number | null,
  currency: string | null,
): string {
  if (amount === null) return "—";
  const code = currency ?? "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${code} ${amount.toLocaleString("en-US")}`;
  }
}

export function formatDate(date: Date | null): string {
  if (!date) return "—";
  return date.toISOString().slice(0, 10);
}
