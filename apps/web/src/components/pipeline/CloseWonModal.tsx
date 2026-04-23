"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAmount } from "./stage-display";

export interface CloseWonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealName: string;
  amount: number | null;
  currency: string | null;
  /** Resolves with `true` on success; closes modal on true. */
  onConfirm: (input: { closeDate: string }) => Promise<boolean>;
  isPending: boolean;
  error: string | null;
}

function isoToday(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function CloseWonModal({
  open,
  onOpenChange,
  dealName,
  amount,
  currency,
  onConfirm,
  isPending,
  error,
}: CloseWonModalProps) {
  const [closeDate, setCloseDate] = useState<string>(isoToday());

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!isPending) onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close won — {dealName}</DialogTitle>
          <DialogDescription>
            Confirm the close date. Defaults to today; backdate when the verbal
            commit preceded the paperwork.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-tertiary text-xs uppercase tracking-wide">
              Amount
            </span>
            <span className="text-primary font-mono text-lg tabular-nums">
              {formatAmount(amount, currency)}
            </span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="closeWonDate">Close date</Label>
            <Input
              id="closeWonDate"
              type="date"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
              max="2099-12-31"
              required
            />
          </div>

          {error && (
            <p className="text-error text-sm" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isPending || closeDate.length === 0}
            onClick={async () => {
              const ok = await onConfirm({ closeDate });
              if (ok) onOpenChange(false);
            }}
          >
            {isPending ? "Saving…" : "Confirm close won"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
