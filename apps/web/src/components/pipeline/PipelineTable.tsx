import Link from "next/link";

import type { Deal, DealStage } from "@nexus/shared";

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

import { StageChangeControl } from "./StageChangeControl";
import { formatAmount, formatDate } from "./stage-display";

interface PipelineTableProps {
  deals: Deal[];
  companyLookup: Map<string, string>;
  stages: readonly DealStage[];
}

export function PipelineTable({
  deals,
  companyLookup,
  stages,
}: PipelineTableProps) {
  if (deals.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No deals yet</CardTitle>
          <CardDescription>
            Create the first one above, or seed HubSpot with{" "}
            <code className="text-primary font-mono text-xs">
              pnpm --filter @nexus/db seed:hubspot-minimal
            </code>
            .
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
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
              <TableRow key={deal.hubspotId} className="relative">
                <TableCell className="font-medium">
                  {/* Row-spanning click target — after:inset-0 expands the Link
                      to the whole <tr> without nesting <a> inside <tr>. */}
                  <Link
                    href={`/pipeline/${deal.hubspotId}`}
                    className="text-primary hover:text-signal-700 transition-colors duration-fast ease-out-soft after:absolute after:inset-0"
                  >
                    {deal.name}
                  </Link>
                </TableCell>
                <TableCell className="text-secondary">
                  {deal.companyId
                    ? (companyLookup.get(deal.companyId) ?? "—")
                    : "—"}
                </TableCell>
                <TableCell className="relative z-10">
                  <StageChangeControl
                    dealId={deal.hubspotId}
                    currentStage={deal.stage}
                    stages={stages}
                    dealName={deal.name}
                    amount={deal.amount}
                    currency={deal.currency}
                    variant="row"
                  />
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
  );
}
