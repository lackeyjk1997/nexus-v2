/**
 * CrmAdapter — canonical interface for all CRM data access.
 *
 * v2 ships ONE implementation: HubSpotAdapter (packages/shared/src/crm/hubspot/).
 * Future SalesforceAdapter and tests' MockCrmAdapter implement the same shape.
 *
 * Source: 07B Section 2 (handoff, read-only). Any amendment must land in
 * docs/DECISIONS.md and update both 07B and this file together.
 *
 * Day-5 skeleton scope (DECISIONS.md 2.18.1):
 *   Live: healthCheck, listDeals, createDeal, updateDealStage, getDeal,
 *         bulkSyncDeals, bulkSyncContacts, bulkSyncCompanies,
 *         parseWebhookPayload, handleWebhookEvent, invalidateCache.
 *   Not implemented: every other method throws CrmNotImplementedError with the
 *   method name + expected phase.
 */

import type {
  BulkSyncResult,
  Company,
  Contact,
  ContactRole,
  Deal,
  DealResolution,
  DealStage,
  DealStageTransition,
  Engagement,
  EngagementType,
  HealthStatus,
  HubSpotId,
  StakeholderResolution,
  Vertical,
  WebhookEvent,
} from "./types";

export interface CrmAdapter {
  // ─── Deal CRUD ───────────────────────────────────────

  createDeal(input: {
    name: string;
    companyId: HubSpotId;
    primaryContactId?: HubSpotId;
    ownerId?: HubSpotId;
    stage: DealStage;
    amount?: number;
    closeDate?: Date;
    vertical?: Vertical;
    customProperties?: Record<string, unknown>;
  }): Promise<Deal>;

  getDeal(hubspotId: HubSpotId): Promise<Deal>;

  updateDeal(
    hubspotId: HubSpotId,
    fields: Partial<
      Omit<
        Deal,
        "hubspotId" | "createdAt" | "updatedAt" | "customProperties" | "_meta"
      >
    >,
  ): Promise<Deal>;

  updateDealCustomProperties(
    hubspotId: HubSpotId,
    props: Record<string, unknown>,
  ): Promise<void>;

  listDeals(filters?: {
    ownerId?: HubSpotId;
    stage?: DealStage | DealStage[];
    vertical?: Vertical;
    closedSince?: Date;
    limit?: number;
  }): Promise<Deal[]>;

  deleteDeal(hubspotId: HubSpotId): Promise<void>;

  updateDealStage(
    hubspotId: HubSpotId,
    newStage: DealStage,
    options?: { reason?: string; closeDate?: Date },
  ): Promise<Deal>;

  getDealStageHistory(hubspotId: HubSpotId): Promise<DealStageTransition[]>;

  // ─── Contact CRUD ────────────────────────────────────

  createContact(input: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    title?: string;
    companyId?: HubSpotId;
    customProperties?: Record<string, unknown>;
  }): Promise<Contact>;

  getContact(hubspotId: HubSpotId): Promise<Contact>;

  upsertContact(input: {
    email: string;
    firstName: string;
    lastName: string;
    title?: string;
    companyId?: HubSpotId;
    customProperties?: Record<string, unknown>;
  }): Promise<Contact>;

  updateContact(
    hubspotId: HubSpotId,
    fields: Partial<
      Omit<
        Contact,
        "hubspotId" | "createdAt" | "updatedAt" | "customProperties" | "_meta"
      >
    >,
  ): Promise<Contact>;

  updateContactCustomProperties(
    hubspotId: HubSpotId,
    props: Record<string, unknown>,
  ): Promise<void>;

  listContacts(filters?: {
    companyId?: HubSpotId;
    email?: string;
    limit?: number;
  }): Promise<Contact[]>;

  listDealContacts(
    hubspotDealId: HubSpotId,
  ): Promise<Array<Contact & { role: ContactRole | null; isPrimary: boolean }>>;

  setContactRoleOnDeal(
    hubspotDealId: HubSpotId,
    hubspotContactId: HubSpotId,
    role: ContactRole | null,
    isPrimary?: boolean,
  ): Promise<void>;

  /**
   * Create a HubSpot Deal↔Contact association. Identity / association live in
   * HubSpot (DECISIONS.md §2.19); role metadata lives in Nexus. Adding a
   * stakeholder to a deal requires BOTH — an association here plus a
   * `deal_contact_roles` row via `setContactRoleOnDeal`.
   */
  associateDealContact(
    hubspotDealId: HubSpotId,
    hubspotContactId: HubSpotId,
    options?: { isPrimary?: boolean },
  ): Promise<void>;

  /**
   * Remove the HubSpot Deal↔Contact association. Does NOT delete the contact
   * itself — contact stays in HubSpot, only its link to this deal is severed.
   * Pair with `setContactRoleOnDeal(..., null)` for a full "remove from deal."
   */
  dissociateDealContact(
    hubspotDealId: HubSpotId,
    hubspotContactId: HubSpotId,
  ): Promise<void>;

  deleteContact(hubspotId: HubSpotId): Promise<void>;

  // ─── Company CRUD ────────────────────────────────────

  createCompany(input: {
    name: string;
    domain?: string;
    vertical?: Vertical;
    employeeCount?: number;
    annualRevenue?: number;
    customProperties?: Record<string, unknown>;
  }): Promise<Company>;

  getCompany(hubspotId: HubSpotId): Promise<Company>;

  upsertCompany(input: {
    domain: string;
    name: string;
    vertical?: Vertical;
    customProperties?: Record<string, unknown>;
  }): Promise<Company>;

  updateCompany(
    hubspotId: HubSpotId,
    fields: Partial<
      Omit<
        Company,
        "hubspotId" | "createdAt" | "updatedAt" | "customProperties" | "_meta"
      >
    >,
  ): Promise<Company>;

  updateCompanyCustomProperties(
    hubspotId: HubSpotId,
    props: Record<string, unknown>,
  ): Promise<void>;

  listCompanies(filters?: {
    vertical?: Vertical;
    domain?: string;
    limit?: number;
  }): Promise<Company[]>;

  deleteCompany(hubspotId: HubSpotId): Promise<void>;

  // ─── Engagements ─────────────────────────────────────

  logEngagement(input: {
    type: EngagementType;
    subject?: string;
    body?: string;
    timestamp?: Date;
    ownerId?: HubSpotId;
    associations: {
      dealIds?: HubSpotId[];
      contactIds?: HubSpotId[];
      companyIds?: HubSpotId[];
    };
    metadata?: Record<string, unknown>;
  }): Promise<Engagement>;

  getEngagement(hubspotId: HubSpotId): Promise<Engagement>;

  listEngagements(filters: {
    dealId?: HubSpotId;
    contactId?: HubSpotId;
    companyId?: HubSpotId;
    types?: EngagementType[];
    since?: Date;
    limit?: number;
  }): Promise<Engagement[]>;

  // ─── Resolution Helpers ──────────────────────────────

  resolveDeal(
    query: string,
    options?: { limit?: number; verticalFilter?: Vertical },
  ): Promise<DealResolution[]>;

  resolveStakeholder(
    speakerName: string,
    hubspotDealId: HubSpotId,
    options?: { speakerEmail?: string },
  ): Promise<StakeholderResolution>;

  // ─── Bulk Sync ───────────────────────────────────────

  bulkSyncDeals(options?: {
    since?: Date;
    pageSize?: number;
  }): Promise<BulkSyncResult>;

  bulkSyncContacts(options?: {
    since?: Date;
    pageSize?: number;
  }): Promise<BulkSyncResult>;

  bulkSyncCompanies(options?: {
    since?: Date;
    pageSize?: number;
  }): Promise<BulkSyncResult>;

  bulkSyncEngagements(options?: {
    since?: Date;
    pageSize?: number;
  }): Promise<BulkSyncResult>;

  // ─── Webhooks ────────────────────────────────────────

  /** Verify + parse a raw HubSpot webhook payload into typed events. Throws CrmAuthError on bad signature. */
  parseWebhookPayload(input: {
    rawBody: string;
    signature: string;
    timestamp: string;
    requestMethod: string;
    requestUri: string;
  }): Promise<WebhookEvent[]>;

  handleWebhookEvent(event: WebhookEvent): Promise<void>;

  // ─── Cache & Health ──────────────────────────────────

  invalidateCache(
    objectType: "deal" | "contact" | "company" | "engagement",
    hubspotId: HubSpotId,
  ): Promise<void>;

  healthCheck(): Promise<HealthStatus>;
}
