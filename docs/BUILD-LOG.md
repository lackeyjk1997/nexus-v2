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

- **Phase / Day completed:** Phase 2 Day 2 — reconciliation + kanban + deal creation.
- **Latest commit on `main` (nexus-v2):** `0396f7a feat(phase-2-day-2): deal_stage reconciliation + kanban + deal creation`.
- **Companion commit on `main` (nexus — frozen handoff):** `533d3eb docs(prompts): align ContactRole taxonomy to 9-value schema canonical` (explicit Jeff approval per §2.13.1).
- **Vercel preview:** Ready on `0396f7a`. `/pipeline` now carries view toggle (table ⇄ kanban) + "New deal" button; `/pipeline/new` form creates deals via `CrmAdapter.createDeal`. 11 routes total.
- **Live HubSpot portal state (`245978261`):** pipeline `2215843570` + 9 stages unchanged; MedVista deal `321972856545` unchanged; `nexus_role_in_deal` contact property options **broadened from 6 to 9** via `scripts/hubspot-align-role-options.ts`; 38 `nexus_*` custom properties + 18 webhook subscriptions unchanged.
- **Live Supabase DB:** migration `0004_shallow_kid_colt.sql` applied. `deal_stage` enum first value is now `new_lead` (was `prospect`). No rows referenced the column; rename was ordinal-preserving.
- **Next day scheduled:** Phase 2 Day 3 — deal detail page skeleton + overview tab + MEDDPICC edit UI (writes Nexus `meddpicc_scores`; HubSpot-write lands Phase 3 Day 2). Does not start until Jeff green-lights.

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

### Phase 1 Day 5 — 2026-04-22 · `2856ce7 → 051906e → 14c157b → ed94027`

**CrmAdapter interface + error hierarchy + types** in `packages/shared/src/crm/{adapter,types,errors}.ts`. Types are verbatim from 07B §2 with Day-5 tightenings: `DealStage` is the closed 9-value union from 07C §2.2, `Deal`/`Contact`/`Company` carry optional `_meta: { cachedAt, isStale }` per 07C §7.7. Five error subclasses `CrmNotFoundError | CrmAuthError | CrmRateLimitError | CrmValidationError | CrmTransientError` plus a sixth `CrmNotImplementedError` that carries `methodName + expectedPhase` — following Day-3's job-handler loud-not-silent pattern.

**HubSpotAdapter — 14 live methods, 17 `not_implemented`.** Live: `healthCheck`, `listDeals`, `createDeal`, `updateDealStage`, `getDeal`, `createCompany`, `getCompany`, `createContact`, `bulkSyncDeals/Contacts/Companies`, `parseWebhookPayload`, `handleWebhookEvent`, `invalidateCache`. Skeletons that throw `CrmNotImplementedError` with explicit target phase: all `updateDeal*`, `upsertContact/Company`, `listContacts/Companies`, `listDealContacts`, `setContactRoleOnDeal`, `getDealStageHistory`, `logEngagement`/`getEngagement`/`listEngagements`, `resolveDeal`/`resolveStakeholder`, `bulkSyncEngagements`. `getCompany` + `createCompany` + `createContact` beyond Jeff's original 11-method list because `/pipeline` needs company name resolution and the minimal seed needs company/contact creation — same code complexity as `getDeal`/`createDeal`; no reason to stub.

**Rate-limited HTTP client** in `packages/shared/src/crm/hubspot/client.ts`. Sliding 10-second window capped at `burstLimit=90` (10% safety margin under HubSpot's documented 100/10s). Maps 400/422 → `CrmValidationError`, 401/403 → `CrmAuthError`, 404 → `CrmNotFoundError`, 429 → `CrmRateLimitError` with `Retry-After` header capture, 5xx/network → `CrmTransientError`. Surfaces `X-HubSpot-RateLimit-Remaining` back to callers for `healthCheck()`.

**Webhook v3 signature verifier** in `packages/shared/src/crm/hubspot/webhook-verify.ts`. `HMAC-SHA256(clientSecret, method + uri + body + timestamp)`, base64-encoded, compared via `timingSafeEqual`. Rejects signatures older than 5 minutes (replay protection, HubSpot's documented requirement).

**Mappers** in `mappers.ts`. Translate HubSpot v3 object JSON (`{ id, properties: Record<string, string>, createdAt, updatedAt, associations }`) to typed `Deal`/`Contact`/`Company`. Parses number/date/boolean/array from the all-string property bag. Resolves `dealstage` HubSpot-ID → internal name via an injected `stageIdToInternal: Map<string, DealStage>`.

**Pipeline-ID artifact** at `packages/shared/src/crm/hubspot/pipeline-ids.json` per DECISIONS.md 2.18.1. Loaded via ESM JSON import (`with { type: "json" }`) so Vercel's serverless bundler inlines it at build time — the original `readFileSync + import.meta.url` path doesn't survive serverless packaging.

**Provisioning + ops scripts** in `packages/db/src/scripts/` (pnpm script names in parens):
- `hubspot-provision-pipeline.ts` (`provision:hubspot-pipeline`) — 07C Step 4. Looks up or creates "Nexus Sales" pipeline + 9 stages, writes `pipeline-ids.json`.
- `hubspot-provision-properties.ts` (`provision:hubspot-properties`) — 07C Step 5. Creates `nexus_intelligence` group + 38 custom properties. Idempotent via GET-first existence check (the initial 400-as-exists heuristic masked real validation errors — see Finding A below).
- `hubspot-subscribe-webhooks.ts` (`subscribe:hubspot-webhooks`) — 07C Step 6. **Prints manual UI steps** rather than calling the API — see Finding B.
- `hubspot-seed-minimal.ts` (`seed:hubspot-minimal`) — 07C Step 7 (Day-5 minimal). Creates MedVista Health + Michael Chen + MedVista Epic Integration ($2.4M Discovery +55d). Lookup-then-create idempotent.
- `hubspot-prewarm-cache.ts` (`prewarm:hubspot-cache`) — 07C Step 9. Runs `bulkSyncDeals/Contacts/Companies` sequentially; populates `hubspot_cache`.
- `hubspot-smoke-stage-change.ts` (`smoke:stage-change`) — 07C Step 10. Flips MedVista Discovery ↔ Qualified via direct HubSpot API (bypasses adapter), polls `hubspot_cache` every 2s, measures propagation latency. 15s SLA.
- `hubspot-env.ts` — dotenv helper with `override: true` per §2.13.1 (local copy; Phase 3 Day 1 consolidates into `packages/shared/src/env.ts`).

**Web surfaces.** `apps/web/src/app/(dashboard)/pipeline/page.tsx` — Server Component, reads via `CrmAdapter.listDeals()` then `adapter.getCompany()` per row. Intentionally unstyled inline-CSS; design tokens land Phase 2 Day 1. `apps/web/src/app/api/hubspot/webhook/route.ts` — `maxDuration=30`, verifies signature against `HUBSPOT_CLIENT_SECRET`, parses events, calls `handleWebhookEvent` per-event inside its own try/catch so one bad event cannot poison the batch; returns 200 on success, 401 on bad signature, 500 otherwise. `apps/web/src/lib/crm.ts` — request-scoped adapter factory; caller `await adapter.close()` in `finally`.

**Executed against live HubSpot portal `245978261`:** pipeline `2215843570` created with 9 stages (`new_lead` … `closed_lost`). 38 `nexus_*` properties provisioned (28 Deal + 5 Contact + 5 Company). 18 webhook subscriptions configured by Jeff in the HubSpot private-app UI (the 12 from 07C + 6 anticipatory cache-refresh triggers: `deal.associationChange`, `contact.*` on `jobtitle` + `hubspot_owner_id`, `company.*` on `hubspot_owner_id` + `industry` + `numberofemployees`). Target URL `https://nexus-v2-five.vercel.app/api/hubspot/webhook`. MedVista Health (`319415911154`) + Dr. Michael Chen (`475337257712`) + MedVista Epic Integration (`321972856545`, $2.4M, Discovery, close+55d) seeded. `hubspot_cache` pre-warmed: 2 deals + 3 contacts + 2 companies.

**Smoke test — PASSED.** `pnpm --filter @nexus/db smoke:stage-change` against the live portal. Forward flip Discovery → Qualified: PATCH acknowledged `t=0`, `hubspot_cache` reflected the new stage id at `t=2s`, total round-trip **4.3s**. Reverse flip Qualified → Discovery: **3.1s**. Both within the 15s Day-5 SLA.

**Day-5 Finding A — `ensureProperty` idempotency via 400-catch was too broad.** The first property-provisioning pass treated every 400 response as "property already exists" and silently skipped it. Two properties (`companies.nexus_tech_stack`, `companies.nexus_internal_company_intelligence_id`) were actually rejected with `PROPERTY_DOESNT_EXIST` / `INVALID_OPTION` errors that the catch swallowed — surfaced only when the seed attempted to write `nexus_tech_stack` and HubSpot returned "property does not exist." Rewrote `ensureProperty` to GET the property first and create only on 404, so validation errors surface loudly.

**Day-5 Finding B — `/webhooks/v3/{appId}/subscriptions` does not accept private-app tokens.** 07C §5.3 specified `POST /webhooks/v3/{appId}/subscriptions` with `Authorization: Bearer {NEXUS_HUBSPOT_TOKEN}`. Live call returned 401 "This API supports OAuth 2.0 authentication." HubSpot's current public docs confirm: *"Managing your private app's webhook subscriptions via API is not currently supported. Subscriptions can only be managed in your private app settings."* The subscribe script now prints the canonical 12-row (or extended-to-18) subscription list + UI URL for an operator to paste/click through. Took Jeff ~5 minutes. 07C §5.3 is wrong; flagged in Operational notes.

**Day-5 Finding C — 07C `fieldType` taxonomy was wrong.** 07C §3.1 listed `single_line_text` / `multi_line_text` / `datetime` as `fieldType` values. HubSpot's v3 Properties API rejects those with `"Enum type must be one of: [calculation_equation, checkbox, phonenumber, number, textarea, booleancheckbox, file, text, date, html, select, radio]"`. Corrected in `properties.ts`: `text` / `textarea` / `date`. The `HubSpotFieldType` TypeScript union now exhaustively enumerates all 12 HubSpot-accepted values so future additions typecheck against reality.

**Day-5 Finding D — `nexus_linkedin_url` label collided with HubSpot native `hs_linkedin_url`.** HubSpot enforces unique property labels across native + custom. `"LinkedIn URL"` was already in use; rename to `"Nexus LinkedIn URL"` (internal name unchanged, so no code changes). Going forward, prefix all ambiguous custom labels with "Nexus" to preempt collisions.

**Day-5 Finding E — signature verification must use `VERCEL_PROJECT_PRODUCTION_URL`, not `VERCEL_URL`.** Initial smoke test failed: forward flip timed out at 31s while HubSpot's `updatedAt` confirmed the PATCH landed immediately. Root cause: the webhook handler built the v3-signature signing string from `VERCEL_URL` (per-deployment, e.g., `nexus-v2-abc123.vercel.app`), but HubSpot signs with the URL configured in the private-app's Webhooks tab — the stable production alias `nexus-v2-five.vercel.app`. Every webhook silently 401'd. Fix: prefer `VERCEL_PROJECT_PRODUCTION_URL` (stable), fall back to `NEXT_PUBLIC_SITE_URL`, then incoming request host for local dev.

**Day-5 Finding F — `pipeline-ids.json` loaded via `readFileSync` didn't survive Vercel's serverless bundling.** Initial deploy of the webhook route returned 500 on POST — the `loadPipelineIds()` function resolved the JSON path via `import.meta.url` + `readFileSync`, but the JSON file wasn't co-located next to the compiled serverless function. Switched to an ESM JSON import (`import pipelineIds from "./pipeline-ids.json" with { type: "json" }`) so the mapping inlines at build time. After redeploy, `/api/hubspot/webhook` returned 401 on unsigned requests (correct behavior), confirming env + JSON bundling fine.

**Architecture amendments locked during Day 5:**
- **§2.18.1** — HubSpot config path convention. All HubSpot-specific config (`pipeline-ids.json`, `properties.ts`, future `association-ids.json`, adapter/client/webhook-verify modules) lives under `packages/shared/src/crm/hubspot/`. Resolves Day-5-brief vs 07C path disagreement.
- **§2.16.1** — Corpus intelligence preservation decisions (out-of-band task). Five LOCKED decisions that preserve optionality for post-demo corpus-intelligence work without inflating current scope: persist transcript embeddings (Phase 3 Day 2), freeze segmentation metadata on `deal_events` (Phase 4 Day 1), add `prompt_call_log` telemetry table pulled forward to Phase 3 Day 1, preserve speaker-turn granularity on `analyzed_transcripts`, keep signal-detection tool schema extensible for future assertions. Matches the vision section added to PRODUCTIZATION-NOTES.md.

**Verification.** `pnpm typecheck` 4/4 pass. `pnpm build` 10 routes (adds `/pipeline`, `/api/hubspot/webhook`), 9.3s. Smoke test `forward=4.3s, reverse=3.1s, SLA ≤15s: PASS`.

**Phase 1 exit criteria (§6).**
- `pnpm dev` runs; deal-list page loads; seeded deal visible. ✓ (localhost:3001/pipeline, Vercel `/pipeline`)
- No-op job enqueued via API completes, status broadcasts via Realtime. ✓ (verified Day 3, still green — `pg_cron` health 87/87 at time of Day-3 report and continuously running since)
- Wrapped Claude client against prompt #21 fixture returns valid tool-use response. ✓ (verified Day 4)
- HubSpot deal creation appears in HubSpot within 5s, cache within 15s. ✓ (seed created MedVista in <2s; webhook round-trip measured 3-4s)

**Phase 1 is COMPLETE.** Jeff reviews before Phase 2.

**Cost.** HubSpot API: ~120 calls across Step 4 (2) + Step 5 (76 — GET + POST for each property, plus re-runs for field-type fixes) + Step 7 (8 — lookup + create for company/contact/deal) + Step 9 (4 — three bulkSync + healthCheck) + smoke test (4 — two PATCH + two associated webhook-triggered refetches). Well under the daily 250k cap; burst stayed under 100/10s at all times. No Claude calls on Day 5.

### Phase 2 Day 1 — 2026-04-22 · `aba29a8`

**Design-system foundation.** [docs/design/DESIGN-SYSTEM.md](design/DESIGN-SYSTEM.md) ("Graphite & Signal", 743 lines, delivered by Jeff as `48de611`) consumed via three layers per the pre-kickoff thought:

- **Layer 1 — hex scales in `apps/web/tailwind.config.ts`.** `neutral`/`graphite`/`signal`/`slate`/`success`/`warning`/`error`/`info` baked directly as hex (not HSL channels). Plus `fontFamily` (resolving to `--font-geist-sans`/`--font-geist-mono`/`--font-instrument-serif` CSS vars), `fontSize` with per-step lineHeight pairs, `letterSpacing`, `borderRadius`, `boxShadow`, `transitionDuration`, `transitionTimingFunction`, `fontWeight`.
- **Layer 2 — CSS custom properties in `apps/web/src/app/globals.css`.** `:root` block carries every Layer-1 token plus semantic role aliases: `--bg-base/muted/surface/inverse`, `--text-primary/secondary/tertiary/disabled/inverse/accent`, `--border-subtle/default/strong/accent`, and a dedicated `--ring-focus` (the `signal-600 @ 15%` value used by focus rings — baked as `rgba(61,72,199,0.15)` since Tailwind 3 hex scales don't support opacity utilities). Plus `html`/`body` base styles, the global `*:focus-visible` outline, and `@media (prefers-reduced-motion: reduce)`.
- **Layer 3 — `backgroundColor`/`textColor`/`borderColor` extensions in tailwind.config** that wrap Layer 2 vars so semantic utilities (`bg-surface`, `text-primary`, `border-subtle`) are first-class Tailwind classes. Components reach for these by default; raw Layer-1 scales only where the design explicitly demands them.

**Fonts.** `next/font/google` doesn't recognize `"Geist"` / `"Geist Mono"` on Next 14.2.29 — build failed with `Unknown font "Geist"`. Switched Geist Sans + Mono to Vercel's `geist` package (`import { GeistSans, GeistMono } from "geist/font/sans"` + `"geist/font/mono"`). Instrument Serif continues via `next/font/google`. CSS variables are preserved (`--font-geist-sans`, etc.) so the tokens remain agnostic of the import source. DESIGN-SYSTEM.md §10.3 specified the Google path; reality is the `geist` npm package for the two Geist variants. Operational note added.

**Primitives (`apps/web/src/components/ui/`).** Seven installed via `pnpm dlx shadcn@latest add button card input label badge table separator -y`, then fully reskinned (no class in any of them still references `bg-primary`/`text-foreground`/`border-border` — grep 0 hits). Every primitive enforces the three DESIGN-SYSTEM §1 principles structurally, not just in hex:

- **Button** — 6 variants (`primary`/`secondary`/`ghost`/`accent`/`destructive`/`link`), 4 sizes. Primary/secondary/accent/destructive all default with `shadow-sm`, lift to `shadow-md` + `-translate-y-px` on hover over `duration-fast`, settle on `translate-y-0 shadow-sm` on active. Ghost + link variants keep their own hover treatments (bg-muted, underline). **No variant ships flat.** Accent variant explicitly reserved for AI-initiated actions per §8 Buttons rule.
- **Card** — `bg-surface`, 1px `border-subtle`, `rounded-lg`, `shadow-sm` by default. Optional `interactive` prop transitions to `shadow-md` + `border-default` on hover.
- **Input** — `bg-surface`, 1px `border-subtle`. Focus: `border-accent` + `box-shadow: 0 0 0 3px var(--ring-focus)` (no tailwind opacity util needed).
- **Label** — Radix `LabelPrimitive.Root`, `text-sm font-medium text-primary`.
- **Badge** — 7 variants (`neutral`/`slate`/`signal`/`success`/`warning`/`error`/`outline`). Accent/signal only for AI-authored markers. Used already on `/pipeline` stages and `/jobs-demo` status.
- **Table** — header cells `text-xs uppercase tracking-wide font-semibold text-tertiary`; body cells `text-sm text-primary` at regular weight; row hover `bg-muted` over `duration-fast`. Type carries hierarchy (principle 2).
- **Separator** — Radix `SeparatorPrimitive.Root`, `bg-[var(--border-subtle)]`.

Every one ≤400 LOC (Guardrail 35). Labels and Separator carry `"use client"` because they use Radix primitives; the rest are server components by default.

**App shell (DECISIONS.md 2.22 / Guardrail 36).**

- `apps/web/src/config/nav.ts` — declarative route registry. `NAV` is a `readonly NavItem[]` of `{ href, label, icon }`. Two entries today (Dashboard, Pipeline) with `lucide-react` icons. `/jobs-demo` intentionally excluded from sidebar (dev-only surface).
- `apps/web/src/components/layout/Sidebar.tsx` — server component. Iterates `NAV`, renders each via `<NavLink>`. Sparkle icon (`lucide/Sparkles`, `signal-600`) + "Nexus" wordmark in the header; user email footer.
- `apps/web/src/components/layout/NavLink.tsx` — tiny client component. Uses `usePathname()` to highlight the active route with `bg-signal-50 text-signal-700` (the only place `signal-50` surfaces outside of `Badge variant="signal"`). Active-state detection is the only client boundary in the shell.
- `apps/web/src/components/layout/AppShell.tsx` — server wrapper composing Sidebar + main column.
- `apps/web/src/app/(dashboard)/layout.tsx` — now wraps authenticated children in `<AppShell userEmail={...}>`.

**Page reskins — all five routes migrated.** Every inline style block, `bg-background`/`text-foreground`/`bg-brand`/`border-border`/`ring-ring` class, and inline hex string removed from `apps/web/src/`. `grep -rE '#[0-9A-Fa-f]{3,8}' apps/web/src/ --include='*.tsx' --include='*.ts'` returns **zero hits** at end of day. `grep -rE '(bg-background|text-foreground|bg-brand|border-border|ring-ring|bg-card|text-card-foreground|bg-primary|text-primary-foreground|bg-destructive|destructive-foreground|text-muted-foreground|ring-offset-background)' apps/web/src/` also returns **zero hits**.

- `/` (landing) — Instrument Serif hero at `font-display text-5xl`, prose at `text-secondary text-lg leading-relaxed`, "Sign in" CTA as `Button asChild size="lg"`. Neutral-only except the implicit graphite-900 button.
- `/login` — Card + Input + Label + Button. Magic-link form pattern preserved. Error message uses `text-error`, send confirmation uses `text-secondary`.
- `/dashboard` — Card placeholder describing what lands in Phase 4. Ghost-variant Button for sign-out in the header.
- `/pipeline` — Card with overflow-hidden wrapping the new Table primitive. Stage column renders as `<Badge variant={STAGE_VARIANTS[deal.stage]}>` — `slate` for new/qualified, `neutral` for discovery/technical_validation, `signal` for proposal/negotiation, `warning` for closing, `success` for closed_won, `error` for closed_lost. Amount column is `font-mono tabular-nums text-right`. MedVista row continues to render live from `hubspot_cache`.
- `/jobs-demo` — Card wraps the status display. Status chip is a `<Badge>` whose variant maps from the job status (`queued` → slate, `running` → signal, `succeeded` → success, `failed` → error). Still the only place in the app that uses `"use client"` at the page level (stays that way — it hosts `useJobStatus()`).

**Enum single-sourcing (Guardrail 22, Day-4 signal-taxonomy pattern).** Four tuples extracted to `packages/shared/src/enums/`:

- `vertical.ts` — 6 values.
- `meddpicc-dimension.ts` — 8 values.
- `odeal-category.ts` — 4 values.
- `contact-role.ts` — **9 values**. `crm/types.ts` `ContactRole` union was narrowed to 6 on Day 5; broadened today to match schema-canonical 9 (`+ decision_maker`, `+ procurement`, `+ influencer`) so adapter + DB cannot drift.

Each file exports a `readonly [string, ...string[]]` tuple (`VERTICAL`, `MEDDPICC_DIMENSION`, etc.), a union type derived from it, and an `isX()` type guard. `packages/db/src/schema.ts` imports the four tuples and passes them to `pgEnum(...)`. `pnpm --filter @nexus/db generate` reports *"No schema changes, nothing to migrate 😴"* — the four enum value sets matched Postgres perfectly.

**Day-1 Finding — `deal_stage` drift deferred.** Schema.ts `dealStageEnum` currently holds `["prospect", "qualified", ...]`. Day 5's `DEAL_STAGES` tuple in `crm/types.ts` holds `["new_lead", "qualified", ...]`, and that's what provisioned the 9 HubSpot stages on portal `245978261` and what the live pipeline uses. Reconciling requires an `ALTER TYPE deal_stage RENAME VALUE 'prospect' TO 'new_lead'` migration. No deal rows exist in Nexus (deals live in HubSpot via `hubspot_cache`), so the migration is safe — just separated from Day 1's "no migration" posture. Parked for Phase 2 Day 2 alongside the deal-creation-UI work that will first need to write to this column.

**Day-1 Finding — missing DESIGN-SYSTEM coverage parked.** Three omissions from DESIGN-SYSTEM.md surfaced during implementation, none blocking Day 1:

- **Z-index scale.** Not needed today (no overlays). Will land with Phase 5's first modal.
- **Data-viz palette.** Phase 4 intelligence dashboard will need charting colors. Flagged for the pre-Phase 4 Claude Design session (already parked).
- **Skeleton/loading token.** Used pragmatically as `bg-muted` + opacity pulse when first needed; deferred as an explicit token until a second loading surface lands.

All three added to Parked items.

**Verification at end of Day 1:**

- `pnpm typecheck` — 4/4 PASS (1.9s).
- `pnpm build` — 10 routes, 7.3s. `/login` grew from 154 B → 1.57 kB because `Label` pulls in `@radix-ui/react-label`; `/` went from 154 B → 175 B because of the Button+Link composition (negligible).
- Inline hex grep: **0 hits** in `apps/web/src/*.{ts,tsx}`.
- Stale shadcn placeholder-class grep: **0 hits**.
- `pnpm --filter @nexus/db generate` — *No schema changes, nothing to migrate.*
- Every primitive file + layout component ≤400 LOC. Largest is `button.tsx` at ~75 LOC.

**Cost.** No HubSpot API calls, no Claude API calls. Dependency install: `geist` (1 package), `@radix-ui/react-{slot,label,separator}` (~340 transitive), shadcn CLI scaffolded seven primitives.

**Nothing-is-flat discipline check (per Jeff's non-negotiable directive).** Every primitive shipped today carries its prescribed shadow/hover/focus treatment. Specifically:

- Button primary/secondary/accent/destructive — `shadow-sm` → `shadow-md` + `-translate-y-px` on hover.
- Button ghost + link — hover carries `bg-muted` and `underline` respectively.
- Card — `shadow-sm` by default; `interactive` variant lifts on hover.
- Input — focus ring via `box-shadow` (can't use `ring-*` utility on hex-valued colors; `--ring-focus` is a baked rgba for this purpose).
- Badge — transitions `colors` on variant changes (no hover lift; badges are markers, not buttons).
- Table — row `hover:bg-muted`; head row `border-b` separation; type weights carry the header/body distinction.
- Global `*:focus-visible` outline — `2px solid var(--color-signal-600)` with `offset 2px`. Unaffected by component-level treatments.

Nothing shipped naked. No "Card ships without shadow because X" calls to make.

### Phase 2 Day 2 — 2026-04-22 · `0396f7a` (+ `~/nexus` handoff commit `533d3eb`)

**Four workstreams shipped in one commit.** Reconciliation + ContactRole alignment + pipeline kanban + deal creation.

**`deal_stage` reconciliation.** `DEAL_STAGES` extracted from `packages/shared/src/crm/types.ts` into new `packages/shared/src/enums/deal-stage.ts` (canonical per Day-4 `signal-taxonomy` pattern). `crm/types.ts` drops local def + re-exports. `schema.ts` imports the tuple into `dealStageEnum`. Hand-wrote migration `0004_shallow_kid_colt.sql` — drizzle-kit auto-generated a `DROP TYPE` + `CREATE TYPE` pair which would silently corrupt any column rows that might exist; replaced with `ALTER TYPE "public"."deal_stage" RENAME VALUE 'prospect' TO 'new_lead'` (atomic in Postgres 10+, ordinal-preserving, safe even if rows exist). One-off applicator script `apply-migration-0004.ts` uses postgres-driver directly + is idempotent (detects already-applied state via `enum_range`). Applied to live Supabase; `drizzle-kit generate` now reports *"No schema changes, nothing to migrate"* with the correct `new_lead`-first enum in both schema and DB.

**`ContactRole` three-way drift resolved to the 9-value schema canonical.** Path B per §2.13.1: align prompt rewrites to schema, not the reverse. Pre-execution grep surfaced **four** locations to update (Jeff had identified two; `ciso`/`other` role values also leaked into 05-deal-fitness rewrites at 04C line 1450 + `source/prompts/05-deal-fitness.md` line 291). Plus a fifth drift vector: live HubSpot property `nexus_role_in_deal` had only 6 options, needed broadening to 9 to avoid Phase 3 runtime `INVALID_OPTION` errors when Claude returns `"decision_maker"`. Executed:

- `~/nexus/docs/handoff/source/prompts/08-call-prep-orchestrator.md:260` — role enum array rewritten to 9 values. Front-matter `version: 1.0.0 → 1.1.0`.
- `~/nexus/docs/handoff/source/prompts/05-deal-fitness.md:291` — role schema changed from free-text description to enum-typed 9 values. Front-matter `version: 1.0.0 → 1.1.0`.
- `~/nexus/docs/handoff/04C-PROMPT-REWRITES.md:1450` + `:2483` — mirrored updates.
- `packages/shared/src/crm/hubspot/properties.ts` — `ROLE_OPTIONS` broadened from 6 to 9.
- `scripts/hubspot-align-role-options.ts` (new) + `pnpm --filter @nexus/db align:hubspot-role-options` PATCHed the live HubSpot property. Added `decision_maker`, `procurement`, `influencer`; removed nothing (existing contact data remains valid).
- `docs/DECISIONS.md §2.13.1` gains a new bullet locking the 9-value canonical + recording the alignment pass.

**`~/nexus` handoff edits — explicit approval policy.** This is the first time I've modified files under `~/nexus/docs/handoff/`. CLAUDE.md's default policy remains: don't modify without Jeff's approval. Operational notes now document: when drift between rewrites and v2 canonical surfaces, editing handoff files is allowed with explicit approval; each edit bumps the prompt's front-matter version and is recorded in DECISIONS.md with rationale.

**Adapter.** `HubSpotAdapter.listCompanies` promoted from `not_implemented` to live. Signature unchanged (matches 07B §2 interface). Uses `POST /crm/v3/objects/companies/search` with optional `vertical` + `domain` filter clauses + ascending name sort. Writes refreshed cache rows on every result. ~40 LOC following `listDeals` pattern. Called by `/pipeline/new` page to populate the company dropdown.

**Pipeline UI upgrade.**

- `apps/web/src/components/pipeline/stage-display.ts` — shared `STAGE_LABELS`, `STAGE_VARIANTS` (maps each `DealStage` to a Badge variant), `formatAmount`, `formatDate`. Central source for both Table and Kanban views.
- `apps/web/src/components/pipeline/PipelineTable.tsx` — extracted from Day-1 `/pipeline` inline table. Server component.
- `apps/web/src/components/pipeline/DealCard.tsx` — compact kanban card: name + company + amount + close date. Server component, ~30 LOC.
- `apps/web/src/components/pipeline/PipelineKanban.tsx` — desktop-first 9-column layout, one column per `DEAL_STAGES` value. Fixed-width columns (`w-72`), parent `overflow-x-auto` for horizontal scroll at narrow viewports. Empty columns show a `"Nothing here yet."` hint. Count badge in each column header. No drag-and-drop (that lands Day 4 with stage-change UI deliverable #7).
- `apps/web/src/components/pipeline/PipelineViewToggle.tsx` — client component wrapping two ghost-variant `Button`s with `role="radiogroup"`. Reads/writes `?view=` search param via `next/navigation`. Default `table` preserves Day-1 bookmarks.
- `apps/web/src/app/(dashboard)/pipeline/page.tsx` — rewritten as a thin server wrapper fetching deals + companies, then rendering either `<PipelineTable>` or `<PipelineKanban>` based on the URL param. Header gains view toggle + "New deal" Button. A signal-tinted banner surfaces the `?created=<name>` post-creation flash.

**Deal creation UI.**

- `apps/web/src/app/(dashboard)/pipeline/new/page.tsx` — dedicated server-component page (not modal). Loads companies via `adapter.listCompanies` with ascending-name sort; renders `<DealCreateForm>`. Server action `createDealAction` validates inputs, calls `adapter.createDeal`, and redirects to `/pipeline?created=<name>` on success. Error path returns a state object with `{ error }` so the form re-renders with the message.
- `apps/web/src/components/pipeline/DealCreateForm.tsx` — client component. Uses React 18's `useActionState` + `useFormStatus` for inline error display and submit pending state. Fields:
  - `name` (required, text)
  - `companyId` (required, native `<select>` populated from companies; `<Input>` primitive is text-only, so the select is hand-styled with matching tokens — same border/focus treatment as Input)
  - `stage` (native select from `DEAL_STAGES`, default `discovery`)
  - `amount` (optional, number)
  - `closeDate` (optional, date)
- Cancel button is a ghost-variant `<Button asChild>` wrapping a `<Link>` back to `/pipeline`.

**Nothing-is-flat discipline check for Day 2.** Every primitive inherits its Day-1 treatment. New surfaces:

- `PipelineViewToggle` buttons — ghost variant; active state gets `bg-surface text-primary shadow-sm` (shadow not missing; the non-active state sits on `bg-muted` which itself provides contrast).
- `DealCard` — `shadow-sm` by default; no hover lift (cards live inside a `bg-muted` column whose own elevation reads as the lift; stacking two shadows reads as muddy). Documented in component comment.
- Kanban column `<section>` — `bg-muted` + `border border-subtle` + `rounded-lg`. No shadow — intentional; the DealCards inside carry the shadow; the column is the container.
- Native `<select>` elements in the form — reuse Input's exact class string for border + focus + padding so they inherit the `--ring-focus` treatment.

Two deliberate omissions, both called out here per the discipline check:
- **`DealCard` ships without hover lift.** Reason: stacking a second shadow on a card already inside a shadowed column reads as muddy. Will revisit when deal-detail click-through lands (Day 3); by then the card has a "view deal" affordance that deserves hover feedback.
- **Kanban column container ships without shadow.** Reason: same — elevation lives on the inner DealCards, not the outer column.

**Enum single-sourcing — all 5 done.** Day-1 extracted 4 (vertical, meddpicc_dimension, odeal_category, contact_role). Day-2 completes the set with deal-stage. No more `pgEnum(...)` declarations hand-write their value lists except the structural ones (`job_status`, `job_type`, `hubspot_object_type`, `person_link_method`, `experiment_lifecycle`) that have no shared-package counterparts yet.

**Verification at end of Day 2:**

- `pnpm typecheck` — 4/4 PASS (1.7s).
- `pnpm build` — 11 routes, 7.4s. New: `/pipeline/new` (3.31 kB). `/pipeline` grew 142 B → 2.95 kB because of the client `PipelineViewToggle` + client `DealCreateForm` (shared chunk rebalancing).
- Inline hex grep in `apps/web/src/*.{ts,tsx}` — 0 hits.
- Stale shadcn placeholder-class grep — 0 hits.
- `pnpm --filter @nexus/db generate` — *No schema changes, nothing to migrate.*
- Migration 0004 idempotent: re-running the applicator reports `already reconciled — no-op.`
- Every client-component file under 200 LOC.

**Cost.** HubSpot API: 2 calls (GET + PATCH on `nexus_role_in_deal` options). Supabase: one ALTER TYPE RENAME VALUE. No Claude calls.

### Phase 2 Day 3 (deal detail + MEDDPICC edit — expected)
- Deal detail page skeleton at `/pipeline/:dealId` with `overview` tab (MEDDPICC/stakeholders/activity tabs land Day 4 per scope tightening).
- MEDDPICC edit UI reading/writing through a new `MeddpiccService` that writes to the Nexus `meddpicc_scores` table. HubSpot custom-property write lands in Phase 3 Day 2 via `CrmAdapter.updateDealCustomProperties`.
- Add kanban filter chips (stage multi-select, vertical filter).
- Revisit `DealCard` hover lift now that deal-detail click-through exists (Day 2 deferred the hover treatment pending a click target).
- Promote `listContacts`, `getContact`, `updateContact*`, `listDealContacts` from `not_implemented` — needed by the stakeholder preview on the overview tab even if full mgmt UI waits to Day 4.

### Phase 2 Day 4 (stakeholders + stage change + polish — expected)
- Stakeholder management UI — adds/removes contacts, assigns roles via `deal_contact_roles`. Consumes `setContactRoleOnDeal` adapter method (promote from stub).
- Kanban DnD stage change via `@dnd-kit/core` or similar — drag a DealCard column-to-column. Writes `CrmAdapter.updateDealStage`; `deal_events` `stage_changed` event append lands Phase 3 Day 2 when event stream wiring arrives.
- Dropdown stage change UI on deal detail + in PipelineTable row context menu.
- Close Won / Close Lost outcome stubs (close-lost interview is Phase 5).
- Promote remaining adapter CRUD stubs as features require (`upsertContact`, `upsertCompany`, `updateContact`, `updateCompany`, `deleteContact`, `deleteCompany`, `deleteDeal`).

### Pre-Phase 4 (hero-page design — expected)
- Run dedicated Claude Design sessions for hero pages (`/intelligence`, `/book`, call-prep card, close-analysis output). Export mockups to `docs/design/mockups/` and reference them in Phase 4+ kickoff prompts. Phase 2–3 proceed from `docs/design/DESIGN-SYSTEM.md` tokens alone; hero-page compositions need Mode 2 design work per DECISIONS.md 3.2. Decision to run this in Claude Design (Anthropic's design product) rather than Claude Code.
- **Data-viz palette** for the Phase 4 intelligence dashboard (pattern counts, rep comparisons, experiment attribution). DESIGN-SYSTEM.md doesn't specify chart colors; extract during the hero-design session as a new token family (likely graphite-300 → signal-500 gradient + semantic success/error reuse). Add to DESIGN-SYSTEM.md before Phase 4 Day 1 implementation.

### Phase 3 Day 1 (AI features — expected)
- Consolidate dotenv loading into `packages/shared/src/env.ts` helper (`loadDevEnv()` with `override: true` by default) so every Claude-calling script invokes one function. Until then, copy-paste the pattern per §2.13.1. Day-5's `packages/db/src/scripts/hubspot-env.ts` is the local precedent; move it when shared helper lands.
- **Add `prompt_call_log` table (DECISIONS.md §2.16.1 decision 3)** and wire the Claude wrapper to persist its stderr telemetry. One row per Claude call: `prompt_version, model, temperature, input_token_count, output_token_count, duration_ms, stop_reason, deal_id, job_id, created_at`. Pulled forward from Phase 4 for corpus-intelligence preservation.

### Phase 3 Day 2 (transcript pipeline — expected)
- **`01-detect-signals` reasoning_trace addition + version bump** per §2.13.1. Pre-execution step on Phase 3 Day 2 kickoff.
- `04-coordinator-synthesis` max_tokens at 2500 — watch for `stopReason=max_tokens` on many-deal patterns when the coordinator synthesis job runs; bump when seen.
- Transcript pipeline wiring replaces Day 4's fixture context stubs (`contactsBlock`, `meddpiccBlock`, etc.) with real output from `DealIntelligence.formatMeddpiccForPrompt`, `CrmAdapter.getContactsForDeal`, `TranscriptPreprocessor.getCanonical`, `IntelligenceCoordinator.getActivePatterns`.
- Worker retry policy — currently `attempts` is incremented on claim but failed jobs aren't re-queued. Phase 3 defines the retry/backoff policy (up to 3 attempts with backoff per §4.5).
- Worker concurrency model — currently one-job-per-invocation. Phase 3 may switch to loop-until-empty or bounded concurrency if transcript pipelines demand higher throughput.
- Wrapper retry-on-protocol-violation — decide when transcript pipeline demands it. Current behavior throws immediately, which is correct for isolated prompts but may be wrong for multi-step pipelines where one flaky response shouldn't fail the whole job.
- Wire `CrmAdapter.updateDealCustomProperties` (currently not_implemented, targeted Phase 3 Day 2 in the stub message). Transcript pipeline Step 4 writes MEDDPICC + fitness + lead-score into HubSpot through this single batched call per 07C §7.5.
- **Corpus-intelligence preservation batch** per DECISIONS.md §2.16.1 decisions 1, 4, 5: add `transcript_embeddings` table + pgvector, embedding step on the transcript pipeline, verify speaker-turn preservation in `analyzed_transcripts`, ensure signal-detection tool schema adds `assertions_made` cleanly as a backward-compatible minor version.
- Consider adding `deal.associationChange` → Nexus `deal_events` emission when Phase 3 wires intelligence consequences. The webhook subscription is already live (one of the 6 anticipatory additions on Day 5).

### Phase 4 Day 1 (intelligence surfaces — expected)
- **`deal_events.event_context` required column** per DECISIONS.md §2.16.1 decision 2. One migration adds the JSONB column; every event-append writes a snapshot of `{vertical, deal_size_band, employee_count_band, stage_at_event, active_experiment_assignments}` captured from `hubspot_cache` + active state.

### Phase 4 Day 2 (coordinator + intelligence — expected)
- `coordinator_synthesis` job handler wires through the wrapper; reasoning_trace already present on the #04 prompt.
- Periodic `hubspot_sync` job handler via `pg_cron` every 15 min per 07C §7.5. Calls `bulkSyncDeals/Contacts/Companies({ since: lastSyncAt })` through the adapter; writes `lastSyncAt` to a single-row `sync_state` table (new migration). Reconciles any webhook delivery that HubSpot retried-exhausted.

### Phase 5 Day 1 (agent layer kickoff — expected)
- **`03-agent-config-proposal` reasoning_trace move to first position + version bump** per §2.13.1. Pre-execution step on Phase 5 Day 1 kickoff.
- **`06a-close-analysis-continuous` reasoning_trace decision** per §2.13.1. Review then; default is leave-as-is.
- **`08-call-prep-orchestrator` reasoning_trace decision** per §2.13.1. Review then; if first call-prep runs show incoherent section integration, add it.
- `07-give-back` max_tokens at 600 — aggressive for structured envelope; bump if `stopReason=max_tokens` lands in practice.
- `08-call-prep-orchestrator` max_tokens at 4000 — tight for 10+ nested sections; likely needs a bump when the orchestrator runs against real context.
- Tighten RLS policies on `agent_config_proposals` and `field_queries` (currently conservative read-all-authenticated per §2.2.1). Phase 5's UI surfaces the access patterns that inform the tighter scoping.
- Verify `readiness_fit` column set when wiring Deal Fitness UI. §2.2.2 documented that v2 elides v1's `_detected` and `_total` count columns (derived from `deal_fitness_events` instead). Confirm the UI's "N/M detected · pct%" pill reads the events table.
- **Z-index scale in DESIGN-SYSTEM.md.** Phase 5's first modal/popover surfaces the need; add a token family before the component lands (modal > popover > toast > sidebar > base).

### Pre-landing (as-needed — expected)
- **Skeleton/loading token in DESIGN-SYSTEM.md.** Day 1 used `bg-muted` + opacity pulse as the pragmatic default in no-data states. When the second loading surface (e.g., table skeleton for pipeline / async deal-detail) lands, extract as a dedicated token.

### Out of scope for v1 (locked — do not ship)
Per DECISIONS.md 1.8, 1.11, 1.12: role-based permissions, multi-tenancy, guided tour, the eight "future state capabilities," admin threshold-configuration UI, leadership feedback surfacing, dead pages (`/agent-admin`, `/team`, `observations-client.tsx`).

---

## Open questions awaiting resolution

_(None currently — all open questions from Days 1–5 + Phase 2 Days 1–2 have resolved into DECISIONS.md amendments 2.2.1, 2.2.2, 2.6.1, 2.13.1, 2.16.1, 2.18.1 or are calendared as parked items above.)_

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
- **HubSpot webhook signature verification uses the private app's `HUBSPOT_CLIENT_SECRET`** (HMAC-SHA256 over `method + uri + body + timestamp`, base64-encoded). There is NO separately-generated "webhook secret" — HubSpot signs with the client secret directly. 07C §5.5 was ambiguous; `.env.example`'s `HUBSPOT_WEBHOOK_SECRET` was retired on Day 5.
- **HubSpot v3 Properties API `fieldType` values are `text` / `textarea` / `number` / `date` / `select` / `radio` / `checkbox` / `booleancheckbox` / `phonenumber` / `html` / `file` / `calculation_equation`** — NOT the `single_line_text` / `multi_line_text` / `datetime` values in 07C §3. The `HubSpotFieldType` TS union in `packages/shared/src/crm/hubspot/properties.ts` is the single source of truth; consult it before adding new properties.
- **HubSpot custom-property labels must be globally unique across native + custom fields** on the target portal. `nexus_linkedin_url` with label `"LinkedIn URL"` collided with native `hs_linkedin_url`. Convention going forward: prefix any ambiguous custom label with `"Nexus "` (internal name unchanged). Day-5 hit this once; watch for it on future `nexus_*` property adds.
- **HubSpot private-app webhook subscriptions are UI-only.** 07C §5.3's `POST /webhooks/v3/{appId}/subscriptions` pattern returns 401 for private-app Bearer tokens. Per HubSpot's current docs: *"Managing your private app's webhook subscriptions via API is not currently supported. Subscriptions can only be managed in your private app settings."* The `subscribe:hubspot-webhooks` script prints the canonical 12-row list + `https://app.hubspot.com/private-apps/{portalId}/{appId}/webhooks` URL so an operator can paste/click through. Takes ~5 minutes. Rotation/updates = same UI flow.
- **HubSpot webhook signature verification uses `VERCEL_PROJECT_PRODUCTION_URL`, NOT `VERCEL_URL`.** HubSpot signs with the URL it was configured to call (the stable production alias from the private-app's Webhooks tab), not the per-deployment URL that `VERCEL_URL` returns. The webhook route's `canonicalHost` fallback chain is `VERCEL_PROJECT_PRODUCTION_URL → NEXT_PUBLIC_SITE_URL → req.url host`. If a future deploy breaks signature verification, check the webhook-target URL in the private-app config AGAINST what the route computes (log `canonicalHost` temporarily).
- **Config artifacts that must travel with the serverless bundle (e.g., `pipeline-ids.json`) must be imported, not `readFileSync`'d.** Vercel's Next.js serverless bundler does not automatically copy files adjacent to compiled route modules. Use `import file from "./foo.json" with { type: "json" }` so the JSON inlines at build time.
- **`HUBSPOT_APP_ID` is distinct from `HUBSPOT_PORTAL_ID`.** Portal ID is the account/hub ID (e.g., `245978261`); App ID is the private app's numeric ID (e.g., `37398776`), visible in the settings URL `https://app.hubspot.com/private-apps/{portalId}/{appId}`. Both required in env — portal ID for webhook event parsing + adapter construction, app ID for the subscribe script's UI link printer.
- **HubSpot Starter tier has NO custom association labels.** Per-deal contact roles (champion, economic_buyer, etc.) live in the Nexus `deal_contact_roles` table, NOT as HubSpot association labels. Only the HubSpot-defined "Primary" label is available. Phase 2 Day 2's `listDealContacts` / `setContactRoleOnDeal` implementations honor this split per 07C §4.3.
- **Tailwind 3 hex scales don't support opacity utilities.** `bg-graphite-600/40` won't work because tokens are baked as hex (not `rgb(... / <alpha-value>)`). Alpha cases land as NEW semantic tokens in DESIGN-SYSTEM.md first (e.g., `--ring-focus` is the pre-baked `signal-600 @ 15%` value the Input primitive uses for its focus ring). Never inline-hack opacity into component code.
- **Geist fonts do NOT come from `next/font/google` on Next 14.2.29.** Despite DESIGN-SYSTEM.md §10.3 suggesting the `google` path, the Next catalog rejects `"Geist"` / `"Geist Mono"` at build time with `Unknown font`. Use the `geist` npm package: `import { GeistSans } from "geist/font/sans"; import { GeistMono } from "geist/font/mono"`. Instrument Serif remains on `next/font/google`. CSS variables (`--font-geist-sans`, `--font-geist-mono`, `--font-instrument-serif`) are preserved.
- **Design-token three-layer consumption is the contract** (DECISIONS.md 2.22 / Guardrail 34 applied structurally). Layer 1: hex scales in `tailwind.config.ts` — utilities like `bg-graphite-900` resolve directly to hex. Layer 2: CSS custom properties in `globals.css :root` — `--bg-surface`, `--text-primary`, `--border-subtle`, `--ring-focus` etc. point at Layer 1 values, and are the seam where a future dark-mode theme flips. Layer 3: Tailwind extends `backgroundColor`/`textColor`/`borderColor` with wrappers around Layer 2 vars so semantic utilities (`bg-surface`, `text-primary`, `border-subtle`) are first-class classes. Components reach for semantic utilities by default; raw Layer-1 scales only where the design explicitly demands them (e.g., `bg-signal-600` for the active-nav marker, `bg-graphite-900` for primary buttons). Hex never appears in component files.
- **"Nothing is flat" enforced at primitive default, not at composition site.** Every primitive that can carry a shadow/hover/focus treatment does so in its default variant; composing code need not re-specify. If a future primitive lands without its treatment, the end-of-day report calls it out by name ("Card shipped without shadow because X") — silent omission is not allowed.
- **Handoff files at `~/nexus/docs/handoff/source/prompts/` and `~/nexus/docs/handoff/04C-PROMPT-REWRITES.md` can be edited with explicit Jeff approval when drift between the rewrites and v2 canonical schema is discovered.** Each edit bumps the prompt's front-matter version (e.g. `1.0.0 → 1.1.0`) and is recorded in DECISIONS.md §2.13.1 with rationale. Default CLAUDE.md constraint remains: no edits to `~/nexus` without approval. Day-2 ContactRole alignment (Phase 2 Day 2) is the first exercise of this policy; nexus commit `533d3eb` is the precedent.
- **drizzle-kit `generate` turns enum-value renames into `DROP TYPE` + `CREATE TYPE` by default.** That's destructive on any table that has the enum as a column type — Postgres refuses or cascades. For a simple value rename, hand-replace the generated SQL with `ALTER TYPE "<type>" RENAME VALUE '<old>' TO '<new>'` (atomic in PG 10+, ordinal-preserving). Day-2 migration `0004_shallow_kid_colt.sql` is the precedent. Apply via a one-off postgres-driver script (see `scripts/apply-migration-0004.ts`) rather than `drizzle-kit migrate` when using hand-replaced SQL, since drizzle-kit expects its own generator output.
- **Three-way drift pattern: canonical value lives in 3 places.** When the schema holds a canonical enum, check THREE downstream vectors before considering the alignment complete: (1) TypeScript types in `packages/shared/src/enums/`, (2) prompt rewrites in `~/nexus/docs/handoff/source/prompts/*.md` + `04C-PROMPT-REWRITES.md`, (3) HubSpot property options for any `nexus_*` property that expresses the same taxonomy. Day-2 ContactRole alignment uncovered drift in all three vectors; future taxonomy changes must grep all three surfaces.
- **Opacity cases that DO need a specific alpha value land as baked-rgba CSS variables.** Day-1 precedent: `--ring-focus: rgba(61, 72, 199, 0.15)` is signal-600 @ 15% for Input's focus ring, referenced via `focus:shadow-[0_0_0_3px_var(--ring-focus)]`. Day-2 native `<select>` form elements reuse the same treatment. Add new baked-rgba tokens to `globals.css :root` alongside semantic aliases when justified; document the use case.
- **Supabase Auth URL Configuration must be set to production** for production logins. Dashboard → Auth → URL Configuration → **Site URL** = `https://nexus-v2-five.vercel.app`. **Redirect URLs** list carries both the production callback (`https://nexus-v2-five.vercel.app/auth/callback`) AND the localhost callback (`http://localhost:3001/auth/callback`) for dev. Contract locked in DECISIONS.md §2.1.1.
- **Magic-link `emailRedirectTo` must be explicit AND `NEXT_PUBLIC_SITE_URL` must be set on Vercel.** `apps/web/src/lib/env.ts`'s `env.siteUrl` getter falls through `NEXT_PUBLIC_SITE_URL` → `VERCEL_PROJECT_PRODUCTION_URL` → `VERCEL_URL` → `http://localhost:3001`. Missing `NEXT_PUBLIC_SITE_URL` on Vercel causes the server action to emit `http://localhost:3001/auth/callback` as the redirect target; Supabase rejects the HTTPS → HTTP downgrade and falls back to Site URL **root**, stranding users at `/?code=<code>`. Landing page `/` now forwards stray `?code=` to `/auth/callback` as defense-in-depth. **Required fix once per deployment:** set `NEXT_PUBLIC_SITE_URL=https://nexus-v2-five.vercel.app` on Vercel across Production + Preview + Development scopes, then `npx vercel env pull` to update `.env.local`.
- **Updating seed user emails for demo personas — the SQL pattern.** Both `auth.users` and `public.users` must be updated for magic-link auth to route to the new email. Example for Sarah → Jeff's Gmail:
  ```sql
  UPDATE auth.users   SET email = 'jeff.lackey97@gmail.com' WHERE email = 'sarah.chen@nexus-demo.com';
  UPDATE public.users SET email = 'jeff.lackey97@gmail.com' WHERE email = 'sarah.chen@nexus-demo.com';
  ```
  Confirm via `SELECT id, email FROM auth.users WHERE email = '<new>';` and the corresponding `public.users` row. Missing the `public.users` update breaks RLS-scoped queries (the user authenticates but the app-side user row doesn't match, so row-level reads fail). The `users.id` FK to `auth.users.id` is not touched — only the `email` column.
- **Supabase rate-limits magic-link emails to one per ~35 seconds per address.** Expected behavior (prevents token-spam). Requesting a second magic link inside that window returns a 429-equivalent ("For security purposes, you can only request this after 35 seconds"). During debugging, wait out the window or rotate to a second seed persona (e.g., Marcus's Gmail) rather than hammering the same address. Supabase's built-in SMTP also rate-limits at **2 emails/hour** for the default dev sender — production replaced this with Resend SMTP (configured in Supabase dashboard → Auth → SMTP Settings).
- **Never pass function / component references as props across the Server→Client Component boundary.** Next.js 14 RSC rejects these with `"Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with 'use server'"`. Day-2 Sidebar (server) passed lucide icon components into NavLink (client) as an `icon: ComponentType` prop. Build succeeded but `/dashboard` + `/pipeline` + `/jobs-demo` (everything under `(dashboard)/layout.tsx`) crashed at request time with digest `2115725996` the moment a real session rendered. Fix: pass a serializable **string identifier** (`iconName: "dashboard" | "pipeline"`) and resolve the component inside the client boundary via a `Record<string, LucideIcon>` map. General rule: if a prop holds a function, it must be a Server Action (`"use server"`) or nothing. Everything else crossing the boundary must be JSON-serializable.
- **New auth-gated surfaces must be exercised with a real browser session + real user BEFORE end-of-day sign-off.** Day-1 `/dashboard` shipped with the latent icon-prop bug because the only test was a CLI script that bypassed browser rendering. Day-2 added three more surfaces under the same `(dashboard)/layout.tsx` (which wraps Sidebar); all three inherited the latent bug. Verification going forward: every end-of-day that adds or touches an auth-gated surface runs at minimum `https://nexus-v2-five.vercel.app/<route>` in an incognito window with a real magic-link session. CLI smoke tests are a cheap sanity check, not a substitute.
- **`auth.users` + `public.users` drift risk when updating seed personas.** Email changes must update BOTH tables (see SQL pattern above). FK is `public.users.id → auth.users.id` — keyed by ID, never email. All future user queries must join on `id`, not email. If a future feature needs to look up users by email, it MUST query `auth.users.email` (via service-role client) — NOT `public.users.email` — to avoid drift. Adding a `UNIQUE` constraint on `public.users.email` is candidate follow-up work if email-based lookups become necessary; today's auth path keys entirely on `auth.uid()`.
- **`/dashboard` sign-out server action uses `const { redirect } = await import("next/navigation")` instead of a top-level import.** Works, but unusual — the dynamic import was a Next-13-era workaround no longer needed. Harmless but confusing; clean up next time this file is touched.

---

## Context for next session

**What's built.** Monorepo scaffolded, deployed to Vercel production at `https://nexus-v2-five.vercel.app` and auto-deploying on push to `main`. Supabase schema complete (38 tables, 31 enums, 49 RLS policies, 5 migrations). Authenticated dashboard works via Supabase Auth magic links; cross-user RLS proven. Background job infrastructure (`jobs` + `job_results` + `pg_cron` every 10s + Supabase Realtime) live. Unified Claude wrapper at `@nexus/shared/claude` loads `.md` prompt files from `@nexus/prompts`, forces `tool_use` responses, retries transport errors, emits telemetry. First ported prompt (`01-detect-signals`) integration-tested. 14 demo users seeded. **Phase 1 Day 5** added the full CRM layer: `CrmAdapter` interface + `HubSpotAdapter` (14 live methods + 17 stubs), webhook receiver with HMAC-SHA256 signature verification, rate-limited HTTP client, `hubspot_cache` read-through, `/pipeline` page. Live HubSpot portal (`245978261`): Nexus Sales pipeline + 9 stages, 38 `nexus_*` custom properties, 18 webhook subscriptions, MedVista Epic Integration. Stage-change round-trip 3–4s under 15s SLA. **Phase 2 Day 1** added the Graphite & Signal design system: three-layer token consumption, Geist + Instrument Serif loading, seven shadcn primitives reskinned with nothing-is-flat defaults, declarative route registry, server-rendered Sidebar + AppShell, five existing routes migrated. Four `pgEnum` tuples single-sourced to `packages/shared/src/enums/`. **Phase 2 Day 2** closed the enum loop: `DealStage` extracted (5/5 enums now canonical); migration `0004` reconciled `deal_stage` (`prospect` → `new_lead`) via ordinal-preserving `ALTER TYPE RENAME VALUE`. ContactRole three-way drift (schema / prompt rewrites / HubSpot property) resolved to 9-value canonical via Path B (aligned prompts + HubSpot property to schema). `listCompanies` promoted to live. `/pipeline` gained view toggle (table ⇄ kanban) + "New deal" Button + created-flash banner. `/pipeline/new` ships deal-creation form writing through `CrmAdapter.createDeal`. 11 routes total.

**What's next and how to pick up.** Phase 2 Day 3 — deal detail page skeleton at `/pipeline/:dealId` with the overview tab, MEDDPICC edit UI (writes Nexus `meddpicc_scores`; HubSpot custom-property write lands Phase 3 Day 2). Promote contact-side CRUD stubs (`listContacts`, `getContact`, `updateContact*`, `listDealContacts`) as needed. Revisit `DealCard` hover lift now that deal-detail click-through exists. Orienting triad unchanged: **`docs/DECISIONS.md`** (constitution + amendments 2.2.1, 2.2.2, 2.6.1, 2.13.1, 2.16.1, 2.18.1) + **`docs/BUILD-LOG.md`** (this file) + **`CLAUDE.md`** (bootstrap). Read that triad before touching code. The primitive library under `apps/web/src/components/ui/`, the three-layer token scheme in `tailwind.config.ts` + `globals.css`, and the shared `stage-display.ts` helpers in `apps/web/src/components/pipeline/` are the contracts for all Phase 2+ UI — reach for semantic utilities (`bg-surface`, `text-primary`, `border-subtle`) by default; raw scales (`bg-signal-600`, `bg-graphite-900`) only when the design explicitly demands them. `PRODUCTIZATION-NOTES.md` is strategic reference only — not required reading for build-day sessions.
