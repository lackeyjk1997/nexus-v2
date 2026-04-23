# Nexus v2 Foundation Review — Pre-Phase 3

**Session:** Pre-Phase 3 foundation review — 2026-04-22
**HEAD at review time:** `a414ad0` (docs) on top of `1781780` (Phase 2 Day 4 Session B)
**Reviewer:** Oversight Claude (full-context pass)
**Scope:** Everything load-bearing for Phase 3+: v1 planning docs (09-CRITIQUE, 10-REBUILD-PLAN, 07B, 07C, 04/04C), DECISIONS.md (51 guardrails + 7 amendments), Phase 1–2 schema/RLS/migrations, prompt library + wrapper, HubSpot workspace state, CrmAdapter interface + implementation, design system + UI primitives, service template, route architecture, oversight prompts.

---

## Preamble

- **Scope expansions honored**: `prompt_call_log` column set (§2.16.1 decision 3), `transcript_embeddings` pgvector dimensionality (§2.16.1 decision 1), and `deal_events.event_context` backfill strategy (§2.16.1 decision 2) all appear in Output 2 with the four-part structure. OVERSIGHT-HANDOFF.md staleness in Output 2 as requested.
- **No prompt edits made.** The framing held up; I'm not recommending structural changes to the review prompt.
- **Read-through summary:** `~/nexus-v2` HEAD `a414ad0` on top of `1781780` (Session B). Read in full: `CLAUDE.md`, `docs/{DECISIONS,BUILD-LOG,OVERSIGHT-HANDOFF,PRODUCTIZATION-NOTES}.md`, migrations 0000–0004, schema.ts all 1,400 LOC, all enum modules, the CrmAdapter types + errors + adapter interface + HubSpotAdapter + client + mappers + webhook-verify, all three Nexus services + factories, apps/web routes under `(dashboard)/` + the four server actions + the `/api/jobs/{worker,enqueue}` + `/api/hubspot/webhook` + 11 pipeline/deal components + nav registry, the Claude wrapper + tools/detect-signals + prompt loader, 09-CRITIQUE and 10-REBUILD-PLAN in full, 07B §1–§5 + §7, 07C §1–§8 (selective), 04C Section 2 + Section 3 + Section 4, PORT-MANIFEST and all 5 of the remaining v2-ready source prompts (02, 03, 06a, 06b, 08) plus the deployed 01, and git log (30 commits). Reasoning below cites file + line where specificity matters.
- **One finding in Output 3.** Session B's signal-taxonomy resolution was the precedent Jeff named; this review finds exactly one comparable active drift — MEDDPICC 7-vs-8 between schema and HubSpot — before Phase 3 Day 2 writes it through.

---

## Output 1 — Ratifications

Lock these. Re-litigation is not worth the cost; each has a concrete reason the alternative was worse.

### R1. HubSpot-as-system-of-record + `CrmAdapter` interface (§2.18, §2.19, Guardrail 23/44)

**Right because:** The boundary cut is clean — HubSpot owns deals/contacts/companies/engagements identity; Nexus owns event-sourced intelligence; split is stakeholders (identity-in-HubSpot, role-in-Nexus via `deal_contact_roles`). The interface in `packages/shared/src/crm/adapter.ts` is 31 methods with typed errors, and `HubSpotAdapter` is a clean implementation with 18 live + 13 stubbed methods after Session A/B promotions. **Alternative (Nexus mirrors deals/contacts)** is what v1 was drifting toward — 37 tables half-built, dual-persistence bugs (§5.2 of 09-CRITIQUE), and fuzzy deal resolution replicated four times (09-CRITIQUE §5.3). The adapter boundary makes SalesforceAdapter a parallel implementation, not a rewrite — explicitly named in PRODUCTIZATION-NOTES.md Stage 3. Preserve.

### R2. Event-sourced intelligence (§2.16, Guardrails 24–25, schema.ts:409–445)

**Right because:** `deal_events (id, hubspot_deal_id, type, payload, source_kind, source_ref, actor_user_id, created_at)` append-only + `deal_snapshots (hubspot_deal_id, snapshot_at, payload, built_from_event_id)` projections + 20-value `deal_event_type` enum give a single substrate for close-lost hypothesis, call-prep risk reads, coordinator synthesis, experiment attribution, agent-config audit trail, and the productization-arc historical-ingestion (backdating `created_at` is the only schema change needed — PRODUCTIZATION-NOTES.md line 41). **Alternative (the v1 `deal_agent_states` mirror + `addCoordinatedIntel` actor hop)** was the specific 09-CRITIQUE §3.1/§3.2 failure that triggered the rebuild. Preserve.

### R3. Single-sourced enums across schema/TS/tool-schema (Guardrail 22, §2.13.1)

**Right because:** `packages/shared/src/enums/*.ts` exports `readonly [string, ...string[]]` tuples, `packages/db/src/schema.ts:37-43` imports them and feeds `pgEnum(...)`, `packages/shared/src/claude/tools/detect-signals.ts:24` binds the tool-use `enum: SIGNAL_TAXONOMY`. Drift is structurally impossible for the six covered enums (signal_taxonomy, deal_stage, contact_role, meddpicc_dimension, odeal_category, vertical). The ContactRole 9-value alignment pass (BUILD-LOG Phase 2 Day 2) is the proof the pattern works in anger. **Alternative (v1's 7-vs-9 prompt drift between #1 and #21, 09-CRITIQUE §6)** made the agent-tuning feedback loop structurally unable to fire. Preserve.

### R4. FK-joined tables replacing `uuid[]` (§2.3, migration 0000 + schema.ts:500–649)

**Right because:** `observation_deals`, `coordinator_pattern_deals`, `experiment_attributions`, `experiment_attribution_events`, `people_contacts`, `deal_contact_roles` all FK-joined with CASCADE/SET-NULL semantics and indexes on both sides. `experiment_assignments` replaces v1's `test_group text[]`; `experiment_attribution_events` replaces v1's `evidence_event_ids uuid[]`. Coordinator pattern queries like "all deals affected by pattern X" are FK-enforced joins, not array scans. **Alternative (uuid[] arrays, v1 `coordinator_patterns.deal_ids text[]`)** produced ghost references 09-CRITIQUE §5.14. Preserve.

### R5. Four canonical RLS patterns + `public.is_admin()` SECURITY DEFINER (§2.2.1, migration 0001)

**Right because:** Pattern A (own-rows: observations/surface_dismissals/surface_feedback/notifications) uses `observer_id = auth.uid()`; Pattern B (team_members lookup: agent_configs/versions/field_query_questions) uses subselect-EXISTS; Pattern C (read-all, update-own: users/team_members/support_function_members); Pattern D (read-all-authenticated, service-role-writes: the 19 event-log/intelligence tables including jobs per migration 0003). 49 policies across 38 tables; default-deny on INSERT/UPDATE/DELETE for Pattern D wins the "server-side service-role only" invariant for free. `is_admin()` is STABLE + SECURITY DEFINER with `search_path = public, pg_temp` — the correct hardening. Admin bypass is a boolean, not a roles table; multi-role adds alongside without policy rewrites. **Alternative (no RLS or a roles table)** was v1's universal gap. Preserve.

### R6. Unified Claude wrapper + prompts-as-files + tool-use forcing (§2.13, Guardrails 16–20, client.ts:96–120)

**Right because:** `tool_choice: { type: "tool", name: input.tool.name }` forces structured output; no regex fence-stripping exists anywhere in `packages/`. Model precedence is `input > env.ANTHROPIC_MODEL > frontmatter.model`; temperature precedence is `input > task-map default > frontmatter`. Retry is 3× exponential on 429/500/502/503/504 only; protocol violations throw `PromptResponseError` cleanly. Telemetry is one JSON line per call to stderr. Prompts load from `.md` files via the `packages/prompts` gray-matter loader with required-front-matter validation. **Alternative (v1's inline template literals + 4 fence-strip regex patterns, 09-CRITIQUE §5.8)** was the universal parse fragility. Preserve.

### R7. Jobs infrastructure — Postgres `jobs` + `pg_cron` + `FOR UPDATE SKIP LOCKED` + Realtime (§2.6, schema.ts:1106–1146, worker/route.ts:38–52)

**Right because:** Concurrent claim is race-free; Realtime broadcasts on `jobs` via `REPLICA IDENTITY FULL`; the cron schedule is a CLI-arg-driven SQL script per §2.6.1 (no accidental preview-URL wiring); 87/87 green at Day 3 report. `attempts` is atomic with the claim; retry policy is parked for Phase 3 per the Day 3 parked items. Four indexes including `(status, scheduled_for)` for the poll query + `(user_id, created_at desc)` for UI. **Alternative (Rivet)** was the 09-CRITIQUE §3.1 facade. Preserve.

### R8. Service template — postgres.js-direct + `{databaseUrl, sql?}` + `close()` (§2.10, Guardrail 13)

**Right because:** `MeddpiccService`, `StakeholderService`, `ObservationService` share the exact same constructor shape; `adapter.setContactRoleOnDeal` borrows the adapter's sql pool via `new StakeholderService({ databaseUrl: "", sql: this.sql })`; the `ownedSql` flag correctly controls whether `close()` ends the pool. Third outing (ObservationService) generalized cleanly without forced-fit per BUILD-LOG Session B. Keeping `@nexus/shared` free of `@nexus/db` avoids the cross-package dep cycle. RLS enforcement for Pattern A lives at the route boundary via `createSupabaseServerClient().auth.getUser()` → passed as `observerId` — documented in the service file header. **Alternative (Drizzle-in-services or @nexus/db as a shared-package dep)** would leak ORM-level types into the CRM adapter boundary. Preserve with one follow-up in Output 2 (A7 — process-wide shared pool to eliminate the per-request pool explosion).

### R9. §2.1.1 Supabase magic-link hotfix rules (three defensive layers)

**Right because:** Dashboard Site URL + Redirect URLs allowlist + `NEXT_PUBLIC_SITE_URL` on Vercel (all three scopes) + explicit `emailRedirectTo` + `/` page forwarding stray `?code=` to `/auth/callback` is defense-in-depth, not redundancy. The failure mode (silent Supabase root fallback stranding users at `/` with a live code) is structurally prevented at three layers. `env.siteUrl` fallback chain (NEXT_PUBLIC_SITE_URL → VERCEL_PROJECT_PRODUCTION_URL → VERCEL_URL → localhost) is the tightest reasonable ordering. **Alternative (trust the Supabase default)** was the Phase 2 Day 2 production loop. Preserve.

### R10. §2.18.1 HubSpot config path convention (`packages/shared/src/crm/hubspot/`)

**Right because:** `pipeline-ids.json` + `properties.ts` + `adapter.ts` + `client.ts` + `webhook-verify.ts` + `mappers.ts` colocated in one package; scripts + adapter + factories all import from one boundary; ESM JSON import (`pipeline-ids.json` with `{ type: "json" }`) survives Vercel serverless bundling. **Alternative (per-app config + `packages/seed-data/` workspace referenced by 07C but nonexistent + `apps/web/src/config/`)** fractures the boundary; the original 07C spec was wrong on both paths and the amendment resolved it correctly. Preserve.

### R11. `/pipeline/:dealId` URL uses HubSpot numeric ID directly — ratified with productization caveat

**Right because:** The review prompt explicitly asked about this. HubSpot IDs in URLs are operationally simple (HubSpot's own UI shows the same IDs), cache-resilient (no Nexus row required), and demo-legible. The cost of building a Nexus-side UUID layer now — new `deal_identity` table, migrations, every route handler refactored, every adapter call routed through a resolver — carries zero demo value and propagates one extra indirection through every page. **Alternative (Nexus UUID in URLs)** only pays off at productization Stage 3 (SalesforceAdapter landing, Month 3–6 post-demo), when the CRM ID format changes. Do NOT fix now; DO add a one-paragraph entry to PRODUCTIZATION-NOTES.md under Stage 3 naming the transition task so it's not lost. Preserve the current pattern.

### R12. `deal_contact_roles` Nexus-side table for per-deal roles (07C §4.3, §2.18)

**Right because:** Starter tier has no custom association labels; role metadata in Nexus is the only legal path. `setContactRoleOnDeal` delegates to `StakeholderService` — single write-path preserved. The adapter method exists for interface-consistency (SalesforceAdapter will implement differently, with Salesforce Opportunity Contact Role labels). Unique constraint `(hubspot_deal_id, hubspot_contact_id)` + indexes on both. **Alternative (force a HubSpot Pro upgrade to get custom labels)** is real cost with no per-demo value. Preserve.

### R13. Design-token three-layer consumption + nothing-is-flat defaults (§2.22, Guardrail 34)

**Right because:** Hex scales in `tailwind.config.ts` (Layer 1) → CSS custom properties in `globals.css` (Layer 2) → Tailwind extends semantic utilities bound to Layer 2 vars (Layer 3). `--ring-focus` and `--backdrop` are baked-rgba variables for the alpha cases Tailwind 3 hex scales can't express. 0 hex hits + 0 stale shadcn placeholder-class hits in `apps/web/src/` at end-of-day for every day since Phase 2 Day 1. Every primitive defaults with its shadow/hover/focus treatment (Button shadow-sm→shadow-md + -translate-y-px, Card shadow-sm, Input ring-focus shadow). **Alternative (the v1 1,019 inline hex + 113 unresolved DM Sans declarations, 09-CRITIQUE §9)** is the specific failure this pattern prevents. Preserve.

### R14. Declarative nav registry + string `iconName` resolution (§2.22c, Guardrail 36, nav.ts + NavLink.tsx)

**Right because:** `NAV` is a `readonly NavItem[]` in `config/nav.ts` with `iconName: "dashboard" | "pipeline"`; `NavLink` (client) holds the `Record<NavIconName, LucideIcon>` and resolves. Sidebar (server) passes only serializable strings. The RSC-crash class (Phase 2 Day 2 hotfix `2b41c4c`) is structurally prevented for future nav items. **Alternative (passing lucide components as props)** was the specific crash. Preserve as the reference pattern for every future server→client prop that would otherwise be a function/component.

### R15. §2.16.1 corpus-intelligence preservation as a locked amendment

**Right because:** Five decisions — transcript embeddings, event_context snapshot, prompt_call_log telemetry, speaker-turn preservation, extensible tool schemas — each inexpensive today and structurally impossible later. They exist specifically to keep the productization arc open without inflating demo scope. The fact that Output 2 has three findings requesting explicit pull-forward/shape-lock decisions on these *confirms* the amendment is load-bearing, not incidental. Preserve the amendment; see Output 2 A2–A4 for the concrete shapes.

---

## Output 2 — Adjust-before-solidifies

Ordered by urgency (pre-Phase-3 items first). Each finding: (a) what it is, (b) what it breaks and when, (c) cost now vs later, (d) recommendation.

### A1. `observations.signal_type NOT NULL` forces semantic hacks for non-classified captures

**(a)** `schema.ts:480` — `observations.signalType signal_taxonomy NOT NULL`, no default. Every row needs one of the 9 taxonomy values even if it came from a path where the classifier didn't run. Phase 2 Day 4 Session B's `close_lost_preliminary` capture routes through `ObservationService.record` (observations.ts:47–49), which hardcodes `CATEGORY_TO_SIGNAL_TYPE['close_lost_preliminary'] = 'field_intelligence'` + writes `source_context.category = 'close_lost_preliminary'` as a JSONB discriminator. The pattern is documented in the service-header comment but not formalized as a guardrail or view.

**(b)** Phase 3 Day 2's coordinator receives transcript-detected signals via `signal_type IN (...)` queries — if any Phase 3+ aggregation forgets to add `AND (source_context IS NULL OR NOT source_context ? 'category')`, rep-typed close-lost notes flow into coordinator pattern detection as "field_intelligence" recurrences. Phase 4 Day 2 synthesis then reasons over them as though Claude produced them. Phase 5 Day 1's formal close-lost flow (§1.1) *is* expected to migrate these rows via `WHERE source_context->>'category' = 'close_lost_preliminary'` — that migration works only if no consumer has already scored these rows as live signals. Every new capture surface (customer-message AI category per §2.19, any post-Phase-5 rep-driven capture) repeats the pattern: pick a taxonomy bucket, add a discriminator, hope downstream remembers.

**(c)** **Fix now (option 1 — nullable signal_type):** one-migration `ALTER COLUMN signal_type DROP NOT NULL`; update `ObservationService.record` signature to accept an optional `signalType?: SignalTaxonomy` and write null when `category` is non-null; existing consumers already handle null safely because `signal_type = X` matches no null rows. ~15 minutes + a regen of `test-rls-observations.ts` to insert a null row. **Fix later:** every time a Phase 3+ coordinator query slips the filter, false-positive patterns flow into `coordinator_patterns.synthesis` with cited-as-evidence rep-typed notes; debugging requires per-deal audit + manual row recategorization.

**(d)** **Recommended: fix now with option 1 (nullable).** Add a sentence to DECISIONS.md §2.13.1: *"`observations.signal_type IS NULL` iff the row was captured outside the signal-classifier path; `source_context.category` identifies the alternate path. Coordinator/pattern queries filter `signal_type IS NOT NULL`."* Reject the materialized-view option (drifts from source of truth, needs refresh policies); reject promoting `category` to a column now (premature — wait for 3+ categories per Output 4 C3).

### A2. `deal_events.event_context` — pull forward from Phase 4 Day 1 to Phase 3 Day 1 (§2.16.1 decision 2)

**(a)** §2.16.1 decision 2 specifies `event_context jsonb` on `deal_events` at Phase 4 Day 1 carrying `{vertical, deal_size_band, employee_count_band, stage_at_event, active_experiment_assignments}`. The column is absent from schema.ts:409–428 today — correct, deferred. But Phase 3 Day 2 writes `signal_detected` events, `meddpicc_scored` events, `transcript_ingested` events. All of those events, written between Phase 3 Day 2 and Phase 4 Day 1, will lack `event_context`. §2.16.1 explicitly states "`hubspot_cache` reflects current state; `event_context` preserves historical state" — which means **a Phase 4 backfill cannot correctly populate Phase 3-era rows** (the deal has moved stages since the event fired).

**(b)** Phase 4 Day 2 coordinator synthesis queries `deal_events` filtered by segmentation ("healthcare Negotiation-stage deals where Microsoft was mentioned"). Phase 3-era signal rows carry null (or approximate current-state) context; Phase 4+ rows carry correct context. Coordinator patterns mix accurate-at-event with approximate-at-now, silently skewing the "same mechanism across multiple deals" signal. PRODUCTIZATION-NOTES.md's corpus-intelligence arc depends on accurate per-event segmentation; Phase 3-era events are permanently less analytically useful.

**(c)** **Fix now:** pull the column forward into the Phase 3 Day 1 migration (the same one that adds `prompt_call_log`). Ship nullable from day one; Phase 3 Day 2's event writes populate it correctly from the outset; Phase 4 Day 1's role collapses to `ALTER COLUMN event_context SET NOT NULL`. Cost: ~10 lines in Phase 3 Day 1 migration + one helper method `DealIntelligence.buildEventContext(dealId, activeExperimentIds)` added when the first event-writer lands. **Fix later (backfill at Phase 4 Day 1):** best-effort backfill from `hubspot_cache` + HubSpot's deal-property history API + `experiment_assignments.is_active_at(event_ts)` — complex, lossy, documented as "approximate for Phase 3-era rows."

**(d)** **Recommended: pull forward to Phase 3 Day 1.** Update DECISIONS.md §2.16.1 decision 2 to say *"column lands Phase 3 Day 1 nullable; flips to NOT NULL Phase 4 Day 1 once all writers populate it."* This is the whole point of the preservation amendment — §2.16.1 exists so the retrospective-impossibility cost never materializes.

### A3. `prompt_call_log` column shape lock (§2.16.1 decision 3)

**(a)** §2.16.1 decision 3 enumerates `prompt_version, model, temperature, input_token_count, output_token_count, duration_ms, stop_reason, deal_id, job_id, created_at` — 10 columns. The table lands Phase 3 Day 1 (already pulled forward). But several foundation-level joins are missing from that list: `prompt_file` (one prompt_version exists per file; without file the call-site query is ambiguous), `tool_name` (a single prompt can carry multiple tool variants in future), `task_type` (the `"classification" | "synthesis" | "voice" | "voice_creative"` temperature class — needed for compliance filtering), `attempts` (already emitted to stderr telemetry; carries retry cost signal), `error_class` (`null` on success, `PromptResponseError` / `APIError` / etc. on failure), `observation_id` / `transcript_id` / `actor_user_id` (the call's foreign anchors — enterprise compliance asks "every AI decision about deal X" which is a join across these).

**(b)** Phase 4 Day 2's coordinator-run audit query ("which patterns did Claude synthesize for healthcare last week"), Phase 5 Day 1's per-prompt-version regression telemetry ("reasoning_trace-added run quality vs prior run"), and the enterprise Stage 4 GA compliance surface ("show me every Claude call that touched this customer's deal data") all join on these missing columns. Adding them later means `ALTER TABLE prompt_call_log ADD COLUMN ...` against a table with millions of rows — not hard, but the column default is null, retrospective joins are incomplete, and the "single source of truth for AI decisions" claim is weakened.

**(c)** **Fix now:** lock the full shape in DECISIONS.md §2.16.1 decision 3 before Phase 3 Day 1's migration ships. Recommended columns (19 total): `id uuid pk, prompt_file text not null, prompt_version text not null, tool_name text not null, model text not null, task_type text, temperature decimal(3,2), max_tokens int, input_tokens int, output_tokens int, duration_ms int, attempts int not null default 1, stop_reason text, error_class text, hubspot_deal_id text, observation_id uuid, transcript_id uuid, job_id uuid, actor_user_id uuid, created_at timestamptz default now()`. Add indexes `(hubspot_deal_id, created_at DESC)`, `(job_id)`, `(prompt_file, prompt_version, created_at DESC)`. RLS Pattern D. `observation_id` / `transcript_id` / `actor_user_id` without FKs for now (same pattern as `deal_events.hubspot_deal_id` — cross-object audit should survive child deletion). **Fix later:** every added column on a populated table loses retrospective fidelity.

**(d)** **Recommended: lock shape now, amend §2.16.1 decision 3.** 30 minutes of decision-making saves every future compliance/ telemetry query.

### A4. `transcript_embeddings` pgvector dimensionality + index strategy (§2.16.1 decision 1)

**(a)** §2.16.1 decision 1 specifies transcript embeddings land Phase 3 Day 2 with "voyage-3 or voyage-large-2 ... fallback to OpenAI text-embedding-3-small." The dimensionality is not locked: voyage-3 = 1024, voyage-large-2 = 1536, OpenAI text-embedding-3-small = 1536, text-embedding-3-large = 3072. The schema must pick one `vector(N)` column definition, and migrating dimensionality after embeddings exist requires a batch re-embed.

**(b)** PRODUCTIZATION-NOTES.md's narrative-analysis surface (Months 3–6 post-demo) queries via cosine similarity. At 1M transcripts × 10 speaker-turn embeddings each × 1536 dims × 4 bytes = ~60 GB of embedding data. HNSW or IVFFLAT index choice is load-bearing for query latency. Provider switch after production rows exist ($0.12/1M tokens × millions of transcripts = real backfill cost) becomes painful.

**(c)** **Fix now:** lock `vector(1536)` + voyage-large-2 as default + `embedding_model text NOT NULL` column for forward compat + HNSW index (`USING hnsw (embedding vector_cosine_ops)`). 1536 matches OpenAI text-embedding-3-small exactly, so the documented fallback swap is mechanical (re-encode queries only, no re-embed). The model-text column means swapping to a future voyage-4 at the same 1536 dims is a code change, not a migration. Schema sketch: `transcript_embeddings (id uuid pk, transcript_id uuid references transcripts(id) on delete cascade, scope text check (scope in ('transcript','speaker_turn')) not null, speaker_turn_index int, embedding vector(1536) not null, embedding_model text not null, embedded_at timestamptz default now())`. Index `hnsw (embedding vector_cosine_ops)` with `ef_construction=64, m=16` as defaults. **Fix later:** every re-embed is operationally expensive + query patterns established against the wrong index shape have to be rewritten.

**(d)** **Recommended: lock `vector(1536)` + voyage-large-2 + HNSW in §2.16.1 decision 1 before Phase 3 Day 2.** ~20 words to §2.16.1.

### A5. MEDDPICC per-dimension score writeback to HubSpot — reconcile with Output 3 W1

This is the same substance as Output 3 W1 but the HubSpot-write-path is Phase-3-Day-2 code. The fix (add the 39th property now) closes both the drift (Output 3) and the Phase 3 writeback gap — one 15-minute fix resolves both findings. See W1 for the four-part detail; noted here only so the reader doesn't search for an Output 2 entry that matches the Output 3 item.

### A6. `experiments.vertical` denormalized column

**(a)** `schema.ts:568–590` defines `experiments` with `applicability jsonb NOT NULL DEFAULT '{}'::jsonb` + `thresholds jsonb NOT NULL DEFAULT '{}'::jsonb` but no first-class `vertical` column. §1.3 (experiment proposal paths), §1.4 (three categories), §2.17 (coordinator), §2.21 (applicability gating) all assume vertical is a first-class experiment axis. Today that axis lives in `applicability.verticals[]` jsonb — no enum constraint, no index, no fail-fast.

**(b)** Phase 5 Day 1 wires experiment CRUD + applicability engine. Phase 4 Day 2 coordinator `IntelligenceCoordinator.receiveSignals` / `getActivePatterns({vertical})` — and Phase 3 #23 experiment-attribution prompt `getApplicableExperimentsForDeal(dealId)` — all need "experiments applicable to this vertical." Today this is `applicability @> '{"verticals":["healthcare"]}'` jsonb ops, unindexed → full-table scan at scale. An experiment created via Phase 5 UI with `applicability.verticals = ['helathcare']` (typo) silently matches zero deals, invisibly.

**(c)** **Fix now:** add `vertical vertical NULL` column (nullable = "cross-vertical") matching the pattern already used on `coordinator_patterns.vertical`. Composite index `(vertical, lifecycle)` for the hot query. One migration, zero rows today (no experiments seeded), strictly additive. **Fix later:** backfill reads each experiment's `applicability.verticals`, writes the column, encounters the "experiment with 2 verticals" ambiguity (single / primary / split), and every Phase 4+ query needs rewriting once the column exists.

**(d)** **Recommended: fix before Phase 5 Day 1.** Can land Phase 3 Day 1 alongside prompt_call_log + event_context. If an experiment genuinely spans N>1 verticals later, add a sibling `experiment_verticals` join table; for single-vertical common case, the column is authoritative.

### A7. Per-request pool explosion — pull the process-wide shared client forward (Session B parked item → Phase 3 Day 1)

**(a)** BUILD-LOG Session B "Full pooler mitigation" is parked for Phase 3 Day 1. Today each factory (`createHubSpotAdapter`, `createMeddpiccService`, `createStakeholderService`, `createObservationService`) opens its own `postgres()` pool with `max=1-2` and 30-s idle timeout. A single `/pipeline/[dealId]` page load creates 2 pools; each server action creates 2–3 more; per-rep workflow peak is 5 connections, documented in BUILD-LOG Session B. Multiplied by concurrent users + Turbopack rebuilds + test scripts, the 200-client Supabase Transaction Pooler cap is reachable (already surfaced during Session A post-split verification — `EMAXCONN` blocked browser re-verify).

**(b)** Phase 3 Day 2's transcript pipeline handler runs inside `/api/jobs/worker` and will create its own pools per invocation; with pg_cron scheduling every 10s, the worker's connections compound with active browser sessions. Phase 4 Day 2's periodic `hubspot_periodic_sync` adds more. The EMAXCONN pattern that surfaced twice in Phase 2 will recur at Phase 3+ volume.

**(c)** **Fix now:** build `packages/shared/src/db/pool.ts` (or `packages/db` export) with a module-level `sharedSql = postgres(DATABASE_URL, { max: 10, idle_timeout: 60, prepare: false })` and a `getSharedSql()` accessor. Update the four factories in `apps/web/src/lib/` to pass `sql: getSharedSql()` → every service/adapter skips pool creation. Peak per request drops from 5 connections to ~0 new (the shared pool covers it). ~1–2 hours. **Fix later:** every Phase 3+ dev cycle fights EMAXCONN events; the documented 2–5 minute drain + preview restart becomes routine; the Playwright smoke (parked) trips EMAXCONN in CI.

**(d)** **Recommended: ship before Phase 3 Day 1 work starts.** Matches the BUILD-LOG parked item's scope; pulls forward the mitigation that Session B identified as "proper fix still the right shape."

### A8. `sync_state` table for 15-min HubSpot reconciliation (parked → Phase 3 Day 1)

**(a)** 07C §5.4 specifies "pg_cron every 15 min calling `bulkSync*({ since: lastSyncAt })`" with `lastSyncAt` in a single-row `sync_state` table. Schema has no such table. BUILD-LOG parks for Phase 4 Day 2.

**(b)** Phase 3+ webhook reliability depends on this reconciliation. Webhook delivery retries exhausted by HubSpot, or landing during a Vercel 5xx cold-start, create stale cache entries that live until manual refresh. Demo = single stale deal until someone clicks "Refresh from HubSpot"; productization = compliance-visible data loss. The webhook handler currently refetches on every event; a missed event is permanently lost without the reconciliation.

**(c)** **Fix now:** one-table migration `sync_state (object_type hubspot_object_type primary key, last_sync_at timestamptz not null default '1970-01-01')` + one pg_cron job definition calling a periodic-sync endpoint that reads+updates per object type. ~20 minutes. **Fix later:** 15-min gap from Phase 3 kickoff until Phase 4 Day 2 ships.

**(d)** **Recommended: ship Phase 3 Day 1 alongside the other pull-forwards.** Three hygiene items (prompt_call_log, event_context, sync_state) fit in one migration.

### A9. `HubSpotAdapter.handleWebhookEvent` refetches every object on every property-change

**(a)** `packages/shared/src/crm/hubspot/adapter.ts:925–961` — every `deal.propertyChange` event triggers `fetchDealWithAssociations(event.objectId)` and writes the full deal payload to cache. For `deal.propertyChange` on a `nexus_*` property we just wrote ourselves, the webhook echo-fetches the same deal we just updated.

**(b)** Phase 3 Day 2's transcript pipeline writes `nexus_meddpicc_*_score` via `updateDealCustomProperties` → HubSpot fires `deal.propertyChange` for each of the ~8 properties → webhook handler re-fetches the deal 8 times. Each fetch is 1 HubSpot API call + 1 cache write. Transcripts with three parallel Claude calls (MEDDPICC + fitness + lead score) × ~10 properties ≈ 30 echo-fetches per transcript. Day 3's `provision:hubspot-properties` pass already hit HubSpot's 100/10s burst ceiling during re-runs per BUILD-LOG Day 5 Finding A's ensureProperty pass. Multiply by concurrent transcript processing and we self-trigger the 429 retry path.

**(c)** **Fix now:** dedupe on write — `updateDealCustomProperties` writes to the cache directly with the expected payload after successful API, and `handleWebhookEvent` skips the fetch if cache's `cached_at` is newer than `event.occurredAt` (HubSpot webhook payload carries `occurredAt`). Or add a write-idempotency token: `adapter.updateDealCustomProperties` sets a short-lived `in_flight_writes` entry keyed on `(deal_id, property_names)` that suppresses the echo webhook for 10 seconds. Or (simplest): skip `nexus_*` property-change webhooks entirely in `handleWebhookEvent` — 07C §5.1 explicitly notes these are self-triggered and the handler should "Update cache only (these are our own writes; we already know)." Today it does the expensive refetch instead. **Fix later:** every Phase 3+ pipeline run burns 10–30× its rate budget on webhook echo.

**(d)** **Recommended: fix now with the `nexus_*` property-change skip.** Check `event.eventType === 'deal.propertyChange' && event.propertyName?.startsWith('nexus_')` → update cache in-place from `event.newValue` (the webhook payload carries it, adapter.ts:916 reads `propertyValue` as `newValue`) and skip the fetch. ~10 lines. Matches 07C §5.1's documented intent.

### A10. Mappers duplicate `VERTICAL` tuple locally (Guardrail 22 violation)

**(a)** `packages/shared/src/crm/hubspot/mappers.ts:54–67` — `parseVertical` hardcodes `const VERTICALS: Vertical[] = ["healthcare", "financial_services", "manufacturing", "retail", "technology", "general"]` as a local constant instead of importing `VERTICAL`/`isVertical` from `../../enums/vertical`.

**(b)** Violates Guardrail 22's single-source-enum intent. If `VERTICAL` is extended (adding `"public_sector"` for a Stage 4 enterprise customer), this mapper silently rejects and returns null; `Deal.vertical` comes back null despite HubSpot having the correct value; a Phase 4 coordinator pattern detection that filters by vertical misses every deal in the new vertical. Invisible drift — the specific failure mode Guardrail 22 was written to prevent.

**(c)** **Fix now:** two-line edit — `import { VERTICAL, isVertical } from "../../enums/vertical"; return isVertical(normalized) ? normalized : null;`. Zero test/code impact. **Fix later:** first drift event is a silent null, likely caught only when a rep asks "why isn't the new vertical's intelligence showing up?"

**(d)** **Recommended: fix now.** Trivial and closes a compliance gap.

### A11. `customer_messages.ai_category text` + `deal_fitness_scores.velocity_trend text` — tighten to enums (§2.2 hygiene)

**(a)** `schema.ts:939 (aiCategory text)` and `:756 (velocityTrend text)`. Both are documented as enumerations at the HubSpot property level (07C §3.1 `nexus_fitness_velocity` enum `accelerating|stable|decelerating|stalled`; 07B §5 contact `nexus_ai_category` enumeration). Nexus-side is untyped text.

**(b)** Phase 4 Day 1's `DealFitnessService.recompute` will write `velocity_trend` — a typo (`"stallled"`) lands silently in Nexus, HubSpot enum rejects the corresponding `nexus_fitness_velocity` write, Nexus and HubSpot diverge. Phase 5 customer-messages flow writes `ai_category` — same silent drift. Both are v1 debt #3 patterns that §2.2's "20+ text-shaped enum columns → proper Postgres enums" was supposed to clean up.

**(c)** **Fix now (fitness_velocity only):** `CREATE TYPE fitness_velocity AS ENUM ('accelerating','stable','decelerating','stalled');` + `ALTER TABLE deal_fitness_scores ALTER COLUMN velocity_trend TYPE fitness_velocity USING velocity_trend::fitness_velocity;`. Zero rows today; matches the HubSpot enum. Defer `ai_category` until Phase 5 Day 3-4 when the customer-messages writer lands and the final taxonomy is decidable. **Fix later:** every write of either column is a drift risk.

**(d)** **Recommended: fix `fitness_velocity` now; `ai_category` at Phase 5 Day 3-4.** The former is known values + no rows; the latter needs its taxonomy first.

### A12. `experiment_attributions.transcriptId` missing FK

**(a)** `schema.ts:623` — `transcriptId: uuid("transcript_id")` with no `.references()` call. All other uuid-to-transcripts references in the schema carry FKs.

**(b)** Phase 5 attribution pipeline (#23 prompt) generates these rows. A Phase-6 demo reset that removes a transcript leaves orphan attribution rows pointing at nothing. Not corruption, but the JOIN-through-transcripts query (for debugging "which transcript produced this attribution") returns null silently.

**(c)** **Fix now:** add `.references(() => transcripts.id, { onDelete: "set null" })` — matches the pattern on `agent_config_proposals.source_observation_id`. One line + migration. **Fix later:** small pollution of the event-lineage model.

**(d)** **Recommended: fix now.** Hygiene completion per §2.2.

### A13. Composite `(hubspot_deal_id, created_at DESC)` index on `deal_events`

**(a)** `schema.ts:421–427` — `deal_events` has `deal_idx`, `type_idx`, `deal_type_idx (hubspot_deal_id, type)`, `actor_idx`, `created_idx`. No composite `(hubspot_deal_id, created_at)` for the canonical "per-deal timeline newest first" query.

**(b)** Phase 4 Day 2 coordinator synthesis (`IntelligenceCoordinator.getEventStream(dealId, opts)`, 06b-close-analysis-final prompt's `${eventStreamBlock}`) + Phase 5 close-hypothesis (#14B reads full event stream) + call-prep orchestrator (#11) all walk `WHERE hubspot_deal_id = ? ORDER BY created_at DESC`. Postgres merges `deal_idx + created_idx` but a composite is faster. Demo-scale (50 events/deal × 100 deals) is invisible; historical-ingestion scale (PRODUCTIZATION-NOTES.md, 10K events/deal) matters.

**(c)** **Fix now:** one-line schema edit, one migration. **Fix later:** `CREATE INDEX CONCURRENTLY` against a populated table with downtime-aware rollout.

**(d)** **Recommended: fix Phase 3 Day 1.** Cheap, aligned with all Phase 4+ read patterns.

### A14. Pipeline page serial company lookups

**(a)** `apps/web/src/app/(dashboard)/pipeline/page.tsx:47–54` — after `listDeals()`, iterates `for (const id of companyIds) { ... await adapter.getCompany(id); ... }` serially.

**(b)** Cold-cache load with 20 unique companies → 20 sequential HubSpot calls × ~200 ms = 4 s page load. Cache hits compress to ~10 ms each; first-load is the slow path. Current demo (10 companies) is invisible; Phase 3+ demo expansion to 18+ deals across more companies surfaces it. Post-demo productization (50+ companies) compounds with Next.js `<Link>` auto-prefetch spawning 4-round-trip detail page pre-loads.

**(c)** **Fix now:** 4-line swap to `Promise.all`. **Fix later:** every cold pipeline load waits sequentially.

**(d)** **Recommended: fix now.** Trivial concurrency win; paired with the Phase 4 parked `prefetch={false}` decision, keeps the pipeline responsive at productization sizes.

### A15. OVERSIGHT-HANDOFF.md staleness (flagged in Jeff's ack)

**(a)** OVERSIGHT-HANDOFF.md line 23 says "Latest commit on main (nexus-v2): `2b41c4c`" — actual HEAD is `a414ad0`, six commits later. Lines 36–43 say Phase 2 Day 3 is blocked on two open hotfixes; both shipped in `6a77782`, and Day 3 + Day 4 Sessions A & B all landed after. Footer line 126 dates the doc to "end of Phase 2 Day 2 hotfix cycle, pre-Phase 2 Day 3" — correct staleness label, but it's buried at the bottom. The "Meta-lessons" section (lines 68–79) misses Session A's EMAXCONN pattern, Session B's @dnd-kit SSR-mismatch pattern, the adapter↔StakeholderService invariant, and the shared-action module-level pattern.

**(b)** Fresh oversight sessions read this doc first per §"Required reading order." A new chat reading it without cross-referencing git will spend the first 10–30 minutes triaging pre-kickoff for blockers that are resolved, and operate against a stale operational baseline. The handoff rhythm documented there (lines 48–58) is correct but the concrete "what's open right now" is wrong.

**(c)** **Fix now (30 min refresh):** update "Latest commit" + "Phases complete" + retire the "Open hotfixes" section (blockers resolved); add Sessions A and B meta-lessons (pool trim rationale, @dnd-kit mount pattern, adapter↔service invariant, "third service template — generalized cleanly"); update the last-updated line; either keep as a separate meta doc OR fold into BUILD-LOG's "Context for next session" block and retire the file. **Fix later:** every fresh oversight session re-pays the orientation tax.

**(d)** **Recommended: refresh now, AND add a maintenance rule to DECISIONS.md.** New lightweight amendment: *"OVERSIGHT-HANDOFF.md refreshed after every 2+ day-sessions or whenever a hotfix cycle resolves. `last updated` line in the file is load-bearing; if the file's top is older than BUILD-LOG's Current state, the file is stale by contract."* Alternative: retire the separate file entirely — most of its content belongs in BUILD-LOG's "Context for next session" block, and the duplication between the two docs is its own drift source. I lean toward refresh (the rhythm + Jeff's-working-style sections don't belong in BUILD-LOG), but propose the retire option explicitly for Jeff's call.

### A16. `confidence_band` enum — document intent or delete

**(a)** `schema.ts:143` defines `confidenceBandEnum = pgEnum("confidence_band", ["low","medium","high"])`. No table column references it; all `confidence` columns use `decimal(4,3)` (numeric, not banded).

**(b)** Dead enum today. Phase 4 Day 2's surface-admission rules (§1.16 threshold-based) *might* bind it, or it might stay unused. Next session looking at schema.ts has no signal whether to extend or delete.

**(c)** **Fix now:** document intent in a comment on the enum declaration. 1 minute. Or delete via migration if intent is abandoned. **Fix later:** small low-signal clutter that ages into "nobody remembers why this exists."

**(d)** **Recommended: add a comment naming the candidate consumer.** If Phase 5 Day 1 ships without binding it, revisit for deletion.

### A17. `/pipeline/:dealId` URL structure — ratified with productization note (cross-reference Output 1 R11)

Placed as **R11 in Output 1** per the prompt's "if ratify, say so explicitly and put the finding in Output 1 instead" rule. This entry here is a pointer to ensure the reader of Output 2 doesn't look for the dealId-URL finding in vain.

---

## Output 3 — Actively-wrong findings

One finding. Same class as Session B's signal-taxonomy resolution — the drift is latent today (no consumer has tripped it yet) but the foundation is internally inconsistent, and Phase 3 Day 2 is the first consumer.

### W1. MEDDPICC 7-vs-8 drift between schema/service and HubSpot properties — fix before Phase 3 Day 2

**(a)** Three-way inconsistency in the same canonical taxonomy:

1. **Schema + service + prompt rewrites say 8 dimensions.** `schema.ts:698–715`: `meddpicc_scores` has 8 score columns including `paper_process_score`. `MEDDPICC_DIMENSION` at `packages/shared/src/enums/meddpicc-dimension.ts:5-14` enumerates 8 values. `packages/shared/src/services/meddpicc.ts:91–98`: `MeddpiccService.upsert` computes `overallScore` as the rounded mean of all present non-null dimension scores across the 8-value enum. All v2-ready rewrite prompts use the 8-value set — `06a-close-analysis-continuous.md:120` and `08-call-prep-orchestrator.md:163` both enumerate the same 8 (metrics, economic_buyer, decision_criteria, decision_process, identify_pain, champion, competition, **paper_process**).

2. **HubSpot property spec says 7 dimensions.** `packages/shared/src/crm/hubspot/properties.ts:234–303` defines exactly 7 `nexus_meddpicc_*_score` properties: metrics, eb, dc, dp, pain, champion, competition. **There is no `nexus_meddpicc_paper_process_score`.** These properties are provisioned on the live HubSpot portal 245978261 per Phase 1 Day 5.

3. **Documentation says 7 average.** 07C §3.1: *"`nexus_meddpicc_score` (number) — 0-100 average across 7 dimensions"* — but `MeddpiccService.upsert` averages 8. 09-CRITIQUE §2.3 says v1 MEDDPICC is 7 dimensions; the schema silently moved to 8 without the HubSpot spec following.

**(b)** Phase 3 Day 2 wires `updateDealCustomProperties(dealId, { nexus_meddpicc_metrics_score, …, nexus_meddpicc_score })` per 07B §5. The prompt rewrite `05-deal-fitness.md` (and the transcript pipeline) will emit `paper_process` scores. Two outcomes: (1) the service drops `paper_process` when building the HubSpot payload → Nexus carries it, HubSpot doesn't, the "overall_score" fields disagree numerically because they average different sets; (2) the service attempts to write a `nexus_meddpicc_paper_process_score` property that doesn't exist → HubSpot returns `PROPERTY_DOESNT_EXIST` 400 → transcript pipeline step 4 fails → job fails. Either way Phase 3 Day 2 crashes on first real transcript. And the `overall` numeric disparity persists into Phase 5 Day 1's Deal Fitness UI — HubSpot's `nexus_meddpicc_score` = 7-dim average, Nexus's `meddpicc_scores.overall_score` = 8-dim average — two authoritative numbers that disagree.

**(c)** **Fix now (15 min):**
1. Add `nexus_meddpicc_paper_process_score` to `packages/shared/src/crm/hubspot/properties.ts` (one entry, matches the other 6 score properties).
2. Add `"nexus_meddpicc_paper_process_score"` to `DEAL_PROPS_TO_FETCH` in `adapter.ts:82-123`.
3. Run `pnpm --filter @nexus/db provision:hubspot-properties` against the live portal (idempotent via the GET-first pattern per Phase 1 Day 5 Finding A).
4. Update 07C §3.1 table to list 8 scores + fix the "average across 7" description to "average across 8 non-null dimensions."
5. Bump the prompt front-matter version on the two rewrite files that use 8-dim and were already consistent — no-op, but signal.

**Fix later:** Phase 3 Day 2 crashes on first real transcript; Phase 5 Day 1 Deal Fitness UI shows Nexus total vs HubSpot total drift; every Claude-pipeline-run log carries a `stop_reason` indistinguishable from a real error. Root-cause diagnosis burns developer hours on a schema drift that's 15 minutes to close today.

**(d)** **Recommended: fix before Phase 3 Day 2 kickoff.** Add the 39th HubSpot property. Rejected alternatives: (i) dropping `paper_process` from the schema — paper_process is canonical MEDDPICC (Miller Heiman taught it, every sales methodology book covers it as a first-class dimension); removing it is a methodology downgrade. (ii) Accepting 7-of-8 HubSpot writeback — HubSpot users looking at the deal record would see 7 scores and an overall that doesn't match the 7 they can see; demoing this to enterprise sales buyers tells them Nexus can't count.

This is the one Output-3 finding because it's the same shape as Session B's taxonomy-NOT-NULL catch: latent today, ready to break Phase 3, cheap to close pre-emptively. Everything else that looked Output-3-adjacent on the first pass (sync_state absence, event_context gap, pool explosion) resolved to Output 2 "adjust before solidifies" because the bug only materializes during Phase 3+ execution, not as a standing inconsistency in the current code.

---

## Output 4 — Creative additions

Five items not in docs or code today that would materially improve the foundation for Phase 3+. Proposed with scope + target phase.

### C1. `pnpm enum:audit` — automate the three-way drift grep

**What:** The §2.13.1 operational note captures a hand-checked process: "when schema holds a canonical enum, check THREE downstream vectors: (1) TS enums, (2) prompt rewrites + 04C, (3) HubSpot property options." This caught ContactRole drift on Phase 2 Day 2, but it's a memorized checklist. A `packages/db/src/scripts/audit-enums.ts` (invoked via `pnpm enum:audit`) that walks each canonical enum and prints cross-site state would have caught Output 3 W1 automatically (the MEDDPICC 7-vs-8 drift would fail CI the moment `properties.ts` was merged).

**How:** For each enum name in a registry `{ SIGNAL_TAXONOMY, CONTACT_ROLE, DEAL_STAGES, MEDDPICC_DIMENSION, ODEAL_CATEGORY, VERTICAL }`:
- **Schema side:** the exported tuple + `pg_enum_range('<name>')` from a live DB query (optional — schema-file read-only is cheaper and catches the generative source).
- **Prompt side:** grep `packages/prompts/files/*.md`, `~/nexus/docs/handoff/source/prompts/*.md`, and `~/nexus/docs/handoff/04C-PROMPT-REWRITES.md` for enum literals (regex matches every 4+ consecutive lowercase_underscore tokens, filters by proximity to the enum name). Report the set each file uses.
- **HubSpot side:** for enums that map to `nexus_*` HubSpot properties (contact_role → nexus_role_in_deal, vertical → nexus_vertical, meddpicc_dimension → nexus_meddpicc_*_score), read `properties.ts` and compare sets.

Exit 1 if any cross-site mismatch; print a per-enum table showing where each value appears. Add to CI as a pre-commit / pre-merge gate.

**Scope:** ~150 LOC script + ~20 LOC CI step. **Target phase:** Pre-Phase 3 Day 1 (same window as prompt_call_log pull-forward). **Why now:** W1 demonstrates the cost of catching this by hand; the productization arc adds SalesforceAdapter (another cross-site vector) and multi-tenant enums; an automated gate prevents Class-W1 from recurring.

### C2. Applicability DSL + shared evaluator service (pre-Phase 5 Day 1)

**What:** §2.21 LOCKED that applicability is "structured JSONB, never prose" — but the actual DSL is not defined. Every Phase 4/5 consumer (intelligence surfaces admission, experiments applicability, risk-flag gating, coordinator pattern filtering) will re-invent the interpretation of `applicability`. Propose a minimal Zod-schema-backed DSL encoded once in `packages/shared/src/applicability/dsl.ts`, plus a shared evaluator `applies({ rule, dealState, eventStream }): { pass: boolean, reasons: string[] }` that Phase 4/5 surfaces call uniformly. Rejection logging (Rebuild Plan §12.5's `applicability_rejections` diagnostic table) flows from the evaluator — one place to instrument, not N places.

**How:** Schema shape:
```ts
const ApplicabilityRule = z.object({
  stages: z.array(z.enum(DEAL_STAGES)).optional(),            // stage gate
  verticals: z.array(z.enum(VERTICAL)).optional(),             // vertical gate
  minDaysInStage: z.number().int().positive().optional(),      // temporal
  maxDaysInStage: z.number().int().positive().optional(),
  minDaysSinceCreated: z.number().int().positive().optional(), // §1.18 48-hour rule
  requires: z.enum(['not_closed', 'closed_won', 'closed_lost']).optional(),
  meddpiccGuards: z.array(z.object({
    dimension: z.enum(MEDDPICC_DIMENSION),
    op: z.enum(['lt', 'lte', 'gte', 'gt', 'eq']),
    value: z.number(),
  })).optional(),
  signalTypePresent: z.array(z.enum(SIGNAL_TAXONOMY)).optional(),   // has at least one open signal of type X
  signalTypeAbsent: z.array(z.enum(SIGNAL_TAXONOMY)).optional(),    // no open signal of type X
});
```

Evaluator reads `dealState: DealState` (the `DealSnapshots` projection) + `eventStream: DealEvent[]` (filtered slice), walks each rule clause, returns `{ pass, reasons }` where reasons are human-readable sentences citing the rule that rejected ("gated: deal is in new_lead, rule requires stages=[discovery, technical_validation]").

**Scope:** ~200 LOC in `packages/shared/src/applicability/` + ~100 LOC unit tests against fixture deal states. **Target phase:** Phase 4 Day 1 alongside `deal_events.event_context` flip and `DealIntelligence.getDealState` — the evaluator needs both as inputs. **Why:** Without this, every Phase 4/5 surface re-parses applicability JSONB differently, and the "rejection diagnostics" surface promised by Rebuild Plan §12.5 becomes N separate loggers.

### C3. `MockClaudeWrapper` for integration tests (pre-Phase 3 Day 1)

**What:** Phase 3 Day 1+ handlers call `callClaude()` in their critical paths. Every test against a real Anthropic API burns cost + introduces nondeterminism. Propose `packages/shared/src/claude/mock.ts` exporting a `createMockClaude(fixtures: Record<string, unknown>)` that returns a drop-in replacement for the wrapper signature, returning `fixtures[promptFile]` as the `toolInput` of the response. Test harness in `packages/db/src/scripts/` (or a new `packages/testing/`) that composes the mock with test fixtures.

**How:** Tests import `callClaude` via a DI seam — `createDealIntelligenceService({ claude: callClaude })` instead of `import { callClaude } from "@nexus/shared/claude"` inside the service. For Phase 3 the first real consumer (transcript pipeline handler) accepts a `claude` parameter; route factory wires the real one, tests wire mock. Matches the `{ sql }` DI pattern already established on the Nexus services. Fixtures live as JSON per prompt file: `tests/fixtures/01-detect-signals/medvista-response.json` etc.

**Scope:** ~50 LOC mock + ~30 LOC harness + fixtures per prompt as handlers wire. **Target phase:** Phase 3 Day 1 (same migration batch as shared sql pool from A7). **Why:** Phase 3 Day 2 is the first handler that hits callClaude for real; a `MockClaudeWrapper` makes the retry-policy, the max_tokens-budget, the protocol-violation, and the per-task-temperature-default tests deterministic + free.

### C4. Telemetry-reader dashboard `/admin/claude-telemetry` (Phase 3 Day 2)

**What:** §2.13.1 "Telemetry as prompt-quality early warning" explicitly parks the `stopReason === "max_tokens"` watch as a reactive signal — but today that signal lives in stderr and is invisible. Once `prompt_call_log` lands Phase 3 Day 1, the first real reader is a per-prompt-version aggregation page. An admin-only surface at `apps/web/src/app/(dashboard)/admin/claude-telemetry/page.tsx` that selects aggregates from `prompt_call_log` and renders a table.

**How:** Server Component, admin-gated by `public.is_admin()`. SELECT `prompt_file, prompt_version, count(*), avg(input_tokens), avg(output_tokens), avg(duration_ms), sum((stop_reason = 'max_tokens')::int) AS hit_budget, sum((error_class is not null)::int) AS errors FROM prompt_call_log WHERE created_at >= now() - interval '7 days' GROUP BY 1,2 ORDER BY count(*) DESC`. One table. Add a drill-down per-prompt-file row showing the last 20 calls with stop_reason breakdowns.

**Scope:** ~120 LOC page + ~30 LOC admin gate utility. **Target phase:** Phase 3 Day 2 (first real handler ships telemetry rows). **Why:** The §2.13.1 calendared resolutions on 01 / 03 / 06a / 08 reasoning_trace + per-prompt max_tokens bumps need observability to fire against. Without this, the "watch for max_tokens" mechanism is noble in theory and unactionable in practice.

### C5. Demo-reset seed manifest as ongoing discipline (not deferred to Phase 6)

**What:** Rebuild Plan §12.8 parks demo-reset rebuild for Phase 6 polish, citing the v1 `ILIKE '%MedVista%'` brittleness. But the manifest shape is foundation-level, not polish-level — every Phase 3+ session that adds a Nexus-owned table should add it to the manifest in the same commit. By Phase 6 the discipline is "wire the UI + exercise the flow," not "figure out which tables exist."

**How:** `packages/db/src/seed-data/demo-reset-manifest.ts` exports a `TABLES_IN_FK_ORDER: readonly { name: string; truncate?: boolean; preserve?: 'seed'|'always' }[]` where every Nexus-owned table appears with a disposition (truncate for event logs, preserve:seed for `team_members`/`knowledge_articles`/`system_intelligence`/`manager_directives`, preserve:always for `users` because auth.users). Commit-level discipline: every schema migration that adds a table adds an entry here. A `pnpm demo:reset` dev script walks the manifest in order, truncating ephemeral tables via service-role; HubSpot-side reset uses structured `demo_seed: true` marker per DECISIONS.md 1.14 (not in place yet — add to `hubspot_cache` payload convention).

**Scope:** ~60 LOC manifest + ~80 LOC script. **Target phase:** ship empty now (38 tables), populate per phase. Phase 3 Day 1 adds prompt_call_log/event_context/sync_state. Phase 3 Day 2 adds transcript_embeddings. Phase 4 Day 2 adds applicability_rejections (if C2 lands). By Phase 6 the manifest is complete + the script has been exercised every phase. **Why:** Phase 6 rebuilding demo-reset against 50+ tables cold is a 1-day task; maintained-per-phase is 2-minute-per-table. Same cost model as the end-of-day verification grep — cheap discipline that compounds.

---

## Closing

**Summary of recommended pre-Phase-3 fixes (7 discrete items):**

1. Add the 39th HubSpot property `nexus_meddpicc_paper_process_score` (Output 3 W1) — 15 min, closes the only actively-wrong foundation finding.
2. Make `observations.signal_type` nullable + amend §2.13.1 with the classified/categorized invariant (A1) — 15 min.
3. Pull `deal_events.event_context` forward to Phase 3 Day 1 migration (A2) — ~10 lines.
4. Lock `prompt_call_log` full column shape (19 cols) in §2.16.1 decision 3 (A3) — 30 min doc.
5. Lock `transcript_embeddings` at `vector(1536)` + voyage-large-2 + HNSW in §2.16.1 decision 1 (A4) — 20-word doc amendment.
6. Add `experiments.vertical` column + index (A6) — one migration.
7. Implement the process-wide shared postgres.js client (A7) — ~1–2 hours, unblocks Phase 3 worker-concurrent workloads.

**Additional pre-Phase-3 hygiene that lands in the same migration batch:** `sync_state` table (A8), webhook echo-fetch skip for `nexus_*` (A9), mapper VERTICAL import (A10), `fitness_velocity` enum (A11), `experiment_attributions.transcriptId` FK (A12), `deal_events (hubspot_deal_id, created_at DESC)` index (A13), pipeline page `Promise.all` (A14), OVERSIGHT-HANDOFF refresh + maintenance rule (A15), confidence_band comment (A16). None are blocking but all fit inside one Phase 3 Day 1 migration + a small apps/web edit session.

**Items explicitly ratified (15 in Output 1):** the core architectural spine (HubSpot SoR + CrmAdapter, event sourcing, single-sourced enums, FK-joined tables, 4-pattern RLS, unified Claude wrapper, jobs infra, service template) plus specific hardening amendments (§2.1.1 auth, §2.18.1 config paths, §2.16.1 corpus preservation) plus §2.22 design tokens, declarative nav, `deal_contact_roles` Nexus-side pattern, and /pipeline/:dealId URL choice — all belong locked.

**One actively-wrong finding (Output 3 W1)** matches Session B's signal-taxonomy-NOT-NULL class: latent today, ready to break on Phase 3 Day 2's first real HubSpot writeback, cheap to close pre-emptively.

**Five creative additions (Output 4):** the enum-audit script + applicability DSL + MockClaudeWrapper + telemetry dashboard + maintained demo-reset manifest are each foundation-level discipline that the Rebuild Plan either implies or defers without specifying shape. Proposing them with concrete scope + target phase so they can be slotted in rather than rediscovered later.

**What this review did NOT surface:** no planning-doc edits to `~/nexus/docs/handoff/` are required beyond the §2.16.1 shape locks already authorized. No v1 rewrite pattern showed the brittleness that would warrant recommending a fresh rewrite pass on 01–25. The prompt architecture is solid; the calendared §2.13.1 resolutions are the right mechanism and the right ordering.
