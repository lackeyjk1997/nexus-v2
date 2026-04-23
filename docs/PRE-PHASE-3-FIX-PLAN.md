# Pre-Phase 3 Fix Plan

**Date:** 2026-04-22
**Author:** Oversight Claude (planning pass, continuation of the foundation review session)
**HEAD at authoring time:** `684ae88` (docs: persist pre-Phase-3 foundation review)
**Source review:** [`./FOUNDATION-REVIEW-2026-04-22.md`](FOUNDATION-REVIEW-2026-04-22.md) — 15 ratifications, 15 adjust-before-solidifies, 1 actively-wrong, 5 creative additions.
**Authority:** CLAUDE.md "Oversight / execution division of responsibility" (commit `a160d69`).

## Purpose

This document sequences the foundation review's 21 actionable items + 15 locks into execution. It is both (a) the plan for the fix work and (b) the handoff bridge to a fresh oversight session. A fresh oversight chat reading this doc + CLAUDE.md + BUILD-LOG.md + DECISIONS.md + PRODUCTIZATION-NOTES.md + FOUNDATION-REVIEW-2026-04-22.md knows what the next kickoff is, what that session's reasoning gate looks like, and what "done" means.

## What this plan is not

- Not feature code. The fix work is foundation hygiene and structural pull-forwards, not new features.
- Not a rebuild-plan supersession. The v1 rebuild plan (`~/nexus/docs/handoff/10-REBUILD-PLAN.md`) remains the phase-level sequencing source; this doc slots a pre-Phase-3 window into that sequence.
- Not a direction shift. The planning pass surfaced no findings that redirect product strategy. All recommendations are tactical.

---

## Preamble — prompt edits

The kickoff prompt for this planning session asked me to produce the plan, execute the three staleness-disposition decisions inline, and resolve the Phase 3 Day 1 prompts-location sub-decision. I did not edit the prompt; the framing held up. What I did do, and wrote in this preamble for audit transparency:

- **Expanded scope slightly** to include a Phase 3 Day 1 pre-kickoff prerequisites section (below §7) because the foundation review surfaces three items that the Phase 3 Day 1 session will want as context even though they don't land in pre-Phase-3 sessions.
- **Reframed one adjust-finding as already-resolved** — A15 (OVERSIGHT-HANDOFF staleness) becomes a disposition decision executed in this session rather than a future fix task. It no longer appears in session scope.
- **Deferred three creative additions** to their review-specified target phases rather than pulling any into pre-Phase-3 sessions, because the pull-forward rationale (C3 Mock wrapper, C4 telemetry dashboard) is stronger the closer it sits to its consumer.

---

## 1 — Strategic frame

Every sequencing decision in this plan is grounded in the four-layer strategic weighting established in orientation:

1. **Demo fidelity today** — the three-act demo (Act 1 transcript + call prep; Act 2 cross-deal intel; Act 3 close-lost interview) must run end-to-end without narration filling gaps. Phase 3 lands Act 1. Pre-Phase-3 cannot introduce anything that destabilizes it.
2. **Corpus-intelligence preservation (§2.16.1)** — five locked preservation decisions (transcript embeddings, event_context snapshot, prompt_call_log telemetry, speaker-turn preservation, extensible tool schemas) are inexpensive today and structurally impossible later. Three of the five (event_context, prompt_call_log, transcript_embeddings) have shape-lock or pull-forward findings in the foundation review. Those findings are pre-Phase-3 work because Phase 3 Day 2 is the first writer.
3. **Productization arc optionality (PRODUCTIZATION-NOTES.md)** — demo → mid-market → enterprise POC → enterprise GA. The foundation review explicitly ratifies HubSpot SoR / CrmAdapter (R1), event sourcing (R2), single-sourced enums (R3), and the `deal_contact_roles` Nexus-side pattern (R12) on the grounds that each parallel-implements cleanly into SalesforceAdapter + multi-tenant rewrites rather than forcing architectural restart. The one URL-structure caveat (R11: `/pipeline/:dealId` uses HubSpot numeric ID) gets a one-paragraph Stage 3 transition note in PRODUCTIZATION-NOTES.md during Session 0-A so the productization cost is visible.
4. **2026+ AE agent substrate** — PRODUCTIZATION-NOTES.md's "Corpus Intelligence — the second product" framing + the agent-layer work in Phase 5 mean the prompt-call-log, the event-sourced intelligence, and the applicability DSL (C2) are not just scaffolding for today's demo — they are the substrate that enterprise AE agents read from later. This is why C2 (applicability DSL) stays on the Phase 4 Day 1 target and does not collapse into demo-only admission rules, and why A3 (prompt_call_log shape lock) carries columns like `task_type`, `attempts`, `error_class`, and `actor_user_id` that no demo surface reads today but every enterprise compliance query will.

**Applied sequencing heuristic:** a finding's pre-Phase-3 urgency is proportional to (imminent Phase 3 consumer) × (retrospective-impossibility cost if deferred) × (demo-narrative breakage if not done). A finding with zero Phase 3 consumer + low retrospective cost defers to its natural phase. A finding with imminent Phase 3 consumer + high retrospective cost lands now regardless of its review label.

---

## 2 — Finding revisit under the planning lens

The review wrote each finding in isolation. The planning lens produces a different framing on five of them. None of the findings flip tier (ratify ↔ adjust ↔ actively-wrong ↔ creative) — the review's tiering held up. What shifts is framing within a tier, or how an item fits the sequence.

**A15 (OVERSIGHT-HANDOFF.md staleness) — reframed from "fix" to "disposition decision executed this session."** The review labeled this as Adjust-item; planning reframes it as a doc-hygiene call that oversight makes directly rather than passing to a fix session. Resolution: replace with `OVERSIGHT-META.md` (done in this session — see §5 below). Removed from the fix-session scope. Retained as a historical-audit entry in the finding-by-finding appendix.

**A5 (MEDDPICC per-dimension writeback) — no change in tier, reframed as pure cross-reference.** The review correctly called A5 a pointer to W1. Planning treats them as one fix in Session 0-C. The A5 entry is retired from session scope; W1 owns the fix.

**A16 (`confidence_band` enum) — no change in tier, planning lens lowers it further.** The review's recommendation is "add a comment naming the candidate consumer; revisit for deletion if Phase 5 Day 1 doesn't bind it." Planning honors that, but downgrades A16 from its Output 2 urgency ordering. It's the lightest-touch item in Session 0-B — one-line comment, fits inside the migration-batch session without its own reasoning-stub entry.

**A4 (`transcript_embeddings` dimensionality) — reframed slightly.** The review recommends `vector(1536)` + voyage-large-2 + HNSW. Planning agrees, but because this is a §2.16.1 decision 1 shape-lock and the table itself doesn't land until Phase 3 Day 2, **the Session 0-A amendment locks the shape; the table's migration lands in Session 0-B as a skeleton (no index yet, pgvector extension installed). Index creation (HNSW with `ef_construction=64, m=16`) lands in Phase 3 Day 2 once the first rows exist, because HNSW index build is cheaper against populated data than empty.** This splits the review's "lock now" into two concrete steps and matches Postgres best practice for HNSW.

**C4 (telemetry dashboard) — reframed target phase.** The review says Phase 3 Day 2 with the argument "first real handler ships telemetry rows then." Planning agrees, but flags it as an optional Phase 3 Day 2 capstone rather than a required deliverable — the `§2.13.1` max_tokens-watch mechanism becomes actionable only once the dashboard exists, but the dashboard over first-day data is low-signal. A reasonable Phase 3 Day 2 oversight call is "defer to Phase 3 Day 3 after one real workday of pipeline runs has populated the log." The review's scope estimate (~120 LOC page + 30 LOC admin gate) is unchanged; only the timing-signal narrows.

**All other findings — no reframe.** The Output 2 urgency ordering, the W1 Output 3 framing, and the C1/C2/C3/C5 target-phase recommendations stand as the review wrote them.

---

## 3 — Session structure

Three sessions, each with its own kickoff, verification, and Reasoning-stub report. The session rhythm matches Phase 2's rhythm (A/B/C/D-style splits). Sessions land in order; each can be green-lit after the prior session's sign-off without requiring the whole plan to be re-adjudicated.

| Session | Name | Scope | Complexity | Blocks | Blocked by |
|---|---|---|---|---|---|
| **0-A** | Shape locks + amendments | DECISIONS.md amendments for A1, A2, A3, A4, MEDDPICC 8-dim canonical; PRODUCTIZATION-NOTES.md Stage 3 URL note (R11 caveat). Doc-only; no code, no migrations. | ~2 hours | Session 0-B | — |
| **0-B** | Foundation migration + shared pool + demo-reset skeleton | Migration 0005 (9 changes); process-wide shared postgres.js client; mapper VERTICAL import; pipeline page `Promise.all`; demo-reset manifest skeleton. | ~6-7 hours | Session 0-C | Session 0-A |
| **0-C** | HubSpot MEDDPICC 8th property + drift audit + webhook dedup | W1 provision to live portal; `pnpm enum:audit` script + CI wiring; webhook echo skip on `nexus_*` property-change. | ~3-4 hours | Phase 3 Day 1 kickoff | Session 0-B |

Rough total ~11-13 hours of Claude Code work across three sessions. Matches Phase 2 Day 4's four-session arc in total effort; the three-session split here mirrors Phase 2 Day 4 Sessions A+B+C (omitting a polish session since polish is already in Phase 6).

### 3.1 — Why three sessions, not one or two

- **One monolithic session** would mix doc amendments, schema migration, code refactors, HubSpot provisioning, script authoring, and live-portal verification into a single reasoning-stub report. Verification surface is ~10 independent axes; a single failure anywhere compromises the commit and forces a revert-and-retry cycle on the entire batch. Session rhythm this project has established argues against.
- **Two sessions** (doc + everything-else) leaves an uncomfortable asymmetry: the doc session is two hours, the code session is ten. More importantly, it couples the HubSpot live-portal provisioning (W1) with internal-only schema work, which means a HubSpot provisioning hiccup mid-session blocks sign-off on the migration that has nothing to do with HubSpot. The external-facing work deserves its own session with its own rollback story.
- **Three sessions** put doc amendments first (strictly precede code that implements them), keep internal-only schema + infra work in its own session (own rollback story if the migration goes sideways), and isolate HubSpot-portal-facing work in a third session (own rollback story for live-portal writes). Each session is small enough to verify end-to-end without sub-splitting.

### 3.2 — Reasoning-gate reminders (wire into every kickoff)

The four justification types from CLAUDE.md's Oversight/execution section apply to all three sessions:

1. **DECISIONS.md guardrail requires it** — the change makes a guardrail enforceable that prior code wasn't enforcing, or closes a drift vector that guardrails 22 / 24 / 34 / 35 / 39 already imply.
2. **§2.16.1 preservation decision** — the change pulls forward or shape-locks one of the five corpus-intelligence preservation items so it is cheaper-now than later.
3. **PRODUCTIZATION-NOTES.md arc** — the change preserves an option (SalesforceAdapter parallel-implement, multi-tenant RLS rewrite, historical-ingestion shape, corpus-intelligence second product) without inflating current scope.
4. **Imminent next-session need** — the next concrete Phase 3+ session will trip over this item if it's not present.

Each session's kickoff should explicitly tell Claude Code **which of the four types are most relevant** for that session's findings, so the reasoning-stub entries land in the right shape. Mapping per session is in each session brief below.

### 3.3 — Verification discipline (inherited from Phase 2)

Applies to every fix session, unchanged from Phase 2 Day 3-4 practice:

- `pnpm typecheck` — 4/4 workspaces green.
- `pnpm build` — clean compile + zero hits on `Attempted import error | Module not found | Type error | Failed to compile` in the output (per BUILD-LOG Pre-landing parked item).
- `pnpm --filter @nexus/db generate` — "No schema changes, nothing to migrate" if no schema change was intended; or a clean diff if schema changed.
- Inline hex grep in `apps/web/src/*.{ts,tsx}` — 0 hits.
- Stale shadcn placeholder-class grep — 0 hits.
- All `test-rls-*.ts` scripts relevant to changed tables — PASS.
- Browser verification via `/api/dev-login` for any UI path that changed — zero console errors, h1 correct, golden-path flow exercised end-to-end.
- For Session 0-B specifically: pool-saturation smoke test — the process-wide shared client's peak connections stays under a small-integer threshold across concurrent requests.
- For Session 0-C specifically: `pnpm enum:audit` returns clean (exit 0) + MEDDPICC 8-value count confirmed across schema, TS enum, properties.ts, and the live HubSpot portal via an ad-hoc adapter script.

---

## 4 — Session briefs

Each brief is structured for a fresh oversight session to draft the kickoff prompt from it directly. The four-part foundation-review structure (what it is, what it addresses, dependencies / complexity, done criteria) is embedded inline rather than repeated.

### 4.1 — Session 0-A — Shape locks + strategic amendments

**Character:** Doc-only. No code, no migrations, no HubSpot writes. Purely locks the shape of the changes Sessions 0-B and 0-C will implement, and records the R11 productization caveat while planning is fresh.

**Findings addressed:**

- **A1** — amend §2.13.1 with the "`observations.signal_type` is nullable iff captured outside the classifier path; `source_context.category` identifies the alternate path; coordinator queries filter `signal_type IS NOT NULL`" invariant. (Session 0-B implements the `ALTER COLUMN DROP NOT NULL` migration and the ObservationService signature update; Session 0-A locks the doc invariant first so the migration justifies itself.)
- **A2** — amend §2.16.1 decision 2 to say "column lands Phase 3 Day 1 nullable; flips to NOT NULL Phase 4 Day 1 once all writers populate it." Pull-forward explicitly authorized at the amendment level.
- **A3** — amend §2.16.1 decision 3 with the full 19-column `prompt_call_log` shape: `id uuid pk, prompt_file text, prompt_version text, tool_name text, model text, task_type text, temperature decimal(3,2), max_tokens int, input_tokens int, output_tokens int, duration_ms int, attempts int default 1, stop_reason text, error_class text, hubspot_deal_id text, observation_id uuid, transcript_id uuid, job_id uuid, actor_user_id uuid, created_at timestamptz default now()`, plus indexes `(hubspot_deal_id, created_at DESC)`, `(job_id)`, `(prompt_file, prompt_version, created_at DESC)`, plus RLS Pattern D.
- **A4** — amend §2.16.1 decision 1 to lock `vector(1536)` + voyage-large-2 as default + `embedding_model text NOT NULL` column for forward compat. **Planning-lens split:** the table lands Session 0-B as a skeleton (columns + pgvector extension); the HNSW index (`USING hnsw (embedding vector_cosine_ops)` with `ef_construction=64, m=16`) lands Phase 3 Day 2 once first rows exist. The amendment captures this two-step sequence explicitly.
- **W1 preamble** — amend §2.13.1 with a new bullet: "MEDDPICC canonical dimensionality is 8 values per `MEDDPICC_DIMENSION` (metrics, economic_buyer, decision_criteria, decision_process, identify_pain, champion, competition, paper_process). The HubSpot property set tracks this exactly; any drift between schema, TS enum, prompt rewrites, and HubSpot properties is the three-way drift pattern §2.13.1 locks against." Session 0-C performs the actual HubSpot provisioning; Session 0-A records the canonical.
- **R11** — add a one-paragraph note to PRODUCTIZATION-NOTES.md under Stage 3 (First enterprise POC / SalesforceAdapter) naming "`/pipeline/:dealId` URL transition task" as part of the SalesforceAdapter work: "v2 uses HubSpot numeric IDs directly in deal detail URLs. When SalesforceAdapter lands in Stage 3, either (a) add a thin `deal_identity` table mapping Nexus UUIDs ↔ CRM IDs and route via Nexus UUID, or (b) keep the CRM ID in URLs and branch per adapter. Either path is a known cost budgeted into the SalesforceAdapter scope; do not slip it into v2 demo scope." Preserves R11's "do not fix now" stance while making the deferred cost visible.

**Grouping rationale:** All are doc-only amendments. Shape locks must precede the migrations that implement them; the R11 caveat fits the same doc-authoring window. Bundling avoids fragmentation across three separate doc-only commits.

**Sequence position:** First. Blocks Session 0-B (migration cannot cite shapes that haven't been locked) and Session 0-C (W1 rationale cites the §2.13.1 MEDDPICC canonical amendment).

**Complexity / scope:** ~2 hours. Five §2.16.1/§2.13.1 amendments + one PRODUCTIZATION-NOTES.md paragraph. No code surface.

**Dependencies:** None — this is the entry point. HEAD at session start is the HEAD after this planning session commits (expected `~6f9a` or similar — the actual hash known at kickoff).

**Reasoning-gate types expected:**

- Type 1 (guardrail requires it) — each amendment is an interpretation of an existing guardrail that closes a drift vector Guardrail 22 / 24 / 32 already imply. Expected: 2-3 entries.
- Type 2 (§2.16.1 preservation) — A2, A3, A4 are the preservation amendments. Expected: 3 entries.
- Type 3 (productization arc) — R11 Stage 3 note. Expected: 1 entry.
- Type 4 (next-session need) — W1 preamble is the one setup-for-Session-0-C entry. Expected: 1 entry.

**Verification:**

- Doc read-through: each amendment cites the prior decision it extends (e.g., A2 cites §2.16.1 decision 2 verbatim before amending).
- Cross-reference check: Session 0-B and 0-C kickoff prompts (drafted immediately after Session 0-A sign-off) can cite the amendments by section number without ambiguity.
- No git churn outside `docs/DECISIONS.md` and `docs/PRODUCTIZATION-NOTES.md`.

**Done criteria:**

- DECISIONS.md carries the five new/updated bullets in §2.13.1 and §2.16.1, each LOCKED-tagged with Phase reference.
- PRODUCTIZATION-NOTES.md has the Stage 3 URL note appended to the "Integration surface" or "Key productization gaps" section.
- Commit pushed; BUILD-LOG.md updated with a `## Pre-Phase 3 Session 0-A — [date]` entry under day-by-day history (shape: same as Phase 2 Day 4 Session A/B entries).
- Fresh oversight session reading DECISIONS.md after this commit can draft Session 0-B's kickoff without re-adjudicating any shape.

### 4.2 — Session 0-B — Foundation migration + shared pool + demo-reset skeleton

**Character:** Internal-only code + schema. Zero HubSpot-portal writes, zero new prompts. The bulk of the fix work.

**Findings addressed:**

- **A1 code** — `ALTER TABLE observations ALTER COLUMN signal_type DROP NOT NULL` in migration 0005. Update `ObservationService.record` signature to accept optional `signalType?: SignalTaxonomy`. Regenerate `test-rls-observations.ts` to include a null-row insert case.
- **A2** — `ALTER TABLE deal_events ADD COLUMN event_context jsonb` (nullable) in migration 0005. Add `DealIntelligence.buildEventContext(dealId, activeExperimentIds)` helper as a stub in a new `packages/shared/src/services/deal-intelligence.ts` file — the first DealIntelligence-service skeleton, documented as "Phase 3+ expands this; today's surface is just the event-context builder so event writes populate it from day 1."
- **A3** — `CREATE TABLE prompt_call_log (...)` per the shape-lock amendment, with the three indexes and RLS Pattern D policies. Do NOT wire the Claude wrapper to write to it yet — that's Phase 3 Day 1 work. This session just lands the table so Phase 3 Day 1 can start writing on day one without a migration step.
- **A4 code** — `CREATE EXTENSION IF NOT EXISTS vector;` + `CREATE TABLE transcript_embeddings (id uuid pk, transcript_id uuid references transcripts(id) on delete cascade, scope text check (scope in ('transcript','speaker_turn')) not null, speaker_turn_index int, embedding vector(1536), embedding_model text, embedded_at timestamptz default now())`. **No index.** HNSW index creation is Phase 3 Day 2 per the planning-lens split.
- **A6** — `ALTER TABLE experiments ADD COLUMN vertical vertical NULL;` + `CREATE INDEX experiments_vertical_lifecycle_idx ON experiments (vertical, lifecycle);` in migration 0005.
- **A7** — new file `packages/shared/src/db/pool.ts` exporting a module-level `sharedSql = postgres(env.DATABASE_URL, { max: 10, idle_timeout: 60, prepare: false })` and a `getSharedSql()` accessor. Update the four factories in `apps/web/src/lib/` (`createHubSpotAdapter`, `createMeddpiccService`, `createStakeholderService`, `createObservationService`) to pass `sql: getSharedSql()` so every service/adapter skips pool creation. Trim per-service `max` values from Session B's 1/1/1/2 to 0 (services borrow the shared pool; they don't own their own).
- **A8** — `CREATE TABLE sync_state (object_type hubspot_object_type primary key, last_sync_at timestamptz not null default '1970-01-01')` in migration 0005. Do NOT wire the pg_cron periodic-sync endpoint yet — that's Phase 4 Day 2 per the rebuild plan. This session lands the table + marks the endpoint parked.
- **A10** — in `packages/shared/src/crm/hubspot/mappers.ts:54-67`, replace the local `VERTICALS: Vertical[]` constant with `import { isVertical } from "../../enums/vertical"; return isVertical(normalized) ? normalized : null;`. Two-line fix closing the Guardrail-22 drift.
- **A11** — `CREATE TYPE fitness_velocity AS ENUM ('accelerating','stable','decelerating','stalled'); ALTER TABLE deal_fitness_scores ALTER COLUMN velocity_trend TYPE fitness_velocity USING velocity_trend::fitness_velocity` in migration 0005. Update schema.ts. Zero rows today, so cast is safe. `ai_category` on `customer_messages` stays text for now — defer to Phase 5 Day 3-4 when the final customer-messages taxonomy is decidable (per review A11 "(c)").
- **A12** — `ALTER TABLE experiment_attributions ADD CONSTRAINT experiment_attributions_transcript_fk FOREIGN KEY (transcript_id) REFERENCES transcripts(id) ON DELETE SET NULL` in migration 0005. Update schema.ts with `.references()`.
- **A13** — `CREATE INDEX deal_events_deal_created_idx ON deal_events (hubspot_deal_id, created_at DESC)` in migration 0005. Update schema.ts index definitions.
- **A14** — in `apps/web/src/app/(dashboard)/pipeline/page.tsx:47-54`, swap the serial `for (const id of companyIds)` to `await Promise.all(companyIds.map(id => adapter.getCompany(id)))`. Four-line change.
- **A16** — one-line comment above `confidenceBandEnum = pgEnum("confidence_band", ["low","medium","high"])` in schema.ts: `// candidate consumer: Phase 4 Day 2 surface-admission scoring bands per §1.16. Delete if Phase 5 Day 1 ships without binding.`
- **C5 skeleton** — create `packages/db/src/seed-data/demo-reset-manifest.ts` exporting `TABLES_IN_FK_ORDER: readonly { name: string; truncate?: boolean; preserve?: 'seed'|'always' }[]` with all 38+ Nexus-owned tables enumerated + disposition. Stub a `packages/db/src/scripts/demo-reset.ts` that walks the manifest but does NOT execute yet (marks each table it would touch, prints the plan). Future phases add one entry per new table in the same migration commit.

**Grouping rationale:**

- One migration file (0005) lands all schema changes atomically. The alternative — one migration per change — is 9 separate files for a coherent pre-Phase-3 hygiene batch, which clutters the migration directory and fragments rollback semantics.
- The shared pool + factory migration + mapper fix + pipeline page Promise.all all touch the `apps/web/src/lib` or `packages/shared/src/crm` code surface. Bundling keeps the single-commit story coherent.
- The demo-reset skeleton is additive (new file, no existing caller) and fits the schema-foundation session character — it's the structural artifact that grows per phase, same discipline as the end-of-day verification greps.
- A9 (webhook echo dedup) and W1 (HubSpot provisioning) are explicitly **not** in this session because they touch the adapter's HubSpot-facing surface and want their own verification story.

**Sequence position:** Second. Blocks Session 0-C (enum:audit script needs the 8-dim MEDDPICC canonical acknowledgment that Session 0-A locked + the W1 provisioning Session 0-C performs, but does NOT need any of 0-B's schema changes to run its audit). Blocked by Session 0-A (migration's DECISIONS.md citations must refer to locked amendments).

**Complexity / scope:** ~6-7 hours. Nine schema changes in one migration (mostly ALTER statements + two CREATE TABLE + one CREATE EXTENSION + one CREATE TYPE + indexes). Shared-pool rewrite touches four factory files and removes four `postgres()` pool instantiations. Code hygiene fixes total ~20 LOC across three files. Demo-reset manifest is ~100 LOC.

**Dependencies:** Session 0-A amendments must be present so migration 0005's inline comments cite locked shapes, not pending ones. The pgvector extension install requires Supabase dashboard action or the migration's `CREATE EXTENSION` is permitted (Supabase permits this on hosted tier — verified via Phase 1 Day 3 precedent where `pg_cron`/`pg_net` were installed via migration 0003).

**Reasoning-gate types expected:**

- Type 1 (guardrail requires it) — A10 (Guardrail 22), A11 (Guardrail 2 + §2.2), A12 (§2.2), A13 (§2.9 read-path performance is a §2.2 hygiene completion item). Expected: 4-5 entries.
- Type 2 (§2.16.1 preservation) — A2 (event_context pull-forward), A3 (prompt_call_log pull-forward), A4 (transcript_embeddings table skeleton). Expected: 3 entries.
- Type 3 (productization arc) — C5 demo-reset manifest is mostly a discipline-compounding argument that pays off at productization when 50+ tables exist. Expected: 1 entry.
- Type 4 (next-session need) — A7 (shared pool unblocks Phase 3 Day 2 worker concurrency), A8 (sync_state unblocks Phase 4 Day 2 periodic sync but reconciles webhook reliability for Phase 3+ demo). Expected: 2 entries.
- Likely total reasoning-stub entries: 10-11. Same shape as Session B's 7-entry stub.

**Verification:**

- All six Phase-2-standard greps pass (see §3.3).
- Migration 0005 applies cleanly against production Supabase via `pnpm --filter @nexus/db migrate` (or the hand-apply pattern if drizzle-kit emits destructive SQL — Day-2 migration 0004 precedent).
- `pnpm --filter @nexus/db exec tsx src/scripts/test-rls-observations.ts` PASSES with the new nullable signal_type case added.
- `pnpm --filter @nexus/db exec tsx src/scripts/test-rls-meddpicc.ts` PASSES unchanged.
- `pnpm --filter @nexus/db exec tsx src/scripts/test-rls-deal-contact-roles.ts` PASSES unchanged.
- Pool saturation smoke test: a new `packages/db/src/scripts/test-shared-pool.ts` script opens 20 concurrent request-scoped factory calls via `createHubSpotAdapter + createMeddpiccService + createStakeholderService + createObservationService` per request, measures peak pooler connections, asserts < 15 (down from 100+ before the fix). Keep as permanent artifact per the `test-rls-*.ts` precedent.
- Browser verification via `/api/dev-login` as Sarah: `/pipeline` renders, `/pipeline/[dealId]` renders, stakeholder management works, MEDDPICC save works, stage change via all three surfaces works. Golden path unchanged.
- `pnpm build` clean.

**Done criteria:**

- Migration 0005 applied to live Supabase.
- 9 new/modified schema objects visible in pg_dump.
- Shared postgres.js pool is the only `postgres()` call in `apps/web/src/lib` + `packages/shared/src/services/*` + `packages/shared/src/crm/hubspot/adapter.ts` (excluding tests).
- Demo-reset manifest enumerates all current Nexus-owned tables.
- BUILD-LOG `## Pre-Phase 3 Session 0-B — [date]` entry shipped alongside the commit.
- `pnpm enum:audit` (if already present; otherwise Session 0-C lands it) passes; alternative: ad-hoc enum coverage check by eye against schema.ts + enums/ + properties.ts.

### 4.3 — Session 0-C — HubSpot MEDDPICC 8th property + drift audit + webhook dedup

**Character:** Outward-facing. Live HubSpot portal writes. Drift-audit automation. Adapter behavior change on live webhook. The session where external blast-radius is highest, isolated for dedicated verification.

**Findings addressed:**

- **W1** — add `nexus_meddpicc_paper_process_score` to `packages/shared/src/crm/hubspot/properties.ts` (one entry, matches the shape of the other 6 score properties); add `"nexus_meddpicc_paper_process_score"` to `DEAL_PROPS_TO_FETCH` in `packages/shared/src/crm/hubspot/adapter.ts:82-123`; run `pnpm --filter @nexus/db provision:hubspot-properties` against the live portal (idempotent via GET-first per Day 5 Finding A); update 07C §3.1 table to list 8 scores; update "average across 7" description to "average across 8 non-null dimensions."
- **C1** — create `packages/db/src/scripts/audit-enums.ts` (invoked via `pnpm --filter @nexus/db enum:audit` + a top-level `pnpm enum:audit` alias in the root `package.json`). Per the review C1 spec: registry of `{ SIGNAL_TAXONOMY, CONTACT_ROLE, DEAL_STAGES, MEDDPICC_DIMENSION, ODEAL_CATEGORY, VERTICAL }`; for each enum, gathers schema-side tuple, prompt-side grep matches, HubSpot-side properties.ts mapping; exits 1 on any cross-site mismatch. Wire as a pre-merge GitHub Actions step (defer actual CI wiring unless bandwidth; at minimum document the `.github/workflows/enum-audit.yml` shape in BUILD-LOG parked items).
- **A9** — in `packages/shared/src/crm/hubspot/adapter.ts:925-961` (`handleWebhookEvent`), add a `nexus_*` property-change skip: `if (event.eventType === 'deal.propertyChange' && event.propertyName?.startsWith('nexus_')) { /* update cache in-place from event.newValue; no fetch */ return; }`. Matches 07C §5.1's documented intent.

**Grouping rationale:**

- W1 + C1 are the MEDDPICC-drift close + the structural protection against its recurrence. One session owns "this class of bug cannot recur without loud CI failure."
- A9 is technically internal-only code, but its behavior change is on the live webhook path; its verification story benefits from running alongside the HubSpot-facing provisioning (both exercise the live portal). Bundling them means one set of live-portal smoke tests.
- W1 + A9 + C1 together resolve all live-portal-facing hygiene items in one session. Future HubSpot-facing work (SalesforceAdapter in Stage 3) inherits the audit + dedup patterns.

**Sequence position:** Third. Blocks Phase 3 Day 1 kickoff (HubSpot writeback of MEDDPICC scores happens Phase 3 Day 2; W1 must land before). Blocked by Session 0-A (W1 rationale cites §2.13.1 MEDDPICC canonical amendment) and Session 0-B (shared pool landed, so the provisioning script's adapter-factory call benefits from the shared pool mid-session if verification reruns the provision idempotently).

**Complexity / scope:** ~3-4 hours. One new property definition + one provision-script run + one adapter method edit + one new audit script (~150 LOC) + CI step documentation. Live-portal verification + cache-state verification (MedVista deal has 8 MEDDPICC properties after the provision) + webhook round-trip test (`nexus_*` change no longer triggers echo fetch).

**Dependencies:**

- Session 0-A (§2.13.1 MEDDPICC canonical amendment must be locked so W1's rationale cites it).
- Session 0-B (shared pool landed; provisioning script uses the shared pool after the Session 0-B factory migration).
- Jeff available for HubSpot provision + live-portal verification. If Jeff is unavailable at kickoff time, Session 0-C can draft everything up to the `pnpm provision:hubspot-properties` invocation, then pause for Jeff's green-light; the provision is the only Jeff-facing step.

**Reasoning-gate types expected:**

- Type 1 (guardrail requires it) — W1 is the three-way drift pattern §2.13.1 locks against; C1 automates the check; A9 closes a documented 07C §5.1 intent. Expected: 3 entries, one per finding.
- Type 2 (§2.16.1 preservation) — minimal. The audit script's forward-looking protection against future drift helps preserve the three-way-clean state that §2.13.1's canonical-enum discipline relies on; defensible as Type 2 but primarily Type 1.
- Type 3 (productization arc) — C1 audit pattern extends naturally to SalesforceAdapter in Stage 3 (adds a 4th cross-site vector). W1 provisioning on Starter demonstrates the pattern for multi-tenant provisioning in Stage 4. Expected: 1 entry.
- Type 4 (next-session need) — W1 unblocks Phase 3 Day 2's first transcript pipeline run writing all 8 MEDDPICC properties to HubSpot; A9 keeps the Phase 3 Day 2 pipeline from self-triggering the 429 retry path via webhook echo. Expected: 2 entries.
- Likely total reasoning-stub entries: 5-6.

**Verification:**

- `pnpm --filter @nexus/db provision:hubspot-properties` against the live portal logs "created nexus_meddpicc_paper_process_score" (first run) or "already exists" (re-runs) — idempotent via Day 5 Finding A GET-first pattern.
- Ad-hoc adapter script: `adapter.getDeal('321972856545')` returns 8 MEDDPICC score fields (or null for unseeded dimensions, which is fine).
- Live HubSpot UI: navigate to MedVista Epic deal, scroll to `nexus_intelligence` property group, visually confirm 8 `nexus_meddpicc_*_score` properties exist.
- `pnpm enum:audit` returns exit code 0. Per-enum table shows all 6 enums clean. Feed an intentional drift (e.g., temporarily remove `paper_process` from properties.ts without updating the schema) and confirm exit code 1 + clear per-enum diagnostics; revert the drift before commit.
- Webhook dedup: update a `nexus_*` property on MedVista via a test `updateDealCustomProperties({ nexus_meddpicc_paper_process_score: 7 })` adapter call; monitor Vercel logs; confirm `handleWebhookEvent` takes the cache-in-place branch, no echo fetch. Contrast: update a non-`nexus_*` property (e.g., `dealname`) and confirm `handleWebhookEvent` still fetches as before.
- All six Phase-2-standard greps pass (see §3.3).
- `pnpm typecheck` + `pnpm build` clean.

**Done criteria:**

- Live HubSpot portal `245978261` has 39 `nexus_*` custom properties (was 38).
- MedVista Epic deal carries 8 MEDDPICC score fields in the adapter response (null-ok for unseeded).
- `pnpm enum:audit` is a runnable script; clean exit against current state.
- `handleWebhookEvent` echo-dedup verified end-to-end with a live portal PATCH round trip.
- BUILD-LOG `## Pre-Phase 3 Session 0-C — [date]` entry shipped alongside the commit.
- Phase 3 Day 1 kickoff prompt can cite "all foundation fixes resolved" without further prerequisites.

---

## 5 — Disposition decisions executed this session

Three staleness-disposition decisions flagged in orientation. Each executed inline per the planning-session authority granted in the kickoff prompt.

### 5.1 — OVERSIGHT-HANDOFF.md — replaced with OVERSIGHT-META.md

**Decision:** retire OVERSIGHT-HANDOFF.md + create `docs/OVERSIGHT-META.md` carrying the stable content (rhythm, Jeff's working style, handoff prompt template, meta-lessons, required reading order).

**Rationale:**

- The `## Current build state` section duplicated BUILD-LOG.md's `## Current state` block and was the specific source of staleness surfaced in foundation review A15 — the previous version claimed HEAD `2b41c4c` and open hotfixes six commits before the file was written. Duplication is its own drift source.
- The `## How oversight has been operating`, `## Meta-lessons surfaced`, and `## Handoff prompt` sections are genuinely stable — they describe the process, not the state. They deserve a home.
- Renaming to `OVERSIGHT-META.md` signals intent: this file is about how oversight operates, not what the build state is. Fresh oversight sessions read META first (for process), then BUILD-LOG (for state).
- A new maintenance-rule bullet in OVERSIGHT-META.md locks the division: update META only when the process changes (rhythm, meta-lessons, reading order), never when build state changes. BUILD-LOG owns state.

**Alternative considered — refresh-in-place:** would have kept OVERSIGHT-HANDOFF.md and just updated the stale sections. Rejected because the name itself implied the file carries current-state content; repeat-refreshes would repeat-drift. Renaming + removing the duplicate sections is cleaner.

**Alternative considered — retire entirely:** would have folded all META content into BUILD-LOG's "Context for next session" block. Rejected because the rhythm/Jeff's-style/handoff-prompt content is genuinely not BUILD-LOG shape — it's meta about how sessions operate, not what has been done. Keeping a separate file preserves the clean oversight-side entry point.

**Executed:** `docs/OVERSIGHT-HANDOFF.md` deleted; `docs/OVERSIGHT-META.md` written with the stable content + maintenance rule + updated required-reading order (6 items now including FOUNDATION-REVIEW and this plan) + updated meta-lessons (added Phase 2 Day 4 Session A EMAXCONN pattern, Session B @dnd-kit mount pattern, shared action module pattern).

### 5.2 — CLAUDE.md "Build status" section — retired

**Decision:** delete the `## Build status` section entirely from CLAUDE.md.

**Rationale:**

- The section was stuck at "Phase 1 Day 1 complete." Actual state: Phase 2 Day 4 Session B complete plus the planning session producing this plan. Three+ phases of drift.
- CLAUDE.md's job is bootstrap rules + repo layout + hard rules — it's timeless infrastructure. BUILD-LOG's job is state. Duplicating state in CLAUDE.md is the same anti-pattern the OVERSIGHT-HANDOFF.md refactor fixes.
- BUILD-LOG.md already has `## Current state (as of [date])` at the top of the file, updated at end-of-session per the BUILD-LOG maintenance discipline. Fresh Claude Code sessions read CLAUDE.md → DECISIONS.md → BUILD-LOG.md per CLAUDE.md's own ordering; "Build status" in CLAUDE.md only offers a chance for Claude Code to skim a stale one-liner and form a wrong mental model.

**Alternative considered — keep + refresh:** rejected. Same anti-pattern as OVERSIGHT-HANDOFF.md.

**Executed:** section removed in this session's CLAUDE.md edit. Now CLAUDE.md ends with "How to run" → "Oversight / execution division of responsibility" with no interstitial build-status claim.

### 5.3 — CLAUDE.md "Read before acting" — added FOUNDATION-REVIEW + PRE-PHASE-3-FIX-PLAN reference

**Decision:** add a single list item in CLAUDE.md's "Read before acting" section pointing at FOUNDATION-REVIEW-2026-04-22.md and PRE-PHASE-3-FIX-PLAN.md, with an inline note on when the references stop being load-bearing.

**Rationale:**

- Phase 2 Day 4 Session B closed with a foundation review that produced 21 actionable items. Claude Code sessions starting work before the fix items close will need to read the review (to know the find itself) and this plan (to know the sequence).
- Once all three fix sessions ship (Session 0-A + 0-B + 0-C), the review + plan become historical. The added reference explicitly names this lifecycle: "Valid until the pre-Phase-3 fix work ships; superseded by its outcomes after."
- Keeping the reference for the duration of the fix work prevents a Claude Code session from, e.g., starting a Phase 3 Day 1 task that conflicts with an unlanded Session 0-B migration.

**Executed:** CLAUDE.md now has:

> - **[`./docs/FOUNDATION-REVIEW-2026-04-22.md`](docs/FOUNDATION-REVIEW-2026-04-22.md)** — pre-Phase-3 foundation pass (15 ratifications, 15 adjust-findings, 1 actively-wrong, 5 creative additions). Valid until the pre-Phase-3 fix work ships; superseded by its outcomes after. Paired with [`./docs/PRE-PHASE-3-FIX-PLAN.md`](docs/PRE-PHASE-3-FIX-PLAN.md) which sequences the fix work.

Added as the third bullet in "Read before acting," between BUILD-LOG.md and the "This file" entry.

---

## 6 — Phase 3 Day 1 sub-decision — v2-ready prompt file location

**Context:** The kickoff prompt flagged this sub-decision for resolution. `~/nexus/docs/handoff/source/prompts/*.md` contains the 8 v2-ready rewrite prompts (02 through 08 + PORT-MANIFEST). Phase 1 Day 4 copied `01-detect-signals.md` into `packages/prompts/files/` as the canonical; §2.13.1 locked it there. The other 7 rewrites still live only in the handoff path.

**The question:** is the handoff path the canonical intent for the remaining 7, or should Phase 3 Day 1 move them into `packages/prompts/files/` at kickoff?

**Resolution:** Move at Phase 3 Day 1 kickoff, as the first executed step of that session. Rationale:

1. **Precedent.** Phase 1 Day 4 established the pattern. `packages/prompts/files/01-detect-signals.md` is authoritative for `01`; re-sync back to 04C is explicitly forbidden by §2.13.1. Continuing the handoff-is-canonical stance for 02-08 would be a pattern break.
2. **Drift surface reduction.** Handoff edits require explicit Jeff approval per §2.13.1 / Phase 2 Day 2 precedent. Every future prompt tweak (front-matter version bump, tool_name add, max_tokens adjustment, reasoning_trace reposition — and the §2.13.1 calendared resolutions on 01/03/06a/08 are exactly these) would require a handoff edit + a packages/prompts/files edit, which is two touchpoints and a new drift vector. Moving at Phase 3 Day 1 kickoff reduces this to one touchpoint.
3. **Handoff files stay archival.** CLAUDE.md's "`~/nexus` is read-only reference" holds. The handoff copies remain as historical baseline; the v2-era canonical is the moved copy in `packages/prompts/files/`. This matches the `~/nexus/docs/handoff/DECISIONS.md` vs `./docs/DECISIONS.md` split already established: handoff is baseline, `./docs` is authoritative.
4. **Wiring is easier at move time.** Each of the 7 prompts needs a `tool_name` addition in the front-matter (e.g., `08-call-prep-orchestrator.md` needs `tool_name: orchestrate_call_prep_brief`), and some may need a `max_tokens` bump (the `04-coordinator-synthesis.md` 2500 + `07-give-back.md` 600 watch items from BUILD-LOG Phase 1 Day 4). Doing the wiring adjustments in-place at move time, rather than as a later packages/prompts/files edit, keeps the reasoning stub unified.

**Phase 3 Day 1 kickoff prompt note:** First executed step is the 7-file move + front-matter wiring pass + version stamp. Files touched: `packages/prompts/files/02-observation-classification.md` through `08-call-prep-orchestrator.md`. Source: `~/nexus/docs/handoff/source/prompts/02-08.md` copied verbatim with `tool_name` and any `max_tokens` adjustments applied. Handoff copies remain unchanged (read-only archival). DECISIONS.md §2.13.1 gains a one-line confirmation that the 7 files are now canonically located under `packages/prompts/files/`.

This resolves the sub-decision in the plan; Phase 3 Day 1's first 15 minutes execute the move. Oversight can green-light Phase 3 Day 1 without re-adjudicating the prompts-location question.

---

## 7 — Deferred items and their target phases

Items the review flagged or I surfaced that do NOT land in pre-Phase-3 sessions. Each listed here so nothing slips.

### 7.1 — Lands Phase 3 Day 1 proper (not pre-Phase-3)

- **7-file prompt move** per §6. First executed step of Phase 3 Day 1.
- **C3 — MockClaudeWrapper** — review target Phase 3 Day 1. Land alongside the `callClaude` wrapper wiring into `prompt_call_log` (which Session 0-B leaves the table for but does not wire). Wiring + mock both want to be testable together.
- **Claude wrapper → `prompt_call_log` write** — §2.16.1 decision 3 requires the wrapper to persist its stderr telemetry. Session 0-B lands the table; Phase 3 Day 1 wires the wrapper to write to it. One migration (0005) that Session 0-B ships already includes the table; Phase 3 Day 1 is pure TS code in `packages/shared/src/claude/client.ts`.
- **Shared `loadDevEnv()` env helper** — §2.13.1 parked for Phase 3 Day 1. Consolidates the dotenv `override: true` pattern into `packages/shared/src/env.ts`. Today's `packages/db/src/scripts/hubspot-env.ts` moves or is retired.
- **Post-deploy Playwright smoke + DnD verification** — pre-Phase-3-Day-1 parked items from BUILD-LOG. These are the "post-deploy" half-day-slot items. Independent of the fix sessions; could slot before, during, or immediately after the fix work depending on Jeff's call.

### 7.2 — Lands Phase 3 Day 2 (transcript pipeline)

- **`transcript_embeddings` HNSW index creation** (the planning-lens split from A4). Index after first rows exist. One-line migration or an SQL statement via provisioning script.
- **§2.13.1 calendared resolution: `01-detect-signals` reasoning_trace addition** — before wiring #01 into the transcript pipeline step 3. Bumps `packages/prompts/files/01-detect-signals.md` front-matter to `1.2.0`.
- **C4 — Telemetry dashboard** — review target Phase 3 Day 2. Optional capstone per §2 reframe; could defer to Phase 3 Day 3 if first-day data is low-signal.
- **`04-coordinator-synthesis` max_tokens watch** — 2500 may be tight; bump reactively on first `stopReason=max_tokens` signal. Not pre-wired.
- **Webhook retry policy + worker concurrency** — parked BUILD-LOG Phase 3 items. Not pre-Phase-3.

### 7.3 — Lands Phase 4 Day 1 (intelligence surfaces)

- **`deal_events.event_context NOT NULL` flip** — the Phase 3 pull-forward lands nullable; flip happens Phase 4 Day 1 once all event writers populate it.
- **C2 — Applicability DSL + shared evaluator service** — review target Phase 4 Day 1 per applicability-gate landing. Not a pre-Phase-3 pull-forward candidate because its consumer (admission engine) is Phase 4.

### 7.4 — Lands Phase 4 Day 2 (coordinator + intelligence)

- **`sync_state` pg_cron wiring** — table lands Session 0-B; the 15-min sync endpoint + cron job definition land Phase 4 Day 2 per the rebuild plan.

### 7.5 — Lands Phase 5 Day 1 (agent layer kickoff)

- **§2.13.1 calendared resolutions**: `03-agent-config-proposal` reasoning_trace move; `06a-close-analysis-continuous` review; `08-call-prep-orchestrator` review.
- **`ai_category` enum** (A11 second half) — Phase 5 Day 3-4 when the customer-messages writer lands.

### 7.6 — Discipline compounding (no landing phase — per-phase maintenance)

- **C5 — Demo-reset manifest** — Session 0-B ships the skeleton. Every phase adds one entry per new Nexus-owned table in the same commit as the schema migration. Phase 6 polish exercises the complete manifest end-to-end.
- **`pnpm enum:audit`** — Session 0-C ships. Future phases run it as a CI step; updates the registry whenever a new enum lands.

---

## 8 — Pre-Phase 3 fix work — kickoff-ready summary

Shape this section for a fresh oversight session to pick up and draft the first kickoff prompt.

**Current state (pre-kickoff):** HEAD is `684ae88` (foundation review persisted) plus the commit produced by this planning session. All three pre-Phase-3 fix sessions are unblocked (Session 0-A has no dependencies; 0-B waits on 0-A's amendments; 0-C waits on 0-A + 0-B). No HubSpot-portal writes or schema changes have happened yet.

**Recommended kickoff order:** 0-A (doc-only, ~2 hours) → review + sign off → 0-B (code + schema, ~6-7 hours) → review + sign off → 0-C (HubSpot + audit, ~3-4 hours) → review + sign off → Phase 3 Day 1.

**Kickoff prompt template for Session 0-A** (fresh oversight session drafts this verbatim with any adjustments):

> Pre-Phase 3 Session 0-A — Shape locks + strategic amendments. HEAD is [commit]. Scope: DECISIONS.md amendments per `docs/PRE-PHASE-3-FIX-PLAN.md` §4.1. Doc-only; no code, no migrations.
>
> Read `docs/PRE-PHASE-3-FIX-PLAN.md` §4.1 in full before executing. The session addresses 6 items: A1, A2, A3, A4, W1-preamble, R11. All are doc-only amendments to DECISIONS.md §2.13.1 / §2.16.1 and PRODUCTIZATION-NOTES.md Stage 3.
>
> Reasoning gate: this session expects entries primarily of types 1, 2, and 3 per the CLAUDE.md Oversight/execution framework. Type 1 covers the three-way-drift protection amendments; type 2 covers the §2.16.1 preservation pull-forwards; type 3 covers the R11 Stage 3 URL note. One type-4 entry for the W1 preamble that sets up Session 0-C.
>
> Done: all five §2.16.1 / §2.13.1 amendments landed + the PRODUCTIZATION-NOTES.md Stage 3 paragraph appended. Commit pushed; BUILD-LOG `## Pre-Phase 3 Session 0-A` entry written and committed.

Similar templates for Sessions 0-B and 0-C draft from §4.2 and §4.3 respectively. The plan contains enough structure that oversight can draft them without re-reading the foundation review; if an ambiguity surfaces during drafting, reread the relevant Output 2 or Output 3 finding.

---

## Appendix A — Finding-by-finding → session mapping

Canonical index for cross-reference. Each foundation-review finding appears here with its session landing (or deferred-to phase) + the rationale in one line.

### Output 1 — Ratifications (15) — all preserved, no action required

R1 (HubSpot SoR + CrmAdapter), R2 (event sourcing), R3 (single-sourced enums), R4 (FK-joined tables), R5 (RLS patterns + is_admin), R6 (Claude wrapper + prompts-as-files), R7 (jobs + pg_cron), R8 (service template), R9 (§2.1.1 magic-link), R10 (§2.18.1 HubSpot config paths), R11 (/pipeline/:dealId URL — plus Session 0-A PRODUCTIZATION-NOTES.md Stage 3 note), R12 (deal_contact_roles), R13 (design tokens + nothing-is-flat), R14 (nav registry + iconName), R15 (§2.16.1 preservation amendment).

### Output 2 — Adjust-before-solidifies (15 + 2 renumbered-cross-refs)

| Finding | Session | Rationale |
|---|---|---|
| A1 — `observations.signal_type` nullable + §2.13.1 invariant | 0-A (amendment) + 0-B (migration) | Session 0-A locks the invariant; Session 0-B drops the NOT NULL and updates ObservationService + test-rls-observations.ts |
| A2 — `deal_events.event_context` pull-forward | 0-A (amendment) + 0-B (migration) | Pulls §2.16.1 decision 2 from Phase 4 Day 1 to Phase 3 Day 1 migration; flip to NOT NULL remains Phase 4 |
| A3 — `prompt_call_log` full shape lock | 0-A (amendment) + 0-B (migration) | 19-col shape locked in §2.16.1 decision 3; table skeleton lands Session 0-B; wrapper-write lands Phase 3 Day 1 |
| A4 — `transcript_embeddings` vector(1536) + voyage-large-2 | 0-A (amendment) + 0-B (skeleton) + Phase 3 Day 2 (HNSW index) | Planning-lens split: lock + table Phase 3 Day 1; HNSW index after first rows |
| A5 — MEDDPICC per-dim writeback | (folded into W1) | Same fix as W1; no separate action |
| A6 — `experiments.vertical` column | 0-B (migration) | Pre-Phase-5 hygiene; fits the Phase 3 Day 1 migration batch |
| A7 — Process-wide shared postgres client | 0-B (code) | Unblocks Phase 3 Day 2 worker concurrency; Session B parked item that promoted to pre-Phase-3 |
| A8 — `sync_state` table | 0-B (migration) | Table lands now; pg_cron wiring stays Phase 4 Day 2 per rebuild plan |
| A9 — Webhook echo dedup on `nexus_*` | 0-C (adapter code) | Closes Phase 3 Day 2 pipeline 429-risk; bundled with HubSpot-facing work |
| A10 — Mapper VERTICAL import | 0-B (2 lines) | Guardrail 22 hygiene; trivially bundled |
| A11 — `fitness_velocity` enum | 0-B (migration) | Zero-rows cast is safe now; `ai_category` defers to Phase 5 Day 3-4 |
| A12 — `experiment_attributions.transcriptId` FK | 0-B (migration) | §2.2 hygiene completion; one-line `.references()` |
| A13 — `deal_events (hubspot_deal_id, created_at DESC)` index | 0-B (migration) | Phase 4+ read path, but cheap to land now |
| A14 — Pipeline page Promise.all | 0-B (4 lines) | Demo responsiveness at productization sizes |
| A15 — OVERSIGHT-HANDOFF staleness | **This session** | Retired + replaced with OVERSIGHT-META.md per §5.1 |
| A16 — `confidence_band` comment | 0-B (1 line) | Lowest-touch item; bundled with migration commit |
| A17 — /pipeline/:dealId URL | (cross-ref to R11) | Ratified; no session action beyond Session 0-A's PRODUCTIZATION-NOTES.md Stage 3 note |

### Output 3 — Actively-wrong (1)

| Finding | Session | Rationale |
|---|---|---|
| W1 — MEDDPICC 7-vs-8 drift | 0-A (canonical amendment) + 0-C (provisioning) | §2.13.1 canonical locked Session 0-A; 39th HubSpot property provisioned Session 0-C; closes Phase 3 Day 2 writeback crash risk |

### Output 4 — Creative additions (5)

| Addition | Session / Phase | Rationale |
|---|---|---|
| C1 — `pnpm enum:audit` | 0-C | Automates the three-way drift check that catches W1-class findings; direct close to W1 |
| C2 — Applicability DSL + shared evaluator | Phase 4 Day 1 | Consumer (admission engine) is Phase 4; not a pre-Phase-3 pull-forward candidate |
| C3 — MockClaudeWrapper | Phase 3 Day 1 | Lands with the first `callClaude` wrapper wiring into `prompt_call_log` |
| C4 — Telemetry dashboard `/admin/claude-telemetry` | Phase 3 Day 2 (optional Day 3) | First real data arrives Day 2; dashboard over empty data is low-signal |
| C5 — Demo-reset seed manifest | 0-B (skeleton) + ongoing discipline | Ship empty now; every phase adds entries per new Nexus-owned table |

---

## Appendix B — Cross-reference map

### B.1 — DECISIONS.md amendments expected to ship (per session)

- **Session 0-A commit:** §2.13.1 new bullets for (a) observations.signal_type nullable invariant (A1), (b) MEDDPICC 8-dim canonical (W1). §2.16.1 updates to (c) decision 1 (transcript_embeddings shape lock — A4), (d) decision 2 (event_context pull-forward — A2), (e) decision 3 (prompt_call_log 19-col shape — A3).
- **Session 0-B commit:** no new amendments expected. Migration 0005 references the amendments locked Session 0-A.
- **Session 0-C commit:** §2.13.1 potentially gains a note confirming `pnpm enum:audit` is a CI-enforced gate going forward. Scope call at kickoff time.

### B.2 — Migrations expected to ship (per session)

- **Session 0-B:** `packages/db/drizzle/0005_<name>.sql` bundling all 9 schema changes. Drizzle-kit may emit destructive SQL for some (e.g., `velocity_trend` TYPE change); follow the Phase 2 Day 2 migration-0004 hand-replace pattern if so, with a one-off applicator script.
- **Session 0-C:** no schema migrations. HubSpot property provisioning via the existing idempotent script.

### B.3 — Live HubSpot portal mutations expected (per session)

- **Sessions 0-A and 0-B:** zero. Internal-only work.
- **Session 0-C:** one provision run adding `nexus_meddpicc_paper_process_score` to the `nexus_intelligence` group. Portal 245978261 goes from 38 → 39 custom properties.

### B.4 — PRODUCTIZATION-NOTES.md edits expected

- **Session 0-A:** one paragraph under Stage 3 naming the `/pipeline/:dealId` URL transition task (R11 caveat).
- **Other sessions:** no edits.

### B.5 — BUILD-LOG.md entries expected (per session)

Each session lands a `## Pre-Phase 3 Session 0-X — [date] · [commit]` entry under day-by-day history, following Phase 2 Day 4 Session A/B entry shape: workstreams, verification table, reasoning stub, parked items closed, parked items added, cost. Current state block at top of BUILD-LOG refreshed each session.

---

*End of Pre-Phase 3 Fix Plan. Fresh oversight sessions pick up here — read §8 for kickoff prompt shape, then §4.1/4.2/4.3 for the active session's scope detail.*
