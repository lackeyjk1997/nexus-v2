/**
 * Canonical list of Nexus-owned HubSpot custom properties.
 *
 * 28 Deal + 5 Contact + 5 Company = 38 total (07B Section 5, 07C Section 3).
 *
 * Path locked in DECISIONS.md 2.18.1:
 *   packages/shared/src/crm/hubspot/properties.ts
 *
 * Consumers:
 *   - scripts/hubspot-provision-properties.ts (07C Step 5) creates each
 *     property via POST /crm/v3/properties/<objectType>.
 *   - HubSpotAdapter reads `objectType` when mapping Nexus writes.
 *
 * Enumeration values are lowercase snake_case matching the Nexus TypeScript
 * enums verbatim. Display labels are Title Case.
 */

export type HubSpotObjectType = "deals" | "contacts" | "companies";

/** Valid HubSpot fieldType values per the v3 Properties API. */
export type HubSpotFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "radio"
  | "checkbox"
  | "booleancheckbox"
  | "phonenumber"
  | "html"
  | "file"
  | "calculation_equation";

export type HubSpotPropertyType =
  | "string"
  | "number"
  | "datetime"
  | "enumeration"
  | "bool";

export interface HubSpotPropertyOption {
  label: string;
  value: string;
  displayOrder: number;
}

export interface HubSpotPropertyDefinition {
  objectType: HubSpotObjectType;
  name: string;
  label: string;
  description: string;
  type: HubSpotPropertyType;
  fieldType: HubSpotFieldType;
  groupName: string;
  displayOrder: number;
  options?: HubSpotPropertyOption[];
  hasUniqueValue?: boolean;
  formField?: boolean;
}

export const NEXUS_INTELLIGENCE_GROUP = {
  name: "nexus_intelligence",
  label: "Nexus Intelligence",
  displayOrder: 10,
} as const;

const VERTICAL_OPTIONS: HubSpotPropertyOption[] = [
  { label: "Healthcare", value: "healthcare", displayOrder: 0 },
  { label: "Financial Services", value: "financial_services", displayOrder: 1 },
  { label: "Manufacturing", value: "manufacturing", displayOrder: 2 },
  { label: "Retail", value: "retail", displayOrder: 3 },
  { label: "Technology", value: "technology", displayOrder: 4 },
  { label: "General", value: "general", displayOrder: 5 },
];

const PRODUCT_OPTIONS: HubSpotPropertyOption[] = [
  { label: "Claude API", value: "claude_api", displayOrder: 0 },
  { label: "Claude Enterprise", value: "claude_enterprise", displayOrder: 1 },
  { label: "Claude Team", value: "claude_team", displayOrder: 2 },
];

const LEAD_SOURCE_OPTIONS: HubSpotPropertyOption[] = [
  { label: "Inbound", value: "inbound", displayOrder: 0 },
  { label: "Outbound", value: "outbound", displayOrder: 1 },
  { label: "PLG Upgrade", value: "plg_upgrade", displayOrder: 2 },
  { label: "Partner", value: "partner", displayOrder: 3 },
  { label: "Event", value: "event", displayOrder: 4 },
];

const FITNESS_VELOCITY_OPTIONS: HubSpotPropertyOption[] = [
  { label: "Accelerating", value: "accelerating", displayOrder: 0 },
  { label: "Stable", value: "stable", displayOrder: 1 },
  { label: "Decelerating", value: "decelerating", displayOrder: 2 },
  { label: "Stalled", value: "stalled", displayOrder: 3 },
];

const ROLE_OPTIONS: HubSpotPropertyOption[] = [
  { label: "Champion", value: "champion", displayOrder: 0 },
  { label: "Economic Buyer", value: "economic_buyer", displayOrder: 1 },
  { label: "Technical Evaluator", value: "technical_evaluator", displayOrder: 2 },
  { label: "End User", value: "end_user", displayOrder: 3 },
  { label: "Blocker", value: "blocker", displayOrder: 4 },
  { label: "Coach", value: "coach", displayOrder: 5 },
];

const ENGAGEMENT_STATUS_OPTIONS: HubSpotPropertyOption[] = [
  { label: "Engaged", value: "engaged", displayOrder: 0 },
  { label: "Silent", value: "silent", displayOrder: 1 },
  { label: "New", value: "new", displayOrder: 2 },
  { label: "Departed", value: "departed", displayOrder: 3 },
];

const ENRICHMENT_SOURCE_OPTIONS: HubSpotPropertyOption[] = [
  { label: "Apollo", value: "apollo", displayOrder: 0 },
  { label: "Clearbit", value: "clearbit", displayOrder: 1 },
  { label: "Simulated", value: "simulated", displayOrder: 2 },
];

// ─── Deal properties (28) ───────────────────────────────

const DEAL_PROPERTIES: HubSpotPropertyDefinition[] = [
  {
    objectType: "deals",
    name: "nexus_vertical",
    label: "Nexus Vertical",
    description: "Primary vertical for the deal.",
    type: "enumeration",
    fieldType: "select",
    groupName: "nexus_intelligence",
    displayOrder: 0,
    options: VERTICAL_OPTIONS,
  },
  {
    objectType: "deals",
    name: "nexus_product",
    label: "Nexus Product",
    description: "Anthropic product tier in play.",
    type: "enumeration",
    fieldType: "select",
    groupName: "nexus_intelligence",
    displayOrder: 1,
    options: PRODUCT_OPTIONS,
  },
  {
    objectType: "deals",
    name: "nexus_lead_source",
    label: "Nexus Lead Source",
    description: "How the deal originated.",
    type: "enumeration",
    fieldType: "select",
    groupName: "nexus_intelligence",
    displayOrder: 2,
    options: LEAD_SOURCE_OPTIONS,
  },
  {
    objectType: "deals",
    name: "nexus_primary_competitor",
    label: "Primary Competitor",
    description: "Competitor name detected or edited.",
    type: "string",
    fieldType: "text",
    groupName: "nexus_intelligence",
    displayOrder: 3,
  },
  {
    objectType: "deals",
    name: "nexus_close_competitor",
    label: "Close Competitor",
    description: "Competitor that won the deal (if lost).",
    type: "string",
    fieldType: "text",
    groupName: "nexus_intelligence",
    displayOrder: 4,
  },
  {
    objectType: "deals",
    name: "nexus_close_notes",
    label: "Close Notes",
    description: "Freeform close notes from close-analysis service.",
    type: "string",
    fieldType: "textarea",
    groupName: "nexus_intelligence",
    displayOrder: 5,
  },
  {
    objectType: "deals",
    name: "nexus_close_improvement",
    label: "Close Improvement",
    description: "What would have changed the outcome.",
    type: "string",
    fieldType: "textarea",
    groupName: "nexus_intelligence",
    displayOrder: 6,
  },
  {
    objectType: "deals",
    name: "nexus_win_turning_point",
    label: "Win Turning Point",
    description: "The moment the deal turned (for wins).",
    type: "string",
    fieldType: "textarea",
    groupName: "nexus_intelligence",
    displayOrder: 7,
  },
  {
    objectType: "deals",
    name: "nexus_win_replicable",
    label: "Win Replicable",
    description: "What is replicable from this win.",
    type: "string",
    fieldType: "textarea",
    groupName: "nexus_intelligence",
    displayOrder: 8,
  },
  {
    objectType: "deals",
    name: "nexus_meddpicc_score",
    label: "MEDDPICC Score",
    description: "0-100 average across 7 dimensions.",
    type: "number",
    fieldType: "number",
    groupName: "nexus_intelligence",
    displayOrder: 9,
  },
  {
    objectType: "deals",
    name: "nexus_meddpicc_metrics_score",
    label: "MEDDPICC Metrics Score",
    description: "0-100 Metrics dimension.",
    type: "number",
    fieldType: "number",
    groupName: "nexus_intelligence",
    displayOrder: 10,
  },
  {
    objectType: "deals",
    name: "nexus_meddpicc_eb_score",
    label: "MEDDPICC Economic Buyer Score",
    description: "0-100 Economic Buyer dimension.",
    type: "number",
    fieldType: "number",
    groupName: "nexus_intelligence",
    displayOrder: 11,
  },
  {
    objectType: "deals",
    name: "nexus_meddpicc_dc_score",
    label: "MEDDPICC Decision Criteria Score",
    description: "0-100 Decision Criteria dimension.",
    type: "number",
    fieldType: "number",
    groupName: "nexus_intelligence",
    displayOrder: 12,
  },
  {
    objectType: "deals",
    name: "nexus_meddpicc_dp_score",
    label: "MEDDPICC Decision Process Score",
    description: "0-100 Decision Process dimension.",
    type: "number",
    fieldType: "number",
    groupName: "nexus_intelligence",
    displayOrder: 13,
  },
  {
    objectType: "deals",
    name: "nexus_meddpicc_pain_score",
    label: "MEDDPICC Pain Score",
    description: "0-100 Pain dimension.",
    type: "number",
    fieldType: "number",
    groupName: "nexus_intelligence",
    displayOrder: 14,
  },
  {
    objectType: "deals",
    name: "nexus_meddpicc_champion_score",
    label: "MEDDPICC Champion Score",
    description: "0-100 Champion dimension.",
    type: "number",
    fieldType: "number",
    groupName: "nexus_intelligence",
    displayOrder: 15,
  },
  {
    objectType: "deals",
    name: "nexus_meddpicc_competition_score",
    label: "MEDDPICC Competition Score",
    description: "0-100 Competition dimension.",
    type: "number",
    fieldType: "number",
    groupName: "nexus_intelligence",
    displayOrder: 16,
  },
  {
    objectType: "deals",
    name: "nexus_fitness_score",
    label: "Fitness Score",
    description: "0-100 oDeal composite fitness.",
    type: "number",
    fieldType: "number",
    groupName: "nexus_intelligence",
    displayOrder: 17,
  },
  {
    objectType: "deals",
    name: "nexus_fitness_velocity",
    label: "Fitness Velocity",
    description: "Trend of fitness-score change over time.",
    type: "enumeration",
    fieldType: "select",
    groupName: "nexus_intelligence",
    displayOrder: 18,
    options: FITNESS_VELOCITY_OPTIONS,
  },
  {
    objectType: "deals",
    name: "nexus_lead_score",
    label: "Lead Score",
    description: "0-100 ICP+engagement+intent composite.",
    type: "number",
    fieldType: "number",
    groupName: "nexus_intelligence",
    displayOrder: 19,
  },
  {
    objectType: "deals",
    name: "nexus_renewal_date",
    label: "Renewal Date",
    description: "Projected renewal date (closed-won deals).",
    type: "datetime",
    fieldType: "date",
    groupName: "nexus_intelligence",
    displayOrder: 20,
  },
  {
    objectType: "deals",
    name: "nexus_next_qbr_date",
    label: "Next QBR Date",
    description: "Next scheduled QBR date.",
    type: "datetime",
    fieldType: "date",
    groupName: "nexus_intelligence",
    displayOrder: 21,
  },
  {
    objectType: "deals",
    name: "nexus_onboarding_complete",
    label: "Onboarding Complete",
    description: "Post-close onboarding flag.",
    type: "bool",
    fieldType: "booleancheckbox",
    groupName: "nexus_intelligence",
    displayOrder: 22,
    options: [
      { label: "True", value: "true", displayOrder: 0 },
      { label: "False", value: "false", displayOrder: 1 },
    ],
  },
  {
    objectType: "deals",
    name: "nexus_products_purchased",
    label: "Products Purchased",
    description: "Products owned post-close.",
    type: "enumeration",
    fieldType: "checkbox",
    groupName: "nexus_intelligence",
    displayOrder: 23,
    options: PRODUCT_OPTIONS,
  },
  {
    objectType: "deals",
    name: "nexus_bdr_owner_id",
    label: "BDR Owner Id",
    description: "HubSpot owner ID for the deal's BDR.",
    type: "string",
    fieldType: "text",
    groupName: "nexus_intelligence",
    displayOrder: 24,
  },
  {
    objectType: "deals",
    name: "nexus_sa_owner_id",
    label: "Solutions Architect Owner Id",
    description: "HubSpot owner ID for the deal's SA.",
    type: "string",
    fieldType: "text",
    groupName: "nexus_intelligence",
    displayOrder: 25,
  },
  {
    objectType: "deals",
    name: "nexus_last_analysis_at",
    label: "Last Transcript Analysis",
    description: "Timestamp of most recent transcript-pipeline completion.",
    type: "datetime",
    fieldType: "date",
    groupName: "nexus_intelligence",
    displayOrder: 26,
  },
  {
    objectType: "deals",
    name: "nexus_internal_event_count",
    label: "Internal Event Count",
    description: "Debug-only: count of Nexus deal_events for this deal.",
    type: "number",
    fieldType: "number",
    groupName: "nexus_intelligence",
    displayOrder: 27,
  },
];

// ─── Contact properties (5) ─────────────────────────────

const CONTACT_PROPERTIES: HubSpotPropertyDefinition[] = [
  {
    objectType: "contacts",
    name: "nexus_role_in_deal",
    label: "Role in Deal",
    description: "Role for the contact's primary open deal.",
    type: "enumeration",
    fieldType: "select",
    groupName: "nexus_intelligence",
    displayOrder: 0,
    options: ROLE_OPTIONS,
  },
  {
    objectType: "contacts",
    name: "nexus_linkedin_url",
    label: "Nexus LinkedIn URL",
    description: "LinkedIn profile URL.",
    type: "string",
    fieldType: "text",
    groupName: "nexus_intelligence",
    displayOrder: 1,
  },
  {
    objectType: "contacts",
    name: "nexus_engagement_status",
    label: "Engagement Status",
    description: "Post-close engagement state.",
    type: "enumeration",
    fieldType: "select",
    groupName: "nexus_intelligence",
    displayOrder: 2,
    options: ENGAGEMENT_STATUS_OPTIONS,
  },
  {
    objectType: "contacts",
    name: "nexus_first_observed_in_nexus",
    label: "First Observed in Nexus",
    description: "Timestamp of first Nexus-side sighting.",
    type: "datetime",
    fieldType: "date",
    groupName: "nexus_intelligence",
    displayOrder: 3,
  },
  {
    objectType: "contacts",
    name: "nexus_internal_person_id",
    label: "Internal Person ID",
    description: "Nexus people.id UUID for cross-account identity.",
    type: "string",
    fieldType: "text",
    groupName: "nexus_intelligence",
    displayOrder: 4,
  },
];

// ─── Company properties (5) ─────────────────────────────

const COMPANY_PROPERTIES: HubSpotPropertyDefinition[] = [
  {
    objectType: "companies",
    name: "nexus_vertical",
    label: "Nexus Vertical",
    description: "Primary vertical for the company.",
    type: "enumeration",
    fieldType: "select",
    groupName: "nexus_intelligence",
    displayOrder: 0,
    options: VERTICAL_OPTIONS,
  },
  {
    objectType: "companies",
    name: "nexus_tech_stack",
    label: "Tech Stack",
    description: "Comma-delimited list of detected technologies.",
    type: "string",
    fieldType: "textarea",
    groupName: "nexus_intelligence",
    displayOrder: 1,
  },
  {
    objectType: "companies",
    name: "nexus_enrichment_source",
    label: "Enrichment Source",
    description: "Provenance of enrichment data.",
    type: "enumeration",
    fieldType: "select",
    groupName: "nexus_intelligence",
    displayOrder: 2,
    options: ENRICHMENT_SOURCE_OPTIONS,
  },
  {
    objectType: "companies",
    name: "nexus_account_health_score",
    label: "Account Health Score",
    description: "0-100 account health score for closed-won accounts.",
    type: "number",
    fieldType: "number",
    groupName: "nexus_intelligence",
    displayOrder: 3,
  },
  {
    objectType: "companies",
    name: "nexus_internal_company_intelligence_id",
    label: "Internal Company Intelligence ID",
    description: "Join key to Nexus companies_intelligence table.",
    type: "string",
    fieldType: "text",
    groupName: "nexus_intelligence",
    displayOrder: 4,
  },
];

export const HUBSPOT_CUSTOM_PROPERTIES: HubSpotPropertyDefinition[] = [
  ...DEAL_PROPERTIES,
  ...CONTACT_PROPERTIES,
  ...COMPANY_PROPERTIES,
];
