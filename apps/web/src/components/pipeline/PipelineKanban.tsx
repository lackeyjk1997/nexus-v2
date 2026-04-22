import type { Deal } from "@nexus/shared";
import { DEAL_STAGES, type DealStage } from "@nexus/shared";

import { Badge } from "@/components/ui/badge";

import { DealCard } from "./DealCard";
import { STAGE_LABELS, STAGE_VARIANTS } from "./stage-display";

interface PipelineKanbanProps {
  deals: Deal[];
  companyLookup: Map<string, string>;
}

/**
 * Desktop-first horizontal kanban: 9 fixed-width columns, one per DealStage.
 * Parent container horizontal-scrolls on overflow. No DnD today — stage change
 * lands Phase 2 Day 4 with the Close Won / Close Lost outcome stubs.
 */
export function PipelineKanban({ deals, companyLookup }: PipelineKanbanProps) {
  const byStage = new Map<DealStage, Deal[]>();
  for (const stage of DEAL_STAGES) byStage.set(stage, []);
  for (const deal of deals) byStage.get(deal.stage)?.push(deal);

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max gap-4 pb-2">
        {DEAL_STAGES.map((stage) => {
          const stageDeals = byStage.get(stage) ?? [];
          return (
            <section
              key={stage}
              className="bg-muted flex w-72 shrink-0 flex-col gap-3 rounded-lg border border-subtle p-3"
              aria-label={`${STAGE_LABELS[stage]} column`}
            >
              <header className="flex items-center justify-between gap-2 px-1">
                <Badge variant={STAGE_VARIANTS[stage]}>
                  {STAGE_LABELS[stage]}
                </Badge>
                <span className="text-tertiary font-mono text-xs tabular-nums">
                  {stageDeals.length}
                </span>
              </header>
              <div className="flex flex-col gap-2">
                {stageDeals.length === 0 ? (
                  <p className="text-tertiary px-1 py-2 text-xs">
                    Nothing here yet.
                  </p>
                ) : (
                  stageDeals.map((deal) => (
                    <DealCard
                      key={deal.hubspotId}
                      deal={deal}
                      companyName={
                        deal.companyId
                          ? (companyLookup.get(deal.companyId) ?? null)
                          : null
                      }
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
