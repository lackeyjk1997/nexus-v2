/**
 * Nexus v2 schema.
 *
 * Authoritative reference: `docs/handoff/10-REBUILD-PLAN.md` §4 in the v1 repo.
 *
 * Hygiene commitments enforced here (DECISIONS.md 2.2, 2.3, 2.19, 2.21, 4.6):
 *  - Every enum-shaped column is a real Postgres enum (exceptions: JobStatus, JobType — Day 3).
 *  - Every FK has an index.
 *  - Every FK declares ON DELETE semantics explicitly.
 *  - No uuid[] arrays referencing other tables (join tables instead).
 *  - No heterogeneous FK columns (discriminated nullable pairs with CHECK).
 *  - observations.observer_id / raw_input / ai_classification (§2.4).
 *  - observation_deals join table (§2.3); no observations.linked_deal_ids.
 *  - coordinator_pattern_deals join table; no coordinator_patterns.deal_ids[].
 *  - readiness spelled correctly (v1 had "readness" typo).
 *  - applicability JSONB on experiments/patterns/flags is structured (§2.21).
 *  - Tables that MUST NOT exist: deal_agent_states, agent_actions_log, deal_stage_history.
 */
import { sql, relations } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  decimal,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  CONTACT_ROLE,
  DEAL_STAGES,
  MEDDPICC_DIMENSION,
  ODEAL_CATEGORY,
  SIGNAL_TAXONOMY,
  VERTICAL,
} from "@nexus/shared";

/* ---------------------------------------------------------------------------
 * Enums (§4.6)
 * ------------------------------------------------------------------------- */

// Values imported from @nexus/shared — see Guardrail 22.
export const verticalEnum = pgEnum("vertical", VERTICAL);

// Values imported from @nexus/shared — see Guardrail 22.
// Canonical tuple starts with "new_lead" (matches HubSpot pipeline 2215843570).
// Migration 0005 renamed the first value from the legacy "prospect".
export const dealStageEnum = pgEnum("deal_stage", DEAL_STAGES);

// Values imported from @nexus/shared so the DB enum and the app enum cannot
// drift (DECISIONS.md 2.13, Guardrail 22).
export const signalTaxonomyEnum = pgEnum("signal_taxonomy", SIGNAL_TAXONOMY);

// Values imported from @nexus/shared — see Guardrail 22.
export const meddpiccDimensionEnum = pgEnum(
  "meddpicc_dimension",
  MEDDPICC_DIMENSION,
);

// Values imported from @nexus/shared — see Guardrail 22.
export const odealCategoryEnum = pgEnum("odeal_category", ODEAL_CATEGORY);

// Values imported from @nexus/shared — see Guardrail 22.
export const contactRoleEnum = pgEnum("contact_role", CONTACT_ROLE);

export const experimentLifecycleEnum = pgEnum("experiment_lifecycle", [
  "proposed",
  "active",
  "graduated",
  "killed",
]);

export const experimentCategoryEnum = pgEnum("experiment_category", [
  "in_conversation",
  "out_of_conversation",
  "implicit_approach",
]);

export const surfaceDismissalModeEnum = pgEnum("surface_dismissal_mode", ["soft", "hard"]);

export const engagementStatusEnum = pgEnum("engagement_status", [
  "engaged",
  "silent",
  "new",
  "departed",
]);

export const teamMemberRoleEnum = pgEnum("team_member_role", [
  "AE",
  "BDR",
  "SA",
  "CSM",
  "MANAGER",
]);

export const supportFunctionEnum = pgEnum("support_function", [
  "enablement",
  "product_marketing",
  "deal_desk",
  "customer_success",
]);

export const healthTrendEnum = pgEnum("health_trend", [
  "improving",
  "stable",
  "declining",
  "critical",
]);

export const contractStatusEnum = pgEnum("contract_status", [
  "onboarding",
  "active",
  "renewal_window",
  "at_risk",
  "churned",
]);

export const customerMessageChannelEnum = pgEnum("customer_message_channel", [
  "email",
  "support_ticket",
  "slack",
  "meeting_note",
]);

export const customerMessageStatusEnum = pgEnum("customer_message_status", [
  "pending",
  "kit_ready",
  "responded",
  "resolved",
]);

export const severityEnum = pgEnum("severity", ["low", "medium", "high", "critical"]);

export const priorityEnum = pgEnum("priority", ["low", "medium", "high", "urgent"]);

export const confidenceBandEnum = pgEnum("confidence_band", ["low", "medium", "high"]);

export const coordinatorPatternStatusEnum = pgEnum("coordinator_pattern_status", [
  "detected",
  "synthesized",
  "expired",
]);

export const observationStatusEnum = pgEnum("observation_status", [
  "pending_review",
  "routed",
  "resolved",
  "dismissed",
]);

export const fieldQueryStatusEnum = pgEnum("field_query_status", ["open", "closed", "expired"]);

export const fieldQueryQuestionStatusEnum = pgEnum("field_query_question_status", [
  "pending",
  "answered",
  "skipped",
]);

export const agentConfigChangeAuthorEnum = pgEnum("agent_config_change_author", [
  "user",
  "feedback_loop",
  "ai_proposal",
]);

export const agentConfigProposalStatusEnum = pgEnum("agent_config_proposal_status", [
  "pending",
  "approved",
  "rejected",
  "expired",
]);

export const systemIntelligenceStatusEnum = pgEnum("system_intelligence_status", [
  "active",
  "stale",
  "archived",
]);

export const hubspotObjectTypeEnum = pgEnum("hubspot_object_type", [
  "deal",
  "contact",
  "company",
  "engagement",
]);

export const personLinkMethodEnum = pgEnum("person_link_method", [
  "email_match",
  "manual",
  "ai_inferred",
]);

export const transcriptSourceEnum = pgEnum("transcript_source", [
  "simulated",
  "hubspot_call",
  "uploaded",
]);

export const dealEventSourceKindEnum = pgEnum("deal_event_source_kind", [
  "prompt",
  "service",
  "user",
  "webhook",
  "scheduled_job",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
]);

/**
 * Full job type catalog seeded Day 3. Only `noop` has a handler at Day 3; the
 * other six throw `not_implemented` until their owning phase wires them up
 * (Phase 1 Day 5, Phase 3 Day 2, Phase 4 Days 2-3, Phase 5 Days 3-4). Seeding
 * all values now so later phases don't require a schema migration.
 */
export const jobTypeEnum = pgEnum("job_type", [
  "transcript_pipeline",
  "coordinator_synthesis",
  "observation_cluster",
  "daily_digest",
  "deal_health_check",
  "hubspot_periodic_sync",
  "noop",
]);

/**
 * deal_events type enum — the backbone of v2 intelligence (§4.4).
 * Extend this when adding new event sources; do not reuse labels.
 */
export const dealEventTypeEnum = pgEnum("deal_event_type", [
  "stage_changed",
  "meddpicc_scored",
  "signal_detected",
  "stakeholder_engagement_recorded",
  "transcript_ingested",
  "deal_theory_updated",
  "risk_flag_raised",
  "risk_flag_cleared",
  "coordinated_intel_received",
  "experiment_attributed",
  "observation_linked",
  "intervention_proposed",
  "intervention_resolved",
  "email_drafted",
  "call_prep_generated",
  "close_hypothesis_produced",
  "close_reconciliation_recorded",
  "agent_action_recorded",
  "agent_config_change_proposed",
  "agent_config_change_applied",
]);

/* ---------------------------------------------------------------------------
 * Users / team members / support
 * ------------------------------------------------------------------------- */

/**
 * users.id MUST match auth.users.id. The FK to auth.users is added in the
 * hand-written 0001_auth_fk migration (cross-schema FKs aren't expressible
 * in drizzle-kit today).
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    email: text("email").notNull().unique(),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    isAdmin: boolean("is_admin").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: index("users_email_idx").on(t.email),
  }),
);

export const teamMembers = pgTable(
  "team_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    role: teamMemberRoleEnum("role").notNull(),
    verticalSpecialization: verticalEnum("vertical_specialization").notNull().default("general"),
    hubspotOwnerId: text("hubspot_owner_id").unique(),
    avatarUrl: text("avatar_url"),
    capacityTarget: integer("capacity_target").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("team_members_user_idx").on(t.userId),
    roleIdx: index("team_members_role_idx").on(t.role),
    verticalIdx: index("team_members_vertical_idx").on(t.verticalSpecialization),
    hubspotOwnerIdx: index("team_members_hubspot_owner_idx").on(t.hubspotOwnerId),
  }),
);

export const supportFunctionMembers = pgTable(
  "support_function_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    role: text("role").notNull(),
    function: supportFunctionEnum("function").notNull(),
    verticalsCovered: verticalEnum("verticals_covered").array().notNull().default(sql`'{}'::vertical[]`),
    avatarInitials: text("avatar_initials"),
    avatarColor: text("avatar_color"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("support_function_members_user_idx").on(t.userId),
    functionIdx: index("support_function_members_function_idx").on(t.function),
  }),
);

/* ---------------------------------------------------------------------------
 * HubSpot read-through cache + people identity
 * ------------------------------------------------------------------------- */

export const hubspotCache = pgTable(
  "hubspot_cache",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    objectType: hubspotObjectTypeEnum("object_type").notNull(),
    hubspotId: text("hubspot_id").notNull(),
    payload: jsonb("payload").notNull(),
    cachedAt: timestamp("cached_at", { withTimezone: true }).notNull().defaultNow(),
    ttlExpiresAt: timestamp("ttl_expires_at", { withTimezone: true }),
  },
  (t) => ({
    objectKey: unique("hubspot_cache_object_key").on(t.objectType, t.hubspotId),
    typeIdx: index("hubspot_cache_type_idx").on(t.objectType),
    expiresIdx: index("hubspot_cache_expires_idx").on(t.ttlExpiresAt),
  }),
);

export const people = pgTable("people", {
  id: uuid("id").defaultRandom().primaryKey(),
  primaryName: text("primary_name").notNull(),
  primaryEmail: text("primary_email"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const peopleContacts = pgTable(
  "people_contacts",
  {
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    hubspotContactId: text("hubspot_contact_id").notNull(),
    linkMethod: personLinkMethodEnum("link_method").notNull(),
    confidence: decimal("confidence", { precision: 4, scale: 3 }).notNull().default("1.000"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.personId, t.hubspotContactId] }),
    personIdx: index("people_contacts_person_idx").on(t.personId),
    hubspotIdx: index("people_contacts_hubspot_idx").on(t.hubspotContactId),
  }),
);

export const dealContactRoles = pgTable(
  "deal_contact_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hubspotDealId: text("hubspot_deal_id").notNull(),
    hubspotContactId: text("hubspot_contact_id").notNull(),
    role: contactRoleEnum("role").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqPerContact: unique("deal_contact_roles_unique").on(t.hubspotDealId, t.hubspotContactId),
    dealIdx: index("deal_contact_roles_deal_idx").on(t.hubspotDealId),
    contactIdx: index("deal_contact_roles_contact_idx").on(t.hubspotContactId),
  }),
);

/* ---------------------------------------------------------------------------
 * Event-sourced deal intelligence (§4.4)
 * ------------------------------------------------------------------------- */

export const dealEvents = pgTable(
  "deal_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hubspotDealId: text("hubspot_deal_id").notNull(),
    type: dealEventTypeEnum("type").notNull(),
    payload: jsonb("payload").notNull(),
    sourceKind: dealEventSourceKindEnum("source_kind").notNull(),
    sourceRef: text("source_ref"),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dealIdx: index("deal_events_deal_idx").on(t.hubspotDealId),
    typeIdx: index("deal_events_type_idx").on(t.type),
    dealTypeIdx: index("deal_events_deal_type_idx").on(t.hubspotDealId, t.type),
    actorIdx: index("deal_events_actor_idx").on(t.actorUserId),
    createdIdx: index("deal_events_created_idx").on(t.createdAt),
  }),
);

export const dealSnapshots = pgTable(
  "deal_snapshots",
  {
    hubspotDealId: text("hubspot_deal_id").notNull(),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull(),
    payload: jsonb("payload").notNull(),
    builtFromEventId: uuid("built_from_event_id").references(() => dealEvents.id, {
      onDelete: "set null",
    }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.hubspotDealId, t.snapshotAt] }),
    dealIdx: index("deal_snapshots_deal_idx").on(t.hubspotDealId),
    builtFromIdx: index("deal_snapshots_built_from_idx").on(t.builtFromEventId),
  }),
);

/* ---------------------------------------------------------------------------
 * Observations (§2.3, §2.4)
 * ------------------------------------------------------------------------- */

export const observationClusters = pgTable(
  "observation_clusters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    signalType: signalTaxonomyEnum("signal_type").notNull(),
    severity: severityEnum("severity").notNull(),
    summary: text("summary"),
    arrImpactTotal: decimal("arr_impact_total", { precision: 14, scale: 2 }),
    arrImpactDetails: jsonb("arr_impact_details"),
    unstructuredQuotes: jsonb("unstructured_quotes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    signalTypeIdx: index("observation_clusters_signal_type_idx").on(t.signalType),
    severityIdx: index("observation_clusters_severity_idx").on(t.severity),
  }),
);

export const observations = pgTable(
  "observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    observerId: uuid("observer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rawInput: text("raw_input").notNull(),
    aiClassification: jsonb("ai_classification"),
    signalType: signalTaxonomyEnum("signal_type").notNull(),
    severity: severityEnum("severity").notNull().default("medium"),
    confidence: decimal("confidence", { precision: 4, scale: 3 }),
    status: observationStatusEnum("status").notNull().default("pending_review"),
    sourceContext: jsonb("source_context"),
    clusterId: uuid("cluster_id").references(() => observationClusters.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    observerIdx: index("observations_observer_idx").on(t.observerId),
    clusterIdx: index("observations_cluster_idx").on(t.clusterId),
    signalTypeIdx: index("observations_signal_type_idx").on(t.signalType),
    statusIdx: index("observations_status_idx").on(t.status),
  }),
);

/** §2.3 replaces v1's observations.linked_deal_ids uuid[]. */
export const observationDeals = pgTable(
  "observation_deals",
  {
    observationId: uuid("observation_id")
      .notNull()
      .references(() => observations.id, { onDelete: "cascade" }),
    hubspotDealId: text("hubspot_deal_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.observationId, t.hubspotDealId] }),
    observationIdx: index("observation_deals_observation_idx").on(t.observationId),
    dealIdx: index("observation_deals_deal_idx").on(t.hubspotDealId),
  }),
);

/* ---------------------------------------------------------------------------
 * Coordinator patterns (§2.17)
 * ------------------------------------------------------------------------- */

export const coordinatorPatterns = pgTable(
  "coordinator_patterns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    patternKey: text("pattern_key").notNull().unique(),
    signalType: signalTaxonomyEnum("signal_type").notNull(),
    vertical: verticalEnum("vertical"),
    competitor: text("competitor"),
    synthesis: text("synthesis").notNull(),
    recommendations: jsonb("recommendations").notNull().default(sql`'[]'::jsonb`),
    arrImpact: jsonb("arr_impact").notNull().default(sql`'{}'::jsonb`),
    score: decimal("score", { precision: 5, scale: 2 }),
    reasoning: text("reasoning"),
    applicability: jsonb("applicability").notNull().default(sql`'{}'::jsonb`),
    status: coordinatorPatternStatusEnum("status").notNull().default("detected"),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    synthesizedAt: timestamp("synthesized_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    signalTypeIdx: index("coordinator_patterns_signal_type_idx").on(t.signalType),
    verticalIdx: index("coordinator_patterns_vertical_idx").on(t.vertical),
    statusIdx: index("coordinator_patterns_status_idx").on(t.status),
  }),
);

/** Replaces v1's coordinator_patterns.deal_ids text[]. */
export const coordinatorPatternDeals = pgTable(
  "coordinator_pattern_deals",
  {
    patternId: uuid("pattern_id")
      .notNull()
      .references(() => coordinatorPatterns.id, { onDelete: "cascade" }),
    hubspotDealId: text("hubspot_deal_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.patternId, t.hubspotDealId] }),
    patternIdx: index("coordinator_pattern_deals_pattern_idx").on(t.patternId),
    dealIdx: index("coordinator_pattern_deals_deal_idx").on(t.hubspotDealId),
  }),
);

/* ---------------------------------------------------------------------------
 * Experiments
 * ------------------------------------------------------------------------- */

export const experiments = pgTable(
  "experiments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    originatorId: uuid("originator_id")
      .notNull()
      .references(() => teamMembers.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    hypothesis: text("hypothesis").notNull(),
    description: text("description"),
    category: experimentCategoryEnum("category").notNull(),
    lifecycle: experimentLifecycleEnum("lifecycle").notNull().default("proposed"),
    applicability: jsonb("applicability").notNull().default(sql`'{}'::jsonb`),
    thresholds: jsonb("thresholds").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    originatorIdx: index("experiments_originator_idx").on(t.originatorId),
    lifecycleIdx: index("experiments_lifecycle_idx").on(t.lifecycle),
    categoryIdx: index("experiments_category_idx").on(t.category),
  }),
);

export const experimentAssignments = pgTable(
  "experiment_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    experimentId: uuid("experiment_id")
      .notNull()
      .references(() => experiments.id, { onDelete: "cascade" }),
    assignedMemberId: uuid("assigned_member_id")
      .notNull()
      .references(() => teamMembers.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    endAt: timestamp("end_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => ({
    uniqAssignment: unique("experiment_assignments_unique").on(t.experimentId, t.assignedMemberId),
    experimentIdx: index("experiment_assignments_experiment_idx").on(t.experimentId),
    memberIdx: index("experiment_assignments_member_idx").on(t.assignedMemberId),
  }),
);

export const experimentAttributions = pgTable(
  "experiment_attributions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    experimentId: uuid("experiment_id")
      .notNull()
      .references(() => experiments.id, { onDelete: "cascade" }),
    hubspotDealId: text("hubspot_deal_id").notNull(),
    matched: boolean("matched").notNull(),
    confidence: decimal("confidence", { precision: 4, scale: 3 }),
    transcriptId: uuid("transcript_id"),
    attributedAt: timestamp("attributed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    experimentIdx: index("experiment_attributions_experiment_idx").on(t.experimentId),
    dealIdx: index("experiment_attributions_deal_idx").on(t.hubspotDealId),
    transcriptIdx: index("experiment_attributions_transcript_idx").on(t.transcriptId),
  }),
);

/** Many-to-many: attribution evidence points at deal_events rows (no uuid[] arrays). */
export const experimentAttributionEvents = pgTable(
  "experiment_attribution_events",
  {
    attributionId: uuid("attribution_id")
      .notNull()
      .references(() => experimentAttributions.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => dealEvents.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.attributionId, t.eventId] }),
    attributionIdx: index("experiment_attribution_events_attribution_idx").on(t.attributionId),
    eventIdx: index("experiment_attribution_events_event_idx").on(t.eventId),
  }),
);

/* ---------------------------------------------------------------------------
 * Transcripts + analyzed transcripts (§2.13 canonical preprocessor)
 * ------------------------------------------------------------------------- */

export const transcripts = pgTable(
  "transcripts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hubspotDealId: text("hubspot_deal_id").notNull(),
    title: text("title").notNull(),
    transcriptText: text("transcript_text").notNull(),
    participants: jsonb("participants").notNull().default(sql`'[]'::jsonb`),
    source: transcriptSourceEnum("source").notNull().default("simulated"),
    durationSeconds: integer("duration_seconds"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }),
    hubspotEngagementId: text("hubspot_engagement_id"),
    pipelineProcessed: boolean("pipeline_processed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dealIdx: index("transcripts_deal_idx").on(t.hubspotDealId),
    sourceIdx: index("transcripts_source_idx").on(t.source),
    engagementIdx: index("transcripts_engagement_idx").on(t.hubspotEngagementId),
  }),
);

export const analyzedTranscripts = pgTable(
  "analyzed_transcripts",
  {
    transcriptId: uuid("transcript_id")
      .primaryKey()
      .references(() => transcripts.id, { onDelete: "cascade" }),
    speakerTurns: jsonb("speaker_turns").notNull(),
    entities: jsonb("entities").notNull().default(sql`'{}'::jsonb`),
    competitorsMentioned: text("competitors_mentioned").array().notNull().default(sql`'{}'::text[]`),
    topics: jsonb("topics").notNull().default(sql`'[]'::jsonb`),
    sentiment: jsonb("sentiment").notNull().default(sql`'{}'::jsonb`),
    wordCount: integer("word_count").notNull(),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

/* ---------------------------------------------------------------------------
 * MEDDPICC scores (one row per deal mirrors HubSpot custom properties)
 * ------------------------------------------------------------------------- */

export const meddpiccScores = pgTable(
  "meddpicc_scores",
  {
    hubspotDealId: text("hubspot_deal_id").primaryKey(),
    metricsScore: integer("metrics_score"),
    economicBuyerScore: integer("economic_buyer_score"),
    decisionCriteriaScore: integer("decision_criteria_score"),
    decisionProcessScore: integer("decision_process_score"),
    paperProcessScore: integer("paper_process_score"),
    identifyPainScore: integer("identify_pain_score"),
    championScore: integer("champion_score"),
    competitionScore: integer("competition_score"),
    overallScore: integer("overall_score"),
    perDimensionConfidence: jsonb("per_dimension_confidence").notNull().default(sql`'{}'::jsonb`),
    evidence: jsonb("evidence").notNull().default(sql`'{}'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

/* ---------------------------------------------------------------------------
 * Deal fitness (oDeal framework) — readiness spelled correctly
 * ------------------------------------------------------------------------- */

export const dealFitnessEvents = pgTable(
  "deal_fitness_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hubspotDealId: text("hubspot_deal_id").notNull(),
    eventKey: text("event_key").notNull(),
    fitCategory: odealCategoryEnum("fit_category").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    detected: boolean("detected").notNull().default(false),
    detectedAt: timestamp("detected_at", { withTimezone: true }),
    evidenceSnippets: jsonb("evidence_snippets").notNull().default(sql`'[]'::jsonb`),
    sourceReferences: jsonb("source_references").notNull().default(sql`'[]'::jsonb`),
    confidence: decimal("confidence", { precision: 4, scale: 3 }),
    coachingText: text("coaching_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqDealEvent: unique("deal_fitness_events_unique").on(t.hubspotDealId, t.eventKey),
    dealIdx: index("deal_fitness_events_deal_idx").on(t.hubspotDealId),
    categoryIdx: index("deal_fitness_events_category_idx").on(t.fitCategory),
    detectedIdx: index("deal_fitness_events_detected_idx").on(t.detected),
  }),
);

export const dealFitnessScores = pgTable(
  "deal_fitness_scores",
  {
    hubspotDealId: text("hubspot_deal_id").primaryKey(),
    businessFitScore: integer("business_fit_score"),
    emotionalFitScore: integer("emotional_fit_score"),
    technicalFitScore: integer("technical_fit_score"),
    readinessFitScore: integer("readiness_fit_score"),
    overallScore: integer("overall_score"),
    velocityTrend: text("velocity_trend"),
    fitImbalanceFlag: boolean("fit_imbalance_flag").notNull().default(false),
    benchmarkVsWon: jsonb("benchmark_vs_won"),
    stakeholderEngagement: jsonb("stakeholder_engagement"),
    buyerMomentum: jsonb("buyer_momentum"),
    conversationSignals: jsonb("conversation_signals"),
    dealInsight: text("deal_insight"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

/* ---------------------------------------------------------------------------
 * Agent configs + proposals
 * ------------------------------------------------------------------------- */

export const agentConfigs = pgTable(
  "agent_configs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    teamMemberId: uuid("team_member_id")
      .notNull()
      .unique()
      .references(() => teamMembers.id, { onDelete: "cascade" }),
    agentName: text("agent_name").notNull(),
    roleType: teamMemberRoleEnum("role_type").notNull(),
    instructions: text("instructions").notNull().default(""),
    outputPreferences: jsonb("output_preferences").notNull().default(sql`'{}'::jsonb`),
    version: integer("version").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    memberIdx: index("agent_configs_member_idx").on(t.teamMemberId),
  }),
);

export const agentConfigVersions = pgTable(
  "agent_config_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentConfigId: uuid("agent_config_id")
      .notNull()
      .references(() => agentConfigs.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    instructions: text("instructions").notNull(),
    outputPreferences: jsonb("output_preferences").notNull().default(sql`'{}'::jsonb`),
    changedBy: agentConfigChangeAuthorEnum("changed_by").notNull(),
    changeReason: text("change_reason"),
    changedByUserId: uuid("changed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqVersion: unique("agent_config_versions_unique").on(t.agentConfigId, t.version),
    configIdx: index("agent_config_versions_config_idx").on(t.agentConfigId),
    userIdx: index("agent_config_versions_user_idx").on(t.changedByUserId),
  }),
);

export const agentConfigProposals = pgTable(
  "agent_config_proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentConfigId: uuid("agent_config_id")
      .notNull()
      .references(() => agentConfigs.id, { onDelete: "cascade" }),
    proposedByUserId: uuid("proposed_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceObservationId: uuid("source_observation_id").references(() => observations.id, {
      onDelete: "set null",
    }),
    proposedChanges: jsonb("proposed_changes").notNull(),
    reasoning: text("reasoning"),
    status: agentConfigProposalStatusEnum("status").notNull().default("pending"),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    configIdx: index("agent_config_proposals_config_idx").on(t.agentConfigId),
    proposerIdx: index("agent_config_proposals_proposer_idx").on(t.proposedByUserId),
    resolverIdx: index("agent_config_proposals_resolver_idx").on(t.resolvedByUserId),
    observationIdx: index("agent_config_proposals_observation_idx").on(t.sourceObservationId),
    statusIdx: index("agent_config_proposals_status_idx").on(t.status),
  }),
);

/* ---------------------------------------------------------------------------
 * Directives + system intelligence
 * ------------------------------------------------------------------------- */

export const managerDirectives = pgTable(
  "manager_directives",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => teamMembers.id, { onDelete: "restrict" }),
    directiveText: text("directive_text").notNull(),
    scope: jsonb("scope").notNull().default(sql`'{}'::jsonb`),
    priority: priorityEnum("priority").notNull().default("medium"),
    category: text("category"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    authorIdx: index("manager_directives_author_idx").on(t.authorId),
    activeIdx: index("manager_directives_active_idx").on(t.isActive),
    priorityIdx: index("manager_directives_priority_idx").on(t.priority),
  }),
);

export const systemIntelligence = pgTable(
  "system_intelligence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vertical: verticalEnum("vertical"),
    insightType: text("insight_type").notNull(),
    title: text("title").notNull(),
    insight: text("insight").notNull(),
    supportingData: jsonb("supporting_data").notNull().default(sql`'{}'::jsonb`),
    confidence: decimal("confidence", { precision: 4, scale: 3 }),
    relevanceScore: decimal("relevance_score", { precision: 5, scale: 2 }),
    status: systemIntelligenceStatusEnum("status").notNull().default("active"),
    hubspotCompanyId: text("hubspot_company_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    verticalIdx: index("system_intelligence_vertical_idx").on(t.vertical),
    typeIdx: index("system_intelligence_type_idx").on(t.insightType),
    statusIdx: index("system_intelligence_status_idx").on(t.status),
    companyIdx: index("system_intelligence_company_idx").on(t.hubspotCompanyId),
  }),
);

/* ---------------------------------------------------------------------------
 * Knowledge + customer (post-close)
 * ------------------------------------------------------------------------- */

export const knowledgeArticles = pgTable(
  "knowledge_articles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    articleType: text("article_type").notNull(),
    content: text("content").notNull(),
    summary: text("summary"),
    products: text("products").array().notNull().default(sql`'{}'::text[]`),
    verticals: verticalEnum("verticals").array().notNull().default(sql`'{}'::vertical[]`),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    resolutionSteps: jsonb("resolution_steps"),
    relatedHubspotCompanyIds: text("related_hubspot_company_ids").array().notNull().default(sql`'{}'::text[]`),
    effectivenessScore: decimal("effectiveness_score", { precision: 4, scale: 3 }),
    viewCount: integer("view_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    typeIdx: index("knowledge_articles_type_idx").on(t.articleType),
  }),
);

export const customerMessages = pgTable(
  "customer_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hubspotCompanyId: text("hubspot_company_id").notNull(),
    hubspotContactId: text("hubspot_contact_id"),
    hubspotDealId: text("hubspot_deal_id"),
    hubspotEngagementId: text("hubspot_engagement_id"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    channel: customerMessageChannelEnum("channel").notNull(),
    priority: priorityEnum("priority").notNull().default("medium"),
    status: customerMessageStatusEnum("status").notNull().default("pending"),
    responseKit: jsonb("response_kit"),
    aiCategory: text("ai_category"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    responseText: text("response_text"),
    respondedEngagementId: text("responded_engagement_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    companyIdx: index("customer_messages_company_idx").on(t.hubspotCompanyId),
    contactIdx: index("customer_messages_contact_idx").on(t.hubspotContactId),
    dealIdx: index("customer_messages_deal_idx").on(t.hubspotDealId),
    engagementIdx: index("customer_messages_engagement_idx").on(t.hubspotEngagementId),
    statusIdx: index("customer_messages_status_idx").on(t.status),
    channelIdx: index("customer_messages_channel_idx").on(t.channel),
  }),
);

export const accountHealth = pgTable(
  "account_health",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hubspotCompanyId: text("hubspot_company_id").notNull(),
    hubspotDealId: text("hubspot_deal_id").notNull().unique(),
    healthScore: integer("health_score").notNull().default(0),
    healthTrend: healthTrendEnum("health_trend").notNull().default("stable"),
    healthFactors: jsonb("health_factors").notNull().default(sql`'{}'::jsonb`),
    contractStatus: contractStatusEnum("contract_status").notNull().default("active"),
    usageMetrics: jsonb("usage_metrics").notNull().default(sql`'{}'::jsonb`),
    keyStakeholders: jsonb("key_stakeholders").notNull().default(sql`'[]'::jsonb`),
    expansionSignals: jsonb("expansion_signals").notNull().default(sql`'[]'::jsonb`),
    riskSignals: jsonb("risk_signals").notNull().default(sql`'[]'::jsonb`),
    contractedUseCases: jsonb("contracted_use_cases").notNull().default(sql`'[]'::jsonb`),
    expansionMap: jsonb("expansion_map").notNull().default(sql`'[]'::jsonb`),
    proactiveSignals: jsonb("proactive_signals").notNull().default(sql`'[]'::jsonb`),
    similarSituations: jsonb("similar_situations").notNull().default(sql`'[]'::jsonb`),
    recommendedResources: jsonb("recommended_resources").notNull().default(sql`'[]'::jsonb`),
    renewalDate: date("renewal_date"),
    lastTouchDate: date("last_touch_date"),
    daysSinceTouch: integer("days_since_touch"),
    nextQbrDate: date("next_qbr_date"),
    onboardingComplete: boolean("onboarding_complete").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    companyIdx: index("account_health_company_idx").on(t.hubspotCompanyId),
    statusIdx: index("account_health_status_idx").on(t.contractStatus),
    trendIdx: index("account_health_trend_idx").on(t.healthTrend),
  }),
);

/* ---------------------------------------------------------------------------
 * Field queries (split initiator per §2.2; CHECK ensures exactly one)
 * ------------------------------------------------------------------------- */

export const fieldQueries = pgTable(
  "field_queries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    initiatedByTeamMemberId: uuid("initiated_by_team_member_id").references(
      () => teamMembers.id,
      { onDelete: "restrict" },
    ),
    initiatedBySupportFunctionMemberId: uuid("initiated_by_support_function_member_id").references(
      () => supportFunctionMembers.id,
      { onDelete: "restrict" },
    ),
    rawQuestion: text("raw_question").notNull(),
    aiAnalysis: jsonb("ai_analysis"),
    status: fieldQueryStatusEnum("status").notNull().default("open"),
    scopeHubspotDealId: text("scope_hubspot_deal_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    teamInitiatorIdx: index("field_queries_team_initiator_idx").on(t.initiatedByTeamMemberId),
    supportInitiatorIdx: index("field_queries_support_initiator_idx").on(
      t.initiatedBySupportFunctionMemberId,
    ),
    statusIdx: index("field_queries_status_idx").on(t.status),
    dealScopeIdx: index("field_queries_deal_scope_idx").on(t.scopeHubspotDealId),
    initiatorCheck: check(
      "field_queries_exactly_one_initiator",
      sql`((${t.initiatedByTeamMemberId} IS NOT NULL)::int + (${t.initiatedBySupportFunctionMemberId} IS NOT NULL)::int) = 1`,
    ),
  }),
);

export const fieldQueryQuestions = pgTable(
  "field_query_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    queryId: uuid("query_id")
      .notNull()
      .references(() => fieldQueries.id, { onDelete: "cascade" }),
    targetMemberId: uuid("target_member_id")
      .notNull()
      .references(() => teamMembers.id, { onDelete: "cascade" }),
    questionText: text("question_text").notNull(),
    chips: text("chips").array().notNull().default(sql`'{}'::text[]`),
    giveBack: jsonb("give_back"),
    status: fieldQueryQuestionStatusEnum("status").notNull().default("pending"),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    response: text("response"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    queryIdx: index("field_query_questions_query_idx").on(t.queryId),
    targetIdx: index("field_query_questions_target_idx").on(t.targetMemberId),
    statusIdx: index("field_query_questions_status_idx").on(t.status),
  }),
);

/* ---------------------------------------------------------------------------
 * Notifications + surface dismissals/feedback (§1.17, §2.26)
 * ------------------------------------------------------------------------- */

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    link: text("link"),
    priority: priorityEnum("priority").notNull().default("medium"),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("notifications_user_idx").on(t.userId),
    unreadIdx: index("notifications_unread_idx").on(t.userId, t.isRead),
    priorityIdx: index("notifications_priority_idx").on(t.priority),
  }),
);

export const surfaceDismissals = pgTable(
  "surface_dismissals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    insightId: text("insight_id").notNull(),
    insightType: text("insight_type").notNull(),
    hubspotDealId: text("hubspot_deal_id"),
    mode: surfaceDismissalModeEnum("mode").notNull().default("soft"),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }).notNull().defaultNow(),
    resurfaceAfter: timestamp("resurface_after", { withTimezone: true }),
  },
  (t) => ({
    uniqDismissal: unique("surface_dismissals_unique").on(t.userId, t.insightId, t.insightType),
    userIdx: index("surface_dismissals_user_idx").on(t.userId),
    insightIdx: index("surface_dismissals_insight_idx").on(t.insightId),
    resurfaceIdx: index("surface_dismissals_resurface_idx").on(t.resurfaceAfter),
  }),
);

/* ---------------------------------------------------------------------------
 * Jobs (§4.5)
 * ------------------------------------------------------------------------- */

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: jobTypeEnum("type").notNull(),
    status: jobStatusEnum("status").notNull().default("queued"),
    input: jsonb("input").notNull().default(sql`'{}'::jsonb`),
    result: jsonb("result"),
    error: text("error"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusScheduledIdx: index("jobs_status_scheduled_idx").on(t.status, t.scheduledFor),
    userCreatedIdx: index("jobs_user_created_idx").on(t.userId, t.createdAt),
    typeIdx: index("jobs_type_idx").on(t.type),
    createdIdx: index("jobs_created_idx").on(t.createdAt),
  }),
);

export const jobResults = pgTable(
  "job_results",
  {
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    stepIndex: integer("step_index").notNull(),
    stepName: text("step_name").notNull(),
    output: jsonb("output"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.jobId, t.stepIndex] }),
    jobIdx: index("job_results_job_idx").on(t.jobId),
  }),
);

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  user: one(users, { fields: [jobs.userId], references: [users.id] }),
  results: many(jobResults),
}));

export const jobResultsRelations = relations(jobResults, ({ one }) => ({
  job: one(jobs, { fields: [jobResults.jobId], references: [jobs.id] }),
}));

export const surfaceFeedback = pgTable(
  "surface_feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    insightId: text("insight_id").notNull(),
    insightType: text("insight_type").notNull(),
    hubspotDealId: text("hubspot_deal_id"),
    reasonTags: text("reason_tags").array().notNull().default(sql`'{}'::text[]`),
    freeText: text("free_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("surface_feedback_user_idx").on(t.userId),
    insightIdx: index("surface_feedback_insight_idx").on(t.insightId),
    insightTypeIdx: index("surface_feedback_insight_type_idx").on(t.insightType),
  }),
);

/* ---------------------------------------------------------------------------
 * Relations
 * ------------------------------------------------------------------------- */

export const usersRelations = relations(users, ({ one, many }) => ({
  teamMember: one(teamMembers),
  supportFunctionMember: one(supportFunctionMembers),
  observations: many(observations),
  notifications: many(notifications),
  surfaceDismissals: many(surfaceDismissals),
  surfaceFeedback: many(surfaceFeedback),
  agentConfigProposalsProposed: many(agentConfigProposals, { relationName: "proposer" }),
  agentConfigProposalsResolved: many(agentConfigProposals, { relationName: "resolver" }),
}));

export const teamMembersRelations = relations(teamMembers, ({ one, many }) => ({
  user: one(users, { fields: [teamMembers.userId], references: [users.id] }),
  agentConfig: one(agentConfigs),
  managerDirectives: many(managerDirectives),
  experiments: many(experiments),
  experimentAssignments: many(experimentAssignments),
  fieldQueriesInitiated: many(fieldQueries),
  fieldQueriesTargeted: many(fieldQueryQuestions),
}));

export const supportFunctionMembersRelations = relations(supportFunctionMembers, ({ one, many }) => ({
  user: one(users, { fields: [supportFunctionMembers.userId], references: [users.id] }),
  fieldQueriesInitiated: many(fieldQueries),
}));

export const peopleRelations = relations(people, ({ many }) => ({
  contacts: many(peopleContacts),
}));

export const peopleContactsRelations = relations(peopleContacts, ({ one }) => ({
  person: one(people, { fields: [peopleContacts.personId], references: [people.id] }),
}));

export const observationsRelations = relations(observations, ({ one, many }) => ({
  observer: one(users, { fields: [observations.observerId], references: [users.id] }),
  cluster: one(observationClusters, {
    fields: [observations.clusterId],
    references: [observationClusters.id],
  }),
  deals: many(observationDeals),
}));

export const observationClustersRelations = relations(observationClusters, ({ many }) => ({
  observations: many(observations),
}));

export const observationDealsRelations = relations(observationDeals, ({ one }) => ({
  observation: one(observations, {
    fields: [observationDeals.observationId],
    references: [observations.id],
  }),
}));

export const dealEventsRelations = relations(dealEvents, ({ one, many }) => ({
  actor: one(users, { fields: [dealEvents.actorUserId], references: [users.id] }),
  attributionEvents: many(experimentAttributionEvents),
}));

export const dealSnapshotsRelations = relations(dealSnapshots, ({ one }) => ({
  builtFromEvent: one(dealEvents, {
    fields: [dealSnapshots.builtFromEventId],
    references: [dealEvents.id],
  }),
}));

export const coordinatorPatternsRelations = relations(coordinatorPatterns, ({ many }) => ({
  deals: many(coordinatorPatternDeals),
}));

export const coordinatorPatternDealsRelations = relations(coordinatorPatternDeals, ({ one }) => ({
  pattern: one(coordinatorPatterns, {
    fields: [coordinatorPatternDeals.patternId],
    references: [coordinatorPatterns.id],
  }),
}));

export const experimentsRelations = relations(experiments, ({ one, many }) => ({
  originator: one(teamMembers, {
    fields: [experiments.originatorId],
    references: [teamMembers.id],
  }),
  assignments: many(experimentAssignments),
  attributions: many(experimentAttributions),
}));

export const experimentAssignmentsRelations = relations(experimentAssignments, ({ one }) => ({
  experiment: one(experiments, {
    fields: [experimentAssignments.experimentId],
    references: [experiments.id],
  }),
  member: one(teamMembers, {
    fields: [experimentAssignments.assignedMemberId],
    references: [teamMembers.id],
  }),
}));

export const experimentAttributionsRelations = relations(experimentAttributions, ({ one, many }) => ({
  experiment: one(experiments, {
    fields: [experimentAttributions.experimentId],
    references: [experiments.id],
  }),
  transcript: one(transcripts, {
    fields: [experimentAttributions.transcriptId],
    references: [transcripts.id],
  }),
  evidenceEvents: many(experimentAttributionEvents),
}));

export const experimentAttributionEventsRelations = relations(
  experimentAttributionEvents,
  ({ one }) => ({
    attribution: one(experimentAttributions, {
      fields: [experimentAttributionEvents.attributionId],
      references: [experimentAttributions.id],
    }),
    event: one(dealEvents, {
      fields: [experimentAttributionEvents.eventId],
      references: [dealEvents.id],
    }),
  }),
);

export const transcriptsRelations = relations(transcripts, ({ one }) => ({
  analyzed: one(analyzedTranscripts, {
    fields: [transcripts.id],
    references: [analyzedTranscripts.transcriptId],
  }),
}));

export const analyzedTranscriptsRelations = relations(analyzedTranscripts, ({ one }) => ({
  transcript: one(transcripts, {
    fields: [analyzedTranscripts.transcriptId],
    references: [transcripts.id],
  }),
}));

export const agentConfigsRelations = relations(agentConfigs, ({ one, many }) => ({
  member: one(teamMembers, {
    fields: [agentConfigs.teamMemberId],
    references: [teamMembers.id],
  }),
  versions: many(agentConfigVersions),
  proposals: many(agentConfigProposals),
}));

export const agentConfigVersionsRelations = relations(agentConfigVersions, ({ one }) => ({
  config: one(agentConfigs, {
    fields: [agentConfigVersions.agentConfigId],
    references: [agentConfigs.id],
  }),
  changedByUser: one(users, {
    fields: [agentConfigVersions.changedByUserId],
    references: [users.id],
  }),
}));

export const agentConfigProposalsRelations = relations(agentConfigProposals, ({ one }) => ({
  config: one(agentConfigs, {
    fields: [agentConfigProposals.agentConfigId],
    references: [agentConfigs.id],
  }),
  proposer: one(users, {
    fields: [agentConfigProposals.proposedByUserId],
    references: [users.id],
    relationName: "proposer",
  }),
  resolver: one(users, {
    fields: [agentConfigProposals.resolvedByUserId],
    references: [users.id],
    relationName: "resolver",
  }),
  sourceObservation: one(observations, {
    fields: [agentConfigProposals.sourceObservationId],
    references: [observations.id],
  }),
}));

export const managerDirectivesRelations = relations(managerDirectives, ({ one }) => ({
  author: one(teamMembers, {
    fields: [managerDirectives.authorId],
    references: [teamMembers.id],
  }),
}));

export const fieldQueriesRelations = relations(fieldQueries, ({ one, many }) => ({
  teamInitiator: one(teamMembers, {
    fields: [fieldQueries.initiatedByTeamMemberId],
    references: [teamMembers.id],
  }),
  supportInitiator: one(supportFunctionMembers, {
    fields: [fieldQueries.initiatedBySupportFunctionMemberId],
    references: [supportFunctionMembers.id],
  }),
  questions: many(fieldQueryQuestions),
}));

export const fieldQueryQuestionsRelations = relations(fieldQueryQuestions, ({ one }) => ({
  query: one(fieldQueries, {
    fields: [fieldQueryQuestions.queryId],
    references: [fieldQueries.id],
  }),
  target: one(teamMembers, {
    fields: [fieldQueryQuestions.targetMemberId],
    references: [teamMembers.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const surfaceDismissalsRelations = relations(surfaceDismissals, ({ one }) => ({
  user: one(users, { fields: [surfaceDismissals.userId], references: [users.id] }),
}));

export const surfaceFeedbackRelations = relations(surfaceFeedback, ({ one }) => ({
  user: one(users, { fields: [surfaceFeedback.userId], references: [users.id] }),
}));
