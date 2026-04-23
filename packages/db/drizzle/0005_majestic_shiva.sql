-- Nexus v2 — Pre-Phase 3 Session 0-B foundation migration.
-- Drizzle-generated base + hand-written additions (extension enable,
-- CHECK constraint, velocity_trend cast, RLS Pattern D on the three new
-- tables). Follows the Phase 2 Day 2 migration-0004 hand-replace precedent.
-- See docs/PRE-PHASE-3-FIX-PLAN.md §4.2 for scope rationale.

-- ──────────────────────────────────────────────────────────────
-- 1. Extensions. pgvector for transcript_embeddings.
-- ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint

-- ──────────────────────────────────────────────────────────────
-- 2. Enums.
-- ──────────────────────────────────────────────────────────────
CREATE TYPE "public"."fitness_velocity" AS ENUM('accelerating', 'stable', 'decelerating', 'stalled');
--> statement-breakpoint

-- ──────────────────────────────────────────────────────────────
-- 3. New tables — prompt_call_log (§2.16.1 decision 3).
-- ──────────────────────────────────────────────────────────────
CREATE TABLE "prompt_call_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_file" text NOT NULL,
	"prompt_version" text NOT NULL,
	"tool_name" text NOT NULL,
	"model" text NOT NULL,
	"task_type" text,
	"temperature" numeric(3, 2),
	"max_tokens" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"duration_ms" integer,
	"attempts" integer DEFAULT 1 NOT NULL,
	"stop_reason" text,
	"error_class" text,
	"hubspot_deal_id" text,
	"observation_id" uuid,
	"transcript_id" uuid,
	"job_id" uuid,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ──────────────────────────────────────────────────────────────
-- 4. New tables — sync_state (foundation-review A8).
-- ──────────────────────────────────────────────────────────────
CREATE TABLE "sync_state" (
	"object_type" "hubspot_object_type" PRIMARY KEY NOT NULL,
	"last_sync_at" timestamp with time zone DEFAULT '1970-01-01 00:00:00+00'::timestamptz NOT NULL
);
--> statement-breakpoint

-- ──────────────────────────────────────────────────────────────
-- 5. New tables — transcript_embeddings (§2.16.1 decision 1).
--    Scope CHECK constraint added by hand; HNSW index deferred to Phase 3 Day 2.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE "transcript_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transcript_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"speaker_turn_index" integer,
	"embedding" vector(1536) NOT NULL,
	"embedding_model" text NOT NULL,
	"embedded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcript_embeddings_scope_check" CHECK ("scope" IN ('transcript', 'speaker_turn'))
);
--> statement-breakpoint

-- ──────────────────────────────────────────────────────────────
-- 6. ALTER existing tables.
-- ──────────────────────────────────────────────────────────────
-- A11: text → proper enum. Explicit USING cast for safety (zero rows today
-- but canonical pattern). If future rows existed with invalid values, cast
-- would fail loudly — which is the right failure mode.
ALTER TABLE "deal_fitness_scores"
  ALTER COLUMN "velocity_trend" SET DATA TYPE fitness_velocity
  USING "velocity_trend"::fitness_velocity;
--> statement-breakpoint

-- A1: nullable signal_type. Existing Session B rows carry non-null values; no
-- data change — just allows future NULL rows (category-driven captures).
ALTER TABLE "observations" ALTER COLUMN "signal_type" DROP NOT NULL;
--> statement-breakpoint

-- A2: event_context pull-forward (§2.16.1 decision 2). Nullable now; flips
-- to NOT NULL Phase 4 Day 1 once all event writers populate it.
ALTER TABLE "deal_events" ADD COLUMN "event_context" jsonb;
--> statement-breakpoint

-- A6: experiments.vertical denormalized first-class column.
ALTER TABLE "experiments" ADD COLUMN "vertical" "vertical";
--> statement-breakpoint

-- A12: experiment_attributions.transcript_id FK (§2.2 hygiene completion).
ALTER TABLE "experiment_attributions"
  ADD CONSTRAINT "experiment_attributions_transcript_id_transcripts_id_fk"
  FOREIGN KEY ("transcript_id") REFERENCES "public"."transcripts"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint

-- transcript_embeddings FK.
ALTER TABLE "transcript_embeddings"
  ADD CONSTRAINT "transcript_embeddings_transcript_id_transcripts_id_fk"
  FOREIGN KEY ("transcript_id") REFERENCES "public"."transcripts"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint

-- ──────────────────────────────────────────────────────────────
-- 7. New indexes.
-- ──────────────────────────────────────────────────────────────
CREATE INDEX "prompt_call_log_deal_idx" ON "prompt_call_log" USING btree ("hubspot_deal_id","created_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "prompt_call_log_job_idx" ON "prompt_call_log" USING btree ("job_id");
--> statement-breakpoint
CREATE INDEX "prompt_call_log_version_idx" ON "prompt_call_log" USING btree ("prompt_file","prompt_version","created_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "transcript_embeddings_transcript_idx" ON "transcript_embeddings" USING btree ("transcript_id");
--> statement-breakpoint
-- A13: composite "per-deal timeline newest first" index. Phase 4+ coordinator
-- + close-hypothesis + call-prep walk this index.
CREATE INDEX "deal_events_deal_created_idx" ON "deal_events" USING btree ("hubspot_deal_id","created_at" DESC NULLS LAST);
--> statement-breakpoint
-- A6: experiments vertical+lifecycle composite for the hot "applicable to
-- deal vertical" query.
CREATE INDEX "experiments_vertical_lifecycle_idx" ON "experiments" USING btree ("vertical","lifecycle");
--> statement-breakpoint

-- ──────────────────────────────────────────────────────────────
-- 8. RLS Pattern D on the three new tables (DECISIONS.md §2.2.1).
--    Read-all-authenticated; writes only via service role.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE "public"."prompt_call_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."transcript_embeddings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."sync_state" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "prompt_call_log_select_authenticated" ON "public"."prompt_call_log"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "transcript_embeddings_select_authenticated" ON "public"."transcript_embeddings"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "sync_state_select_authenticated" ON "public"."sync_state"
  FOR SELECT TO authenticated USING (true);
