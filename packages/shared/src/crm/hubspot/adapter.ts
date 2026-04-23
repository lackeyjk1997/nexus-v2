/**
 * HubSpotAdapter — implementation of CrmAdapter for Phase 1 Day 5.
 *
 * Scope (DECISIONS.md 2.18.1, 07C §8 Steps 1–10):
 *   LIVE (11):
 *     healthCheck, listDeals, createDeal, updateDealStage, getDeal,
 *     bulkSyncDeals, bulkSyncContacts, bulkSyncCompanies,
 *     parseWebhookPayload, handleWebhookEvent, invalidateCache.
 *   NOT IMPLEMENTED (everything else): throws CrmNotImplementedError with
 *   expected phase (following Day-3's job-handler pattern).
 *
 * Cache: Postgres `hubspot_cache` table. TTL per 07C §7.6 (deal/contact 60 min,
 * company 4 hr). Writes invalidate by setting ttl_expires_at = now().
 */

import postgres from "postgres";

import {
  CrmAuthError,
  CrmNotFoundError,
  CrmNotImplementedError,
  CrmTransientError,
  CrmValidationError,
} from "../errors";
import type { CrmAdapter } from "../adapter";
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
} from "../types";
import { DEAL_STAGES } from "../types";
import { StakeholderService } from "../../services/stakeholders";
import { HubSpotClient } from "./client";
import {
  buildCacheMeta,
  mapHubSpotCompany,
  mapHubSpotContact,
  mapHubSpotDeal,
  type HubSpotObject,
} from "./mappers";
import type { PipelineIdsFile } from "./pipeline-ids";
import { verifyHubSpotSignature } from "./webhook-verify";

export interface HubSpotAdapterOptions {
  token: string;
  portalId: string;
  clientSecret: string;
  pipelineIds: PipelineIdsFile;
  databaseUrl: string;
  /** Inject a pre-built postgres client (tests, reuse across requests). */
  sql?: postgres.Sql;
  /** Test override for HubSpotClient. */
  httpClient?: HubSpotClient;
}

const CACHE_TTL_MS: Record<"deal" | "contact" | "company" | "engagement", number> = {
  deal: 60 * 60 * 1000,
  contact: 60 * 60 * 1000,
  company: 4 * 60 * 60 * 1000,
  engagement: 5 * 60 * 1000,
};

const URL_PATH: Record<"deal" | "contact" | "company" | "engagement", string> = {
  deal: "deals",
  contact: "contacts",
  company: "companies",
  engagement: "engagements",
};

const DEAL_PROPS_TO_FETCH = [
  "dealname",
  "dealstage",
  "amount",
  "closedate",
  "pipeline",
  "hubspot_owner_id",
  "deal_currency_code",
  "hs_deal_stage_probability",
  "hs_forecast_category",
  "hs_closed_won_date",
  "hs_lastmodifieddate",
  "closed_lost_reason",
  "nexus_vertical",
  "nexus_product",
  "nexus_lead_source",
  "nexus_primary_competitor",
  "nexus_close_competitor",
  "nexus_close_notes",
  "nexus_close_improvement",
  "nexus_win_turning_point",
  "nexus_win_replicable",
  "nexus_meddpicc_score",
  "nexus_meddpicc_metrics_score",
  "nexus_meddpicc_eb_score",
  "nexus_meddpicc_dc_score",
  "nexus_meddpicc_dp_score",
  "nexus_meddpicc_pain_score",
  "nexus_meddpicc_champion_score",
  "nexus_meddpicc_competition_score",
  // Added Pre-Phase 3 Session 0-C (foundation-review W1). Closes the
  // schema/HubSpot 7-vs-8 MEDDPICC drift.
  "nexus_meddpicc_paper_process_score",
  "nexus_fitness_score",
  "nexus_fitness_velocity",
  "nexus_lead_score",
  "nexus_renewal_date",
  "nexus_next_qbr_date",
  "nexus_onboarding_complete",
  "nexus_products_purchased",
  "nexus_bdr_owner_id",
  "nexus_sa_owner_id",
  "nexus_last_analysis_at",
  "nexus_internal_event_count",
];

const CONTACT_PROPS_TO_FETCH = [
  "firstname",
  "lastname",
  "email",
  "phone",
  "jobtitle",
  "nexus_role_in_deal",
  "nexus_linkedin_url",
  "nexus_engagement_status",
  "nexus_first_observed_in_nexus",
  "nexus_internal_person_id",
];

const COMPANY_PROPS_TO_FETCH = [
  "name",
  "domain",
  "industry",
  "numberofemployees",
  "annualrevenue",
  "city",
  "state",
  "country",
  "description",
  "nexus_vertical",
  "nexus_tech_stack",
  "nexus_enrichment_source",
  "nexus_account_health_score",
  "nexus_internal_company_intelligence_id",
];

export class HubSpotAdapter implements CrmAdapter {
  private readonly http: HubSpotClient;
  private readonly sql: postgres.Sql;
  private readonly ownedSql: boolean;
  private readonly clientSecret: string;
  private readonly portalId: string;
  private readonly stageIdToInternal: Map<string, DealStage>;
  private readonly internalToStageId: Map<DealStage, string>;
  private readonly pipelineId: string | null;

  constructor(options: HubSpotAdapterOptions) {
    this.http =
      options.httpClient ??
      new HubSpotClient({ token: options.token });
    this.ownedSql = options.sql === undefined;
    this.sql =
      options.sql ??
      postgres(options.databaseUrl, {
        max: 2,
        idle_timeout: 30,
        prepare: false,
      });
    this.clientSecret = options.clientSecret;
    this.portalId = options.portalId;

    this.stageIdToInternal = new Map();
    this.internalToStageId = new Map();
    this.pipelineId = options.pipelineIds.pipelineId;
    for (const [internal, hubspotId] of Object.entries(
      options.pipelineIds.stageIds,
    )) {
      if (!hubspotId) continue;
      this.stageIdToInternal.set(hubspotId, internal as DealStage);
      this.internalToStageId.set(internal as DealStage, hubspotId);
    }
  }

  /** Close the owned postgres pool if this adapter created it. No-op otherwise. */
  async close(): Promise<void> {
    if (this.ownedSql) await this.sql.end({ timeout: 5 });
  }

  // ─── Deal CRUD ───────────────────────────────────────────────────────

  async createDeal(input: {
    name: string;
    companyId: HubSpotId;
    primaryContactId?: HubSpotId;
    ownerId?: HubSpotId;
    stage: DealStage;
    amount?: number;
    closeDate?: Date;
    vertical?: Vertical;
    customProperties?: Record<string, unknown>;
  }): Promise<Deal> {
    if (!this.pipelineId) {
      throw new CrmValidationError(
        "HubSpot pipeline not provisioned; run scripts/hubspot-provision-pipeline.ts first.",
      );
    }
    const dealStageId = this.resolveStageId(input.stage);
    const properties: Record<string, unknown> = {
      dealname: input.name,
      pipeline: this.pipelineId,
      dealstage: dealStageId,
    };
    if (input.amount !== undefined) properties.amount = String(input.amount);
    if (input.closeDate)
      properties.closedate = input.closeDate.toISOString();
    if (input.ownerId) properties.hubspot_owner_id = input.ownerId;
    if (input.vertical) properties.nexus_vertical = input.vertical;
    for (const [key, value] of Object.entries(input.customProperties ?? {})) {
      properties[key] = this.serializePropertyValue(value);
    }

    const associations: Array<{
      to: { id: string };
      types: Array<{ associationCategory: string; associationTypeId: number }>;
    }> = [
      {
        to: { id: input.companyId },
        types: [
          {
            associationCategory: "HUBSPOT_DEFINED",
            associationTypeId: 341, // Deal → Company primary
          },
        ],
      },
    ];
    if (input.primaryContactId) {
      associations.push({
        to: { id: input.primaryContactId },
        types: [
          {
            associationCategory: "HUBSPOT_DEFINED",
            associationTypeId: 3, // Deal → Contact primary
          },
        ],
      });
    }

    const { body } = await this.http.request<HubSpotObject>({
      method: "POST",
      path: "/crm/v3/objects/deals",
      body: { properties, associations },
    });

    const obj = await this.fetchDealWithAssociations(body.id);
    const deal = mapHubSpotDeal(obj, this.stageIdToInternal);
    await this.writeCache("deal", deal.hubspotId, obj);
    return deal;
  }

  async getDeal(hubspotId: HubSpotId): Promise<Deal> {
    const cached = await this.readCache("deal", hubspotId);
    if (cached && !this.isExpired(cached)) {
      return mapHubSpotDeal(
        cached.payload,
        this.stageIdToInternal,
        buildCacheMeta(cached.cachedAt),
      );
    }
    const obj = await this.fetchDealWithAssociations(hubspotId);
    await this.writeCache("deal", hubspotId, obj);
    return mapHubSpotDeal(obj, this.stageIdToInternal);
  }

  updateDeal(): Promise<Deal> {
    throw new CrmNotImplementedError("updateDeal", "Phase 2 Day 1");
  }

  updateDealCustomProperties(): Promise<void> {
    throw new CrmNotImplementedError(
      "updateDealCustomProperties",
      "Phase 3 Day 3+",
    );
  }

  async listDeals(filters?: {
    ownerId?: HubSpotId;
    stage?: DealStage | DealStage[];
    vertical?: Vertical;
    closedSince?: Date;
    limit?: number;
  }): Promise<Deal[]> {
    const limit = filters?.limit ?? 100;

    const filterGroups: Array<{
      filters: Array<{ propertyName: string; operator: string; value?: string }>;
    }> = [];
    const base: Array<{
      propertyName: string;
      operator: string;
      value?: string;
    }> = [];
    if (filters?.ownerId) {
      base.push({
        propertyName: "hubspot_owner_id",
        operator: "EQ",
        value: filters.ownerId,
      });
    }
    if (filters?.vertical) {
      base.push({
        propertyName: "nexus_vertical",
        operator: "EQ",
        value: filters.vertical,
      });
    }
    if (filters?.closedSince) {
      base.push({
        propertyName: "closedate",
        operator: "GTE",
        value: String(filters.closedSince.getTime()),
      });
    }

    const stages = Array.isArray(filters?.stage)
      ? filters.stage
      : filters?.stage
      ? [filters.stage]
      : [];
    if (stages.length > 0) {
      for (const stage of stages) {
        filterGroups.push({
          filters: [
            ...base,
            {
              propertyName: "dealstage",
              operator: "EQ",
              value: this.resolveStageId(stage),
            },
          ],
        });
      }
    } else if (base.length > 0) {
      filterGroups.push({ filters: base });
    }

    const requestBody: Record<string, unknown> = {
      limit,
      properties: DEAL_PROPS_TO_FETCH,
      sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
    };
    if (filterGroups.length > 0) requestBody.filterGroups = filterGroups;

    const { body } = await this.http.request<{
      results: HubSpotObject[];
      paging?: { next?: { after: string } };
    }>({
      method: "POST",
      path: "/crm/v3/objects/deals/search",
      body: requestBody,
    });

    const hydrated = await Promise.all(
      body.results.map(async (obj) => this.fetchDealWithAssociations(obj.id)),
    );
    const now = new Date();
    await Promise.all(
      hydrated.map((obj) => this.writeCache("deal", obj.id, obj, now)),
    );
    return hydrated.map((obj) => mapHubSpotDeal(obj, this.stageIdToInternal));
  }

  deleteDeal(): Promise<void> {
    throw new CrmNotImplementedError("deleteDeal", "Phase 2 Day 1");
  }

  async updateDealStage(
    hubspotId: HubSpotId,
    newStage: DealStage,
    options?: { reason?: string; closeDate?: Date },
  ): Promise<Deal> {
    const stageId = this.resolveStageId(newStage);
    const properties: Record<string, unknown> = { dealstage: stageId };
    if (options?.closeDate) {
      properties.closedate = options.closeDate.toISOString();
    }
    await this.http.request({
      method: "PATCH",
      path: `/crm/v3/objects/deals/${hubspotId}`,
      body: { properties },
    });
    await this.invalidateCache("deal", hubspotId);
    return this.getDeal(hubspotId);
  }

  getDealStageHistory(): Promise<DealStageTransition[]> {
    throw new CrmNotImplementedError("getDealStageHistory", "Phase 2 Day 2");
  }

  // ─── Contact CRUD ────────────────────────────────────────────────────

  async createContact(input: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    title?: string;
    companyId?: HubSpotId;
    customProperties?: Record<string, unknown>;
  }): Promise<Contact> {
    const properties: Record<string, unknown> = {
      firstname: input.firstName,
      lastname: input.lastName,
    };
    if (input.email) properties.email = input.email;
    if (input.phone) properties.phone = input.phone;
    if (input.title) properties.jobtitle = input.title;
    for (const [k, v] of Object.entries(input.customProperties ?? {})) {
      properties[k] = this.serializePropertyValue(v);
    }

    const associations: Array<{
      to: { id: string };
      types: Array<{ associationCategory: string; associationTypeId: number }>;
    }> = [];
    if (input.companyId) {
      associations.push({
        to: { id: input.companyId },
        types: [
          {
            associationCategory: "HUBSPOT_DEFINED",
            associationTypeId: 279, // Contact → Company primary
          },
        ],
      });
    }

    const { body } = await this.http.request<HubSpotObject>({
      method: "POST",
      path: "/crm/v3/objects/contacts",
      body: { properties, associations },
    });
    await this.writeCache("contact", body.id, body);
    return mapHubSpotContact(body);
  }
  async getContact(hubspotId: HubSpotId): Promise<Contact> {
    const cached = await this.readCache("contact", hubspotId);
    if (cached && !this.isExpired(cached)) {
      return mapHubSpotContact(cached.payload, buildCacheMeta(cached.cachedAt));
    }
    const { body } = await this.http.request<HubSpotObject>({
      method: "GET",
      path: `/crm/v3/objects/contacts/${hubspotId}`,
      query: `properties=${encodeURIComponent(CONTACT_PROPS_TO_FETCH.join(","))}&associations=companies`,
    });
    await this.writeCache("contact", hubspotId, body);
    return mapHubSpotContact(body);
  }

  async upsertContact(input: {
    email: string;
    firstName: string;
    lastName: string;
    title?: string;
    companyId?: HubSpotId;
    customProperties?: Record<string, unknown>;
  }): Promise<Contact> {
    // Email-based upsert: find existing by email → PATCH, else POST new.
    // HubSpot enforces email uniqueness on POST, so the find-then-act path is
    // idempotent for the one-contact-per-email invariant.
    const existing = await this.listContacts({ email: input.email, limit: 1 });
    if (existing[0]) {
      return this.updateContact(existing[0].hubspotId, {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        title: input.title ?? null,
      });
    }
    return this.createContact({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      title: input.title,
      companyId: input.companyId,
      customProperties: input.customProperties,
    });
  }

  async updateContact(
    hubspotId: HubSpotId,
    fields: Partial<
      Omit<Contact, "hubspotId" | "createdAt" | "updatedAt" | "customProperties" | "_meta">
    >,
  ): Promise<Contact> {
    const properties: Record<string, unknown> = {};
    if (fields.firstName !== undefined) properties.firstname = fields.firstName;
    if (fields.lastName !== undefined) properties.lastname = fields.lastName;
    if (fields.email !== undefined) properties.email = fields.email ?? "";
    if (fields.phone !== undefined) properties.phone = fields.phone ?? "";
    if (fields.title !== undefined) properties.jobtitle = fields.title ?? "";
    if (fields.linkedinUrl !== undefined)
      properties.nexus_linkedin_url = fields.linkedinUrl ?? "";
    if (fields.companyId !== undefined) {
      throw new CrmValidationError(
        "updateContact does not support companyId changes — use HubSpot associations API directly",
      );
    }
    if (Object.keys(properties).length === 0) {
      return this.getContact(hubspotId);
    }
    await this.http.request({
      method: "PATCH",
      path: `/crm/v3/objects/contacts/${hubspotId}`,
      body: { properties },
    });
    await this.invalidateCache("contact", hubspotId);
    return this.getContact(hubspotId);
  }

  updateContactCustomProperties(): Promise<void> {
    throw new CrmNotImplementedError(
      "updateContactCustomProperties",
      "Phase 3 Day 3+",
    );
  }

  async listContacts(filters?: {
    companyId?: HubSpotId;
    email?: string;
    limit?: number;
  }): Promise<Contact[]> {
    const limit = filters?.limit ?? 100;
    const clauses: Array<{
      propertyName: string;
      operator: string;
      value?: string;
    }> = [];
    if (filters?.email) {
      clauses.push({ propertyName: "email", operator: "EQ", value: filters.email });
    }
    if (filters?.companyId) {
      clauses.push({
        propertyName: "associations.company",
        operator: "EQ",
        value: filters.companyId,
      });
    }

    const requestBody: Record<string, unknown> = {
      limit,
      properties: CONTACT_PROPS_TO_FETCH,
      sorts: [{ propertyName: "lastname", direction: "ASCENDING" }],
    };
    if (clauses.length > 0) {
      requestBody.filterGroups = [{ filters: clauses }];
    }

    const { body } = await this.http.request<{
      results: HubSpotObject[];
      paging?: { next?: { after: string } };
    }>({
      method: "POST",
      path: "/crm/v3/objects/contacts/search",
      body: requestBody,
    });

    const now = new Date();
    await Promise.all(
      body.results.map((obj) => this.writeCache("contact", obj.id, obj, now)),
    );
    return body.results.map((obj) => mapHubSpotContact(obj));
  }

  async listDealContacts(
    hubspotDealId: HubSpotId,
  ): Promise<Array<Contact & { role: ContactRole | null; isPrimary: boolean }>> {
    // Step 1 — fetch associations from HubSpot.
    const { body: assoc } = await this.http.request<{
      results: Array<{ id: string; type?: string }>;
    }>({
      method: "GET",
      path: `/crm/v3/objects/deals/${hubspotDealId}/associations/contacts`,
    });
    const contactIds = assoc.results.map((r) => r.id);
    if (contactIds.length === 0) return [];

    // Step 2 — fan-out getContact (cache-friendly per-contact).
    const contacts = await Promise.all(
      contactIds.map((id) => this.getContact(id)),
    );

    // Step 3 — role + primary metadata lives in Nexus deal_contact_roles
    // (HubSpot Starter tier has no custom association labels; only HubSpot-
    // defined "Primary" exists there. Nexus owns the richer taxonomy.)
    const roleRows = await this.sql<
      { hubspot_contact_id: string; role: ContactRole; is_primary: boolean }[]
    >`
      SELECT hubspot_contact_id, role, is_primary
        FROM deal_contact_roles
       WHERE hubspot_deal_id = ${hubspotDealId}
         AND hubspot_contact_id = ANY(${contactIds})
    `;
    const roleMap = new Map<string, { role: ContactRole; isPrimary: boolean }>();
    for (const row of roleRows) {
      roleMap.set(row.hubspot_contact_id, {
        role: row.role,
        isPrimary: row.is_primary,
      });
    }

    return contacts.map((c) => ({
      ...c,
      role: roleMap.get(c.hubspotId)?.role ?? null,
      isPrimary: roleMap.get(c.hubspotId)?.isPrimary ?? false,
    }));
  }

  async setContactRoleOnDeal(
    hubspotDealId: HubSpotId,
    hubspotContactId: HubSpotId,
    role: ContactRole | null,
    isPrimary: boolean = false,
  ): Promise<void> {
    // Starter tier has no custom association labels; role metadata lives in
    // Nexus `deal_contact_roles` (DECISIONS.md §2.18 / 07C §4.3). Thin wrapper
    // delegates to StakeholderService — the canonical write-path per
    // Guardrail 13. Borrows the adapter's sql pool (no own close() needed).
    const service = new StakeholderService({ databaseUrl: "", sql: this.sql });
    if (role === null) {
      await service.remove({
        dealId: hubspotDealId,
        contactId: hubspotContactId,
      });
      return;
    }
    const existing = await service.listForDeal(hubspotDealId);
    const match = existing.find(
      (s) => s.hubspotContactId === hubspotContactId,
    );
    if (match) {
      // updateRole today updates role only; is_primary re-assignment lands
      // with the close-won primary-stakeholder surface (Session B+).
      await service.updateRole({
        dealId: hubspotDealId,
        contactId: hubspotContactId,
        role,
      });
      return;
    }
    await service.add({
      dealId: hubspotDealId,
      contactId: hubspotContactId,
      role,
      isPrimary,
    });
  }
  /**
   * Create a Deal↔Contact association in HubSpot using the v4 `default`
   * endpoint, which auto-picks the HubSpot-defined default label for the
   * pair. Starter tier has no custom association labels (per 07C §4.3), so
   * "default" is the only label reps can produce anyway. Idempotent — re-
   * associating an existing pair is a no-op server-side.
   *
   * `isPrimary` is currently accepted for signature consistency but not yet
   * wired (requires a second call to set the primary flag via v4). Today's
   * UI doesn't expose primary toggling; lands with Session B's close-won
   * primary-stakeholder surface.
   */
  async associateDealContact(
    hubspotDealId: HubSpotId,
    hubspotContactId: HubSpotId,
    _options?: { isPrimary?: boolean },
  ): Promise<void> {
    await this.http.request({
      method: "PUT",
      path: `/crm/v4/objects/deals/${hubspotDealId}/associations/default/contacts/${hubspotContactId}`,
      parseJson: false,
    });
    await this.invalidateCache("deal", hubspotDealId);
    await this.invalidateCache("contact", hubspotContactId);
  }

  /**
   * Remove ALL Deal↔Contact association types between the pair. v4 endpoint
   * handles primary + non-primary in one call; contact row itself is
   * untouched.
   */
  async dissociateDealContact(
    hubspotDealId: HubSpotId,
    hubspotContactId: HubSpotId,
  ): Promise<void> {
    await this.http.request({
      method: "DELETE",
      path: `/crm/v4/objects/deals/${hubspotDealId}/associations/contacts/${hubspotContactId}`,
      parseJson: false,
    });
    await this.invalidateCache("deal", hubspotDealId);
    await this.invalidateCache("contact", hubspotContactId);
  }

  deleteContact(): Promise<void> {
    throw new CrmNotImplementedError("deleteContact", "Phase 2 Day 1");
  }

  // ─── Company CRUD ────────────────────────────────────────────────────

  async createCompany(input: {
    name: string;
    domain?: string;
    vertical?: Vertical;
    employeeCount?: number;
    annualRevenue?: number;
    customProperties?: Record<string, unknown>;
  }): Promise<Company> {
    const properties: Record<string, unknown> = { name: input.name };
    if (input.domain) properties.domain = input.domain;
    if (input.vertical) properties.nexus_vertical = input.vertical;
    if (input.employeeCount !== undefined)
      properties.numberofemployees = String(input.employeeCount);
    if (input.annualRevenue !== undefined)
      properties.annualrevenue = String(input.annualRevenue);
    for (const [k, v] of Object.entries(input.customProperties ?? {})) {
      properties[k] = this.serializePropertyValue(v);
    }

    const { body } = await this.http.request<HubSpotObject>({
      method: "POST",
      path: "/crm/v3/objects/companies",
      body: { properties },
    });
    await this.writeCache("company", body.id, body);
    return mapHubSpotCompany(body);
  }
  async getCompany(hubspotId: HubSpotId): Promise<Company> {
    const cached = await this.readCache("company", hubspotId);
    if (cached && !this.isExpired(cached)) {
      return mapHubSpotCompany(cached.payload, buildCacheMeta(cached.cachedAt));
    }
    const { body } = await this.http.request<HubSpotObject>({
      method: "GET",
      path: `/crm/v3/objects/companies/${hubspotId}`,
      query: `properties=${encodeURIComponent(COMPANY_PROPS_TO_FETCH.join(","))}`,
    });
    await this.writeCache("company", hubspotId, body);
    return mapHubSpotCompany(body);
  }
  upsertCompany(): Promise<Company> {
    throw new CrmNotImplementedError("upsertCompany", "Phase 2 Day 1");
  }
  updateCompany(): Promise<Company> {
    throw new CrmNotImplementedError("updateCompany", "Phase 2 Day 1");
  }
  updateCompanyCustomProperties(): Promise<void> {
    throw new CrmNotImplementedError(
      "updateCompanyCustomProperties",
      "Phase 3 Day 3+",
    );
  }
  async listCompanies(filters?: {
    vertical?: Vertical;
    domain?: string;
    limit?: number;
  }): Promise<Company[]> {
    const limit = filters?.limit ?? 100;
    const clauses: Array<{
      propertyName: string;
      operator: string;
      value?: string;
    }> = [];
    if (filters?.vertical) {
      clauses.push({
        propertyName: "nexus_vertical",
        operator: "EQ",
        value: filters.vertical,
      });
    }
    if (filters?.domain) {
      clauses.push({
        propertyName: "domain",
        operator: "EQ",
        value: filters.domain,
      });
    }

    const requestBody: Record<string, unknown> = {
      limit,
      properties: COMPANY_PROPS_TO_FETCH,
      sorts: [{ propertyName: "name", direction: "ASCENDING" }],
    };
    if (clauses.length > 0) {
      requestBody.filterGroups = [{ filters: clauses }];
    }

    const { body } = await this.http.request<{
      results: HubSpotObject[];
      paging?: { next?: { after: string } };
    }>({
      method: "POST",
      path: "/crm/v3/objects/companies/search",
      body: requestBody,
    });

    const now = new Date();
    await Promise.all(
      body.results.map((obj) => this.writeCache("company", obj.id, obj, now)),
    );
    return body.results.map((obj) => mapHubSpotCompany(obj));
  }
  deleteCompany(): Promise<void> {
    throw new CrmNotImplementedError("deleteCompany", "Phase 2 Day 1");
  }

  // ─── Engagements ─────────────────────────────────────────────────────

  logEngagement(): Promise<Engagement> {
    throw new CrmNotImplementedError("logEngagement", "Phase 3 Day 4+");
  }
  getEngagement(): Promise<Engagement> {
    throw new CrmNotImplementedError("getEngagement", "Phase 3 Day 4+");
  }
  listEngagements(): Promise<Engagement[]> {
    throw new CrmNotImplementedError("listEngagements", "Phase 2 Day 2");
  }

  // ─── Resolution Helpers ──────────────────────────────────────────────

  resolveDeal(): Promise<DealResolution[]> {
    throw new CrmNotImplementedError("resolveDeal", "Later");
  }
  resolveStakeholder(): Promise<StakeholderResolution> {
    throw new CrmNotImplementedError("resolveStakeholder", "Later");
  }

  // ─── Bulk Sync ───────────────────────────────────────────────────────

  async bulkSyncDeals(options?: {
    since?: Date;
    pageSize?: number;
  }): Promise<BulkSyncResult> {
    return this.bulkSync("deal", options);
  }

  async bulkSyncContacts(options?: {
    since?: Date;
    pageSize?: number;
  }): Promise<BulkSyncResult> {
    return this.bulkSync("contact", options);
  }

  async bulkSyncCompanies(options?: {
    since?: Date;
    pageSize?: number;
  }): Promise<BulkSyncResult> {
    return this.bulkSync("company", options);
  }

  bulkSyncEngagements(): Promise<BulkSyncResult> {
    throw new CrmNotImplementedError("bulkSyncEngagements", "Phase 2 Day 2");
  }

  // ─── Webhooks ────────────────────────────────────────────────────────

  async parseWebhookPayload(input: {
    rawBody: string;
    signature: string;
    timestamp: string;
    requestMethod: string;
    requestUri: string;
  }): Promise<WebhookEvent[]> {
    verifyHubSpotSignature({
      clientSecret: this.clientSecret,
      signatureHeader: input.signature,
      timestampHeader: input.timestamp,
      requestMethod: input.requestMethod,
      requestUri: input.requestUri,
      rawBody: input.rawBody,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(input.rawBody);
    } catch (err) {
      throw new CrmValidationError(
        "HubSpot webhook body is not valid JSON",
        err,
      );
    }
    if (!Array.isArray(parsed)) {
      throw new CrmValidationError(
        "HubSpot webhook body is not an array of events",
      );
    }

    const events: WebhookEvent[] = [];
    for (const raw of parsed) {
      if (typeof raw !== "object" || raw === null) continue;
      const r = raw as Record<string, unknown>;
      const subscriptionType = String(r.subscriptionType ?? "");
      const objectPrefix = subscriptionType.split(".")[0] ?? "";
      const objectType = this.normalizeObjectType(objectPrefix);
      if (!objectType) continue;
      events.push({
        eventType: subscriptionType,
        objectType,
        objectId: String(r.objectId ?? ""),
        propertyName:
          typeof r.propertyName === "string" ? r.propertyName : undefined,
        newValue: r.propertyValue,
        oldValue: undefined,
        occurredAt: new Date(Number(r.occurredAt ?? Date.now())),
        portalId: String(r.portalId ?? this.portalId),
      });
    }
    return events;
  }

  async handleWebhookEvent(event: WebhookEvent): Promise<void> {
    if (!event.objectId) return;
    const eventClass = event.eventType.split(".")[1];

    if (eventClass === "deletion") {
      await this.deleteCache(event.objectType, event.objectId);
      return;
    }

    // Foundation-review A9: skip the full HubSpot refetch when the webhook
    // is an echo of our own nexus_* property write. Phase 3 Day 2's
    // transcript pipeline writes ~10 nexus_* properties per deal via
    // updateDealCustomProperties; each write fires a deal.propertyChange
    // webhook that used to trigger a full deal refetch, multiplying the
    // HubSpot API burn and risking the 100/10s burst limit. Instead, patch
    // the cached property in-place from the webhook payload (which carries
    // the new value via `propertyValue` → event.newValue). 07C §5.1
    // documents this as the intended behavior: "Update cache only (these
    // are our own writes; we already know)."
    if (
      eventClass === "propertyChange" &&
      event.propertyName?.startsWith("nexus_") &&
      event.newValue !== undefined &&
      event.newValue !== null &&
      event.objectType !== "engagement"
    ) {
      await this.patchCacheProperty(
        event.objectType,
        event.objectId,
        event.propertyName,
        String(event.newValue),
      );
      return;
    }

    // Refresh cache from HubSpot for creation / non-nexus_* propertyChange.
    try {
      if (event.objectType === "deal") {
        const obj = await this.fetchDealWithAssociations(event.objectId);
        await this.writeCache("deal", event.objectId, obj);
      } else if (event.objectType === "contact") {
        const { body } = await this.http.request<HubSpotObject>({
          method: "GET",
          path: `/crm/v3/objects/contacts/${event.objectId}`,
          query: `properties=${encodeURIComponent(CONTACT_PROPS_TO_FETCH.join(","))}&associations=companies`,
        });
        await this.writeCache("contact", event.objectId, body);
      } else if (event.objectType === "company") {
        const { body } = await this.http.request<HubSpotObject>({
          method: "GET",
          path: `/crm/v3/objects/companies/${event.objectId}`,
          query: `properties=${encodeURIComponent(COMPANY_PROPS_TO_FETCH.join(","))}`,
        });
        await this.writeCache("company", event.objectId, body);
      }
    } catch (err) {
      if (err instanceof CrmNotFoundError) {
        await this.deleteCache(event.objectType, event.objectId);
        return;
      }
      throw err;
    }
  }

  /**
   * Patch a single property on a cached HubSpot object in-place, without
   * a HubSpot API round trip. Used by `handleWebhookEvent` for `nexus_*`
   * property-change events — see A9 comment above.
   *
   * If no cache row exists for the target, this is a no-op; the next
   * organic read will fetch fresh from HubSpot via `writeCache`.
   */
  private async patchCacheProperty(
    objectType: "deal" | "contact" | "company",
    hubspotId: HubSpotId,
    propertyName: string,
    newValue: string,
  ): Promise<void> {
    const ttlMs = CACHE_TTL_MS[objectType];
    await this.sql`
      UPDATE hubspot_cache
         SET payload = jsonb_set(
               payload,
               ARRAY['properties', ${propertyName}],
               to_jsonb(${newValue}::text),
               true
             ),
             cached_at = NOW(),
             ttl_expires_at = NOW() + MAKE_INTERVAL(secs => ${ttlMs} / 1000.0)
       WHERE object_type = ${objectType}
         AND hubspot_id = ${hubspotId}
    `;
  }

  // ─── Cache & Health ──────────────────────────────────────────────────

  async invalidateCache(
    objectType: "deal" | "contact" | "company" | "engagement",
    hubspotId: HubSpotId,
  ): Promise<void> {
    await this.sql`
      UPDATE hubspot_cache
         SET ttl_expires_at = NOW()
       WHERE object_type = ${objectType}
         AND hubspot_id = ${hubspotId}
    `;
  }

  async healthCheck(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      await this.http.request<{ portalId: number }>({
        method: "GET",
        path: "/account-info/v3/details",
      });
      const latencyMs = Date.now() - start;
      const status: HealthStatus["status"] =
        latencyMs > 5000 ? "degraded" : "ok";
      return {
        status,
        latencyMs,
        rateLimitRemaining: this.http.rateLimitRemaining,
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      if (err instanceof CrmAuthError) {
        return {
          status: "degraded",
          latencyMs,
          rateLimitRemaining: this.http.rateLimitRemaining,
        };
      }
      if (err instanceof CrmTransientError) {
        return {
          status: "down",
          latencyMs,
          rateLimitRemaining: this.http.rateLimitRemaining,
        };
      }
      throw err;
    }
  }

  // ─── Internal helpers ────────────────────────────────────────────────

  private resolveStageId(stage: DealStage): string {
    const mapped = this.internalToStageId.get(stage);
    if (mapped) return mapped;
    // Tolerate missing-mapping for degraded modes; HubSpot itself will reject
    // the ID if it really isn't a stage.
    if ((DEAL_STAGES as readonly string[]).includes(stage)) return stage;
    throw new CrmValidationError(
      `Unknown deal stage "${stage}"; provision pipeline first.`,
    );
  }

  private async fetchDealWithAssociations(
    hubspotId: HubSpotId,
  ): Promise<HubSpotObject> {
    const { body } = await this.http.request<HubSpotObject>({
      method: "GET",
      path: `/crm/v3/objects/deals/${hubspotId}`,
      query: `properties=${encodeURIComponent(DEAL_PROPS_TO_FETCH.join(","))}&associations=contacts,companies`,
    });
    return body;
  }

  private normalizeObjectType(
    prefix: string,
  ): WebhookEvent["objectType"] | null {
    switch (prefix) {
      case "deal":
        return "deal";
      case "contact":
        return "contact";
      case "company":
        return "company";
      case "engagement":
        return "engagement";
      default:
        return null;
    }
  }

  private serializePropertyValue(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.join(";");
    if (typeof value === "boolean") return value ? "true" : "false";
    return String(value);
  }

  private async bulkSync(
    objectType: "deal" | "contact" | "company",
    options?: { since?: Date; pageSize?: number },
  ): Promise<BulkSyncResult> {
    const pageSize = Math.min(options?.pageSize ?? 100, 100);
    const propsArray =
      objectType === "deal"
        ? DEAL_PROPS_TO_FETCH
        : objectType === "contact"
        ? CONTACT_PROPS_TO_FETCH
        : COMPANY_PROPS_TO_FETCH;
    const assocQuery =
      objectType === "deal"
        ? "&associations=contacts,companies"
        : objectType === "contact"
        ? "&associations=companies"
        : "";

    let after: string | undefined;
    let synced = 0;
    let failed = 0;

    while (true) {
      const query =
        `limit=${pageSize}` +
        `&properties=${encodeURIComponent(propsArray.join(","))}` +
        (after ? `&after=${encodeURIComponent(after)}` : "") +
        assocQuery;
      const { body } = await this.http.request<{
        results: HubSpotObject[];
        paging?: { next?: { after: string } };
      }>({
        method: "GET",
        path: `/crm/v3/objects/${URL_PATH[objectType]}`,
        query,
      });

      const cachedAt = new Date();
      for (const obj of body.results) {
        if (options?.since && new Date(obj.updatedAt) < options.since) continue;
        try {
          await this.writeCache(objectType, obj.id, obj, cachedAt);
          synced++;
        } catch {
          failed++;
        }
      }

      after = body.paging?.next?.after;
      if (!after) break;
    }

    return { synced, failed };
  }

  private async readCache(
    objectType: "deal" | "contact" | "company" | "engagement",
    hubspotId: HubSpotId,
  ): Promise<
    | {
        payload: HubSpotObject;
        cachedAt: Date;
        ttlExpiresAt: Date | null;
      }
    | null
  > {
    const rows = await this.sql<
      { payload: HubSpotObject; cached_at: Date; ttl_expires_at: Date | null }[]
    >`
      SELECT payload, cached_at, ttl_expires_at
        FROM hubspot_cache
       WHERE object_type = ${objectType}
         AND hubspot_id = ${hubspotId}
       LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      payload: row.payload,
      cachedAt: new Date(row.cached_at),
      ttlExpiresAt: row.ttl_expires_at ? new Date(row.ttl_expires_at) : null,
    };
  }

  private isExpired(row: {
    ttlExpiresAt: Date | null;
  }): boolean {
    if (!row.ttlExpiresAt) return false;
    return row.ttlExpiresAt.getTime() <= Date.now();
  }

  private async writeCache(
    objectType: "deal" | "contact" | "company" | "engagement",
    hubspotId: HubSpotId,
    payload: HubSpotObject,
    cachedAt: Date = new Date(),
  ): Promise<void> {
    const ttlExpiresAt = new Date(
      cachedAt.getTime() + CACHE_TTL_MS[objectType],
    );
    await this.sql`
      INSERT INTO hubspot_cache (object_type, hubspot_id, payload, cached_at, ttl_expires_at)
      VALUES (${objectType}, ${hubspotId}, ${this.sql.json(payload as unknown as postgres.JSONValue)}, ${cachedAt}, ${ttlExpiresAt})
      ON CONFLICT (object_type, hubspot_id) DO UPDATE
         SET payload = EXCLUDED.payload,
             cached_at = EXCLUDED.cached_at,
             ttl_expires_at = EXCLUDED.ttl_expires_at
    `;
  }

  private async deleteCache(
    objectType: "deal" | "contact" | "company" | "engagement",
    hubspotId: HubSpotId,
  ): Promise<void> {
    await this.sql`
      DELETE FROM hubspot_cache
       WHERE object_type = ${objectType}
         AND hubspot_id = ${hubspotId}
    `;
  }
}
