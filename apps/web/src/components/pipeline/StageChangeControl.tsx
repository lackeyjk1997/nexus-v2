"use client";

import { useState } from "react";

import type { DealStage } from "@nexus/shared";

import { CloseLostModal } from "./CloseLostModal";
import { CloseWonModal } from "./CloseWonModal";
import { STAGE_LABELS, STAGE_VARIANTS } from "./stage-display";
import { useStageChange } from "./use-stage-change";

type OutcomeStage = "closed_won" | "closed_lost";

export interface StageChangeControlProps {
  dealId: string;
  currentStage: DealStage;
  stages: readonly DealStage[];
  dealName: string;
  amount: number | null;
  currency: string | null;
  /**
   * 'badge' = detail-page header (Badge-appearance trigger, full stage label).
   * 'row'   = PipelineTable row (compact trigger, inline with the cell).
   */
  variant: "badge" | "row";
}

const VARIANT_CLASS: Record<
  NonNullable<ReturnType<typeof variantToKey>>,
  string
> = {
  neutral: "border-subtle bg-muted text-primary",
  slate: "border-slate-200 bg-slate-50 text-slate-700",
  signal: "border-signal-200 bg-signal-50 text-signal-700",
  success: "border-success-light bg-success-light text-success-dark",
  warning: "border-warning-light bg-warning-light text-warning-dark",
  error: "border-error-light bg-error-light text-error-dark",
};

function variantToKey(stage: DealStage):
  | "neutral"
  | "slate"
  | "signal"
  | "success"
  | "warning"
  | "error" {
  return STAGE_VARIANTS[stage];
}

export function StageChangeControl({
  dealId,
  currentStage,
  stages,
  dealName,
  amount,
  currency,
  variant,
}: StageChangeControlProps) {
  const { changeStage, isPending, error, clearError } = useStageChange({
    dealId,
    currentStage,
    mode: "pending",
  });
  const [modal, setModal] = useState<OutcomeStage | null>(null);

  const variantKey = variantToKey(currentStage);

  // Controlled select: `value` is always the server-authoritative
  // `currentStage` prop, so selecting an outcome stage (close-won/lost)
  // opens a modal without committing the visual change until the modal's
  // confirm → changeStage → revalidate flow completes.
  const triggerClass =
    variant === "badge"
      ? `inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium appearance-none cursor-pointer transition-colors duration-fast ease-out-soft focus:outline-none focus:shadow-[0_0_0_3px_var(--ring-focus)] pr-7 bg-[image:linear-gradient(45deg,transparent_50%,currentColor_50%),linear-gradient(135deg,currentColor_50%,transparent_50%)] bg-[size:4px_4px,4px_4px] bg-[position:calc(100%-12px)_55%,calc(100%-8px)_55%] bg-no-repeat ${VARIANT_CLASS[variantKey]} ${
          isPending ? "opacity-60 cursor-wait" : ""
        }`
      : `inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium appearance-none cursor-pointer transition-colors duration-fast ease-out-soft focus:outline-none focus:shadow-[0_0_0_3px_var(--ring-focus)] pr-7 bg-[image:linear-gradient(45deg,transparent_50%,currentColor_50%),linear-gradient(135deg,currentColor_50%,transparent_50%)] bg-[size:4px_4px,4px_4px] bg-[position:calc(100%-12px)_55%,calc(100%-8px)_55%] bg-no-repeat ${VARIANT_CLASS[variantKey]} ${
          isPending ? "opacity-60 cursor-wait" : ""
        }`;

  async function handleSelect(value: string) {
    if (value === currentStage) return;
    if (value === "closed_won") {
      setModal("closed_won");
      return;
    }
    if (value === "closed_lost") {
      setModal("closed_lost");
      return;
    }
    // Non-outcome stages — fire immediately.
    clearError();
    await changeStage(value as DealStage);
  }

  return (
    <>
      <div className="inline-flex flex-col gap-1">
        <select
          aria-label="Change stage"
          value={currentStage}
          disabled={isPending}
          onChange={(e) => void handleSelect(e.target.value)}
          className={triggerClass}
        >
          {stages.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
        {error && !modal && (
          <span className="text-error text-xs" role="alert">
            {error}
          </span>
        )}
      </div>

      <CloseWonModal
        open={modal === "closed_won"}
        onOpenChange={(o) => {
          if (!o) {
            setModal(null);
            clearError();
          }
        }}
        dealName={dealName}
        amount={amount}
        currency={currency}
        isPending={isPending}
        error={error}
        onConfirm={async ({ closeDate }) => {
          const result = await changeStage("closed_won", { closeDate });
          return result.success;
        }}
      />

      <CloseLostModal
        open={modal === "closed_lost"}
        onOpenChange={(o) => {
          if (!o) {
            setModal(null);
            clearError();
          }
        }}
        dealName={dealName}
        isPending={isPending}
        error={error}
        onConfirm={async ({ note }) => {
          const result = await changeStage("closed_lost", {
            closeLostNote: note,
          });
          return result.success;
        }}
      />
    </>
  );
}
