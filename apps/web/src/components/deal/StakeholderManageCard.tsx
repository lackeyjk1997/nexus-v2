"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import type { Contact, ContactRole } from "@nexus/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AddStakeholderCard } from "./AddStakeholderCard";
import { ROLE_LABELS } from "./stakeholder-display";

export interface StakeholderActionState {
  error?: string;
  success?: boolean;
}

export type StakeholderRow = Contact & {
  role: ContactRole | null;
  isPrimary: boolean;
};

export interface StakeholderManageCardProps {
  dealId: string;
  stakeholders: StakeholderRow[];
  candidateContacts: Contact[];
  /**
   * Canonical tuple, passed from the server component that imports it from
   * `@nexus/shared`. Client components must not runtime-import enums from the
   * barrel (DECISIONS.md §2.10 / Guardrail 15 — the `postgres` module would
   * bundle to the browser chunk otherwise).
   */
  roles: readonly ContactRole[];
  addExistingAction: (
    state: StakeholderActionState,
    formData: FormData,
  ) => Promise<StakeholderActionState>;
  createAndAddAction: (
    state: StakeholderActionState,
    formData: FormData,
  ) => Promise<StakeholderActionState>;
  updateRoleAction: (formData: FormData) => Promise<void>;
  removeAction: (formData: FormData) => Promise<void>;
}

const SELECT_CLASS =
  "bg-surface text-primary flex h-10 w-full rounded-md border border-subtle px-3 py-2 text-sm transition-colors duration-fast ease-out-soft focus:border-accent focus:shadow-[0_0_0_3px_var(--ring-focus)] focus:outline-none";

function RemoveSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      size="sm"
      disabled={pending}
      className="text-tertiary hover:text-error"
    >
      {pending ? "Removing…" : "Remove from deal"}
    </Button>
  );
}

export function StakeholderManageCard({
  dealId,
  stakeholders,
  candidateContacts,
  roles,
  addExistingAction,
  createAndAddAction,
  updateRoleAction,
  removeAction,
}: StakeholderManageCardProps) {
  const [addOpen, setAddOpen] = useState(false);

  const sorted = [...stakeholders].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.lastName.localeCompare(b.lastName);
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle>Stakeholders</CardTitle>
          <CardDescription>
            Identity lives in HubSpot; role + primary flag live in Nexus{" "}
            <code className="text-primary font-mono text-xs">
              deal_contact_roles
            </code>
            . Removing from the deal leaves the HubSpot contact untouched.
          </CardDescription>
        </div>
        {!addOpen && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAddOpen(true)}
          >
            Add stakeholder
          </Button>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        {sorted.length === 0 ? (
          <p className="text-tertiary text-sm">
            No stakeholders on this deal yet.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--border-subtle)]">
            {sorted.map((c) => {
              const fullName =
                [c.firstName, c.lastName].filter(Boolean).join(" ") ||
                c.email ||
                c.hubspotId;
              return (
                <li
                  key={c.hubspotId}
                  className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-primary text-sm font-medium">
                      {fullName}
                    </span>
                    <span className="text-tertiary text-xs">
                      {[c.title, c.email].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </div>
                  {c.isPrimary && <Badge variant="signal">Primary</Badge>}
                  <form
                    action={updateRoleAction}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="hidden"
                      name="__dealId"
                      value={dealId}
                      readOnly
                    />
                    <input
                      type="hidden"
                      name="__contactId"
                      value={c.hubspotId}
                      readOnly
                    />
                    <label
                      htmlFor={`role-${c.hubspotId}`}
                      className="sr-only"
                    >
                      Role
                    </label>
                    <select
                      id={`role-${c.hubspotId}`}
                      name="role"
                      defaultValue={c.role ?? ""}
                      onChange={(e) => e.currentTarget.form?.requestSubmit()}
                      className={`${SELECT_CLASS} h-9 w-44`}
                    >
                      {c.role === null && (
                        <option value="" disabled>
                          Pick a role…
                        </option>
                      )}
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </form>
                  <form action={removeAction}>
                    <input
                      type="hidden"
                      name="__dealId"
                      value={dealId}
                      readOnly
                    />
                    <input
                      type="hidden"
                      name="__contactId"
                      value={c.hubspotId}
                      readOnly
                    />
                    <RemoveSubmit />
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        {addOpen && (
          <AddStakeholderCard
            dealId={dealId}
            candidateContacts={candidateContacts}
            roles={roles}
            addExistingAction={addExistingAction}
            createAndAddAction={createAndAddAction}
            onDone={() => setAddOpen(false)}
          />
        )}
      </CardContent>
    </Card>
  );
}
