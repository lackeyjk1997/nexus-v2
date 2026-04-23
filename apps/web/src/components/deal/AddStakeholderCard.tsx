"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import type { Contact, ContactRole } from "@nexus/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_LABELS } from "./stakeholder-display";
import type { StakeholderActionState } from "./StakeholderManageCard";

const SELECT_CLASS =
  "bg-surface text-primary flex h-10 w-full rounded-md border border-subtle px-3 py-2 text-sm transition-colors duration-fast ease-out-soft focus:border-accent focus:shadow-[0_0_0_3px_var(--ring-focus)] focus:outline-none";

export interface AddStakeholderCardProps {
  dealId: string;
  candidateContacts: Contact[];
  roles: readonly ContactRole[];
  addExistingAction: (
    state: StakeholderActionState,
    formData: FormData,
  ) => Promise<StakeholderActionState>;
  createAndAddAction: (
    state: StakeholderActionState,
    formData: FormData,
  ) => Promise<StakeholderActionState>;
  onDone: () => void;
}

function AddExistingSubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? "Adding…" : "Add to deal"}
    </Button>
  );
}

function CreateNewSubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? "Creating…" : "Create & add to deal"}
    </Button>
  );
}

export function AddStakeholderCard({
  dealId,
  candidateContacts,
  roles,
  addExistingAction,
  createAndAddAction,
  onDone,
}: AddStakeholderCardProps) {
  const [tab, setTab] = useState<"existing" | "new">("existing");

  const [existingState, existingFormAction] = useFormState<
    StakeholderActionState,
    FormData
  >(addExistingAction, {});
  const [createState, createFormAction] = useFormState<
    StakeholderActionState,
    FormData
  >(createAndAddAction, {});

  // Required-selection state (no silent default per Session-A resolution #1).
  const [existingContactId, setExistingContactId] = useState("");
  const [existingRole, setExistingRole] = useState<"" | ContactRole>("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newRole, setNewRole] = useState<"" | ContactRole>("");

  useEffect(() => {
    if (existingState.success || createState.success) onDone();
  }, [existingState.success, createState.success, onDone]);

  const createDisabled =
    newRole === "" ||
    newEmail.trim().length === 0 ||
    newFirstName.trim().length === 0 ||
    newLastName.trim().length === 0;

  return (
    <div className="bg-muted flex flex-col gap-4 rounded-md border border-subtle p-4">
      <div
        role="tablist"
        aria-label="Add stakeholder"
        className="flex items-center gap-2"
      >
        <Button
          type="button"
          variant={tab === "existing" ? "secondary" : "ghost"}
          size="sm"
          role="tab"
          aria-selected={tab === "existing"}
          onClick={() => setTab("existing")}
        >
          Existing contact
        </Button>
        <Button
          type="button"
          variant={tab === "new" ? "secondary" : "ghost"}
          size="sm"
          role="tab"
          aria-selected={tab === "new"}
          onClick={() => setTab("new")}
        >
          Create new
        </Button>
        <div className="flex-1" />
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>

      {tab === "existing" && (
        <form action={existingFormAction} className="flex flex-col gap-4">
          <input type="hidden" name="__dealId" value={dealId} readOnly />
          <div className="space-y-2">
            <Label htmlFor="existingContactId">Contact at this company</Label>
            <select
              id="existingContactId"
              name="contactId"
              required
              value={existingContactId}
              onChange={(e) => setExistingContactId(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="" disabled>
                {candidateContacts.length === 0
                  ? "No other contacts in this company."
                  : "Select a contact…"}
              </option>
              {candidateContacts.map((c) => {
                const fullName =
                  [c.firstName, c.lastName].filter(Boolean).join(" ") ||
                  c.email ||
                  c.hubspotId;
                const tail = [c.title, c.email].filter(Boolean).join(" · ");
                return (
                  <option key={c.hubspotId} value={c.hubspotId}>
                    {fullName}
                    {tail && ` — ${tail}`}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="existingRole">Role on this deal</Label>
            <select
              id="existingRole"
              name="role"
              required
              value={existingRole}
              onChange={(e) =>
                setExistingRole(e.target.value as "" | ContactRole)
              }
              className={SELECT_CLASS}
            >
              <option value="" disabled>
                Pick a role…
              </option>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>

          {existingState.error && (
            <p className="text-error text-sm" role="alert">
              {existingState.error}
            </p>
          )}

          <div className="flex justify-end">
            <AddExistingSubmit
              disabled={
                existingContactId === "" ||
                existingRole === "" ||
                candidateContacts.length === 0
              }
            />
          </div>
        </form>
      )}

      {tab === "new" && (
        <form action={createFormAction} className="flex flex-col gap-4">
          <input type="hidden" name="__dealId" value={dealId} readOnly />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="newFirstName">First name</Label>
              <Input
                id="newFirstName"
                name="firstName"
                required
                autoComplete="off"
                value={newFirstName}
                onChange={(e) => setNewFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newLastName">Last name</Label>
              <Input
                id="newLastName"
                name="lastName"
                required
                autoComplete="off"
                value={newLastName}
                onChange={(e) => setNewLastName(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="newEmail">Email</Label>
              <Input
                id="newEmail"
                name="email"
                type="email"
                required
                autoComplete="off"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newTitle">Title</Label>
              <Input
                id="newTitle"
                name="title"
                autoComplete="off"
                placeholder="Chief of Surgery"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="newRole">Role on this deal</Label>
            <select
              id="newRole"
              name="role"
              required
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as "" | ContactRole)}
              className={SELECT_CLASS}
            >
              <option value="" disabled>
                Pick a role…
              </option>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>

          {createState.error && (
            <p className="text-error text-sm" role="alert">
              {createState.error}
            </p>
          )}

          <div className="flex justify-end">
            <CreateNewSubmit disabled={createDisabled} />
          </div>
        </form>
      )}
    </div>
  );
}
