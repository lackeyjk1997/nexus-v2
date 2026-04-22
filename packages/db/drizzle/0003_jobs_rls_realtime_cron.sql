-- Nexus v2 — Jobs RLS + Supabase Realtime + pg_cron/pg_net extensions.
-- Hand-written. The actual cron.schedule() call is driven by
-- scripts/configure-cron.ts because it depends on runtime values
-- (worker URL + CRON_SECRET) that don't belong in migrations.

-- ──────────────────────────────────────────────────────────────
-- 1. Extensions. pg_cron + pg_net are Supabase-hosted first-class.
-- ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_net;
--> statement-breakpoint

-- ──────────────────────────────────────────────────────────────
-- 2. RLS on jobs + job_results (Pattern D per DECISIONS.md 2.2.1).
--    Read-all-authenticated; writes only via service role.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE "public"."jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."job_results" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "jobs_select_authenticated" ON "public"."jobs"
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "job_results_select_authenticated" ON "public"."job_results"
  FOR SELECT TO authenticated USING (true);
--> statement-breakpoint

-- ──────────────────────────────────────────────────────────────
-- 3. Supabase Realtime publication for jobs.
--    REPLICA IDENTITY FULL so UPDATE payloads carry all columns
--    (the useJobStatus hook reads status/result/error off payload.new).
-- ──────────────────────────────────────────────────────────────
ALTER TABLE "public"."jobs" REPLICA IDENTITY FULL;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
  END IF;
END
$$;
