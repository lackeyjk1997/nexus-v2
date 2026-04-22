import type { Company, Deal } from "@nexus/shared";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface DealSummarySectionProps {
  deal: Deal;
  company: Company | null;
}

/**
 * Lightweight summary card — product, vertical, owner, lead source.
 * Read-only; edits land via the Phase 2 Day 4 "deal edit" surface.
 */
export function DealSummarySection({ deal, company }: DealSummarySectionProps) {
  const rows: Array<{ label: string; value: string }> = [];
  if (deal.vertical) rows.push({ label: "Vertical", value: deal.vertical });
  if (deal.product) rows.push({ label: "Product", value: deal.product });
  if (deal.leadSource)
    rows.push({ label: "Lead source", value: deal.leadSource });
  if (deal.primaryCompetitor)
    rows.push({ label: "Primary competitor", value: deal.primaryCompetitor });
  if (company?.domain) rows.push({ label: "Domain", value: company.domain });
  if (company?.employeeCount !== null && company?.employeeCount !== undefined)
    rows.push({
      label: "Employees",
      value: company.employeeCount.toLocaleString("en-US"),
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Summary</CardTitle>
        <CardDescription>
          Non-MEDDPICC deal + company context. Read-only today; editable in
          Phase 2 Day 4.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-tertiary text-sm">Nothing captured yet.</p>
        ) : (
          <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
            {rows.map(({ label, value }) => (
              <div key={label} className="flex flex-col gap-0.5">
                <dt className="text-tertiary text-xs uppercase tracking-wide">
                  {label}
                </dt>
                <dd className="text-primary text-sm">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
