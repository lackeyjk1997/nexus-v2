import type { Contact, ContactRole } from "@nexus/shared";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type StakeholderRow = Contact & {
  role: ContactRole | null;
  isPrimary: boolean;
};

const ROLE_LABELS: Record<ContactRole, string> = {
  champion: "Champion",
  economic_buyer: "Economic Buyer",
  decision_maker: "Decision Maker",
  technical_evaluator: "Technical Evaluator",
  end_user: "End User",
  procurement: "Procurement",
  influencer: "Influencer",
  blocker: "Blocker",
  coach: "Coach",
};

interface StakeholderPreviewProps {
  contacts: StakeholderRow[];
}

/**
 * Read-only stakeholder preview. Stakeholder management (add/remove, role
 * assignment) lands Phase 2 Day 4 via `setContactRoleOnDeal`.
 */
export function StakeholderPreview({ contacts }: StakeholderPreviewProps) {
  // Sort: primary first, then by last name.
  const sorted = [...contacts].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.lastName.localeCompare(b.lastName);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stakeholders</CardTitle>
        <CardDescription>
          {sorted.length === 0
            ? "No contacts associated with this deal in HubSpot yet."
            : `${sorted.length} contact${sorted.length === 1 ? "" : "s"} from HubSpot. Role metadata lives in Nexus \`deal_contact_roles\`.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sorted.length > 0 && (
          <ul className="flex flex-col divide-y divide-[var(--border-subtle)]">
            {sorted.map((c) => {
              const fullName = [c.firstName, c.lastName]
                .filter(Boolean)
                .join(" ");
              return (
                <li
                  key={c.hubspotId}
                  className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-primary text-sm font-medium">
                      {fullName || c.email || c.hubspotId}
                    </span>
                    <span className="text-tertiary text-xs">
                      {[c.title, c.email].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </div>
                  {c.isPrimary && <Badge variant="signal">Primary</Badge>}
                  {c.role && (
                    <Badge variant="slate">{ROLE_LABELS[c.role]}</Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
