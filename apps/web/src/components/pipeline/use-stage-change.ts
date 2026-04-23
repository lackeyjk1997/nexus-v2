"use client";

import { useCallback, useState, useTransition } from "react";

import type { DealStage } from "@nexus/shared";

import {
  stageChangeAction,
  type StageChangeResult,
} from "@/app/actions/stage-change";

export interface UseStageChangeOptions {
  dealId: string;
  currentStage: DealStage;
  /**
   * Semantic hint for the caller's visual treatment. Does NOT change the
   * hook's internal mechanics today — both modes expose `pendingStage` +
   * `isPending` + `error`, and the caller picks which to render on. Kept
   * as metadata for future per-mode tuning; if ever the hook starts
   * branching on mode, re-evaluate the abstraction per the session-B
   * contract.
   */
  mode?: "optimistic" | "pending";
}

export interface UseStageChangeReturn {
  changeStage: (
    newStage: DealStage,
    opts?: { closeDate?: string; closeLostNote?: string },
  ) => Promise<StageChangeResult>;
  isPending: boolean;
  error: string | null;
  pendingStage: DealStage | null;
  clearError: () => void;
}

/**
 * Shared stage-change orchestration across kanban DnD, detail-header
 * dropdown, and PipelineTable row chevron.
 *
 *  - kanban (mode: 'optimistic'): the caller swaps the card visually on
 *    drop, then invokes `changeStage` + rolls back on `error`.
 *  - dropdown / table (mode: 'pending'): the caller shows a disabled /
 *    spinning state keyed off `isPending` while the action runs.
 *
 * The hook wraps the server action in `useTransition` so `isPending` is
 * true from invocation through `revalidatePath` + server-component
 * re-render. On failure, `error` carries the message for surface-specific
 * rendering; the caller clears via `clearError`.
 */
export function useStageChange({
  dealId,
  currentStage: _currentStage,
  mode: _mode = "pending",
}: UseStageChangeOptions): UseStageChangeReturn {
  const [isPending, startTransition] = useTransition();
  const [pendingStage, setPendingStage] = useState<DealStage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const changeStage = useCallback(
    (
      newStage: DealStage,
      opts?: { closeDate?: string; closeLostNote?: string },
    ): Promise<StageChangeResult> => {
      setError(null);
      setPendingStage(newStage);
      return new Promise<StageChangeResult>((resolve) => {
        startTransition(async () => {
          const result = await stageChangeAction({
            dealId,
            newStage,
            closeDate: opts?.closeDate,
            closeLostNote: opts?.closeLostNote,
          });
          if (!result.success) {
            setError(result.error);
          }
          setPendingStage(null);
          resolve(result);
        });
      });
    },
    [dealId],
  );

  const clearError = useCallback(() => setError(null), []);

  return { changeStage, isPending, error, pendingStage, clearError };
}
