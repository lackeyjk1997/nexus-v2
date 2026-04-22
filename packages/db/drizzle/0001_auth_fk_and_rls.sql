-- Nexus v2 — Auth FK + RLS (DECISIONS.md 2.1, 2.2, 2.26)
-- Hand-written. Assumes Supabase Auth provisions the `auth` schema.

-- ──────────────────────────────────────────────────────────────
-- 1. Cross-schema FK: public.users.id → auth.users.id
-- ──────────────────────────────────────────────────────────────
ALTER TABLE "public"."users"
  ADD CONSTRAINT "users_id_auth_fk"
  FOREIGN KEY ("id")
  REFERENCES "auth"."users"("id")
  ON DELETE CASCADE;
--> statement-breakpoint

-- ──────────────────────────────────────────────────────────────
-- 2. Admin helper. Returns true when the current JWT's user_id maps to a
--    public.users row with is_admin = true. SECURITY DEFINER bypasses RLS on
--    the lookup; STABLE lets the planner cache within a transaction.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."is_admin"()
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND is_admin = true
  );
$$;
--> statement-breakpoint

-- ──────────────────────────────────────────────────────────────
-- 3. Enable RLS on every Nexus-owned table.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."support_function_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."hubspot_cache" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."people" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."people_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."deal_contact_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."deal_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."deal_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."observations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."observation_deals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."observation_clusters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."coordinator_patterns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."coordinator_pattern_deals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."experiments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."experiment_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."experiment_attributions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."experiment_attribution_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."transcripts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."analyzed_transcripts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."meddpicc_scores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."deal_fitness_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."deal_fitness_scores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."agent_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."agent_config_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."agent_config_proposals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."manager_directives" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."system_intelligence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."knowledge_articles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."customer_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."account_health" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."field_queries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."field_query_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."surface_dismissals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."surface_feedback" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- ──────────────────────────────────────────────────────────────
-- 4. Policies.
--
-- Pattern A — user-authored content, own rows only.
-- Pattern B — own rows via team_members → user_id lookup.
-- Pattern C — read-all-authenticated, update own row via auth.uid().
-- Pattern D — read-all-authenticated, writes via service role only.
--
-- Tables without an INSERT/UPDATE/DELETE policy reject those operations for
-- the authenticated role (default-deny). Service role bypasses RLS so seed
-- scripts and server-side writers still succeed.
-- ──────────────────────────────────────────────────────────────

-- ── Pattern A: observations ──
CREATE POLICY "observations_select_own" ON "public"."observations"
  FOR SELECT TO authenticated
  USING (observer_id = auth.uid() OR public.is_admin());
CREATE POLICY "observations_insert_own" ON "public"."observations"
  FOR INSERT TO authenticated
  WITH CHECK (observer_id = auth.uid());
CREATE POLICY "observations_update_own" ON "public"."observations"
  FOR UPDATE TO authenticated
  USING (observer_id = auth.uid() OR public.is_admin())
  WITH CHECK (observer_id = auth.uid() OR public.is_admin());
CREATE POLICY "observations_delete_own" ON "public"."observations"
  FOR DELETE TO authenticated
  USING (observer_id = auth.uid() OR public.is_admin());
--> statement-breakpoint

-- ── Pattern A: surface_dismissals ──
CREATE POLICY "surface_dismissals_select_own" ON "public"."surface_dismissals"
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "surface_dismissals_insert_own" ON "public"."surface_dismissals"
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "surface_dismissals_update_own" ON "public"."surface_dismissals"
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "surface_dismissals_delete_own" ON "public"."surface_dismissals"
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
--> statement-breakpoint

-- ── Pattern A: surface_feedback ──
CREATE POLICY "surface_feedback_select_own" ON "public"."surface_feedback"
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "surface_feedback_insert_own" ON "public"."surface_feedback"
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
--> statement-breakpoint

-- ── Pattern A: notifications ──
CREATE POLICY "notifications_select_own" ON "public"."notifications"
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "notifications_update_own" ON "public"."notifications"
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());
--> statement-breakpoint

-- ── Pattern B: agent_configs ──
CREATE POLICY "agent_configs_select_own" ON "public"."agent_configs"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.id = agent_configs.team_member_id
        AND tm.user_id = auth.uid()
    )
    OR public.is_admin()
  );
CREATE POLICY "agent_configs_update_own" ON "public"."agent_configs"
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.id = agent_configs.team_member_id
        AND tm.user_id = auth.uid()
    )
    OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.id = agent_configs.team_member_id
        AND tm.user_id = auth.uid()
    )
    OR public.is_admin()
  );
--> statement-breakpoint

-- ── Pattern B: agent_config_versions ──
CREATE POLICY "agent_config_versions_select_own" ON "public"."agent_config_versions"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.agent_configs ac
      JOIN public.team_members tm ON tm.id = ac.team_member_id
      WHERE ac.id = agent_config_versions.agent_config_id
        AND tm.user_id = auth.uid()
    )
    OR public.is_admin()
  );
--> statement-breakpoint

-- ── Pattern B: field_query_questions ──
CREATE POLICY "field_query_questions_select_target" ON "public"."field_query_questions"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.id = field_query_questions.target_member_id
        AND tm.user_id = auth.uid()
    )
    OR public.is_admin()
  );
CREATE POLICY "field_query_questions_update_target" ON "public"."field_query_questions"
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.id = field_query_questions.target_member_id
        AND tm.user_id = auth.uid()
    )
    OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.id = field_query_questions.target_member_id
        AND tm.user_id = auth.uid()
    )
    OR public.is_admin()
  );
--> statement-breakpoint

-- ── Pattern C: users / team_members / support_function_members ──
CREATE POLICY "users_select_authenticated" ON "public"."users"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "users_update_own" ON "public"."users"
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());
CREATE POLICY "team_members_select_authenticated" ON "public"."team_members"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "team_members_update_own" ON "public"."team_members"
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "support_function_members_select_authenticated" ON "public"."support_function_members"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "support_function_members_update_own" ON "public"."support_function_members"
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());
--> statement-breakpoint

-- ── Pattern D: read-all-authenticated; writes via service role only ──
CREATE POLICY "deal_events_select_authenticated" ON "public"."deal_events"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "deal_snapshots_select_authenticated" ON "public"."deal_snapshots"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "coordinator_patterns_select_authenticated" ON "public"."coordinator_patterns"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "coordinator_pattern_deals_select_authenticated" ON "public"."coordinator_pattern_deals"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "observation_clusters_select_authenticated" ON "public"."observation_clusters"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "observation_deals_select_authenticated" ON "public"."observation_deals"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "experiments_select_authenticated" ON "public"."experiments"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "experiment_assignments_select_authenticated" ON "public"."experiment_assignments"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "experiment_attributions_select_authenticated" ON "public"."experiment_attributions"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "experiment_attribution_events_select_authenticated" ON "public"."experiment_attribution_events"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "transcripts_select_authenticated" ON "public"."transcripts"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "analyzed_transcripts_select_authenticated" ON "public"."analyzed_transcripts"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "meddpicc_scores_select_authenticated" ON "public"."meddpicc_scores"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "deal_fitness_events_select_authenticated" ON "public"."deal_fitness_events"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "deal_fitness_scores_select_authenticated" ON "public"."deal_fitness_scores"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "hubspot_cache_select_authenticated" ON "public"."hubspot_cache"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "people_select_authenticated" ON "public"."people"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "people_contacts_select_authenticated" ON "public"."people_contacts"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "deal_contact_roles_select_authenticated" ON "public"."deal_contact_roles"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "customer_messages_select_authenticated" ON "public"."customer_messages"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "account_health_select_authenticated" ON "public"."account_health"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "system_intelligence_select_authenticated" ON "public"."system_intelligence"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "knowledge_articles_select_authenticated" ON "public"."knowledge_articles"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "manager_directives_select_authenticated" ON "public"."manager_directives"
  FOR SELECT TO authenticated USING (true);
--> statement-breakpoint

-- ── Ambiguous-but-functional (flagged in Day 2 report) ──
-- agent_config_proposals: managers need read across org for the proposal queue.
-- field_queries: leadership may need to see open queries across org.
-- Conservative default: read-all-authenticated. Writes stay service-role only.
CREATE POLICY "agent_config_proposals_select_authenticated" ON "public"."agent_config_proposals"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "field_queries_select_authenticated" ON "public"."field_queries"
  FOR SELECT TO authenticated USING (true);
