import type { ContactRole } from "@nexus/shared";

/**
 * Human labels for the 9 ContactRole values. Separate from the canonical
 * enum tuple (packages/shared/src/enums/contact-role.ts) so future copy
 * changes don't touch the schema source.
 */
export const ROLE_LABELS: Record<ContactRole, string> = {
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
