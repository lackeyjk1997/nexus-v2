-- Phase 2 Day 2 — reconcile deal_stage enum: "prospect" → "new_lead".
--
-- Background: schema.ts originally defined dealStageEnum with "prospect" as
-- the first value. Day-5's CrmAdapter (packages/shared/src/crm/types.ts),
-- the HubSpot Nexus Sales pipeline (portal 245978261, pipeline 2215843570,
-- provisioned 2026-04-22T18:02:45Z), and all code paths use "new_lead" as
-- the first stage. DEAL_STAGES is now canonical in
-- packages/shared/src/enums/deal-stage.ts per DECISIONS.md 2.13 / Guardrail 22.
--
-- drizzle-kit auto-generated a DROP TYPE + CREATE TYPE pair for this diff,
-- which would fail (or silently corrupt data) the moment any column typed
-- deal_stage had rows. Hand-replaced with ALTER TYPE ... RENAME VALUE, which
-- is atomic in Postgres 10+ and preserves ordinal position and any dependent
-- column references. No rows reference the enum at migration time (deals
-- live in HubSpot via hubspot_cache.payload jsonb, not a typed column), so
-- the rename is a no-op at the row level; it only aligns the type definition.

ALTER TYPE "public"."deal_stage" RENAME VALUE 'prospect' TO 'new_lead';
