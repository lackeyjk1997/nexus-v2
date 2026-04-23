"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";

import type { Deal, DealStage } from "@nexus/shared";

import { Badge } from "@/components/ui/badge";
import { STAGE_LABELS, STAGE_VARIANTS, formatAmount, formatDate } from "./stage-display";
import { stageChangeAction } from "@/app/actions/stage-change";

interface PipelineKanbanProps {
  deals: Deal[];
  companyLookup: Map<string, string>;
  stages: readonly DealStage[];
}

/**
 * Desktop-first horizontal kanban with DnD (Phase 2 Day 4 Session B).
 *
 * Optimistic + rollback per the session contract: drop fires a local state
 * swap immediately, then the server action runs; on failure the local state
 * reverts and an error surfaces inline. On success, router.refresh() pulls
 * the now-canonical data; a useEffect re-seeds local state from the refreshed
 * `deals` prop.
 *
 * PointerSensor uses `distance: 8` so a click without movement passes through
 * to the DealCard's `<Link>` (click-through to detail page). A drag that
 * moves >8px triggers DnD and suppresses the click.
 *
 * Outcome stages (closed_won / closed_lost) are deliberately NOT handled by
 * DnD — a drag gesture isn't the right place to ask for a close-date or a
 * close-lost note. Dragging into those columns rolls back with a note, and
 * the rep picks the column through the detail-page or table-row dropdown
 * which opens the proper modal.
 */
export function PipelineKanban({
  deals,
  companyLookup,
  stages,
}: PipelineKanbanProps) {
  const router = useRouter();
  const [localDeals, setLocalDeals] = useState<Deal[]>(deals);
  const [error, setError] = useState<string | null>(null);
  // @dnd-kit assigns client-side-only IDs (aria-describedby) that differ
  // between SSR and hydration. Render plain cards server-side and the
  // DnD-wrapped version only after mount to avoid the hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Re-seed local state when the server re-renders with fresh data after a
  // successful stage change (or any other pipeline mutation).
  useEffect(() => {
    setLocalDeals(deals);
  }, [deals]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const dealId = String(active.id);
    const targetStage = String(over.id) as DealStage;
    const deal = localDeals.find((d) => d.hubspotId === dealId);
    if (!deal) return;
    if (deal.stage === targetStage) return;

    if (targetStage === "closed_won" || targetStage === "closed_lost") {
      setError(
        `Use the stage dropdown on the deal page to close ${
          targetStage === "closed_won" ? "won" : "lost"
        } — a close date or note is required.`,
      );
      return;
    }

    const previousStage = deal.stage;
    setError(null);

    // Optimistic update: reflect the new stage immediately.
    setLocalDeals((prev) =>
      prev.map((d) =>
        d.hubspotId === dealId ? { ...d, stage: targetStage } : d,
      ),
    );

    const result = await stageChangeAction({ dealId, newStage: targetStage });

    if (!result.success) {
      // Rollback.
      setLocalDeals((prev) =>
        prev.map((d) =>
          d.hubspotId === dealId ? { ...d, stage: previousStage } : d,
        ),
      );
      setError(result.error);
      return;
    }

    router.refresh();
  }

  const byStage = new Map<DealStage, Deal[]>();
  for (const stage of stages) byStage.set(stage, []);
  for (const deal of localDeals) byStage.get(deal.stage)?.push(deal);

  const columns = (
    <div className="overflow-x-auto">
      <div className="flex min-w-max gap-4 pb-2">
        {stages.map((stage) => (
          <KanbanColumn
            key={stage}
            stage={stage}
            deals={byStage.get(stage) ?? []}
            companyLookup={companyLookup}
            draggable={mounted}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div
          className="bg-error-light text-error-dark rounded-md border border-error-light px-4 py-2 text-sm"
          role="alert"
        >
          {error}
        </div>
      )}
      {mounted ? (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          {columns}
        </DndContext>
      ) : (
        columns
      )}
    </div>
  );
}

function KanbanColumn({
  stage,
  deals,
  companyLookup,
  draggable,
}: {
  stage: DealStage;
  deals: Deal[];
  companyLookup: Map<string, string>;
  draggable: boolean;
}) {
  if (!draggable) {
    return (
      <section
        className="bg-muted flex w-72 shrink-0 flex-col gap-3 rounded-lg border border-subtle p-3"
        aria-label={`${STAGE_LABELS[stage]} column`}
      >
        <ColumnHeader stage={stage} count={deals.length} />
        <ColumnBody
          deals={deals}
          companyLookup={companyLookup}
          draggable={false}
        />
      </section>
    );
  }
  return <DroppableColumn stage={stage} deals={deals} companyLookup={companyLookup} />;
}

function DroppableColumn({
  stage,
  deals,
  companyLookup,
}: {
  stage: DealStage;
  deals: Deal[];
  companyLookup: Map<string, string>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <section
      ref={setNodeRef}
      className={`bg-muted flex w-72 shrink-0 flex-col gap-3 rounded-lg border p-3 transition-colors duration-fast ease-out-soft ${
        isOver ? "border-accent" : "border-subtle"
      }`}
      aria-label={`${STAGE_LABELS[stage]} column`}
    >
      <ColumnHeader stage={stage} count={deals.length} />
      <ColumnBody deals={deals} companyLookup={companyLookup} draggable />
    </section>
  );
}

function ColumnHeader({ stage, count }: { stage: DealStage; count: number }) {
  return (
    <header className="flex items-center justify-between gap-2 px-1">
      <Badge variant={STAGE_VARIANTS[stage]}>{STAGE_LABELS[stage]}</Badge>
      <span className="text-tertiary font-mono text-xs tabular-nums">
        {count}
      </span>
    </header>
  );
}

function ColumnBody({
  deals,
  companyLookup,
  draggable,
}: {
  deals: Deal[];
  companyLookup: Map<string, string>;
  draggable: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {deals.length === 0 ? (
        <p className="text-tertiary px-1 py-2 text-xs">Nothing here yet.</p>
      ) : (
        deals.map((deal) => {
          const companyName = deal.companyId
            ? (companyLookup.get(deal.companyId) ?? null)
            : null;
          return draggable ? (
            <DraggableDealCard
              key={deal.hubspotId}
              deal={deal}
              companyName={companyName}
            />
          ) : (
            <StaticDealCard
              key={deal.hubspotId}
              deal={deal}
              companyName={companyName}
            />
          );
        })
      )}
    </div>
  );
}

function StaticDealCard({
  deal,
  companyName,
}: {
  deal: Deal;
  companyName: string | null;
}) {
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

function DraggableDealCard({
  deal,
  companyName,
}: {
  deal: Deal;
  companyName: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: deal.hubspotId });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`touch-none ${isDragging ? "opacity-60" : ""}`}
    >
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
    </div>
  );
}
