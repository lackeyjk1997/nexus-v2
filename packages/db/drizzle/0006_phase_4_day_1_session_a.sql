-- Nexus v2 — Phase 4 Day 1 Session A foundation migration.
--
-- Two structural changes:
--   1. event_context SET NOT NULL flip per DECISIONS.md §2.16.1 decision 2.
--      All Phase 3-era event writers populate event_context (verified Phase 3
--      Day 4 Session B); Preflight 8's NULL audit returned count=0
--      (Outcome (a): clean. No backfill needed). The flip locks the
--      preservation contract: every deal_event from this point forward
--      carries a snapshot of segmentation state at event time.
--   2. CREATE TABLE applicability_rejections — diagnostic table per the
--      kickoff Decision 7 + rebuild plan §12.5. Records every rule
--      rejection with the reasoning + the DealState snapshot at rejection
--      time. Enables Phase 5+ "rule X rejected N% of deals last week"
--      tuning.
--
-- See docs/PRE-PHASE-3-FIX-PLAN.md §4.2 for the migration-shape precedent
-- (migration 0005). RLS Pattern D matches prompt_call_log + transcript_
-- embeddings.

-- ──────────────────────────────────────────────────────────────
-- 1. event_context SET NOT NULL flip (§2.16.1 decision 2).
-- ──────────────────────────────────────────────────────────────
-- Pre-flight 8 audit returned 0 NULL rows. Flip is safe.
ALTER TABLE "deal_events" ALTER COLUMN "event_context" SET NOT NULL;
--> statement-breakpoint

-- ──────────────────────────────────────────────────────────────
-- 2. New table — applicability_rejections (kickoff Decision 7).
-- ──────────────────────────────────────────────────────────────
CREATE TABLE "applicability_rejections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" text NOT NULL,
	"rule_description" text,
	"surface_id" text,
	"hubspot_deal_id" text,
	"rejected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reasons" jsonb NOT NULL,
	"deal_state_snapshot" jsonb
);
--> statement-breakpoint

-- ──────────────────────────────────────────────────────────────
-- 3. Indexes for the diagnostic-surface hot queries.
-- ──────────────────────────────────────────────────────────────
CREATE INDEX "applicability_rejections_deal_idx"
  ON "applicability_rejections" USING btree ("hubspot_deal_id", "rejected_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "applicability_rejections_rule_idx"
  ON "applicability_rejections" USING btree ("rule_id", "rejected_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "applicability_rejections_surface_idx"
  ON "applicability_rejections" USING btree ("surface_id", "rejected_at" DESC NULLS LAST);
--> statement-breakpoint

-- ──────────────────────────────────────────────────────────────
-- 4. RLS Pattern D — read-all-authenticated, writes via service role.
--    Same shape as prompt_call_log + transcript_embeddings + sync_state
--    in migration 0005.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE "public"."applicability_rejections" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "applicability_rejections_select_authenticated"
  ON "public"."applicability_rejections"
  FOR SELECT TO authenticated USING (true);
