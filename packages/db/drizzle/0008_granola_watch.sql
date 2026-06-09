-- Migration 0008 — Granola click→score automation (demo 2026-06-10 Run 2)
--
-- 1. 'granola' transcript_source enum value: Granola-ingested transcripts
--    carry their true provenance (system of record = raw Granola transcript).
-- 2. granola_watch_config: pinned-deal watch configuration. A config ROW
--    (not an env var) so activation needs no Vercel-dashboard step and the
--    privacy scope (exactly one watched deal) is inspectable in the DB.
--    Single-row table by convention (id = 'default').
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block —
-- apply-migration-0008 runs statements sequentially, not wrapped.

ALTER TYPE "transcript_source" ADD VALUE IF NOT EXISTS 'granola';
--> statement-breakpoint
ALTER TYPE "job_type" ADD VALUE IF NOT EXISTS 'granola_ingest';
--> statement-breakpoint
ALTER TYPE "job_type" ADD VALUE IF NOT EXISTS 'deal_fitness';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "granola_watch_config" (
  "id" text PRIMARY KEY DEFAULT 'default',
  "hubspot_deal_id" text NOT NULL,
  "buyer_contact_email" text,
  "buyer_contact_name" text,
  "seller_name" text NOT NULL DEFAULT 'Jeff Lackey',
  "enabled" boolean NOT NULL DEFAULT true,
  "last_polled_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "granola_watch_config" ENABLE ROW LEVEL SECURITY;
