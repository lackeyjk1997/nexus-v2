# Nexus v2 — Build Log

## How to maintain this file

This file is appended to at the end of every day's work. After writing the end-of-day report to Jeff:

1. Append the full report to this file under a new `## Phase X Day Y — [date]` heading in the "Day-by-day history" section.
2. Update "Current state" at the top with the latest commit, phase/day, and what's next.
3. Move completed parked items out of "Parked items" as they resolve; add new ones as they surface.
4. Add newly-resolved operational gotchas to "Operational notes" if they carry forward.
5. Commit BUILD-LOG.md in the same commit as the day's work, or in a follow-up commit with message "docs: update build log for Phase X Day Y".

A new session reads `docs/DECISIONS.md` + `docs/BUILD-LOG.md` + `CLAUDE.md` before acting.

---

## Current state (as of 2026-04-22)

- **Phase / Day completed:** Phase 1 Day 4
- **Latest commit on `main`:** `f377edc docs(decisions): lock 2.13.1 — Day-4 Claude-wrapper clarifications` (docs-only; code HEAD is `8bd4cdd feat(phase-1-day-4): unified Claude wrapper + first ported prompt`)
- **Vercel preview:** Ready on `8bd4cdd` (Day 4 added no web routes)
- **Next day scheduled:** Phase 1 Day 5 — `CrmAdapter` + HubSpot foundation

---

## Day-by-day history

### Phase 1 Day 1 — 2026-04-22 · `7646fcb`

**Repo scaffold.** Turborepo + pnpm monorepo at `~/nexus-v2`. Next.js 14.2.29 App Router in `apps/web` (TS strict, Turbopack dev on port 3001). Packages `@nexus/db` (Drizzle 0.36 + postgres driver; schema.ts empty placeholder), `@nexus/shared` (Anthropic SDK, Supabase JS, zod placeholders), `@nexus/prompts` (gray-matter loader scaffold).

**Tailwind + shadcn.** Tailwind 3.4 with CSS-variable design token placeholders (populated Phase 2 Day 1 from `~/nexus/docs/handoff/design/DESIGN-SYSTEM.md`). shadcn/ui `components.json` config + `cn()` helper; no Radix components pulled yet (per-feature basis).

**Model pin.** `ANTHROPIC_MODEL` env var, never hardcoded (DECISIONS.md 2.13).

**Verification.**
- `pnpm install` — 442 packages, 5.7s.
- `pnpm typecheck` — 4/4 workspaces pass, 1.2s.
- `pnpm build` — 7.4s, static `/`, 87.2 kB first-load.
- `pnpm dev` → `curl localhost:3001` — HTTP 200, HTML + Tailwind CSS shell.
- `git push origin main` — clean.

**Notes / parked.** pnpm 10 ignored 3 build scripts on install (`esbuild`, `unrs-resolver`); parked for Day 2 via `pnpm.onlyBuiltDependencies`. `next@14.2.29` flagged deprecated; matches v1 pin, no action.

### Phase 1 Day 2 — 2026-04-22 · `820cf6d`

**Schema + migrations.** 36 tables, 31 enums, 141 indexes. 34 tables from `10-REBUILD-PLAN.md §4.2` plus `experiment_assignments` and `experiment_attribution_events` join tables (replacing v1's `test_group`/`evidence_event_ids` uuid[] arrays — hygiene per §2.2).

**RLS — 49 policies on all 36 tables.** Four canonical patterns:
- Pattern A (own rows): observations, surface_dismissals, surface_feedback, notifications.
- Pattern B (own via team_members lookup): agent_configs, agent_config_versions, field_query_questions.
- Pattern C (read-all, update own): users, team_members, support_function_members.
- Pattern D (read-all, writes via service role): event streams, coordinator patterns, transcripts, MEDDPICC, deal fitness, HubSpot cache, post-sale, shared reference.

Cross-schema FK `public.users.id → auth.users.id ON DELETE CASCADE`. Admin bypass via `public.is_admin()` SECURITY DEFINER STABLE function. v1's `readnessFitDetected` typo resolved by elision (Phase 1 Day 2 finding; §2.2.2).

**Auth.** Supabase Auth + magic link. `/login`, `/auth/callback`, `/(dashboard)/layout.tsx` server-side auth gate. Session refresh middleware on every request. `apps/web/.env.local` symlink to workspace root for Next.js env loading.

**Seed — 14 users.** 11 team_members (5 AEs, 1 MANAGER, 2 SAs, 1 BDR, 2 CSMs) + 3 support_function_members (Lisa Park enablement, Michael Torres product_marketing, Rachel Kim deal_desk). All `@nexus-demo.com`. `auth.users` rows via `admin.createUser` with `email_confirm=true`.

**Cross-user RLS test — PASSED.** Marcus authenticated via `admin.generateLink → verifyOtp`, queried `observations WHERE observer_id = sarah.id` — 0 rows returned. Sarah queried her own — 1 row. RLS enforcing at the Supabase API layer.

**Magic-link smoke test — PASSED.** `/login` renders form, OTP exchange produces session cookies, `/dashboard` renders "Logged in as sarah.chen@nexus-demo.com".

**Forbidden tables absent.** `deal_agent_states`, `agent_actions_log`, `deal_stage_history` — all absent. `jobs`, `job_results` — absent (deferred to Day 3).

**Verification.** `pnpm typecheck` 4/4 pass. `pnpm build` 6 routes, 7.4s. Cross-user RLS test + magic-link test both pass.

**Admin-role choice:** `users.is_admin boolean NOT NULL DEFAULT false` + `public.is_admin()` helper — locked in §2.2.1.

**Parked.** agent_config_proposals + field_queries read-all-authenticated (tighten Phase 5 Day 1). apps/web/components/ doesn't exist yet (lands Phase 2).

### Phase 1 Day 3 — 2026-04-22 · `7756d1e → 18acccc → e526970 → f12f1d6`

**Jobs infrastructure.** 2 new tables (jobs, job_results), 2 new enums (job_status, job_type with all 7 values seeded: transcript_pipeline, coordinator_synthesis, observation_cluster, daily_digest, deal_health_check, hubspot_periodic_sync, noop). Only `noop` has a handler; the other six throw `not_implemented` with phase tags.

**Worker endpoint.** `GET /api/jobs/worker` with Bearer CRON_SECRET auth, `maxDuration=300`. Atomic claim via `FOR UPDATE SKIP LOCKED` subquery — concurrent pg_cron invocations cannot double-claim. Handler dispatch via HANDLERS map. On throw: `status=failed`, error message captured, `completed_at` set.

**Enqueue endpoint.** `POST /api/jobs/enqueue` with user-session auth. Validates type against the 7-value enum allowlist. Inserts with `user_id = auth.uid()`.

**Realtime.** `jobs` added to `supabase_realtime` publication with `REPLICA IDENTITY FULL`. `useJobStatus(jobId)` hook uses subscribe-first, fetch-on-SUBSCRIBED-callback ordering with `setState(prev => prev ?? snapshot)` guard to avoid race where fast handlers complete between fetch and subscription.

**pg_cron.** `CREATE EXTENSION IF NOT EXISTS pg_cron, pg_net` via migration 0003. Scheduled via `scripts/configure-cron.ts <stable-url>` — requires CLI arg to prevent accidentally wiring to ephemeral preview URLs. URL + CRON_SECRET embedded as SQL literals in the cron body (Supabase denies `ALTER DATABASE ... SET` for project postgres role; decision locked in §2.6.1). Rotation: Vercel → `npx vercel env pull` → re-run configure-cron.

**Mid-stream fix — DATABASE_URL pooler.** First prod run surfaced `getaddrinfo ENOTFOUND db.<ref>.supabase.co` — Vercel's IPv4-only Node runtime cannot resolve Supabase's direct DB host (IPv6-only on hosted). Repointed `DATABASE_URL` in Vercel to the Transaction pooler (`aws-1-us-east-1.pooler.supabase.com:6543`). `DIRECT_URL` stayed on the direct host for local drizzle-kit (prepared statements, developer Mac IPv6). Documented in README + `.env.example`.

**Concurrent claim test — PASSED.** Two parallel worker HTTP requests, two pre-queued noop jobs; each worker claimed a different job, both succeeded.

**E2E test against prod — PASSED.** Authenticated enqueue → Supabase Realtime subscribe → no manual worker trigger → pg_cron fired → worker claimed → `running` event at t+5.2s → `succeeded` event at t+7.2s (20s budget).

**6 not_implemented handlers — all throw loudly.** Each non-noop type sets `status=failed` with error prefix `not_implemented:` naming both the type and the owning phase.

**pg_cron health snapshot at time of report.** 87/87 runs succeeded, 0 failed, schedule `10 seconds`, active=true.

**Verification.** `pnpm typecheck` 4/4 pass. `pnpm build` 8 routes (adds `/api/jobs/enqueue`, `/api/jobs/worker`, `/jobs-demo`), middleware 79.6 kB.

**Parked.** Worker one-job-per-invocation (may switch to loop-until-empty in Phase 3 when transcript pipelines land). Attempts column incremented on claim but failed jobs not re-queued (Phase 3 retry policy). `running` event visibility cosmetic.

### Phase 1 Day 4 — 2026-04-22 · `8bd4cdd → f377edc`

**Single-sourced `SIGNAL_TAXONOMY`.** Defined in `packages/shared/src/enums/signal-taxonomy.ts` as a readonly `[string, ...string[]]` tuple plus `SignalTaxonomy` union type + `isSignalTaxonomy` guard. `packages/db/src/schema.ts` imports the tuple and passes it to `pgEnum("signal_taxonomy", SIGNAL_TAXONOMY)`. `drizzle-kit generate` confirmed "No schema changes, nothing to migrate" — values unchanged, source-of-truth location moved. Guardrail 22 closed: v1's 7-vs-9 drift between prompt #1 and #21 is structurally impossible now.

**Prompt loader.** `packages/prompts/src/loader.ts` — gray-matter front-matter parser with required-key validation (name, model, temperature, max_tokens, tool_name, version). H1 section splitter (`# System Prompt`, `# User Prompt Template`). `interpolate()` throws `PromptInterpolationError` listing every unmapped `${var}` — never silently leaves a literal in the prompt sent to Claude. Module-level cache.

**Claude wrapper.** `packages/shared/src/claude/client.ts`. Single exported function `callClaude<T>({ promptFile, vars, tool, task?, temperature?, maxTokens?, model? })`. Precedence:
- Model: `input.model` → `env.ANTHROPIC_MODEL` → front-matter.model.
- Temperature: `input.temperature` → task-mapped default (0.2 classification / 0.3 synthesis / 0.6 voice / 0.7 voice_creative) → front-matter.temperature.
- Max tokens: `input.maxTokens` → front-matter.max_tokens.

Forces `tool_choice: { type: "tool", name }` so Claude cannot emit plain text. Retry: 3 attempts, exponential backoff 1s/2s/4s, only on 429/500/502/503/504. Protocol violations (missing `tool_use`, wrong tool name) throw `PromptResponseError` immediately — no retry on Day 4 (park for Phase 3 decision). Telemetry: one JSON line per call to stderr with `promptFile, promptVersion, toolName, model, temperature, maxTokens, attempts, inputTokens, outputTokens, durationMs, stopReason`.

**First prompt ported.** `packages/prompts/files/01-detect-signals.md` — copy of 04C Rewrite 1 + added `tool_name: record_detected_signals` + **bumped `max_tokens: 3000 → 6000`** after the integration test hit the 3000 ceiling mid `tool_use` on a 1448-word fixture. Locked in §2.13.1.

**Tool schema.** `packages/shared/src/claude/tools/detect-signals.ts` imports `SIGNAL_TAXONOMY` for the `signal_type` enum. Typed `DetectedSignal`, `StakeholderInsight`, `DetectSignalsOutput` interfaces exported.

**Fixture + integration test.** 1448-word MedVista discovery transcript with explicit Microsoft DAX competitive mention and six-to-eight-week InfoSec review cue. Test covers 7 assertions: loader front-matter, interpolation completeness, tool_use return, signal enum validity, stakeholder insights shape, telemetry presence, reasoning_trace presence (conditional).

**Test PASSED.** 10 signals, 2 insights, 58s, stop_reason=tool_use, attempts=1, 5128 input tokens, 3029 output tokens. Types detected: competitive_intel, content_gap, deal_blocker, field_intelligence, win_pattern. Every signal's `signal_type` ∈ `SIGNAL_TAXONOMY`.

**Prompt-quality findings surfaced.**
- **Finding A:** `01-detect-signals` (and 3 others across the 9 rewrites) missing reasoning-first field required by 04C Principle 6. Audit: 4-of-9 pattern — clear gaps on #01 and #03, judgment calls on #06a and #08, exempt on #07. Resolution calendared in §2.13.1 — #01 before Phase 3 Day 2, #03 before Phase 5 Day 1.
- **Finding B:** `max_tokens: 3000` empirically too tight. Bumped to 6000.

**Operational finding.** Claude Code's shell exports `ANTHROPIC_API_KEY=""` (empty string) to prevent subagents from using parent credentials. Dotenv's default `override: false` preserves that empty value even with a real one in `.env.local`. Day-4 test uses `loadEnv({ path, override: true })`. Convention locked in §2.13.1 — Phase 3 Day 1 consolidates into `packages/shared/src/env.ts` helper.

**Other max_tokens watch items from audit.**
- `04-coordinator-synthesis` at 2500 — may be tight for 4-5 deal patterns with reasoning + synthesis + recommendations + arr_impact + constraint_acknowledgment.
- `07-give-back` at 600 — aggressive for structured voice envelope.
- `08-call-prep-orchestrator` at 4000 — tight given 10+ sections with nested objects.

**Verification.** `pnpm typecheck` 4/4 pass. `pnpm build` 8 routes unchanged, 6.4s.

**Cost.** Single Claude API call, 5128+3029 tokens against claude-sonnet-4-6, ~$0.06-$0.08.

---

## Parked items — outstanding backlog

Organized by expected-land phase. Consolidates across Days 1–4.

### Phase 2 Day 1 (Core CRUD — expected)
- Populate Tailwind design tokens from `~/nexus/docs/handoff/design/DESIGN-SYSTEM.md`. Shadcn base already scaffolded.
- `apps/web/src/components/` directory lands per-feature when first UI lands.
- Single-source remaining pgEnums (`DealStage`, `Vertical`, `MeddpiccDimension`, `OdealCategory`, `ContactRole`) from `packages/shared/src/enums/` following the Day-4 `signal_taxonomy` pattern. No schema migration needed — values unchanged.

### Phase 3 Day 1 (AI features — expected)
- Consolidate dotenv loading into `packages/shared/src/env.ts` helper (`loadDevEnv()` with `override: true` by default) so every Claude-calling script invokes one function. Until then, copy-paste the pattern per §2.13.1.

### Phase 3 Day 2 (transcript pipeline — expected)
- **`01-detect-signals` reasoning_trace addition + version bump** per §2.13.1. Pre-execution step on Phase 3 Day 2 kickoff.
- `04-coordinator-synthesis` max_tokens at 2500 — watch for `stopReason=max_tokens` on many-deal patterns when the coordinator synthesis job runs; bump when seen.
- Transcript pipeline wiring replaces Day 4's fixture context stubs (`contactsBlock`, `meddpiccBlock`, etc.) with real output from `DealIntelligence.formatMeddpiccForPrompt`, `CrmAdapter.getContactsForDeal`, `TranscriptPreprocessor.getCanonical`, `IntelligenceCoordinator.getActivePatterns`.
- Worker retry policy — currently `attempts` is incremented on claim but failed jobs aren't re-queued. Phase 3 defines the retry/backoff policy (up to 3 attempts with backoff per §4.5).
- Worker concurrency model — currently one-job-per-invocation. Phase 3 may switch to loop-until-empty or bounded concurrency if transcript pipelines demand higher throughput.
- Wrapper retry-on-protocol-violation — decide when transcript pipeline demands it. Current behavior throws immediately, which is correct for isolated prompts but may be wrong for multi-step pipelines where one flaky response shouldn't fail the whole job.

### Phase 4 Day 2 (coordinator + intelligence — expected)
- `coordinator_synthesis` job handler wires through the wrapper; reasoning_trace already present on the #04 prompt.

### Phase 5 Day 1 (agent layer kickoff — expected)
- **`03-agent-config-proposal` reasoning_trace move to first position + version bump** per §2.13.1. Pre-execution step on Phase 5 Day 1 kickoff.
- **`06a-close-analysis-continuous` reasoning_trace decision** per §2.13.1. Review then; default is leave-as-is.
- **`08-call-prep-orchestrator` reasoning_trace decision** per §2.13.1. Review then; if first call-prep runs show incoherent section integration, add it.
- `07-give-back` max_tokens at 600 — aggressive for structured envelope; bump if `stopReason=max_tokens` lands in practice.
- `08-call-prep-orchestrator` max_tokens at 4000 — tight for 10+ nested sections; likely needs a bump when the orchestrator runs against real context.
- Tighten RLS policies on `agent_config_proposals` and `field_queries` (currently conservative read-all-authenticated per §2.2.1). Phase 5's UI surfaces the access patterns that inform the tighter scoping.
- Verify `readiness_fit` column set when wiring Deal Fitness UI. §2.2.2 documented that v2 elides v1's `_detected` and `_total` count columns (derived from `deal_fitness_events` instead). Confirm the UI's "N/M detected · pct%" pill reads the events table.

### Out of scope for v1 (locked — do not ship)
Per DECISIONS.md 1.8, 1.11, 1.12: role-based permissions, multi-tenancy, guided tour, the eight "future state capabilities," admin threshold-configuration UI, leadership feedback surfacing, dead pages (`/agent-admin`, `/team`, `observations-client.tsx`).

---

## Open questions awaiting resolution

_(None currently — all open questions from Days 1–4 have resolved into DECISIONS.md amendments 2.2.1, 2.2.2, 2.6.1, 2.13.1 or are calendared as parked items above.)_

---

## Operational notes

- **`DATABASE_URL`** uses Shared Pooler (`aws-1-us-east-1.pooler.supabase.com:6543`), IPv4-compatible. Vercel runtime cannot resolve the direct DB host (IPv6-only on Supabase hosted free tier).
- **`DIRECT_URL`** stays on the direct host (`db.<ref>.supabase.co:5432`) for local drizzle-kit migrations (prepared statements + longer-lived connections; developer Macs have IPv6).
- **dotenv `loadEnv`** requires `override: true` in scripts that call Claude. Default `override: false` preserves Claude Code's intentional empty-string `ANTHROPIC_API_KEY` guard that shadows `.env.local`. Consolidation helper lands Phase 3 Day 1.
- **`CRON_SECRET` rotation:** Vercel (all 3 scopes) → `npx vercel env pull` → `pnpm --filter @nexus/db configure-cron https://nexus-v2-five.vercel.app`.
- **pg_cron cannot reach localhost.** Local worker testing uses `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/jobs/worker` or `test:concurrent` / `test:notimpl` / `test:e2e` scripts (auto-detect localhost and trigger manually).
- **Vercel env vars have three scopes** (Production / Preview / Development). `vercel env pull` defaults to Development. Always check all three when adding or rotating a var.
- **Magic-link auth** uses Supabase's fragment-based implicit flow (`#access_token=…`). The server can't see the fragment. Production flow: magic link → Supabase verifies → redirect to `/auth/callback` → SSR client exchanges cookies. Our tests bypass the browser by calling `admin.generateLink → verifyOtp` directly through an SSR client with a jar-based cookie adapter.
- **`apps/web/.env.local` is a symlink** to the repo-root `.env.local`. Next.js reads env from the app directory; Vercel's `env pull` writes to the repo root. Symlink bridges the two. `.gitignore` excludes `apps/*/.env.local`.
- **Forbidden tables** (v1 debris): `deal_agent_states`, `agent_actions_log`, `deal_stage_history` — verified absent in Supabase, must never exist.
- **Prompt model-ID pin:** front-matter `model: claude-sonnet-4-20250514` is a fallback. `env.ANTHROPIC_MODEL` takes precedence (currently `claude-sonnet-4-6`). Never hardcode a model ID in route handlers or service code.

---

## Context for next session

**What's built.** Monorepo scaffolded, deployed to Vercel production at `https://nexus-v2-five.vercel.app` and auto-deploying on push to `main`. Supabase schema is complete (38 tables, 31 enums, 49 RLS policies, 4 migrations applied). Authenticated dashboard (`/login` → `/(dashboard)/dashboard`) works via Supabase Auth magic links; cross-user RLS proven. Background job infrastructure (`jobs` + `job_results` + `pg_cron` every 10s + Supabase Realtime) is live; the `/jobs-demo` page proves end-to-end queue → claim → status-push. The unified Claude wrapper at `@nexus/shared/claude` loads `.md` prompt files from `@nexus/prompts`, forces `tool_use` responses, retries on transport errors, emits telemetry. `SIGNAL_TAXONOMY` is single-sourced across the DB enum and every Claude call that references it. The first ported prompt (`01-detect-signals`) has passed integration testing against the real Anthropic API. 14 demo users seeded (11 team_members + 3 support_function_members, `@nexus-demo.com`).

**What's next and how to pick up.** Phase 1 Day 5 — `CrmAdapter` interface + `HubSpotAdapter` implementation + the first HubSpot-backed deal rendered by a minimal `/pipeline` page. Before executing, read `~/nexus/docs/handoff/07B-CRM-BOUNDARY.md` (the table-by-table HubSpot/Nexus split; defines the adapter's responsibilities) and `~/nexus/docs/handoff/07C-HUBSPOT-SETUP.md` (the provisioning playbook; Day 5 runs Steps 1–10). `NEXUS_HUBSPOT_TOKEN` is already in `.env.local` from an earlier `vercel env pull`; additional HubSpot credentials arrive at Day 5 start. The orienting triad for any fresh session is **`docs/DECISIONS.md`** (constitution, including amendments 2.2.1, 2.2.2, 2.6.1, 2.13.1) + **`docs/BUILD-LOG.md`** (this file — running narrative, parked items, operational notes) + **`CLAUDE.md`** (bootstrap rules + repo layout). Read that triad before touching code.
