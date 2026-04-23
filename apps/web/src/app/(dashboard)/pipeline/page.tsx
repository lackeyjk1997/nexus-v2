import Link from "next/link";
import { Plus } from "lucide-react";

import { DEAL_STAGES } from "@nexus/shared";

import { PipelineKanban } from "@/components/pipeline/PipelineKanban";
import { PipelineTable } from "@/components/pipeline/PipelineTable";
import {
  PipelineViewToggle,
  type PipelineView,
} from "@/components/pipeline/PipelineViewToggle";
import { Button } from "@/components/ui/button";
import { createHubSpotAdapter } from "@/lib/crm";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function resolveView(raw: string | string[] | undefined): PipelineView {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "kanban" ? "kanban" : "table";
}

interface PipelinePageProps {
  searchParams: Promise<{
    view?: string | string[];
    created?: string | string[];
  }>;
}

export default async function PipelinePage({
  searchParams,
}: PipelinePageProps) {
  const params = await searchParams;
  const view = resolveView(params.view);
  const createdDealName = Array.isArray(params.created)
    ? params.created[0]
    : params.created;

  const adapter = createHubSpotAdapter();
  try {
    const deals = await adapter.listDeals({ limit: 100 });

    const companyIds = Array.from(
      new Set(deals.map((d) => d.companyId).filter((id): id is string => !!id)),
    );
    // Foundation-review A14: parallelize company lookups. Cold-cache load
    // with N unique companies previously serialized N× ~200ms HubSpot calls.
    const companyEntries = await Promise.all(
      companyIds.map(async (id): Promise<[string, string]> => {
        try {
          const company = await adapter.getCompany(id);
          return [id, company.name];
        } catch {
          return [id, id];
        }
      }),
    );
    const companyLookup = new Map<string, string>(companyEntries);

    return (
      <div className="flex flex-1 flex-col gap-6 p-8">
        <header className="flex items-end justify-between gap-4">
          <div>
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
          </div>
          <div className="flex items-center gap-3">
            <PipelineViewToggle active={view} />
            <Button asChild>
              <Link href="/pipeline/new">
                <Plus className="h-4 w-4" />
                New deal
              </Link>
            </Button>
          </div>
        </header>

        {createdDealName && (
          <div className="bg-signal-50 text-signal-700 rounded-md border border-signal-200 px-4 py-2 text-sm">
            Created deal{" "}
            <span className="font-medium">{createdDealName}</span>.
          </div>
        )}

        {view === "kanban" ? (
          <PipelineKanban
            deals={deals}
            companyLookup={companyLookup}
            stages={DEAL_STAGES}
          />
        ) : (
          <PipelineTable
            deals={deals}
            companyLookup={companyLookup}
            stages={DEAL_STAGES}
          />
        )}
      </div>
    );
  } finally {
    await adapter.close();
  }
}
