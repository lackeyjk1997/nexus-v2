CREATE TYPE "public"."agent_config_change_author" AS ENUM('user', 'feedback_loop', 'ai_proposal');--> statement-breakpoint
CREATE TYPE "public"."agent_config_proposal_status" AS ENUM('pending', 'approved', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."confidence_band" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."contact_role" AS ENUM('champion', 'economic_buyer', 'decision_maker', 'technical_evaluator', 'end_user', 'procurement', 'influencer', 'blocker', 'coach');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('onboarding', 'active', 'renewal_window', 'at_risk', 'churned');--> statement-breakpoint
CREATE TYPE "public"."coordinator_pattern_status" AS ENUM('detected', 'synthesized', 'expired');--> statement-breakpoint
CREATE TYPE "public"."customer_message_channel" AS ENUM('email', 'support_ticket', 'slack', 'meeting_note');--> statement-breakpoint
CREATE TYPE "public"."customer_message_status" AS ENUM('pending', 'kit_ready', 'responded', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."deal_event_source_kind" AS ENUM('prompt', 'service', 'user', 'webhook', 'scheduled_job');--> statement-breakpoint
CREATE TYPE "public"."deal_event_type" AS ENUM('stage_changed', 'meddpicc_scored', 'signal_detected', 'stakeholder_engagement_recorded', 'transcript_ingested', 'deal_theory_updated', 'risk_flag_raised', 'risk_flag_cleared', 'coordinated_intel_received', 'experiment_attributed', 'observation_linked', 'intervention_proposed', 'intervention_resolved', 'email_drafted', 'call_prep_generated', 'close_hypothesis_produced', 'close_reconciliation_recorded', 'agent_action_recorded', 'agent_config_change_proposed', 'agent_config_change_applied');--> statement-breakpoint
CREATE TYPE "public"."deal_stage" AS ENUM('prospect', 'qualified', 'discovery', 'technical_validation', 'proposal', 'negotiation', 'closing', 'closed_won', 'closed_lost');--> statement-breakpoint
CREATE TYPE "public"."engagement_status" AS ENUM('engaged', 'silent', 'new', 'departed');--> statement-breakpoint
CREATE TYPE "public"."experiment_category" AS ENUM('in_conversation', 'out_of_conversation', 'implicit_approach');--> statement-breakpoint
CREATE TYPE "public"."experiment_lifecycle" AS ENUM('proposed', 'active', 'graduated', 'killed');--> statement-breakpoint
CREATE TYPE "public"."field_query_question_status" AS ENUM('pending', 'answered', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."field_query_status" AS ENUM('open', 'closed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."health_trend" AS ENUM('improving', 'stable', 'declining', 'critical');--> statement-breakpoint
CREATE TYPE "public"."hubspot_object_type" AS ENUM('deal', 'contact', 'company', 'engagement');--> statement-breakpoint
CREATE TYPE "public"."meddpicc_dimension" AS ENUM('metrics', 'economic_buyer', 'decision_criteria', 'decision_process', 'paper_process', 'identify_pain', 'champion', 'competition');--> statement-breakpoint
CREATE TYPE "public"."observation_status" AS ENUM('pending_review', 'routed', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."odeal_category" AS ENUM('business_fit', 'emotional_fit', 'technical_fit', 'readiness_fit');--> statement-breakpoint
CREATE TYPE "public"."person_link_method" AS ENUM('email_match', 'manual', 'ai_inferred');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."signal_taxonomy" AS ENUM('deal_blocker', 'competitive_intel', 'process_friction', 'content_gap', 'win_pattern', 'field_intelligence', 'process_innovation', 'agent_tuning', 'cross_agent');--> statement-breakpoint
CREATE TYPE "public"."support_function" AS ENUM('enablement', 'product_marketing', 'deal_desk', 'customer_success');--> statement-breakpoint
CREATE TYPE "public"."surface_dismissal_mode" AS ENUM('soft', 'hard');--> statement-breakpoint
CREATE TYPE "public"."system_intelligence_status" AS ENUM('active', 'stale', 'archived');--> statement-breakpoint
CREATE TYPE "public"."team_member_role" AS ENUM('AE', 'BDR', 'SA', 'CSM', 'MANAGER');--> statement-breakpoint
CREATE TYPE "public"."transcript_source" AS ENUM('simulated', 'hubspot_call', 'uploaded');--> statement-breakpoint
CREATE TYPE "public"."vertical" AS ENUM('healthcare', 'financial_services', 'technology', 'retail', 'manufacturing', 'general');--> statement-breakpoint
CREATE TABLE "account_health" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hubspot_company_id" text NOT NULL,
	"hubspot_deal_id" text NOT NULL,
	"health_score" integer DEFAULT 0 NOT NULL,
	"health_trend" "health_trend" DEFAULT 'stable' NOT NULL,
	"health_factors" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"contract_status" "contract_status" DEFAULT 'active' NOT NULL,
	"usage_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"key_stakeholders" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expansion_signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"risk_signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contracted_use_cases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expansion_map" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"proactive_signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"similar_situations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommended_resources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"renewal_date" date,
	"last_touch_date" date,
	"days_since_touch" integer,
	"next_qbr_date" date,
	"onboarding_complete" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_health_hubspot_deal_id_unique" UNIQUE("hubspot_deal_id")
);
--> statement-breakpoint
CREATE TABLE "agent_config_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_config_id" uuid NOT NULL,
	"proposed_by_user_id" uuid NOT NULL,
	"source_observation_id" uuid,
	"proposed_changes" jsonb NOT NULL,
	"reasoning" text,
	"status" "agent_config_proposal_status" DEFAULT 'pending' NOT NULL,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_config_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_config_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"instructions" text NOT NULL,
	"output_preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"changed_by" "agent_config_change_author" NOT NULL,
	"change_reason" text,
	"changed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_config_versions_unique" UNIQUE("agent_config_id","version")
);
--> statement-breakpoint
CREATE TABLE "agent_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_member_id" uuid NOT NULL,
	"agent_name" text NOT NULL,
	"role_type" "team_member_role" NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"output_preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_configs_team_member_id_unique" UNIQUE("team_member_id")
);
--> statement-breakpoint
CREATE TABLE "analyzed_transcripts" (
	"transcript_id" uuid PRIMARY KEY NOT NULL,
	"speaker_turns" jsonb NOT NULL,
	"entities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"competitors_mentioned" text[] DEFAULT '{}'::text[] NOT NULL,
	"topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sentiment" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"word_count" integer NOT NULL,
	"analyzed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coordinator_pattern_deals" (
	"pattern_id" uuid NOT NULL,
	"hubspot_deal_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coordinator_pattern_deals_pattern_id_hubspot_deal_id_pk" PRIMARY KEY("pattern_id","hubspot_deal_id")
);
--> statement-breakpoint
CREATE TABLE "coordinator_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern_key" text NOT NULL,
	"signal_type" "signal_taxonomy" NOT NULL,
	"vertical" "vertical",
	"competitor" text,
	"synthesis" text NOT NULL,
	"recommendations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"arr_impact" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score" numeric(5, 2),
	"reasoning" text,
	"applicability" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "coordinator_pattern_status" DEFAULT 'detected' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"synthesized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coordinator_patterns_pattern_key_unique" UNIQUE("pattern_key")
);
--> statement-breakpoint
CREATE TABLE "customer_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hubspot_company_id" text NOT NULL,
	"hubspot_contact_id" text,
	"hubspot_deal_id" text,
	"hubspot_engagement_id" text,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"channel" "customer_message_channel" NOT NULL,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"status" "customer_message_status" DEFAULT 'pending' NOT NULL,
	"response_kit" jsonb,
	"ai_category" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"response_text" text,
	"responded_engagement_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_contact_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hubspot_deal_id" text NOT NULL,
	"hubspot_contact_id" text NOT NULL,
	"role" "contact_role" NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_contact_roles_unique" UNIQUE("hubspot_deal_id","hubspot_contact_id")
);
--> statement-breakpoint
CREATE TABLE "deal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hubspot_deal_id" text NOT NULL,
	"type" "deal_event_type" NOT NULL,
	"payload" jsonb NOT NULL,
	"source_kind" "deal_event_source_kind" NOT NULL,
	"source_ref" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_fitness_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hubspot_deal_id" text NOT NULL,
	"event_key" text NOT NULL,
	"fit_category" "odeal_category" NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"detected" boolean DEFAULT false NOT NULL,
	"detected_at" timestamp with time zone,
	"evidence_snippets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" numeric(4, 3),
	"coaching_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_fitness_events_unique" UNIQUE("hubspot_deal_id","event_key")
);
--> statement-breakpoint
CREATE TABLE "deal_fitness_scores" (
	"hubspot_deal_id" text PRIMARY KEY NOT NULL,
	"business_fit_score" integer,
	"emotional_fit_score" integer,
	"technical_fit_score" integer,
	"readiness_fit_score" integer,
	"overall_score" integer,
	"velocity_trend" text,
	"fit_imbalance_flag" boolean DEFAULT false NOT NULL,
	"benchmark_vs_won" jsonb,
	"stakeholder_engagement" jsonb,
	"buyer_momentum" jsonb,
	"conversation_signals" jsonb,
	"deal_insight" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_snapshots" (
	"hubspot_deal_id" text NOT NULL,
	"snapshot_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"built_from_event_id" uuid,
	CONSTRAINT "deal_snapshots_hubspot_deal_id_snapshot_at_pk" PRIMARY KEY("hubspot_deal_id","snapshot_at")
);
--> statement-breakpoint
CREATE TABLE "experiment_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"assigned_member_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"end_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "experiment_assignments_unique" UNIQUE("experiment_id","assigned_member_id")
);
--> statement-breakpoint
CREATE TABLE "experiment_attribution_events" (
	"attribution_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	CONSTRAINT "experiment_attribution_events_attribution_id_event_id_pk" PRIMARY KEY("attribution_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "experiment_attributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"hubspot_deal_id" text NOT NULL,
	"matched" boolean NOT NULL,
	"confidence" numeric(4, 3),
	"transcript_id" uuid,
	"attributed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"originator_id" uuid NOT NULL,
	"title" text NOT NULL,
	"hypothesis" text NOT NULL,
	"description" text,
	"category" "experiment_category" NOT NULL,
	"lifecycle" "experiment_lifecycle" DEFAULT 'proposed' NOT NULL,
	"applicability" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"thresholds" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"initiated_by_team_member_id" uuid,
	"initiated_by_support_function_member_id" uuid,
	"raw_question" text NOT NULL,
	"ai_analysis" jsonb,
	"status" "field_query_status" DEFAULT 'open' NOT NULL,
	"scope_hubspot_deal_id" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "field_queries_exactly_one_initiator" CHECK ((("field_queries"."initiated_by_team_member_id" IS NOT NULL)::int + ("field_queries"."initiated_by_support_function_member_id" IS NOT NULL)::int) = 1)
);
--> statement-breakpoint
CREATE TABLE "field_query_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_id" uuid NOT NULL,
	"target_member_id" uuid NOT NULL,
	"question_text" text NOT NULL,
	"chips" text[] DEFAULT '{}'::text[] NOT NULL,
	"give_back" jsonb,
	"status" "field_query_question_status" DEFAULT 'pending' NOT NULL,
	"answered_at" timestamp with time zone,
	"response" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hubspot_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"object_type" "hubspot_object_type" NOT NULL,
	"hubspot_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ttl_expires_at" timestamp with time zone,
	CONSTRAINT "hubspot_cache_object_key" UNIQUE("object_type","hubspot_id")
);
--> statement-breakpoint
CREATE TABLE "knowledge_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"article_type" text NOT NULL,
	"content" text NOT NULL,
	"summary" text,
	"products" text[] DEFAULT '{}'::text[] NOT NULL,
	"verticals" "vertical"[] DEFAULT '{}'::vertical[] NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"resolution_steps" jsonb,
	"related_hubspot_company_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"effectiveness_score" numeric(4, 3),
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manager_directives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"directive_text" text NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"category" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meddpicc_scores" (
	"hubspot_deal_id" text PRIMARY KEY NOT NULL,
	"metrics_score" integer,
	"economic_buyer_score" integer,
	"decision_criteria_score" integer,
	"decision_process_score" integer,
	"paper_process_score" integer,
	"identify_pain_score" integer,
	"champion_score" integer,
	"competition_score" integer,
	"overall_score" integer,
	"per_dimension_confidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"link" text,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observation_clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"signal_type" "signal_taxonomy" NOT NULL,
	"severity" "severity" NOT NULL,
	"summary" text,
	"arr_impact_total" numeric(14, 2),
	"arr_impact_details" jsonb,
	"unstructured_quotes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observation_deals" (
	"observation_id" uuid NOT NULL,
	"hubspot_deal_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "observation_deals_observation_id_hubspot_deal_id_pk" PRIMARY KEY("observation_id","hubspot_deal_id")
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"observer_id" uuid NOT NULL,
	"raw_input" text NOT NULL,
	"ai_classification" jsonb,
	"signal_type" "signal_taxonomy" NOT NULL,
	"severity" "severity" DEFAULT 'medium' NOT NULL,
	"confidence" numeric(4, 3),
	"status" "observation_status" DEFAULT 'pending_review' NOT NULL,
	"source_context" jsonb,
	"cluster_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"primary_name" text NOT NULL,
	"primary_email" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people_contacts" (
	"person_id" uuid NOT NULL,
	"hubspot_contact_id" text NOT NULL,
	"link_method" "person_link_method" NOT NULL,
	"confidence" numeric(4, 3) DEFAULT '1.000' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_contacts_person_id_hubspot_contact_id_pk" PRIMARY KEY("person_id","hubspot_contact_id")
);
--> statement-breakpoint
CREATE TABLE "support_function_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"function" "support_function" NOT NULL,
	"verticals_covered" "vertical"[] DEFAULT '{}'::vertical[] NOT NULL,
	"avatar_initials" text,
	"avatar_color" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_function_members_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "support_function_members_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "surface_dismissals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"insight_id" text NOT NULL,
	"insight_type" text NOT NULL,
	"hubspot_deal_id" text,
	"mode" "surface_dismissal_mode" DEFAULT 'soft' NOT NULL,
	"dismissed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resurface_after" timestamp with time zone,
	CONSTRAINT "surface_dismissals_unique" UNIQUE("user_id","insight_id","insight_type")
);
--> statement-breakpoint
CREATE TABLE "surface_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"insight_id" text NOT NULL,
	"insight_type" text NOT NULL,
	"hubspot_deal_id" text,
	"reason_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"free_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_intelligence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vertical" "vertical",
	"insight_type" text NOT NULL,
	"title" text NOT NULL,
	"insight" text NOT NULL,
	"supporting_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence" numeric(4, 3),
	"relevance_score" numeric(5, 2),
	"status" "system_intelligence_status" DEFAULT 'active' NOT NULL,
	"hubspot_company_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" "team_member_role" NOT NULL,
	"vertical_specialization" "vertical" DEFAULT 'general' NOT NULL,
	"hubspot_owner_id" text,
	"avatar_url" text,
	"capacity_target" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "team_members_email_unique" UNIQUE("email"),
	CONSTRAINT "team_members_hubspot_owner_id_unique" UNIQUE("hubspot_owner_id")
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hubspot_deal_id" text NOT NULL,
	"title" text NOT NULL,
	"transcript_text" text NOT NULL,
	"participants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" "transcript_source" DEFAULT 'simulated' NOT NULL,
	"duration_seconds" integer,
	"recorded_at" timestamp with time zone,
	"hubspot_engagement_id" text,
	"pipeline_processed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "agent_config_proposals" ADD CONSTRAINT "agent_config_proposals_agent_config_id_agent_configs_id_fk" FOREIGN KEY ("agent_config_id") REFERENCES "public"."agent_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_config_proposals" ADD CONSTRAINT "agent_config_proposals_proposed_by_user_id_users_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_config_proposals" ADD CONSTRAINT "agent_config_proposals_source_observation_id_observations_id_fk" FOREIGN KEY ("source_observation_id") REFERENCES "public"."observations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_config_proposals" ADD CONSTRAINT "agent_config_proposals_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_config_versions" ADD CONSTRAINT "agent_config_versions_agent_config_id_agent_configs_id_fk" FOREIGN KEY ("agent_config_id") REFERENCES "public"."agent_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_config_versions" ADD CONSTRAINT "agent_config_versions_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_configs" ADD CONSTRAINT "agent_configs_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analyzed_transcripts" ADD CONSTRAINT "analyzed_transcripts_transcript_id_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coordinator_pattern_deals" ADD CONSTRAINT "coordinator_pattern_deals_pattern_id_coordinator_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."coordinator_patterns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_events" ADD CONSTRAINT "deal_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_snapshots" ADD CONSTRAINT "deal_snapshots_built_from_event_id_deal_events_id_fk" FOREIGN KEY ("built_from_event_id") REFERENCES "public"."deal_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_assigned_member_id_team_members_id_fk" FOREIGN KEY ("assigned_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_attribution_events" ADD CONSTRAINT "experiment_attribution_events_attribution_id_experiment_attributions_id_fk" FOREIGN KEY ("attribution_id") REFERENCES "public"."experiment_attributions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_attribution_events" ADD CONSTRAINT "experiment_attribution_events_event_id_deal_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."deal_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_attributions" ADD CONSTRAINT "experiment_attributions_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_originator_id_team_members_id_fk" FOREIGN KEY ("originator_id") REFERENCES "public"."team_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_queries" ADD CONSTRAINT "field_queries_initiated_by_team_member_id_team_members_id_fk" FOREIGN KEY ("initiated_by_team_member_id") REFERENCES "public"."team_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_queries" ADD CONSTRAINT "field_queries_initiated_by_support_function_member_id_support_function_members_id_fk" FOREIGN KEY ("initiated_by_support_function_member_id") REFERENCES "public"."support_function_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_query_questions" ADD CONSTRAINT "field_query_questions_query_id_field_queries_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."field_queries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_query_questions" ADD CONSTRAINT "field_query_questions_target_member_id_team_members_id_fk" FOREIGN KEY ("target_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manager_directives" ADD CONSTRAINT "manager_directives_author_id_team_members_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."team_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_deals" ADD CONSTRAINT "observation_deals_observation_id_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_observer_id_users_id_fk" FOREIGN KEY ("observer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_cluster_id_observation_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."observation_clusters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people_contacts" ADD CONSTRAINT "people_contacts_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_function_members" ADD CONSTRAINT "support_function_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surface_dismissals" ADD CONSTRAINT "surface_dismissals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surface_feedback" ADD CONSTRAINT "surface_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_health_company_idx" ON "account_health" USING btree ("hubspot_company_id");--> statement-breakpoint
CREATE INDEX "account_health_status_idx" ON "account_health" USING btree ("contract_status");--> statement-breakpoint
CREATE INDEX "account_health_trend_idx" ON "account_health" USING btree ("health_trend");--> statement-breakpoint
CREATE INDEX "agent_config_proposals_config_idx" ON "agent_config_proposals" USING btree ("agent_config_id");--> statement-breakpoint
CREATE INDEX "agent_config_proposals_proposer_idx" ON "agent_config_proposals" USING btree ("proposed_by_user_id");--> statement-breakpoint
CREATE INDEX "agent_config_proposals_resolver_idx" ON "agent_config_proposals" USING btree ("resolved_by_user_id");--> statement-breakpoint
CREATE INDEX "agent_config_proposals_observation_idx" ON "agent_config_proposals" USING btree ("source_observation_id");--> statement-breakpoint
CREATE INDEX "agent_config_proposals_status_idx" ON "agent_config_proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_config_versions_config_idx" ON "agent_config_versions" USING btree ("agent_config_id");--> statement-breakpoint
CREATE INDEX "agent_config_versions_user_idx" ON "agent_config_versions" USING btree ("changed_by_user_id");--> statement-breakpoint
CREATE INDEX "agent_configs_member_idx" ON "agent_configs" USING btree ("team_member_id");--> statement-breakpoint
CREATE INDEX "coordinator_pattern_deals_pattern_idx" ON "coordinator_pattern_deals" USING btree ("pattern_id");--> statement-breakpoint
CREATE INDEX "coordinator_pattern_deals_deal_idx" ON "coordinator_pattern_deals" USING btree ("hubspot_deal_id");--> statement-breakpoint
CREATE INDEX "coordinator_patterns_signal_type_idx" ON "coordinator_patterns" USING btree ("signal_type");--> statement-breakpoint
CREATE INDEX "coordinator_patterns_vertical_idx" ON "coordinator_patterns" USING btree ("vertical");--> statement-breakpoint
CREATE INDEX "coordinator_patterns_status_idx" ON "coordinator_patterns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "customer_messages_company_idx" ON "customer_messages" USING btree ("hubspot_company_id");--> statement-breakpoint
CREATE INDEX "customer_messages_contact_idx" ON "customer_messages" USING btree ("hubspot_contact_id");--> statement-breakpoint
CREATE INDEX "customer_messages_deal_idx" ON "customer_messages" USING btree ("hubspot_deal_id");--> statement-breakpoint
CREATE INDEX "customer_messages_engagement_idx" ON "customer_messages" USING btree ("hubspot_engagement_id");--> statement-breakpoint
CREATE INDEX "customer_messages_status_idx" ON "customer_messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "customer_messages_channel_idx" ON "customer_messages" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "deal_contact_roles_deal_idx" ON "deal_contact_roles" USING btree ("hubspot_deal_id");--> statement-breakpoint
CREATE INDEX "deal_contact_roles_contact_idx" ON "deal_contact_roles" USING btree ("hubspot_contact_id");--> statement-breakpoint
CREATE INDEX "deal_events_deal_idx" ON "deal_events" USING btree ("hubspot_deal_id");--> statement-breakpoint
CREATE INDEX "deal_events_type_idx" ON "deal_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "deal_events_deal_type_idx" ON "deal_events" USING btree ("hubspot_deal_id","type");--> statement-breakpoint
CREATE INDEX "deal_events_actor_idx" ON "deal_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "deal_events_created_idx" ON "deal_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "deal_fitness_events_deal_idx" ON "deal_fitness_events" USING btree ("hubspot_deal_id");--> statement-breakpoint
CREATE INDEX "deal_fitness_events_category_idx" ON "deal_fitness_events" USING btree ("fit_category");--> statement-breakpoint
CREATE INDEX "deal_fitness_events_detected_idx" ON "deal_fitness_events" USING btree ("detected");--> statement-breakpoint
CREATE INDEX "deal_snapshots_deal_idx" ON "deal_snapshots" USING btree ("hubspot_deal_id");--> statement-breakpoint
CREATE INDEX "deal_snapshots_built_from_idx" ON "deal_snapshots" USING btree ("built_from_event_id");--> statement-breakpoint
CREATE INDEX "experiment_assignments_experiment_idx" ON "experiment_assignments" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX "experiment_assignments_member_idx" ON "experiment_assignments" USING btree ("assigned_member_id");--> statement-breakpoint
CREATE INDEX "experiment_attribution_events_attribution_idx" ON "experiment_attribution_events" USING btree ("attribution_id");--> statement-breakpoint
CREATE INDEX "experiment_attribution_events_event_idx" ON "experiment_attribution_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "experiment_attributions_experiment_idx" ON "experiment_attributions" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX "experiment_attributions_deal_idx" ON "experiment_attributions" USING btree ("hubspot_deal_id");--> statement-breakpoint
CREATE INDEX "experiment_attributions_transcript_idx" ON "experiment_attributions" USING btree ("transcript_id");--> statement-breakpoint
CREATE INDEX "experiments_originator_idx" ON "experiments" USING btree ("originator_id");--> statement-breakpoint
CREATE INDEX "experiments_lifecycle_idx" ON "experiments" USING btree ("lifecycle");--> statement-breakpoint
CREATE INDEX "experiments_category_idx" ON "experiments" USING btree ("category");--> statement-breakpoint
CREATE INDEX "field_queries_team_initiator_idx" ON "field_queries" USING btree ("initiated_by_team_member_id");--> statement-breakpoint
CREATE INDEX "field_queries_support_initiator_idx" ON "field_queries" USING btree ("initiated_by_support_function_member_id");--> statement-breakpoint
CREATE INDEX "field_queries_status_idx" ON "field_queries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "field_queries_deal_scope_idx" ON "field_queries" USING btree ("scope_hubspot_deal_id");--> statement-breakpoint
CREATE INDEX "field_query_questions_query_idx" ON "field_query_questions" USING btree ("query_id");--> statement-breakpoint
CREATE INDEX "field_query_questions_target_idx" ON "field_query_questions" USING btree ("target_member_id");--> statement-breakpoint
CREATE INDEX "field_query_questions_status_idx" ON "field_query_questions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hubspot_cache_type_idx" ON "hubspot_cache" USING btree ("object_type");--> statement-breakpoint
CREATE INDEX "hubspot_cache_expires_idx" ON "hubspot_cache" USING btree ("ttl_expires_at");--> statement-breakpoint
CREATE INDEX "knowledge_articles_type_idx" ON "knowledge_articles" USING btree ("article_type");--> statement-breakpoint
CREATE INDEX "manager_directives_author_idx" ON "manager_directives" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "manager_directives_active_idx" ON "manager_directives" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "manager_directives_priority_idx" ON "manager_directives" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX "notifications_priority_idx" ON "notifications" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "observation_clusters_signal_type_idx" ON "observation_clusters" USING btree ("signal_type");--> statement-breakpoint
CREATE INDEX "observation_clusters_severity_idx" ON "observation_clusters" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "observation_deals_observation_idx" ON "observation_deals" USING btree ("observation_id");--> statement-breakpoint
CREATE INDEX "observation_deals_deal_idx" ON "observation_deals" USING btree ("hubspot_deal_id");--> statement-breakpoint
CREATE INDEX "observations_observer_idx" ON "observations" USING btree ("observer_id");--> statement-breakpoint
CREATE INDEX "observations_cluster_idx" ON "observations" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX "observations_signal_type_idx" ON "observations" USING btree ("signal_type");--> statement-breakpoint
CREATE INDEX "observations_status_idx" ON "observations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "people_contacts_person_idx" ON "people_contacts" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "people_contacts_hubspot_idx" ON "people_contacts" USING btree ("hubspot_contact_id");--> statement-breakpoint
CREATE INDEX "support_function_members_user_idx" ON "support_function_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "support_function_members_function_idx" ON "support_function_members" USING btree ("function");--> statement-breakpoint
CREATE INDEX "surface_dismissals_user_idx" ON "surface_dismissals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "surface_dismissals_insight_idx" ON "surface_dismissals" USING btree ("insight_id");--> statement-breakpoint
CREATE INDEX "surface_dismissals_resurface_idx" ON "surface_dismissals" USING btree ("resurface_after");--> statement-breakpoint
CREATE INDEX "surface_feedback_user_idx" ON "surface_feedback" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "surface_feedback_insight_idx" ON "surface_feedback" USING btree ("insight_id");--> statement-breakpoint
CREATE INDEX "surface_feedback_insight_type_idx" ON "surface_feedback" USING btree ("insight_type");--> statement-breakpoint
CREATE INDEX "system_intelligence_vertical_idx" ON "system_intelligence" USING btree ("vertical");--> statement-breakpoint
CREATE INDEX "system_intelligence_type_idx" ON "system_intelligence" USING btree ("insight_type");--> statement-breakpoint
CREATE INDEX "system_intelligence_status_idx" ON "system_intelligence" USING btree ("status");--> statement-breakpoint
CREATE INDEX "system_intelligence_company_idx" ON "system_intelligence" USING btree ("hubspot_company_id");--> statement-breakpoint
CREATE INDEX "team_members_user_idx" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_members_role_idx" ON "team_members" USING btree ("role");--> statement-breakpoint
CREATE INDEX "team_members_vertical_idx" ON "team_members" USING btree ("vertical_specialization");--> statement-breakpoint
CREATE INDEX "team_members_hubspot_owner_idx" ON "team_members" USING btree ("hubspot_owner_id");--> statement-breakpoint
CREATE INDEX "transcripts_deal_idx" ON "transcripts" USING btree ("hubspot_deal_id");--> statement-breakpoint
CREATE INDEX "transcripts_source_idx" ON "transcripts" USING btree ("source");--> statement-breakpoint
CREATE INDEX "transcripts_engagement_idx" ON "transcripts" USING btree ("hubspot_engagement_id");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");