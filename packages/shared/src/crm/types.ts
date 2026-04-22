/**
 * CrmAdapter types. Verbatim from 07B Section 2 with minor Day-5 tightenings:
 * `DealStage` is a union of the 9 internal names from 07C Section 2.2, not an
 * open `string`. Every `Deal` carries a `_meta` staleness indicator per 07C 7.7.
 *
 * Phase 2 Day 1: `Vertical` and `ContactRole` moved to
 * packages/shared/src/enums/ and re-exported here so the DB enum + the app
 * type share one source (Guardrail 22). `DealStage` / `DEAL_STAGES` remain
 * here until the schema `deal_stage` enum is reconciled (schema.ts currently
 * has `"prospect"` as the first value; HubSpot + canonical code use
 * `"new_lead"` — drift resolved via migration in Phase 2 Day 2 per parked
 * item).
 */

import { CONTACT_ROLE, type ContactRole } from "../enums/contact-role";
import { VERTICAL, type Vertical } from "../enums/vertical";

export type HubSpotId = string;

export { CONTACT_ROLE, VERTICAL };
export type { ContactRole, Vertical };

export const DEAL_STAGES = [
  "new_lead",
  "qualified",
  "discovery",
  "technical_validation",
  "proposal",
  "negotiation",
  "closing",
  "closed_won",
  "closed_lost",
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

export type EngagementType = "email" | "call" | "meeting" | "note" | "task";

export interface CacheMeta {
  /** When the cache row was last written from HubSpot. */
  cachedAt: Date;
  /** `(now - cachedAt) > 5 minutes` — used by the staleness UI (07C 7.7). */
  isStale: boolean;
}

export interface Company {
  hubspotId: HubSpotId;
  name: string;
  domain: string | null;
  industry: string | null;
  vertical: Vertical | null;
  employeeCount: number | null;
  annualRevenue: number | null;
  techStack: string[];
  hqLocation: string | null;
  description: string | null;
  enrichmentSource: "apollo" | "clearbit" | "simulated" | null;
  createdAt: Date;
  updatedAt: Date;
  customProperties: Record<string, unknown>;
  _meta?: CacheMeta;
}

export interface Contact {
  hubspotId: HubSpotId;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  linkedinUrl: string | null;
  companyId: HubSpotId | null;
  createdAt: Date;
  updatedAt: Date;
  customProperties: Record<string, unknown>;
  _meta?: CacheMeta;
}

export interface DealContactRole {
  hubspotContactId: HubSpotId;
  role: ContactRole | null;
  isPrimary: boolean;
}

export interface Deal {
  hubspotId: HubSpotId;
  name: string;
  companyId: HubSpotId | null;
  primaryContactId: HubSpotId | null;
  ownerId: HubSpotId | null;
  bdrOwnerId: HubSpotId | null;
  saOwnerId: HubSpotId | null;
  stage: DealStage;
  amount: number | null;
  currency: string | null;
  closeDate: Date | null;
  winProbability: number | null;
  forecastCategory: string | null;
  vertical: Vertical | null;
  product: string | null;
  leadSource: string | null;
  primaryCompetitor: string | null;
  lossReason: string | null;
  closeCompetitor: string | null;
  closeNotes: string | null;
  closeImprovement: string | null;
  winTurningPoint: string | null;
  winReplicable: string | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  customProperties: Record<string, unknown>;
  _meta?: CacheMeta;
}

export interface Engagement {
  hubspotId: HubSpotId;
  type: EngagementType;
  subject: string | null;
  body: string | null;
  timestamp: Date;
  ownerId: HubSpotId | null;
  associations: {
    dealIds: HubSpotId[];
    contactIds: HubSpotId[];
    companyIds: HubSpotId[];
  };
  metadata: Record<string, unknown>;
}

export interface DealStageTransition {
  fromStage: DealStage | null;
  toStage: DealStage;
  changedAt: Date;
  changedByOwnerId: HubSpotId | null;
}

export interface DealResolution {
  hubspotId: HubSpotId;
  name: string;
  companyName: string;
  stage: DealStage;
  matchScore: number;
}

export interface StakeholderResolution {
  hubspotContactId: HubSpotId | null;
  matchedName: string | null;
  confidence: number;
  reason:
    | "exact_email"
    | "exact_name"
    | "fuzzy_name"
    | "title_match"
    | "no_match";
}

export interface WebhookEvent {
  eventType: string;
  objectType: "deal" | "contact" | "company" | "engagement";
  objectId: HubSpotId;
  propertyName?: string;
  newValue?: unknown;
  oldValue?: unknown;
  occurredAt: Date;
  portalId: HubSpotId;
}

export interface BulkSyncResult {
  synced: number;
  failed: number;
}

export interface HealthStatus {
  status: "ok" | "degraded" | "down";
  latencyMs: number;
  rateLimitRemaining: number | null;
}
