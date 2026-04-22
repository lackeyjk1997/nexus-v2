"use client";

import { useFormState, useFormStatus } from "react-dom";

import type { MeddpiccDimension, MeddpiccRecord } from "@nexus/shared";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MEDDPICC_HINTS,
  MEDDPICC_LABELS,
  MEDDPICC_SCORE_MAX,
  MEDDPICC_SCORE_MIN,
} from "./meddpicc-display";

export interface MeddpiccEditFormState {
  error?: string;
}

export interface MeddpiccEditCardProps {
  dealId: string;
  /**
   * Canonical tuple of dimensions, passed from the server component that
   * imports it from `@nexus/shared`. Avoids a runtime-value import of
   * `MEDDPICC_DIMENSION` from `@nexus/shared` inside this client component
   * (the barrel transitively imports `postgres`, which can't bundle to a
   * browser chunk — DECISIONS.md §2.10 / Guardrail 15).
   */
  dimensions: readonly MeddpiccDimension[];
  current: MeddpiccRecord | null;
  action: (
    state: MeddpiccEditFormState,
    formData: FormData,
  ) => Promise<MeddpiccEditFormState>;
  savedJustNow?: boolean;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save MEDDPICC"}
    </Button>
  );
}

export function MeddpiccEditCard({
  dealId,
  dimensions,
  current,
  action,
  savedJustNow,
}: MeddpiccEditCardProps) {
  const [state, formAction] = useFormState<MeddpiccEditFormState, FormData>(
    action,
    {},
  );

  const overall = current?.overallScore;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle>MEDDPICC</CardTitle>
          <CardDescription>
            Score each dimension 0–10. Evidence is free text — paste the line
            from the transcript, or jot a reminder. Writes to Nexus
            {" "}
            <code className="text-primary font-mono text-xs">
              meddpicc_scores
            </code>
            ; HubSpot custom-property sync lands Phase 3 Day 2.
          </CardDescription>
        </div>
        {typeof overall === "number" && (
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="text-tertiary text-xs uppercase tracking-wide">
              Overall
            </span>
            <span className="text-primary font-mono text-2xl tabular-nums">
              {overall}
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-6">
          <input type="hidden" name="__dealId" value={dealId} readOnly />
          {savedJustNow && (
            <div className="bg-signal-50 text-signal-700 rounded-md border border-signal-200 px-4 py-2 text-sm">
              MEDDPICC saved.
            </div>
          )}

          <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-2">
            {dimensions.map((dim: MeddpiccDimension) => {
              const scoreName = `score_${dim}`;
              const evidenceName = `evidence_${dim}`;
              const scoreValue = current?.scores[dim];
              const evidenceValue = current?.evidence[dim] ?? "";
              return (
                <div key={dim} className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <Label htmlFor={scoreName} className="text-base">
                      {MEDDPICC_LABELS[dim]}
                    </Label>
                    <span className="text-tertiary text-xs">0–10</span>
                  </div>
                  <p className="text-tertiary text-xs leading-snug">
                    {MEDDPICC_HINTS[dim]}
                  </p>
                  <Input
                    id={scoreName}
                    name={scoreName}
                    type="number"
                    inputMode="numeric"
                    min={MEDDPICC_SCORE_MIN}
                    max={MEDDPICC_SCORE_MAX}
                    step={1}
                    placeholder="—"
                    defaultValue={
                      typeof scoreValue === "number" ? scoreValue : ""
                    }
                    className="max-w-24"
                  />
                  <textarea
                    id={evidenceName}
                    name={evidenceName}
                    rows={3}
                    placeholder="Evidence from a transcript, email, or your own notes…"
                    defaultValue={evidenceValue}
                    className="bg-surface text-primary border-subtle focus:border-accent flex min-h-20 w-full rounded-md border px-3 py-2 text-sm transition-colors duration-fast ease-out-soft focus:shadow-[0_0_0_3px_var(--ring-focus)] focus:outline-none"
                  />
                </div>
              );
            })}
          </div>

          {state?.error && (
            <p className="text-error text-sm" role="alert">
              {state.error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <SubmitButton />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
