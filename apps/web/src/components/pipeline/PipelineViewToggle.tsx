"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, Rows } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PipelineView = "table" | "kanban";

interface PipelineViewToggleProps {
  active: PipelineView;
}

/**
 * Small toggle between the table and kanban pipeline views. Client component
 * because it reads + writes `?view=` search params via Next.js router.
 * Default view is `table` (preserves Day-1 behavior for bookmarks).
 */
export function PipelineViewToggle({ active }: PipelineViewToggleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setView(view: PipelineView) {
    const next = new URLSearchParams(params?.toString() ?? "");
    if (view === "table") next.delete("view");
    else next.set("view", view);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : (pathname ?? "/"));
  }

  return (
    <div
      role="radiogroup"
      aria-label="Pipeline view"
      className="bg-muted inline-flex items-center gap-1 rounded-md border border-subtle p-1"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        role="radio"
        aria-checked={active === "table"}
        onClick={() => setView("table")}
        className={cn(
          "gap-1.5",
          active === "table" && "bg-surface text-primary shadow-sm",
        )}
      >
        <Rows className="h-3.5 w-3.5" />
        Table
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        role="radio"
        aria-checked={active === "kanban"}
        onClick={() => setView("kanban")}
        className={cn(
          "gap-1.5",
          active === "kanban" && "bg-surface text-primary shadow-sm",
        )}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        Kanban
      </Button>
    </div>
  );
}
