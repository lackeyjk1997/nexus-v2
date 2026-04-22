import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createHubSpotAdapter } from "@/lib/crm";
import type { DealStage } from "@nexus/shared";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const STAGE_LABELS: Record<DealStage, string> = {
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

const STAGE_VARIANTS: Record<
  DealStage,
  "neutral" | "slate" | "signal" | "success" | "error" | "warning"
> = {
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

function formatAmount(amount: number | null, currency: string | null): string {
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

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return date.toISOString().slice(0, 10);
}

export default async function PipelinePage() {
  const adapter = createHubSpotAdapter();
  try {
    const deals = await adapter.listDeals({ limit: 50 });

    const companyIds = Array.from(
      new Set(deals.map((d) => d.companyId).filter((id): id is string => !!id)),
    );
    const companyLookup = new Map<string, string>();
    for (const id of companyIds) {
      try {
        const company = await adapter.getCompany(id);
        companyLookup.set(id, company.name);
      } catch {
        companyLookup.set(id, id);
      }
    }

    return (
      <div className="flex flex-1 flex-col gap-6 p-8">
        <header>
          <h1 className="text-primary text-3xl font-semibold tracking-tight">
            Pipeline
          </h1>
          <p className="text-secondary mt-1 text-sm">
            {deals.length} deal{deals.length === 1 ? "" : "s"} from HubSpot —
            read via{" "}
            <code className="text-primary font-mono text-xs">
              CrmAdapter.listDeals()
            </code>
            .
          </p>
        </header>

        {deals.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No deals yet</CardTitle>
              <CardDescription>
                Seed HubSpot with{" "}
                <code className="text-primary font-mono text-xs">
                  pnpm --filter @nexus/db seed:hubspot-minimal
                </code>
                , then pre-warm with{" "}
                <code className="text-primary font-mono text-xs">
                  pnpm --filter @nexus/db prewarm:hubspot-cache
                </code>
                .
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Close Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deals.map((deal) => (
                    <TableRow key={deal.hubspotId}>
                      <TableCell className="font-medium">{deal.name}</TableCell>
                      <TableCell className="text-secondary">
                        {deal.companyId
                          ? (companyLookup.get(deal.companyId) ?? "—")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STAGE_VARIANTS[deal.stage]}>
                          {STAGE_LABELS[deal.stage]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatAmount(deal.amount, deal.currency)}
                      </TableCell>
                      <TableCell className="text-secondary font-mono text-sm">
                        {formatDate(deal.closeDate)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    );
  } finally {
    await adapter.close();
  }
}
