-- Nexus v2 — Phase 4 Day 3 observation-cluster candidate-shape extension.
--
-- Extends `observation_clusters` from its v1-shaped post-promotion form
-- (signal_type/severity NOT NULL — assumed Marcus had already promoted)
-- into a candidate-aware shape that supports the §1.16 LOCKED admission
-- threshold workflow: 3+ deals with uncategorized reasons that cluster
-- by prompt-generated signature qualify as new-category candidates.
--
-- Two structural changes (preflight verified `observation_clusters`
-- contains 0 rows, so NOT NULL + UNIQUE on the new cluster_key are safe
-- without backfill):
--   1. Drop NOT NULL on signal_type + severity. Both stay populated for
--      Marcus-promoted clusters but are NULL for candidate rows.
--   2. Add 10 candidate-shape columns + 2 indexes (cluster_key UNIQUE
--      idempotency anchor; status hot-path for the surfaces registry's
--      category_candidates admission branch).
--
-- Membership tracking diverges from the kickoff Decision 6 option (b)
-- new-table proposal — observations.cluster_id FK already exists from
-- migration 0001+ and gives us option (c): direct FK back. Adding a new
-- join table would create double state per Guardrail 13 (single write-
-- path on observations + observation_clusters); the existing FK is the
-- membership pointer + the signature is stored once on the cluster row.
--
-- Productization-arc preservation (PRODUCTIZATION-NOTES.md "Corpus
-- Intelligence — the second product"): observation_clusters become the
-- v1 substrate for taxonomy-evolution analysis. Stage 3+ narrative
-- analysis reads observation_clusters + signatures over time to surface
-- "new categories emerging" trends. This migration locks the WRITE
-- shape; v2 demo behavior is the silence-as-feature default per §1.18.

-- ──────────────────────────────────────────────────────────────
-- 1. Drop NOT NULL on signal_type + severity (candidate state).
-- ──────────────────────────────────────────────────────────────
ALTER TABLE "observation_clusters" ALTER COLUMN "signal_type" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "observation_clusters" ALTER COLUMN "severity" DROP NOT NULL;
--> statement-breakpoint

-- ──────────────────────────────────────────────────────────────
-- 2. Add candidate-shape columns. cluster_key NOT NULL is safe at
--    0 existing rows; future post-promotion rows retain the same
--    cluster_key established at candidate time.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE "observation_clusters" ADD COLUMN "cluster_key" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "observation_clusters" ADD COLUMN "normalized_signature" text;
--> statement-breakpoint
ALTER TABLE "observation_clusters" ADD COLUMN "candidate_category" text;
--> statement-breakpoint
ALTER TABLE "observation_clusters" ADD COLUMN "confidence" text;
--> statement-breakpoint
ALTER TABLE "observation_clusters" ADD COLUMN "signature_basis" text;
--> statement-breakpoint
ALTER TABLE "observation_clusters" ADD COLUMN "vertical" text;
--> statement-breakpoint
ALTER TABLE "observation_clusters" ADD COLUMN "status" text DEFAULT 'candidate' NOT NULL;
--> statement-breakpoint
ALTER TABLE "observation_clusters" ADD COLUMN "member_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "observation_clusters" ADD COLUMN "last_synthesized_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "observation_clusters" ADD COLUMN "applicability" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint

-- ──────────────────────────────────────────────────────────────
-- 3. UNIQUE on cluster_key (idempotency anchor for ON CONFLICT
--    in the observation_cluster handler) + status index for the
--    surfaces registry category_candidates admission branch.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE "observation_clusters"
  ADD CONSTRAINT "observation_clusters_cluster_key_unique" UNIQUE ("cluster_key");
--> statement-breakpoint
CREATE INDEX "observation_clusters_status_idx"
  ON "observation_clusters" USING btree ("status");
