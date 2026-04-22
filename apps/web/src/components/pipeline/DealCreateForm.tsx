"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";

import type { DealStage } from "@nexus/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STAGE_LABELS } from "./stage-display";

interface CompanyOption {
  hubspotId: string;
  name: string;
}

export interface DealCreateFormState {
  error?: string;
}

export interface DealCreateFormProps {
  companies: CompanyOption[];
  stages: readonly DealStage[];
  defaultStage: DealStage;
  action: (
    state: DealCreateFormState,
    formData: FormData,
  ) => Promise<DealCreateFormState>;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating…" : "Create deal"}
    </Button>
  );
}

export function DealCreateForm({
  companies,
  stages,
  defaultStage,
  action,
}: DealCreateFormProps) {
  const [state, formAction] = useActionState<DealCreateFormState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="space-y-2">
        <Label htmlFor="name">Deal name</Label>
        <Input
          id="name"
          name="name"
          required
          autoComplete="off"
          placeholder="Acme Epic integration"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="companyId">Company</Label>
        <select
          id="companyId"
          name="companyId"
          required
          defaultValue=""
          className="bg-surface text-primary flex h-10 w-full rounded-md border border-subtle px-3 py-2 text-sm transition-colors duration-fast ease-out-soft focus:border-accent focus:shadow-[0_0_0_3px_var(--ring-focus)] focus:outline-none"
        >
          <option value="" disabled>
            Select a company…
          </option>
          {companies.map((company) => (
            <option key={company.hubspotId} value={company.hubspotId}>
              {company.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="stage">Stage</Label>
          <select
            id="stage"
            name="stage"
            defaultValue={defaultStage}
            className="bg-surface text-primary flex h-10 w-full rounded-md border border-subtle px-3 py-2 text-sm transition-colors duration-fast ease-out-soft focus:border-accent focus:shadow-[0_0_0_3px_var(--ring-focus)] focus:outline-none"
          >
            {stages.map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="amount">Amount (USD)</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            inputMode="decimal"
            min={0}
            step={1000}
            placeholder="0"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="closeDate">Close date</Label>
        <Input id="closeDate" name="closeDate" type="date" />
      </div>

      {state?.error && (
        <p className="text-error text-sm" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button asChild variant="ghost">
          <Link href="/pipeline">Cancel</Link>
        </Button>
        <SubmitButton />
      </div>
    </form>
  );
}
