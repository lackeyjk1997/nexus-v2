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
import { Label } from "@/components/ui/label";

export interface CloseLostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealName: string;
  /** Resolves with `true` on success; closes modal on true. */
  onConfirm: (input: { note: string }) => Promise<boolean>;
  isPending: boolean;
  error: string | null;
}

export function CloseLostModal({
  open,
  onOpenChange,
  dealName,
  onConfirm,
  isPending,
  error,
}: CloseLostModalProps) {
  const [note, setNote] = useState<string>("");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!isPending) onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close lost — {dealName}</DialogTitle>
          <DialogDescription>
            Preliminary note. Captures a rep-owned first reaction before the
            full close-lost analysis runs.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="closeLostNote">What happened?</Label>
            <textarea
              id="closeLostNote"
              rows={5}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="A few sentences in your own words — full analysis runs after."
              className="bg-surface text-primary border-subtle focus:border-accent flex min-h-24 w-full rounded-md border px-3 py-2 text-sm transition-colors duration-fast ease-out-soft focus:shadow-[0_0_0_3px_var(--ring-focus)] focus:outline-none"
            />
          </div>

          <p className="text-tertiary bg-muted border-subtle rounded-md border p-3 text-xs leading-relaxed">
            <span className="text-primary font-medium">Next:</span>{" "}
            Close-lost analysis will run here — AI reads the deal&apos;s full
            context (MEDDPICC gaps, stakeholder engagement, timeline,
            transcripts) and produces a hypothesis for you to react to.
            Landing Phase 5 per DECISIONS.md §1.1.
          </p>

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
            disabled={isPending || note.trim().length === 0}
            onClick={async () => {
              const ok = await onConfirm({ note });
              if (ok) onOpenChange(false);
            }}
          >
            {isPending ? "Saving…" : "Confirm close lost"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
