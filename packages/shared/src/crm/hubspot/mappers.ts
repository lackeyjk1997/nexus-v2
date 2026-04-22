/**
 * Mappers between HubSpot CRM v3 JSON shapes and CrmAdapter typed objects.
 *
 * HubSpot's v3 object shape:
 *   { id: string, properties: Record<string, string>, createdAt: ISO, updatedAt: ISO, associations? }
 *
 * Property values are always strings in HubSpot's responses; we parse numbers,
 * dates, and booleans here. Unknown enumerations pass through as-is; casting to
 * Nexus enums happens at the caller's discretion.
 */

import type {
  CacheMeta,
  Company,
  Contact,
  Deal,
  DealStage,
  HubSpotId,
  Vertical,
} from "../types";
import { DEAL_STAGES } from "../types";

export interface HubSpotObject {
  id: string;
  properties: Record<string, string | null | undefined>;
  createdAt: string;
  updatedAt: string;
  associations?: Record<string, { results: Array<{ id: string }> }>;
}

const NEXUS_PROP_PREFIX = "nexus_";

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseArrayField(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseVertical(value: string | null | undefined): Vertical | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  const VERTICALS: Vertical[] = [
    "healthcare",
    "financial_services",
    "manufacturing",
    "retail",
    "technology",
    "general",
  ];
  return VERTICALS.includes(normalized as Vertical)
    ? (normalized as Vertical)
    : null;
}

function resolveDealStage(
  hubspotStageId: string | null | undefined,
  stageIdToInternal: Map<string, DealStage>,
): DealStage {
  if (!hubspotStageId) return "new_lead";
  const internal = stageIdToInternal.get(hubspotStageId);
  if (internal) return internal;
  // Accept internal name directly (e.g. before pipeline provisioned, or when
  // HubSpot dev tools return the internal name rather than numeric id).
  if ((DEAL_STAGES as readonly string[]).includes(hubspotStageId)) {
    return hubspotStageId as DealStage;
  }
  return "new_lead";
}

function buildCustomPropertiesMap(
  properties: Record<string, string | null | undefined>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!key.startsWith(NEXUS_PROP_PREFIX)) continue;
    if (value === null || value === undefined) continue;
    out[key] = value;
  }
  return out;
}

function primaryAssociationId(
  obj: HubSpotObject,
  associationKey: string,
): HubSpotId | null {
  const assoc = obj.associations?.[associationKey];
  const first = assoc?.results[0];
  return first ? first.id : null;
}

export function buildCacheMeta(cachedAt: Date): CacheMeta {
  const ageMs = Date.now() - cachedAt.getTime();
  return { cachedAt, isStale: ageMs > 5 * 60 * 1000 };
}

export function mapHubSpotDeal(
  obj: HubSpotObject,
  stageIdToInternal: Map<string, DealStage>,
  meta?: CacheMeta,
): Deal {
  const p = obj.properties;
  const custom = buildCustomPropertiesMap(p);

  return {
    hubspotId: obj.id,
    name: p.dealname ?? "",
    companyId:
      primaryAssociationId(obj, "companies") ??
      primaryAssociationId(obj, "company") ??
      null,
    primaryContactId:
      primaryAssociationId(obj, "contacts") ??
      primaryAssociationId(obj, "contact") ??
      null,
    ownerId: p.hubspot_owner_id ?? null,
    bdrOwnerId: p.nexus_bdr_owner_id ?? null,
    saOwnerId: p.nexus_sa_owner_id ?? null,
    stage: resolveDealStage(p.dealstage, stageIdToInternal),
    amount: parseNumber(p.amount),
    currency: p.deal_currency_code ?? null,
    closeDate: parseDate(p.closedate),
    winProbability: parseNumber(p.hs_deal_stage_probability),
    forecastCategory: p.hs_forecast_category ?? null,
    vertical: parseVertical(p.nexus_vertical),
    product: p.nexus_product ?? null,
    leadSource: p.nexus_lead_source ?? null,
    primaryCompetitor: p.nexus_primary_competitor ?? null,
    lossReason: p.closed_lost_reason ?? null,
    closeCompetitor: p.nexus_close_competitor ?? null,
    closeNotes: p.nexus_close_notes ?? null,
    closeImprovement: p.nexus_close_improvement ?? null,
    winTurningPoint: p.nexus_win_turning_point ?? null,
    winReplicable: p.nexus_win_replicable ?? null,
    closedAt: parseDate(p.hs_closed_won_date ?? p.hs_lastmodifieddate),
    createdAt: new Date(obj.createdAt),
    updatedAt: new Date(obj.updatedAt),
    customProperties: custom,
    _meta: meta,
  };
}

export function mapHubSpotContact(
  obj: HubSpotObject,
  meta?: CacheMeta,
): Contact {
  const p = obj.properties;
  const custom = buildCustomPropertiesMap(p);

  return {
    hubspotId: obj.id,
    firstName: p.firstname ?? "",
    lastName: p.lastname ?? "",
    email: p.email ?? null,
    phone: p.phone ?? null,
    title: p.jobtitle ?? null,
    linkedinUrl: p.nexus_linkedin_url ?? null,
    companyId:
      primaryAssociationId(obj, "companies") ??
      primaryAssociationId(obj, "company") ??
      null,
    createdAt: new Date(obj.createdAt),
    updatedAt: new Date(obj.updatedAt),
    customProperties: custom,
    _meta: meta,
  };
}

export function mapHubSpotCompany(
  obj: HubSpotObject,
  meta?: CacheMeta,
): Company {
  const p = obj.properties;
  const custom = buildCustomPropertiesMap(p);

  return {
    hubspotId: obj.id,
    name: p.name ?? "",
    domain: p.domain ?? null,
    industry: p.industry ?? null,
    vertical: parseVertical(p.nexus_vertical),
    employeeCount: parseNumber(p.numberofemployees),
    annualRevenue: parseNumber(p.annualrevenue),
    techStack: parseArrayField(p.nexus_tech_stack),
    hqLocation: [p.city, p.state, p.country].filter(Boolean).join(", ") || null,
    description: p.description ?? null,
    enrichmentSource: (p.nexus_enrichment_source as Company["enrichmentSource"]) ?? null,
    createdAt: new Date(obj.createdAt),
    updatedAt: new Date(obj.updatedAt),
    customProperties: custom,
    _meta: meta,
  };
}
