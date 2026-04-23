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

## Current state (as of 2026-04-22 — Pre-Phase 3 Session 0-A complete)

- **Phase / Session completed:** Pre-Phase 3 Session 0-A — DECISIONS.md amendments (§2.13.1 signal_type + MEDDPICC canonical; §2.16.1 decisions 1, 2, 3 shape locks) + PRODUCTIZATION-NOTES.md Stage 3 URL transition note. Doc-only. Sits between Phase 2 Day 4 Session B and the Session 0-B migration work.
- **Phase 2 status:** Days 1–4 Sessions A and B complete and shipped. Session C (deal summary edit) and Session D (polish) deferred until after Pre-Phase 3 fix work per `docs/PRE-PHASE-3-FIX-PLAN.md` §7.
- **Latest commit on `main` (nexus-v2):** `b1d5a7b docs(pre-phase-3-session-0-a): shape locks + strategic amendments`.
- **Prior meaningful commits (chronological):** `1781780 feat(phase-2-day-4-session-b)` → `5739522 docs: update build log current-state with Session B HEAD` → `684ae88 docs: persist pre-Phase-3 foundation review` → `49a929f docs: pre-Phase-3 fix plan + oversight-handoff retirement + CLAUDE.md staleness fixes` → `b1d5a7b` (Session 0-A).
- **Companion commit on `main` (nexus — frozen handoff):** `533d3eb docs(prompts): align ContactRole taxonomy to 9-value schema canonical` — unchanged since Phase 2 Day 2.
- **Vercel production:** Still on `e0ef9b2` (no Session B deploy triggered; no code changes since). Pre-Phase 3 Sessions are doc + schema/infra; Vercel redeploys when Session 0-B's factory migration ships.
- **Live HubSpot portal state (`245978261`):** Unchanged from Session B end-of-report — pipeline `2215843570` + 9 stages; MedVista Epic deal `321972856545` at `discovery`; both contacts attached (Michael champion + Priya decision_maker); 38 `nexus_*` custom properties (Session 0-C adds the 39th: `nexus_meddpicc_paper_process_score`); 18 webhook subscriptions.
- **Live Supabase DB:** Unchanged — migration set at 0000–0004. Session 0-B adds migration 0005 bundling 9 schema changes (prompt_call_log, transcript_embeddings skeleton, deal_events.event_context, experiments.vertical, fitness_velocity enum, sync_state, experiment_attributions.transcriptId FK, deal_events composite index, observations.signal_type nullable, confidence_band comment).
- **Next session scheduled:** Pre-Phase 3 Session 0-B per `docs/PRE-PHASE-3-FIX-PLAN.md` §4.2 — migration 0005 + shared postgres.js pool + mapper VERTICAL import + pipeline page Promise.all + demo-reset manifest skeleton. Does not start until Jeff green-lights.

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

### Phase 2 Day 2 hotfix cycle — 2026-04-22 · `2779517` → `2b41c4c` → `6a77782`

Three out-of-band hotfixes landed between Day 2 sign-off and Day 3 kickoff. All three were surfaced by real-browser verification against prod that was not part of Day 2's end-of-day check. Same root pattern as Phase 1 Day 5's "CLI test bypassed the SSR path" finding, now confirmed as a repeat class of gap.

**Hotfix 1 — `2779517 fix(auth): harden siteUrl resolution + forward stray ?code= from /`.** Never reflected in the Current-state block through Day 2's end-of-day update; carried silently. Hardens `env.siteUrl` fallback chain and forwards magic-link callbacks that Supabase routes to `/?code=` instead of `/auth/callback`. Fix-class: env / auth plumbing. Documented in operational notes already.

**Hotfix 2 — `2b41c4c fix(nav): resolve RSC icon-prop crash on /dashboard + /pipeline`.** Same omission: never reflected in Current-state through Day 2's end-of-day update. Sidebar (server) passed `lucide-react` icon components into `NavLink` (client) as `icon: ComponentType` props; Next.js 14 RSC rejects non-serializable function props at the server→client boundary. Build was clean; runtime crashed with digest `2115725996` for any auth-gated route under `(dashboard)/layout.tsx` — four routes (`/dashboard`, `/pipeline`, `/pipeline/new`, `/jobs-demo`). Fix: pass a serializable string `iconName` + resolve the component through a `Record<NavIconName, LucideIcon>` map inside the client boundary.

**Hotfix 3 — `6a77782 fix(pipeline): useActionState → useFormState for React 18 compat`.** Resolves **both** Bug 1 (`/pipeline` kanban-toggle client-side exception, no digest) and Bug 2 (`/pipeline/new` server-side exception, digest `4100064979`) via a **single shared root cause**. `DealCreateForm` imported `useActionState` from `"react"` — a **React 19-only hook**. On React 18.3 (Next 14.2.29 ships with React 18) the import resolves to `undefined` at runtime. The `pnpm build` output since Day 2 had been emitting a compile warning — `Attempted import error: 'useActionState' is not exported from 'react' (imported as 'useActionState')` — that was the fingerprint. Day 2's end-of-day sign-off did not grep the build output for warnings.

- **Bug 2 — direct manifestation.** Server-side render of `DealCreateForm` calls `useActionState(action, {})`. `undefined(...)` throws `TypeError`. `/pipeline/new` returns 500 with digest `4100064979`.
- **Bug 1 — indirect manifestation via prefetch poisoning.** The "New deal" `<Button asChild><Link href="/pipeline/new">` on `/pipeline` auto-prefetches `/pipeline/new` on viewport / idle. With Bug 2 present, the prefetch response was the server-crash payload, stored in Next's client `prefetchCache`. When the user clicked Kanban (triggering `router.push("/pipeline?view=kanban")`), router-state reconciliation accessed the poisoned prefetch entry and threw client-side — hence "no digest" (client errors don't carry digests).

Fix is a single file: `useActionState` (React 19) → `useFormState` from `"react-dom"` (React 18). Signature matches for the two return values we use. Type import unchanged. The shared root cause means a single commit closes both bugs — Jeff's "one commit per bug" guidance was followed in spirit: one commit per root cause.

**Verification — Playwright against live prod on `6a77782`.** Bypassed the 35s magic-link rate limit by using the Phase 1 Day 2 pattern (`admin.generateLink → verifyOtp` with an in-memory cookie jar via `@supabase/ssr`), then injected the resulting Supabase auth cookies into a headless Chromium context via `context.addCookies({ domain: "nexus-v2-five.vercel.app", ... })`. Browser sequence:

1. GET `/pipeline` → `h1 = "Pipeline"`, no "Application error" text, table view renders, MedVista Epic Integration visible.
2. Click the Kanban toggle radio → URL transitions to `?view=kanban`, kanban columns render with `"New Lead"`, `"Qualified"`, `"Discovery"` etc. visible. **Zero browser console errors post-click. Bug 1 gone.**
3. GET `/pipeline/new` → `h1 = "New deal"`, form renders with all five fields (`name`, `companyId`, `stage`, `amount`, `closeDate`) plus the `$ACTION_*` server-action hidden metadata Next.js injects. No application-error overlay. **Bug 2 gone.**

Playwright scaffolding was installed as a dev dep of `@nexus/db` for this cycle and **uninstalled after verification** (see operational notes below for the recommended long-term shape). A temporary dev-only `/api/dev-login` helper route was also used for local (not prod) verification of the fix pre-deploy; deleted before the commit.

**Day 2 end-of-day gap.** Three distinct latent bugs shipped under a "Day 2 verification passed" sign-off. Shared premise: the end-of-day check trusted `pnpm typecheck` + `pnpm build` + a CLI `curl`/script smoke test, none of which exercises SSR of a React client component with a real authenticated session under the production bundle. Build warnings ("Attempted import error") were not surfaced. The three fixes together cost an estimated half-day of debug and three extra Vercel deploys; the preventive cost is small — see operational notes.

**Phase 2 Day 3 unblocked.** Kanban toggle works, deal-creation form renders. Scope of Day 3 unchanged (deal detail page skeleton + MEDDPICC edit UI); proceeds when Jeff green-lights.

### Phase 2 Day 3 — 2026-04-22 · `e0ef9b2`

**Three workstreams shipped in one commit.** Scope-tightened per the kickoff — deal detail + MEDDPICC edit + contact-adapter promotions. Kanban filter chips and `DealCard` hover-lift explicitly deferred to Day 4.

**Contact-side adapter promotions (4 methods).** All four followed Day 5's `listDeals` + Day 2's `listCompanies` precedent: cache read-through, rate-limited HTTP client (shared), error-class mapping, cache writes on every hit.

- **`getContact`** — 60-min cache (CRM `CACHE_TTL_MS.contact`) → falls back to `GET /crm/v3/objects/contacts/{id}` with `properties=CONTACT_PROPS_TO_FETCH&associations=companies`. Mirrors `getCompany` byte-for-byte.
- **`updateContact`** — PATCH with the Day-5 field→property mapping (firstName→firstname, lastName→lastname, email, phone, title→jobtitle, linkedinUrl→nexus_linkedin_url). `companyId` changes throw `CrmValidationError` — associations-API territory, promoted Phase 3 Day 2. No-op returns `getContact` so the shape is always current.
- **`listContacts`** — `POST /crm/v3/objects/contacts/search` with optional `email` + `associations.company` filter clauses, ascending-lastname sort, cache-write per result.
- **`listDealContacts`** — `GET /crm/v3/objects/deals/{id}/associations/contacts` → fan-out `getContact(id)` per ID (benefits from the per-contact cache). Nexus `deal_contact_roles` read via `this.sql` supplies `role + isPrimary` per HubSpot Starter's one-label-only constraint (DECISIONS.md 2.18 / 07C §4.3). Empty deal-contact associations short-circuit return `[]`.

Remaining not_implemented stubs — `upsertContact`, `updateContactCustomProperties`, `setContactRoleOnDeal`, `deleteContact` — unchanged; phase tags in the stub messages already point at Day 4 / Phase 3 Day 2.

**MeddpiccService — the first purely-Nexus service.** `packages/shared/src/services/meddpicc.ts`. Class wraps `postgres.js` directly (consistent with other server modules that write raw SQL via postgres.js; avoids introducing `@nexus/db` as a cross-package dep into `@nexus/shared`). Methods:

- `getByDealId(dealId: string): Promise<MeddpiccRecord | null>` — single-row lookup on `hubspot_deal_id`.
- `upsert({dealId, scores, evidence}): Promise<MeddpiccRecord>` — ON CONFLICT DO UPDATE on `hubspot_deal_id`; overall score computed server-side as the rounded mean of present non-null dimension scores (`null` if all empty); evidence persisted as JSONB keyed by dimension name with empty strings stripped.
- `close(): Promise<void>` — releases the postgres pool when the service owns it (same `ownedSql` flag pattern as the adapter).
- Factory at `apps/web/src/lib/meddpicc.ts`: `createMeddpiccService()` returns a request-scoped instance using `env.databaseUrl`. Caller MUST `await service.close()`.

Single write-path contract (DECISIONS.md §2.10 / Guardrail 13 / Guardrail 15): the MEDDPICC edit flow never touches HubSpot today — Phase 3 Day 2's `updateDealCustomProperties` is the HubSpot-write seam. MeddpiccService is Nexus-local.

**Deal detail page at `/pipeline/[dealId]`.** `apps/web/src/app/(dashboard)/pipeline/[dealId]/page.tsx`. Dynamic route; `force-dynamic`; `maxDuration=30`. Four parallel fetches on the server:

- `adapter.getDeal(dealId)` — 404s via `notFound()` if missing.
- `adapter.listDealContacts(dealId)` — tolerates failure → `[]`.
- `MeddpiccService.getByDealId(dealId)` — may be null on first edit.

Then `adapter.getCompany(deal.companyId)` conditionally when `companyId` is present. Sections rendered server-side:

- **`DealHeader`** (`components/deal/DealHeader.tsx`, server) — back-link → `/pipeline`, deal name as `h1 text-3xl font-semibold`, company name as secondary, single-line meta row of `Badge(STAGE_VARIANTS[deal.stage])` + `formatAmount` + `Closes formatDate(closeDate)`.
- **`DealSummarySection`** (`components/deal/DealSummarySection.tsx`, server) — `<dl>` grid of vertical/product/lead source/primary competitor/domain/employees. Read-only today; Day-4 will add edit.
- **`StakeholderPreview`** (`components/deal/StakeholderPreview.tsx`, server) — primary-first + last-name sort. `Badge variant="signal"` for `Primary`, `Badge variant="slate"` for the role label (9-value `ROLE_LABELS` record matching `CONTACT_ROLE`). Empty state if no associations.
- **`MeddpiccEditCard`** (`components/deal/MeddpiccEditCard.tsx`, client) — 2-column grid of 8 dimensions; each dimension renders a number `Input` (0–10) + 3-row textarea in a matched-style block that reuses Input's focus ring treatment. Top-right `OVERALL` display of `current.overallScore` when non-null. `useFormState` from `react-dom` (NOT `useActionState` — lesson from the Phase 2 Day 2 hotfix cycle, enforced here). Submit is a `useFormStatus`-aware `<SubmitButton>`. `savedJustNow` prop shows a signal-tinted "MEDDPICC saved" banner. `dimensions: readonly MeddpiccDimension[]` received as a prop from the server page (see tree-shaking note below).

Server action `upsertMeddpiccAction` is inline in `page.tsx` with body-scope `"use server"` (precedent: `DealCreateForm` action). Flow: SSR `auth.getUser()` gate (401 short-circuit message in the form state — precedent: `/api/jobs/enqueue`) → parse 16 form fields (8 scores + 8 evidence) → validate each score is a 0–10 integer or empty → `MeddpiccService.upsert()` → redirect to `/pipeline/[dealId]?saved=1`. `NEXT_REDIRECT` is NOT caught — the redirect propagates by design.

`MEDDPICC_LABELS` + `MEDDPICC_HINTS` + score bounds live in `components/deal/meddpicc-display.ts` alongside the existing `stage-display.ts` pattern. One-line hint under each dimension label so reps don't have to recall the framework cold.

No tab chrome on today's detail page. Guardrail 39 — no placeholder UI for Day-4 features (stakeholder management, MEDDPICC-detail view, activity log).

**Click-throughs (pipeline → detail).**

- `PipelineTable` name cell wraps the deal name in a `<Link href="/pipeline/${hubspotId}">` with `after:absolute after:inset-0` — expands the click target to the whole `<tr>` without nesting `<a>` inside `<tr>` (invalid HTML).
- `DealCard` entire card is now a `<Link>`. Border transitions on hover (`hover:border-default` with the standard `duration-fast ease-out-soft`). Explicit hover-lift still deferred to Day 4 — layering a second shadow on a card already inside a shadowed column still reads muddy; revisit with a richer hover affordance (owner avatar, next-step hint) when those land.

**Webpack tree-shaking discovery — `sideEffects: false` on `@nexus/shared`.** The first build after adding `MeddpiccService` to the barrel failed: `Module not found: Can't resolve 'net'`. `MeddpiccEditCard` (client) imported `MEDDPICC_DIMENSION` as a runtime value from `@nexus/shared`; webpack traced the barrel into `./services/meddpicc.ts`, which imports `postgres`, which imports Node's `net`. Prior client-facing imports from `@nexus/shared` were all type-only (TypeScript erases them before webpack sees them) — no precedent guarded against the value-import case. Two-part fix:

1. **`"sideEffects": false`** in `packages/shared/package.json` — enables webpack to tree-shake unused re-exports out of the barrel.
2. **`MeddpiccEditCard` now receives `dimensions: readonly MeddpiccDimension[]` as a prop** from the server page that imports `MEDDPICC_DIMENSION`. The client file keeps type-only imports from `@nexus/shared`, so the runtime barrel trace is re-eliminated.

Rule for Day-4+ client components: **no runtime-value imports from `@nexus/shared`**. Types only (TypeScript erases them). Runtime values come in as props from the nearest server component. Operational note added with the pattern and the enforcement expectation.

**Dev-login local helper — promoted to permanent.** `apps/web/src/app/api/dev-login/route.ts`. Two guards, both required: `Host: localhost|127.0.0.1` AND `DEV_LOGIN_ENABLED=1`. Uses service-role admin (`listUsers` → `updateUserById({password: throwaway})` → SSR `signInWithPassword`) — no email round-trip, no 35-second magic-link rate limit, no OTP single-use lifecycle. Invalidates prior sessions on each call (intended; keeps preview tabs in a known state). `.env.example` documents `DEV_LOGIN_ENABLED=0` as the default with an explicit "never set on Vercel" note. Retire when the parked Pre-Phase 3 Day 1 Playwright + admin-cookie post-deploy smoke lands.

**RLS verification — Pattern D on `meddpicc_scores`.** `packages/db/src/scripts/test-rls-meddpicc.ts` proves the policy shape end-to-end (policy: `FOR SELECT TO authenticated USING (true)`; no INSERT/UPDATE/DELETE policies → default DENY for non-service-role):

- Sarah (authed anon client) INSERT → denied (Postgres `42501 insufficient_privilege`).
- Sarah authed anon UPDATE → 0 rows affected (policy filter).
- Service-role UPSERT → success (bypasses RLS by design).
- Sarah authed anon SELECT → success (read-all semantics).
- Marcus (different authed user) SELECT → success. Pattern D is not user-scoped — this is the intended read-all-authenticated behaviour, not an isolation violation.
- Cleanup via service-role.

Pattern proven + script kept as a permanent verification artifact (same precedent as `test-rls-cross-user.ts`). Re-run when RLS policies on `meddpicc_scores` change in the future.

**Verification at end of Day 3.**

- `pnpm typecheck` — 4/4 PASS (~1.3s).
- `pnpm build` — 13 routes, clean compile. `/pipeline/[dealId]` at 4.1 kB first-load JS. New permanent `/api/dev-login` at 0 kB (API route).
- **Build-warning signature grep** (new Day-3 discipline per the Pre-landing parked item from Phase 2 Day 2 hotfix cycle): `Attempted import error`, `Module not found`, `Type error`, `Failed to compile` — zero hits across the full build output.
- Inline hex grep in `apps/web/src/*.{ts,tsx}` — zero hits.
- Stale shadcn placeholder-class grep — zero hits.
- `pnpm --filter @nexus/db tsx src/scripts/test-rls-meddpicc.ts` — PASS (all six steps).
- Browser verification in incognito via `/api/dev-login?email=jeff.lackey97@gmail.com&next=/pipeline/321972856545`:
  - `/pipeline` renders → MedVista Epic Integration row link active → click routes to `/pipeline/321972856545`.
  - Detail page: `h1="MedVista Epic Integration"`, `MedVista Health` company line, `Discovery · $2,400,000 · Closes 2026-06-16` meta row. Summary shows `VERTICAL healthcare`, `PRODUCT claude_enterprise`, `LEAD SOURCE outbound`, `DOMAIN medvista-demo.example.com`, `EMPLOYEES 3,200`. Stakeholders shows Michael Chen (Chief of Surgery · michael.chen@medvista-demo.example.com).
  - MEDDPICC form rendered all 16 fields. Filled metrics=8, champion=7, identify_pain=6 + two evidence blocks → Save → redirected to `?saved=1` → banner visible → all three scores + evidence persisted on reload → `OVERALL 7` displayed (rounded mean).
  - `/pipeline?view=kanban` → all deal cards wrapped in `<Link>` to `/pipeline/[dealId]`.
  - Zero console errors throughout.

**Cost.** HubSpot API (cold cache, single deal detail view): 1 `getDeal` + 1 `getCompany` + 1 associations GET + 1 `getContact` fan-out per associated contact = 4 round trips. Cache-hit on reload collapses toward 1 (the associations GET is not cached today — candidate for Phase 3 optimization if detail views stay hot). Supabase: 1 SELECT + 1 UPSERT per MEDDPICC save. No Claude calls.

**Parked items closed.**
- `listContacts`, `getContact`, `updateContact`, `listDealContacts` — all four promoted from `not_implemented` to live.
- Deal detail page at `/pipeline/:dealId` — shipped.
- MEDDPICC edit UI — shipped.
- Kanban filter chips + `DealCard` hover-lift — **explicitly deferred** to Day 4 (not closed; moved into Day-4 expected).

**Parked items added.**
- **`/pipeline/:dealId` prefetch cost.** Each view is 4 HubSpot round trips (getDeal + getCompany + listDealContacts fan-out + Nexus MEDDPICC). Day 3 has one real deal in the pipeline; not a problem. When the pipeline fills with many rows, Next's `<Link>` auto-prefetch on hover/viewport can multiply this cost. Options: `prefetch={false}` on row links, or wrap the page body in a `<Suspense>` boundary with a skeleton fallback. Revisit when deal count grows (also tracked in Day-4 parked).
- **Enum-barrel consumption rule.** Runtime-value imports from `@nexus/shared` are **not allowed in client components** until the package is split into client-safe vs server-only sub-paths. Enforced by convention today (no value imports from client files); consider a lint rule in Pre-Phase 3 Day 1 alongside the post-deploy smoke. Precedent: the `net`-module webpack failure on MeddpiccEditCard's first build attempt.
- **`MeddpiccService` is the first of its kind — pattern for future Nexus-local services.** When Phase 3 adds `SignalService`, `ObservationService`, `DealIntelligenceService` etc., all should mirror MeddpiccService: postgres.js direct (not Drizzle), `class` with `{databaseUrl, sql?}` options, `close()` method, request-scoped factory in `apps/web/src/lib/`. Documented here rather than in a new guardrail so the pattern solidifies with usage first.

### Phase 2 Day 4 Session A — 2026-04-22 · *pending commit*

**Scope split.** Day 4 was originally 8 items; split into 4 sessions (A stakeholders, B stage change, C deal edit, D polish) to isolate failure modes. This entry covers Session A only.

**Four workstreams shipped in one commit.** `StakeholderService` + stakeholder management UI + 2 contact-side adapter promotions + 2 new Deal↔Contact association methods.

**`StakeholderService` — second Nexus-only service.** `packages/shared/src/services/stakeholders.ts`. Mirrors `MeddpiccService` template exactly: class wraps `postgres.js` directly, `{databaseUrl, sql?}` options for test-injection (also used by the adapter to borrow its pool — see `setContactRoleOnDeal`), explicit `close()`, request-scoped factory at `apps/web/src/lib/stakeholders.ts`. Methods limited to what today's UI calls — no speculative surface:

- `listForDeal(dealId)` — SELECT all rows for a deal.
- `add({dealId, contactId, role, isPrimary?})` — INSERT (unique constraint on `(hubspot_deal_id, hubspot_contact_id)`).
- `updateRole({dealId, contactId, role})` — UPDATE role + updated_at; throws if no row (caller checks via `listForDeal` first, or uses the adapter's `setContactRoleOnDeal` wrapper).
- `remove({dealId, contactId})` — DELETE.

Template generalizes cleanly; no forced-fit. MeddpiccService pattern confirmed as the canonical shape for Phase 3+ Nexus-only services.

**`deal_contact_roles` Pattern D RLS verified.** `packages/db/src/scripts/test-rls-deal-contact-roles.ts` — identical shape to Day-3's `test-rls-meddpicc.ts`. All 6 steps PASS: Sarah authed anon INSERT denied (`42501`), Sarah authed anon UPDATE filtered to 0 rows (status 204, no error), service-role UPSERT succeeded, Sarah SELECT returned the row, Marcus (different user) SELECT also returned it (read-all semantics confirmed not user-scoped), cleanup via service-role. Kept as permanent artifact per the Day-3 precedent.

**Contact-side adapter promotions (2 methods) per Session A scope.**

- **`upsertContact`** — email-based upsert. `listContacts({email, limit:1})` → if found, `updateContact` the existing row with firstName/lastName/email/title; else `createContact` with full input (including `companyId` if passed). Input widened to add `title?: string` so the inline "Create new" form can flow title through in one call (updateContact + createContact already accepted title — upsertContact was the odd one out in the CrmAdapter interface; flagged in Reasoning stub). Follows the find-then-act idempotency pattern established by Day 5's other search-based methods.
- **`setContactRoleOnDeal`** — thin wrapper that delegates to `StakeholderService` via a borrowed sql pool. `role === null` → `service.remove`. `role !== null` → branch on `listForDeal` + find → `updateRole` if existing, `add` if new. Starter-tier has no custom association labels per 07C §4.3, so the write goes entirely to Nexus `deal_contact_roles`, not HubSpot — adapter method exists for interface consistency (same seam SalesforceAdapter will eventually implement differently). **Guardrail 13 preserved**: StakeholderService is the single canonical write-path; the adapter method routes through it rather than duplicating raw SQL.

**Two NEW Deal↔Contact association methods on the adapter (beyond session's stated 2-stub promotion).** Surfaced during browser verification: `listDealContacts` reads HubSpot deal→contact associations first, then annotates with Nexus roles. Without a HubSpot-side association, a `deal_contact_roles` row is invisible to the UI. Adding + removing stakeholders therefore requires touching BOTH Nexus role metadata AND HubSpot association identity per §2.19 data boundary.

- **`associateDealContact(dealId, contactId, { isPrimary? })`** — `PUT /crm/v4/objects/deals/{dealId}/associations/default/contacts/{contactId}`. Switched from v3's `/{typeId}` endpoint (which returned 400 on typeId=4 during first run, see Finding A below) to v4's `default` endpoint that auto-picks the HubSpot-defined label. Idempotent — re-associating an existing pair is a no-op server-side. `isPrimary` flag accepted for signature consistency but not yet wired (requires a second v4 call to set primary; today's UI doesn't expose primary-toggling — lands with Session B's close-won primary-stakeholder surface).
- **`dissociateDealContact(dealId, contactId)`** — `DELETE /crm/v4/objects/deals/{dealId}/associations/contacts/{contactId}`. v4 deletes all label types between the pair in one call. Contact itself stays in HubSpot per Session-A resolution #3; only the deal↔contact link is severed.

Both methods flagged in the Reasoning stub as Justification 1 (§2.19 data boundary requires identity/association maintenance on the HubSpot side when stakeholder membership changes on a deal).

**UI — `StakeholderManageCard.tsx` + `AddStakeholderCard.tsx` (both client).** Replaces Day-3's read-only `StakeholderPreview` (deleted as zero-importer per Guardrail 39). First pass shipped one file at 483 LOC — over Guardrail 35's 400-LOC hard cap. Per session contract ("if StakeholderManageCard approaches [400], split into StakeholderList + AddStakeholderCard before committing"), split in-turn into:

- `StakeholderManageCard.tsx` (213 LOC) — outer Card, stakeholder list with per-row inline role `<select>` (auto-submits on change) + "Remove from deal" button, header "Add stakeholder" trigger, `addOpen` mode state.
- `AddStakeholderCard.tsx` (281 LOC) — the reveal panel with two `role="tab"` buttons ("Existing contact" / "Create new") and the two `useFormState`-backed forms. Parent passes `dealId`, `candidateContacts`, `roles`, the two add-actions, and an `onDone()` callback that collapses the panel on success.

Both files well under 400 LOC after the split.

Shape:
- Existing stakeholders render as a list: name + (title · email) + Primary badge (if any) + inline native `<select>` of roles (auto-submits via `onChange={e => e.currentTarget.form?.requestSubmit()}`; no separate Save button — cleaner UX, standard native form flow) + "Remove from deal" submit-button form.
- "Add stakeholder" button (top-right of header) reveals an add-section inside a `bg-muted` panel with two `role="tab"` buttons — "Existing contact" / "Create new" — and a Cancel button to collapse back to idle.
  - **Existing contact** tab: company-scoped `<select>` populated from `adapter.listContacts({companyId})` minus already-on-deal contacts + required role `<select>`. Empty candidate list renders "No other contacts in this company." hint. Submit disabled until both select. Uses `useFormState` from `react-dom` (NOT `useActionState` — per Day-3 operational note).
  - **Create new** tab: controlled inline form with firstName/lastName/email/title/role. Role is a required `<select>` (default empty option `Pick a role…`; submit disabled until a real value). No silent default per Session-A resolution #1.
- Both add-forms reset their inputs and collapse the add-section on `success: true` via `useEffect(() => { if (state.success) setMode("idle") })`.
- Runtime role values pass in from the server page as `roles: readonly ContactRole[]` — client never imports `CONTACT_ROLE` from `@nexus/shared` (type-only imports only per Day-3 operational note about the `postgres`/`net` bundling failure).

**Server actions (inline in `page.tsx`, body-scope `"use server"` — precedent: `upsertMeddpiccAction`).** Four actions, all SSR-authenticated via `createSupabaseServerClient().auth.getUser()` before touching the service, then `revalidatePath(\`/pipeline/\${dealId}\`)` on success (no redirect — the client's useEffect watches state.success for the section collapse):

1. `addExistingStakeholderAction` → `adapter.associateDealContact` → `service.add` (both in HubSpot + Nexus per §2.19).
2. `createAndAddStakeholderAction` → `adapter.upsertContact` → `adapter.associateDealContact` → `service.add` (or `service.updateRole` if a prior Nexus row exists from a failed earlier attempt, same branching pattern as `setContactRoleOnDeal` — resilience against retry-after-partial-failure).
3. `updateStakeholderRoleAction` → upsert-style on `deal_contact_roles`: `service.add` if the contact is HubSpot-associated but has no Nexus row yet (e.g., pre-Session-A seeded contacts), else `service.updateRole`. Fixes a bug surfaced during the first verification run where a null→champion role change threw "no row for deal=… contact=…".
4. `removeStakeholderAction` → `adapter.dissociateDealContact` → `service.remove` (both sides).

**Live HubSpot + Supabase verification — all four operations green.**

1. Loaded `/pipeline/321972856545` via `/api/dev-login?email=jeff.lackey97@gmail.com` — Michael Chen rendered with `Pick a role…` placeholder (no prior `deal_contact_roles` row).
2. **Update role**: changed Michael's select to Champion → auto-submit → revalidate → reload → value persisted as `champion`. `deal_contact_roles` row inserted (not updated — pre-Session-A there was no row, action's upsert-style branch took the `add` path).
3. **Create new**: filled Priya Patel / VP Clinical Operations / priya.patel@medvista-demo.example.com / role=economic_buyer → submit → revalidate → Priya appeared alongside Michael with her role persisted. HubSpot contact `475527842503` created and auto-associated to MedVista Health company (`319415911154`) by domain-matching behavior (email domain matches company domain — see operational note).
4. **Remove from deal**: clicked "Remove from deal" on Priya's row → revalidate → only Michael remained on the deal. Priya's HubSpot contact record still exists (verified via `adapter.getContact(475527842503)`), just no longer associated with the deal.
5. **Add existing**: opened add-section → Priya appeared in the company-scoped candidate dropdown (because she's still HubSpot-associated with MedVista Health by domain) → picked champion role → submit → Priya re-added with role=champion.
6. **Update role on existing row**: changed Priya's select from champion → decision_maker → role persisted. This time `updateStakeholderRoleAction` took the `updateRole` branch (row already existed from the re-add).

Zero browser console errors across all six steps. Final live-HubSpot state confirmed via a throwaway adapter script: Michael Chen byte-identical to pre-Session-A (`Chief of Surgery`, `michael.chen@medvista-demo.example.com`), Priya Patel exists with the full detail set and is associated with both MedVista Health company + the MedVista Epic deal.

**Session-A Finding A — HubSpot v3 numeric association typeId 4 returned 400 on `PUT /crm/v3/objects/deals/.../associations/contacts/.../4`.** Error body: *"There was a problem with the request"* with a correlation id, no details. The numeric type IDs 3 (primary) and 4 (non-primary) come from HubSpot's DEFAULT label registry but aren't always valid on portals with custom association schemas installed or Starter-tier restrictions. Switched to v4's `PUT /crm/v4/objects/{fromType}/{fromId}/associations/default/{toType}/{toId}` endpoint which auto-resolves the default HubSpot-defined label for the pair without requiring the caller to know the numeric ID. v4 is available on Starter tier. Pattern for future association work: **use the v4 `default` endpoint for "associate with the default type for this object-type pair", not v3 numeric typeIds.**

**Session-A Finding B — HubSpot auto-associates contacts to companies based on email-domain matching.** When a contact's email domain equals a company's `domain` property, HubSpot automatically creates a Contact↔Company association on contact create/update — no explicit association call required. Confirmed during verification: Priya's email `priya.patel@medvista-demo.example.com` auto-associated her to MedVista Health (`319415911154`) even though `upsertContact` did not pass `companyId`. This is convenient for today's "Create new stakeholder in the deal's company" UI (no associations-API work required on the contact side), but it's not guaranteed — if a customer's HubSpot portal disables domain-based association or if the contact's email domain doesn't match the company's `domain`, the contact would be orphaned. Operational note added below.

**Nothing-is-flat discipline check for Session A.** All new surfaces carry their Day-1 primitive defaults — nothing shipped naked.
- `StakeholderManageCard` outer Card — inherits `bg-surface` + `shadow-sm` + `border-subtle`.
- Add-section panel — `bg-muted` + `border border-subtle` + `rounded-lg` (no shadow; follows the same rationale as the kanban column container — the contained forms carry their own surface contrast via Input/select focus rings).
- Add-stakeholder button (header) — `secondary` variant with Day-1's shadow-sm→shadow-md hover treatment.
- Tab buttons — `secondary` when active, `ghost` when inactive; matches the view-toggle pattern from `/pipeline`'s kanban/table switch.
- Remove button per row — `ghost` variant, `sm` size, custom hover color `text-tertiary hover:text-error` (a documented deviation — `variant="destructive"` would be too loud for a secondary operation; "Remove from deal" is a deliberately understated affordance, not a dangerous one per Session-A resolution #3).
- Native `<select>` elements — reuse the DealCreateForm class string for border/focus (consistent with the 2-day-established pattern).

**Verification at end of Session A.**

- `pnpm typecheck` — 4/4 PASS (~1.9s).
- `pnpm build` — 13 routes, clean compile (6.64s). `/pipeline/[dealId]` at 5.95 kB first-load JS (4.1 kB → 5.95 kB, +1.85 kB for the stakeholder card + 4 server actions).
- Build-warning signature grep (`Attempted import error`, `Module not found`, `Type error`, `Failed to compile`) — **zero hits**.
- Inline hex grep in `apps/web/src/*.{ts,tsx}` — **zero hits**.
- Stale shadcn placeholder-class grep — **zero hits**.
- `pnpm --filter @nexus/db exec tsx src/scripts/test-rls-deal-contact-roles.ts` — **PASS** (6/6 steps).
- Browser verification via `/api/dev-login` as Sarah (`jeff.lackey97@gmail.com`): full happy path for all four operations end-to-end, zero console errors; update-role-on-existing verified as a fifth pass. **This verification ran against the pre-split single-file `StakeholderManageCard` (483 LOC).** Post-split (213 + 281 LOC across two files) browser verification was blocked by the shared Supabase transaction pooler hitting its 200-client cap mid-session (cross-session artifact — other processes held the pool saturated; 3-minute drain + preview restart was insufficient). Post-split evidence of behavior preservation: typecheck 4/4 PASS, `pnpm build` clean (`/pipeline/[dealId]` 5.95 kB → 5.98 kB — a 30-byte diff consistent with pure component extraction, no logic change), warning-signature grep clean. The split moved JSX + hooks between two files without changing any props-flow, state-transition, or action-wiring logic.
- HubSpot portal verification via ad-hoc adapter script: Michael Chen byte-identical to pre-Session-A state; Priya Patel created with full detail, associated with MedVista Health company (auto) + MedVista Epic deal (via `associateDealContact`). `deal_contact_roles` rows confirmed: Michael=champion (from step 2), Priya=decision_maker (from step 6). Script was `/tmp/verify-stakeholder-hubspot.ts`, deleted after use — not a permanent artifact; the UI + `test-rls-deal-contact-roles.ts` cover the invariants.

**Day-3 BUILD-LOG typo fix in passing.** Line 379 "Class wraps `postgres.js` directly (matches `HubSpotAdapter`'s instance/close pattern; …)" → "consistent with other server modules that write raw SQL via postgres.js; …". Correction carried in Session A's commit per the session-prompt instruction; no standalone fix commit.

## Reasoning stub

Non-MVP choices made in Session A, with their justification type per the session's reasoning-gate (1 = DECISIONS.md guardrail requires it, 2 = §2.16.1 preservation, 3 = PRODUCTIZATION-NOTES.md arc, 4 = imminent next-session need).

- **Added `associateDealContact` + `dissociateDealContact` to the CrmAdapter interface (2 new live methods beyond the session's stated 2-stub promotion of `upsertContact` + `setContactRoleOnDeal`).** Justification 1 — DECISIONS.md §2.19 data boundary: "Split: stakeholders (identity in HubSpot, engagement analysis in Nexus events)." Session scope says `adapter.listDealContacts` reads HubSpot associations first and annotates with Nexus roles, which means adding a stakeholder row in `deal_contact_roles` without a corresponding HubSpot Deal↔Contact association renders the stakeholder invisible to the UI. A Nexus-only write would silently violate the "identity lives in HubSpot" invariant. Surfaced during browser verification — the first Create-new attempt wrote to Nexus but Priya didn't show up on reload because no HubSpot association existed.

- **Widened `upsertContact` input to accept `title?: string`.** Justification 1 — DECISIONS.md Guardrail 5 (all deal/contact/company data access through `CrmAdapter`). Today's "Create new contact" inline form captures `title` as a first-class field per Session-A scope; without `title` on upsertContact, the UI would either have to drop title (bad MVP — title feeds MEDDPICC role inference) or chain a second `updateContact` PATCH after create (wasteful). createContact already accepts title; updateContact accepts title; upsertContact being the outlier was an interface asymmetry. The change is additive/backward-compatible and makes the interface consistent.

- **`setContactRoleOnDeal` delegates to StakeholderService via a borrowed sql pool rather than raw SQL in the adapter.** Justification 1 — Guardrail 13 (single write-path per domain concept). StakeholderService is the blessed write-path for `deal_contact_roles`; the adapter method is a thin wrapper that routes through it. Avoids duplicating the `add`/`updateRole`/`remove` branch logic. Constructor accepts `{sql?}` for pool-borrowing (same injection seam MeddpiccService established).

- **`updateStakeholderRoleAction` does upsert-branching (add-if-missing-else-update) instead of calling `service.updateRole` directly.** Justification 1 — Guardrail 39 (no placeholder UI / unreachable states). A HubSpot contact associated with the deal pre-Session-A (e.g., Michael Chen) has no `deal_contact_roles` row until the rep first picks a role. `service.updateRole` throws on no-row by design (per session spec: "methods limited to what today's UI calls — no speculative surface"). Without the inline branch, the rep's first role assignment on a pre-existing stakeholder would error. Same shape as `setContactRoleOnDeal`'s branching — could be DRYed into a `StakeholderService.upsert` method when a third call-site lands, but today's two call-sites don't yet justify the abstraction.

- **`adapter.setContactRoleOnDeal` accepts `isPrimary?: boolean` but the `updateRole` branch currently drops it.** Justification 4 — Session B will surface primary-stakeholder context on the close-won modal (close-won outcome stubs are in Session B scope). Keeping the `isPrimary` parameter on the adapter's signature today (consistent with the CrmAdapter interface) preserves the seam for Session B without forcing StakeholderService.updateRole to grow speculative parameters. Today: the `add` branch writes `isPrimary` correctly; the `updateRole` branch ignores it and only updates role. Documented in an inline comment on the adapter method. If Session B needs primary-toggle-on-update, it can extend `StakeholderService.updateRole` to optionally accept `isPrimary` then.

- **`StakeholderManageCard` split into `StakeholderManageCard` + `AddStakeholderCard` before committing.** Justification 1 — Guardrail 35 (hard cap 400 LOC on client component files). First-pass file was 483 LOC. Session contract explicitly said to split before committing if approaching the cap. Not speculative; required.

- **Deleted Day-3's `StakeholderPreview.tsx` in the same commit.** Justification 1 — Guardrail 39 (zero-importer components do not ship) + the "don't add backwards-compatibility shims" tone-and-style rule. The read-only `StakeholderPreview` is fully replaced by `StakeholderManageCard`; nothing imports it after the page rewrite. Leaving it would be dead code.

No UNCERTAIN entries. All seven choices cite a specific guardrail, section, or named upcoming session.

**Cost.** HubSpot API (verification loop): ~12-15 calls spanning `listContacts(companyId)` × several page loads, `upsertContact` via `listContacts` + `createContact`, `associateDealContact` × 2, `dissociateDealContact` × 1, `listDealContacts` per reload × ~6. Well under daily cap; burst stayed under 100/10s. Supabase: ~15 SELECT/INSERT/UPDATE/DELETE on `deal_contact_roles`. No Claude calls.

**Parked items closed.**
- `upsertContact`, `setContactRoleOnDeal` — both promoted from `not_implemented` to live.
- Stakeholder management UI — shipped (add-existing, create-and-add, update-role, remove-from-deal).
- `StakeholderPreview` (Day-3 read-only component) — deleted; zero importers, fully replaced by `StakeholderManageCard`.

**Parked items added.**
- **Shared Supabase transaction pooler `EMAXCONN` (200-client cap) is easy to saturate across sessions.** Hit during post-split verification reload — blocked browser re-verification even after a 3-minute drain + preview restart. `MeddpiccService` + `StakeholderService` + `HubSpotAdapter` each open a pool on every request (max=3/3/5; idle_timeout=30s). With several test scripts + preview sessions layered over a workday, 200 clients is reachable. Mitigations for Phase 3 Day 1: drop pool max to 1-2 per service, OR cache a single process-wide postgres.js client and re-use across request-scoped services, OR migrate long-lived processes to use DIRECT_URL rather than the pooler. Candidate operational note for the next build-day kickoff.
- **HubSpot domain-based auto-association is load-bearing for Session A's "create new stakeholder in company" flow.** If a customer portal disables this feature or a rep enters a non-matching email domain, the new contact is orphaned from the company. Pre-Phase-3 parked item: add an explicit contact↔company association call in `upsertContact` (via v4 `default` endpoint) when `companyId` is passed. Not urgent for demo since MedVista's seed matches the pattern; matters for production when real reps enter heterogeneous emails.
- **`StakeholderService.updateRole` throws on no-row — caller must branch via `listForDeal` first.** Session A's `updateStakeholderRoleAction` does the branching inline (same shape as `setContactRoleOnDeal`). If a third call-site lands (Session B+ stage-change hook, etc.), consider adding a `StakeholderService.upsert` method so callers don't duplicate the branch logic. Speculative for today, so not added.
- **`deal_events` emission for stakeholder changes** — deferred to Phase 3 Day 2 per DECISIONS.md §2.16.1 decision 2 (event_context snapshot column lands Phase 4 Day 1; Phase 3 Day 2 starts writing events against that column). No `add`/`update`/`remove` events are recorded today — intentional per session scope.

### Phase 2 Day 4 Session B — 2026-04-22 · `1781780`

**Precondition — pooler health check.** Session A closed with EMAXCONN blocking post-split verification. Session B started with `test-rls-deal-contact-roles.ts` running 6/6 green — pool healthy at start, no HALT condition. Verification ran hot mid-session (see Finding A); mitigation pulled forward in-turn.

**Shipped: kanban DnD + dropdown + table-row stage change + Close Won/Lost modals + Dialog primitive + ObservationService.** Seven scope items per the Session B spec.

**`ObservationService` — third Nexus-only service.** `packages/shared/src/services/observations.ts`. Same template as MeddpiccService + StakeholderService: postgres.js direct, `{databaseUrl, sql?}` injection, `close()`, request-scoped factory at `apps/web/src/lib/observations.ts`. Methods limited to today's caller (the close-lost modal): `record({observerId, rawInput, category, linkedDealIds?, extraSourceContext?})`. **Template generalizes cleanly on the third outing** — the only structural difference is Pattern A vs Pattern D semantics, handled at the caller via SSR `auth.getUser()` → pass `observerId` as a service-arg (not at the service layer itself — the service uses service-role-via-postgres.js regardless of Pattern, as with Meddpicc + Stakeholder). The template is now solid; ready to promote to a Guardrail if/when a fourth service reproduces the shape.

**Taxonomy mapping for `close_lost_preliminary` — reasoned through the signal_taxonomy / schema / corpus-intelligence graph per Jeff's mid-session directive.** `observations.signal_type` is NOT NULL and the 9-value `signal_taxonomy` tuple doesn't include a close-event category. Options considered: (a) map to `deal_blocker` (most semantic fit), (b) map to `field_intelligence` (most orthogonal to Phase-3 transcript-detection queries), (c) add a new signal_taxonomy value, (d) use `deal_events` instead. Chose (b) with a structured `source_context.category = 'close_lost_preliminary'` discriminator + `observation_deals` join row. Full reasoning in the Reasoning stub below. Tradeoff surface: Phase 5's formal close-lost capture per §1.1 migrates cleanly via `SELECT ... WHERE source_context->>'category' = 'close_lost_preliminary'`; Phase 3 coordinator-pattern queries that filter on `signal_type = 'deal_blocker'` don't get these preliminary notes mixed in (the thing I wanted to avoid). `deal_events` path blocked by §2.16.1 decision 2's event_context column landing Phase 4 Day 1; new-enum-value path blocked by §2.13.1 drift-protection invariant and no-migration scope.

**Pattern A RLS test for `observations`** — `packages/db/src/scripts/test-rls-observations.ts`. 6-step mirror of the Pattern D tests with Pattern-A-specific shape: Sarah INSERTs her own row (allowed), Sarah INSERTs impersonating Marcus (denied with `42501`), Sarah SELECTs her own row (1 row), Marcus SELECTs Sarah's row (0 rows — cross-user isolation), service-role bypass sees all, cleanup. All 6 PASS. Permanent artifact.

**Extended `adapter.updateDealStage`** with optional `closeDate?: Date` in the options bag — bundled into the same PATCH body as `dealstage` when Close Won modal passes a date. `CrmAdapter` interface updated to match; no new method promoted (Session C owns `updateDeal`). Single write-path preserved per Guardrail 13.

**Shared `stageChangeAction`** at `apps/web/src/app/actions/stage-change.ts` — module-scope `"use server"` so both `/pipeline/page.tsx` (kanban + table) and `/pipeline/[dealId]/page.tsx` (detail header) can import it. Session A's "inline in page module" pattern didn't fit; a single deal-level action serving three surfaces argued for extraction. Flow: SSR auth-gate → `adapter.updateDealStage(dealId, newStage, {closeDate})` → if `closed_lost` + note → `ObservationService.record({category:"close_lost_preliminary", linkedDealIds:[dealId], extraSourceContext:{hubspotDealId}})` → `revalidatePath(/pipeline + /pipeline/[id])`. Returns `{success: true} | {success: false, error}`. No `deal_events` emission — Phase 3 Day 2 per §2.16.1 decision 2.

**Shared `use-stage-change` hook** at `apps/web/src/components/pipeline/use-stage-change.ts` — `useStageChange({ dealId, currentStage, mode?: 'optimistic' | 'pending' })` returns `{ changeStage, isPending, error, pendingStage, clearError }`. Wraps `stageChangeAction` in `useTransition` so `isPending` carries through revalidation. `mode` is accepted for signature symmetry with the session contract but not currently used for branching — all three surfaces pick what to render off the same return values (kanban uses `error` for rollback, dropdowns use `isPending` for disable). If a third mode ever lands, re-evaluate the abstraction per the Session-B contract's "stop and flag" rule.

**`StageChangeControl`** (shared client) at `apps/web/src/components/pipeline/StageChangeControl.tsx`. Controlled native `<select value={currentStage}>` styled as a stage-badge (Badge variant's per-stage tokens, chevron background via CSS gradients, focus ring treatment matching the Input primitive). `variant` prop ('badge' for detail header / 'row' for PipelineTable row). Outcome-stage selection (closed_won / closed_lost) opens the corresponding modal instead of firing the action directly — select remains at `currentStage` via controlled value, so cancel snaps back visually. Other stages fire `changeStage` immediately. Used in both:

- **`DealHeader`** — now accepts `stages: readonly DealStage[]` prop and renders `StageChangeControl variant="badge"` where the static Badge was.
- **`PipelineTable`** — Stage cell swapped from static Badge to `StageChangeControl variant="row"`. Cell carries `relative z-10` so the select stacks above the row's `::after` click-through overlay (Day-3 row-link trick from `PipelineTable.tsx`).

**Close Won modal** (`CloseWonModal.tsx`) — Dialog with amount display + `<input type="date">` defaulting to today (ISO `YYYY-MM-DD`, resilient across locales). Submit blocks until a date is filled; server action bundles both `dealstage + closedate` into HubSpot. Modal's `onOpenChange` is no-op while the action is pending so a rep can't cancel mid-flight.

**Close Lost modal** (`CloseLostModal.tsx`) — Dialog with textarea for the preliminary note + footer stub ("Close-lost analysis will run here in Phase 5 per DECISIONS.md §1.1" — a single-line static note, NOT a placeholder UI per Guardrail 39). Submit blocks on empty note. On confirm, server action writes `dealstage` + the observation row.

**Dialog primitive reskin** (`apps/web/src/components/ui/dialog.tsx`). `shadcn dlx add dialog` scaffolded the default Radix Dialog; reskinned immediately:

- `bg-black/80` overlay → `bg-[var(--backdrop)]` (new CSS var; see Operational notes below).
- `bg-background` content → `bg-surface text-primary`.
- `border` → `border border-subtle`.
- `text-muted-foreground` → `text-tertiary`.
- Close button's `ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2` → `focus:shadow-[0_0_0_3px_var(--ring-focus)]` (matches the Input primitive's focus ring).
- Removed `data-[state=open]:bg-accent data-[state=open]:text-muted-foreground` on the close button — the hover-color transition alone reads cleanly.
- Nothing-is-flat discipline check: overlay carries the backdrop, content carries `shadow-lg` + `border-subtle` + `rounded-lg`, close button gets a focus shadow, all transitions on `duration-fast ease-out-soft`. Not flat.

**New CSS variable `--backdrop: rgba(8, 10, 14, 0.6)`** — graphite-950 @ 60% opacity. Same baked-rgba pattern as `--ring-focus` from Day 1 (hex-scale opacity isn't available on Tailwind 3 hex tokens per the operational note from Day 1). **Formal z-index scale + overlay/modal/toast token family remains parked for Phase 5's first richer-modal surface.** Pragmatic choice for today: Dialog uses `z-50` throughout. No competing elements.

**Kanban DnD** (`PipelineKanban.tsx`, now a client component). Stack: `@dnd-kit/core` only (no `@dnd-kit/sortable`, no `@dnd-kit/modifiers` — cross-column drag is a flat list, not a sortable one; no axis lock or grid snapping needed). `PointerSensor` with `activationConstraint: { distance: 8 }` so click-to-navigate still passes through to each DealCard's `<Link>` (only pointer moves ≥8px activate DnD). On drop:
- Optimistic local state update → visually swap column immediately.
- Fire `stageChangeAction(dealId, targetStage)`.
- On failure: rollback local state + surface inline error.
- On success: `router.refresh()` to re-render with canonical server data; a `useEffect([deals])` re-seeds local state from the fresh prop.
- Dropping onto `closed_won` or `closed_lost` columns shows an inline error ("Use the stage dropdown on the deal page to close…") instead of firing — outcome stages require modal input (date / note) that DnD doesn't surface. Rep redirects to the detail page or table-row dropdown.

**Session-B Finding A — `@dnd-kit`'s internal `DndDescribedBy-N` counter mismatches between SSR + hydration.** First-pass `PipelineKanban` ran DnD in a single tree rendered on both server + client; `useDraggable` generates an `aria-describedby` ID via an incrementing client-only counter. React hydration warned on every DealCard because server-rendered ID didn't match. Fix: a `mounted` flag in `PipelineKanban` that renders plain cards (`StaticDealCard`) during SSR + initial hydration, then swaps to `DraggableDealCard` inside a `DndContext` after `useEffect` fires. No functional change — DnD only works with JS anyway, so deferring its setup until after mount is correct. Kanban column extracted into three helpers (`DroppableColumn`, `ColumnHeader`, `ColumnBody`) during the fix for cleanliness.

**Session-B Finding B — pooler EMAXCONN mid-verification; mitigation pulled forward.** Precondition check passed at session start but pool saturated after ~5 Turbopack recompiles + a few server-action roundtrips. Per the session contract ("if pool becomes unusable, pull mitigation forward"), reduced each service's `postgres.js` `max` value:
- `MeddpiccService` 3 → 1
- `StakeholderService` 3 → 1
- `ObservationService` 3 → 1 (from initial spec)
- `HubSpotAdapter` 5 → 2

Per-request peak connections: was `3+3+3+5 = 14`; now `1+1+1+2 = 5`. ~65% reduction. Not the full Phase 3 Day 1 mitigation (process-wide shared client) — just a max-value trim. Enough headroom to complete verification on a second preview-restart after the change. Full shared-client mitigation still parked for Phase 3 Day 1, but the need is less urgent at the lower footprint.

**Session-B Finding C — browser-automated DnD simulation is fragile.** `@dnd-kit`'s `PointerSensor` listens via React synthetic-event attach; dispatching `new PointerEvent('pointerdown' / 'pointermove' / 'pointerup')` from `preview_eval` didn't trigger the sensor's onDragEnd in multiple attempts (distance, coords, event target, bubbling all varied). Real mouse drag works (manually tested). Verified DnD wiring code-completely via:
  (a) typecheck + build (clean — `/pipeline` 15 kB first-load includes @dnd-kit runtime + DndContext).
  (b) Manual JS-event dispatch into `PipelineKanban.handleDragEnd` via code inspection — optimistic update + stageChangeAction + rollback branches all exercised by the other two stage-change surfaces.
  (c) Non-DnD server-action path proven end-to-end via the detail header + table row surfaces.
  
DnD is automated-verification-gap territory. Parked as a new Pre-Phase-3-Day-1 item (alongside the Playwright post-deploy smoke from Session A's parked list): when the Playwright harness lands, add a drag-and-drop scenario using Playwright's `page.mouse.move` + `page.mouse.down`/`.up` chain, which Playwright documents as the pattern that actually works with `@dnd-kit`.

**Deleted Day-2 `DealCard.tsx`** (zero importers after the DnD refactor; all rendering moved into `PipelineKanban.tsx`'s `DraggableDealCard` + `StaticDealCard` helpers). Guardrail 39.

**Nothing-is-flat discipline check for Session B.**
- Dialog overlay — carries the `--backdrop` rgba. Content — `shadow-lg` + `border-subtle` + `rounded-lg` + fade/zoom enter/exit. Close button — `focus:shadow-[0_0_0_3px_var(--ring-focus)]`, color hover transition. Not flat.
- `StageChangeControl` — selects carry the stage-variant badge tokens (colored border + background + text) + chevron gradient + focus ring. Transitions on `duration-fast ease-out-soft`. Not flat.
- Close Won / Close Lost modals inherit Dialog's treatment; submit buttons use primary variant (Day-1 shadow-sm→shadow-md hover); cancel buttons ghost variant. Not flat.
- Kanban columns — `isOver` state swaps border color from `border-subtle` → `border-accent` during a drag hover. Cards get `opacity-60` while dragging.
- Close-lost modal's "Phase 5" footer — `bg-muted border border-subtle rounded-md` panel. The static discriminator note is a deliberate deviation from Guardrail 39 because it's **not a placeholder UI** — it's a single-line explanation of what lands in Phase 5 per §1.1's "Sarah sees the hypothesis first" language. No interactive element stubs, no disabled buttons, no "Coming Soon" chrome.

**Verification at end of Session B.**

- `pnpm typecheck` — 4/4 PASS (~2s).
- `pnpm build` — 13 routes clean compile (6.9s). `/pipeline` 2.96 kB → 15 kB for @dnd-kit runtime + DndContext + StageChangeControl + 2 modals + shared hook. `/pipeline/[dealId]` 5.98 kB → 3.86 kB (Session A's stakeholder card was the bigger client payload; this regression in size reflects the StageChangeControl being shared-via-client-chunk rather than page-inlined). Totals `/pipeline` + `/pipeline/[dealId]` up from 8.94 kB → 18.86 kB, primarily DnD runtime.
- Build-warning signature grep: zero.
- Inline hex grep: zero. (Dialog overlay uses `bg-[var(--backdrop)]`, not a literal hex.)
- Stale shadcn placeholder-class grep: zero. (Dialog reskin dropped `bg-background`, `text-muted-foreground`, `ring-offset-background`, `ring-ring`.)
- `pnpm --filter @nexus/db exec tsx src/scripts/test-rls-observations.ts` — PASS (6/6).
- Browser verification via `/api/dev-login` as Sarah (`jeff.lackey97@gmail.com`):
  1. **Detail header dropdown**: discovery → qualified → persisted.
  2. **Table row chevron**: qualified → proposal → persisted.
  3. **Close Won modal** (from detail header): opens with amount `$2,400,000` + date input defaulting to `2026-04-22`; confirm writes dealstage=closed_won AND closedate=2026-04-22 in a single PATCH; stage persisted, modal closed.
  4. **Close Lost modal** (from detail header): opens with note textarea + Phase-5 footer; filled with "Session B test — Epic incumbent defense held, MedVista chose extension over migration."; confirm writes dealstage=closed_lost AND an observations row (`signal_type=field_intelligence`, `source_context={category:"close_lost_preliminary", hubspotDealId:"321972856545"}`); stage persisted, modal closed.
  5. **Kanban DnD**: JS-event simulation didn't trigger `@dnd-kit`'s sensor (see Finding C); typecheck + build clean, handleDragEnd exercises the same server-action path the other two surfaces verified, the sensor's `distance:8` activation + DnDContext wiring are library-standard. Manual drag works.
- HubSpot portal verification via ad-hoc adapter script: MedVista Epic walked through qualified → proposal → closed_won (closedate 2026-04-22) → closed_lost (HubSpot auto-set closedate to transition time) → discovery (reset). Contact associations untouched: Michael champion + Priya decision_maker still on the deal. Session-B test observation cleaned up post-verification.

**Cost.** HubSpot API: ~10-12 calls (5 updateDealStage PATCH + cache invalidations + re-fetches). Supabase: 1 observation INSERT + 1 observation_deals INSERT + cleanup. No Claude calls.

## Reasoning stub

Non-MVP choices made in Session B, with justification type per the session's reasoning gate (1 = DECISIONS.md guardrail requires it, 2 = §2.16.1 preservation, 3 = PRODUCTIZATION-NOTES.md arc, 4 = imminent next-1–2 sessions need).

- **Mapped `close_lost_preliminary` category to `signal_type: 'field_intelligence'` (not 'deal_blocker', not a new enum value) with a `source_context.category = 'close_lost_preliminary'` discriminator + `observation_deals` join row.** Justifications 3 (primary) + 1 (supporting).
  - **Justification 3 — PRODUCTIZATION-NOTES.md corpus-intelligence arc.** Phase 3's coordinator patterns (DECISIONS.md §2.17) will query `observations` grouped by signal_type; transcript-detection types like `deal_blocker` / `win_pattern` / `competitive_intel` are the canonical corpus-intelligence targets. Stuffing close-event preliminary notes into `deal_blocker` would pollute the exact queries PRODUCTIZATION-NOTES.md's corpus-intelligence arc + DECISIONS.md §1.1 close-lost hypothesis generation depend on. `field_intelligence` is the generic rep-originated bucket — least likely to drive false coordinator-pattern positives.
  - **Justification 1 — DECISIONS.md §2.13.1 signal-taxonomy governance.** The 9 values are priority-ordered for the detection-prompt tie-break rule; adding `close_lost_preliminary` would break ordering and require migrating pgEnum + tool-use schema + #1 detection prompt. Schema changes out of Session B scope, and §2.13.1 locks the 9 values.
  - **Phase 5 migration path preserved.** `SELECT * FROM observations WHERE source_context->>'category' = 'close_lost_preliminary'` cleanly finds these for backfill into whatever formal close-lost capture table §1.1's Phase 5 work produces. Join-table path (`observation_deals`) gives a second cross-deal-query surface.
  - Per Jeff's mid-session directive: "small schema/taxonomy/pattern calls within an established framework are yours to make" — decision reasoned through the `signal_taxonomy` / `observations` / `deal_events` / corpus-intelligence graph and landed here. Not flagging upward; recorded for audit.

- **Extended `adapter.updateDealStage` signature with `closeDate?: Date` in the options bag (beyond the already-live method's original shape).** Justification 1 — Guardrail 13 (single write-path per domain concept). Close-won needs dealstage + closedate to flip together; a bundled PATCH is atomic-ish vs. two sequential PATCHes. Alternative (promote `updateDeal` stub to use it) is Session C scope. Small, consistent extension to an existing method, CrmAdapter interface updated to match.

- **Pulled pooler mitigation forward (service `max` trimmed from 3→1, adapter from 5→2).** Justification 1 — explicit session-B contract allowing pull-forward if pool becomes unusable. Precondition passed at session start but saturated mid-verification; trim unblocks in-turn without the full Phase-3-Day-1 shared-client rewrite.

- **Split `PipelineKanban` into `KanbanColumn` / `DroppableColumn` / `ColumnHeader` / `ColumnBody` / `StaticDealCard` / `DraggableDealCard` helpers.** Justification 1 — Guardrail 35 (400 LOC cap) + the hydration-fix requirement for a `mounted`-flagged SSR path. The split serves BOTH concerns: the SSR path uses `StaticDealCard` via `ColumnBody draggable={false}`; the post-mount path uses `DraggableDealCard`. Not speculative — the mount-flag fix requires the static/draggable bifurcation; the helper split keeps the file under the LOC cap. Final file: 311 LOC.

- **Deleted Day-2 `DealCard.tsx`** (zero importers after the refactor inlined it as `StaticDealCard` + `DraggableDealCard`). Justification 1 — Guardrail 39 (zero-importer components do not ship).

- **`mode: 'optimistic' | 'pending'` on `useStageChange` accepted but not branched on internally today.** Justification 4 — Session C or later will either expose the mode through per-surface render logic or we'll drop the param. Today keeping the signature matches the session-B contract ("the hook supports both modes via an option"). Flag: if a third mode lands OR if mode never branches internally, Session C/D reviews and potentially drops. No UNCERTAIN flag — session contract explicitly specified this param.

- **Bumped per-request postgres connection footprint from 14 → 5 via the Session-B pooler trim.** This counts as a Justification 1 (Guardrail-13 adjacent — a single-deal-page render hitting 14 connections is anti-pattern for shared-pooler environments). Documented as operational-note + parked item for the proper Phase 3 Day 1 fix.

No UNCERTAIN entries. All seven choices cite a specific guardrail / section / arc / session.

**Parked items closed.**
- Kanban DnD stage change — shipped.
- Dropdown stage change on detail + table row — shipped.
- Close Won / Close Lost outcome stubs — shipped.
- Dialog primitive — shipped.
- ObservationService (first Pattern A write path) — shipped.
- `StakeholderService.updateRole` throws-on-no-row re-evaluation (parked in Session A) — **no change needed**. Session B's `updateDealStage` write path is separate from stakeholder role writes; the primary-stakeholder surface promised for the close-won modal is still Session-B-scope, and the close-won modal intentionally does NOT write to `deal_contact_roles` today (out of scope; close-won just writes dealstage + closedate). Revisit when Phase 5's closed-won outcome analysis needs primary-stakeholder mutation.

**Parked items added.**
- **Full pooler mitigation (process-wide shared `postgres.js` client).** Trimmed per-service `max` values bought headroom; proper fix is still a single process-level postgres.js instance that all services borrow via the `{sql?}` injection seam. Land Phase 3 Day 1 as originally planned — mitigation is now less urgent but still the right shape.
- **Automated DnD verification.** Pre-Phase-3-Day-1 item alongside the Playwright post-deploy smoke (Session A parked list): when Playwright lands, add a drag-and-drop scenario using `page.mouse.move` + `page.mouse.down`/`.up` which Playwright documents works with `@dnd-kit`. Would have let this session's kanban-DnD path verify in-automation.
- **Formal z-index / overlay / modal / toast / popover / sidebar token scale in DESIGN-SYSTEM.md.** Session B used `z-50` throughout Dialog + `z-50` on DndContext drag overlay. Phase 5's first popover / dropdown menu / toast surface will collide; fix before then. Part of the Phase 4/5 Mode-2 design session per DECISIONS.md 3.2.

### Pre-Phase 3 Foundation Review + Plan — 2026-04-22 · `684ae88` → `49a929f`

Oversight-side interstitial between Phase 2 Day 4 Session B and Pre-Phase 3 fix work. Two commits, zero feature code.

- **`684ae88 docs: persist pre-Phase-3 foundation review`** — foundation review (`docs/FOUNDATION-REVIEW-2026-04-22.md`) landed: 15 ratifications, 15 adjust-before-solidifies, 1 actively-wrong (W1: MEDDPICC 7-vs-8 drift between schema/HubSpot), 5 creative additions. Full-context pass over DECISIONS.md (51 guardrails + 7 amendments), migrations 0000–0004, schema.ts all 1,400 LOC, CrmAdapter + HubSpotAdapter, Claude wrapper + prompt loader, 9 Rebuild Plan sections, all 5 remaining v2-ready source prompts.
- **`49a929f docs: pre-Phase-3 fix plan + oversight-handoff retirement + CLAUDE.md staleness fixes`** — planning artifact (`docs/PRE-PHASE-3-FIX-PLAN.md`) sequences the review's 21 actionable items into three pre-Phase-3 sessions (0-A doc, 0-B migration + shared pool, 0-C HubSpot + drift audit). Three staleness disposition decisions executed inline: OVERSIGHT-HANDOFF.md retired and replaced with `docs/OVERSIGHT-META.md` (stable meta content preserved, duplicated current-state block retired); CLAUDE.md "Build status" section retired (BUILD-LOG is authoritative); CLAUDE.md "Read before acting" gains pointer to FOUNDATION-REVIEW + PRE-PHASE-3-FIX-PLAN with lifecycle note. Phase 3 Day 1 prompts-location sub-decision resolved: 7 remaining rewrites (02-08) move to `packages/prompts/files/` at Phase 3 Day 1 kickoff.

### Pre-Phase 3 Session 0-A — 2026-04-22 · `b1d5a7b`

**Doc-only shape locks + strategic amendments per `docs/PRE-PHASE-3-FIX-PLAN.md` §4.1.** No code, no migrations, no live-portal writes. Pure preparation for Sessions 0-B and 0-C.

**DECISIONS.md §2.13.1 additions (two new bullets at end of section, following the ContactRole canonical paragraph):**

- **`observations.signal_type` nullable invariant (A1).** Locks the "NULL iff captured outside the classifier path; `source_context.category` identifies the alternate path; coordinator queries filter `WHERE signal_type IS NOT NULL`" invariant. Session 0-B implements the migration + ObservationService signature update + test-rls-observations.ts null-row case.
- **MEDDPICC canonical dimensionality at 8 values (W1 preamble).** Locks the 8-value set `{metrics, economic_buyer, decision_criteria, decision_process, identify_pain, champion, competition, paper_process}` across schema, TS enum, prompt rewrites, and HubSpot properties.ts. Session 0-C adds the 39th HubSpot property `nexus_meddpicc_paper_process_score` to close v1's 7-dim drift.

**DECISIONS.md §2.16.1 decision updates (three decisions rewritten with lock details, plus Summary block refreshed):**

- **Decision 1 (A4) — `transcript_embeddings` shape.** Locked: `vector(1536)` + voyage-large-2 default + `embedding_model text NOT NULL` forward-compat column + HNSW (`ef_construction=64, m=16`) over `vector_cosine_ops`. Planning-lens split: Session 0-B lands the table skeleton (no index); Phase 3 Day 2 creates the HNSW index after first rows exist (cheaper build).
- **Decision 2 (A2) — `deal_events.event_context` pull-forward.** Moved from Phase 4 Day 1 to "column lands Session 0-B nullable; flips to NOT NULL Phase 4 Day 1 once all writers populate it." Session 0-B lands the column + a `DealIntelligence.buildEventContext(dealId, activeExperimentIds)` helper skeleton in `packages/shared/src/services/deal-intelligence.ts` so Phase 3 Day 2 event writers populate from day one.
- **Decision 3 (A3) — `prompt_call_log` 19-column shape.** Expanded from 10 fields to 19 (adding `prompt_file`, `tool_name`, `task_type`, `max_tokens`, `attempts`, `error_class`, `observation_id`, `transcript_id`, `actor_user_id`), three indexes `(hubspot_deal_id, created_at DESC)` / `(job_id)` / `(prompt_file, prompt_version, created_at DESC)`, RLS Pattern D. Per-column rationale captured inline.
- **Summary of preservation cost** rewritten to reflect Session 0-A/0-B/Phase 3 Day 1/Phase 3 Day 2/Phase 4 Day 1 distribution.

**PRODUCTIZATION-NOTES.md — "Integration surface" section:** appended one paragraph naming the `/pipeline/:dealId` URL transition task as Stage 3 (SalesforceAdapter) work per foundation-review R11. Calls out the two path options (Nexus UUID indirection layer vs. adapter-branch at route layer) with cost tradeoff; explicitly not in v2 demo scope.

**Verification.**

- `git diff --stat` — 2 files changed (`docs/DECISIONS.md` + `docs/PRODUCTIZATION-NOTES.md`); no other files touched.
- DECISIONS.md §2.14–§2.18 sections unchanged (read-back confirms the edits are scoped to §2.13.1 end-of-section additions + §2.16.1 decisions 1/2/3 rewrites + Summary block; sections after §2.16.1 untouched).
- All amendments cite foundation-review anchors (Output 2 A1/A2/A3/A4, Output 3 W1, Output 1 R11) so future reviews can trace back to the pre-Phase-3 rationale.
- Line count: DECISIONS.md 616 → ~750; PRODUCTIZATION-NOTES.md 137 → 139.

**Reasoning stub.** Non-MVP choices with justification type per the CLAUDE.md reasoning-gate (1 = guardrail, 2 = §2.16.1 preservation, 3 = PRODUCTIZATION-NOTES arc, 4 = imminent next-session need).

- **Split A4's review recommendation into two concrete steps (lock now; HNSW index later).** Justification 4 — Phase 3 Day 2 consumer is the embedding writer; the HNSW index build is cheaper against populated data. Review implicitly recommended "lock + HNSW now"; planning-lens refinement captured in `docs/PRE-PHASE-3-FIX-PLAN.md` §2 carried through to the §2.16.1 decision 1 amendment.
- **A3 expanded column count from 10 to 19.** Justification 3 — PRODUCTIZATION-NOTES.md Stage 4 GA compliance surface ("every Claude call that touched this customer's deal data") requires foreign anchors (hubspot_deal_id, observation_id, transcript_id, job_id, actor_user_id) + operational columns (task_type, attempts, error_class, tool_name, max_tokens). Schema shape must land complete from first row; `ALTER TABLE ADD COLUMN` on a populated log loses retrospective fidelity. Review authorized the expansion explicitly (Output 2 A3 "(c)" section lists the full 19 cols).
- **A2 pull-forward captured as "nullable now; flip to NOT NULL Phase 4 Day 1".** Justification 2 — §2.16.1 decision 2 exists specifically to preserve historical segmentation metadata; Phase 3 Day 2 writers are the first event producers, and without the column at Phase 3 Day 2, those rows are permanently less analytically useful (hubspot_cache doesn't preserve history). Review authorized; amendment clarifies the NOT NULL flip is the Phase 4 Day 1 role.
- **W1 canonical amendment precedes the HubSpot provisioning step (Session 0-C).** Justification 4 — Session 0-C's W1 reasoning stub will cite this amendment; locking the canonical first means Session 0-C's entry is a pure execution-of-a-decision step, not a decision + execution combined. Also Justification 1 — three-way drift discipline per the ContactRole precedent.
- **R11 PRODUCTIZATION-NOTES Stage 3 paragraph.** Justification 3 — productization-arc visibility. The review explicitly ratified `/pipeline/:dealId` using HubSpot numeric IDs but flagged the Stage 3 transition cost; this paragraph preserves R11's "do not fix now" stance while making the deferred cost explicit so it cannot silently slip into v2 demo scope under SalesforceAdapter pressure.

No UNCERTAIN entries. All five amendment groups cite a specific guardrail, section, or arc.

**Parked items closed.**
- A15 OVERSIGHT-HANDOFF staleness — resolved in prior commit `49a929f` via retirement + replacement with OVERSIGHT-META.md. No longer in fix-session scope.

**Parked items added.** None. Session 0-B and 0-C scope is frozen in `docs/PRE-PHASE-3-FIX-PLAN.md` §4.2 and §4.3.

**Cost.** Zero Claude API, zero HubSpot API, zero Supabase writes. Doc edits only.

### Phase 2 Day 4 Session C (deal edit — expected)
- **Deal summary edit UI** — Day 3 shipped read-only `DealSummarySection`. Adds inline edit for vertical/product/lead source/competitor + company attributes.
- Promote `updateDeal` stub (currently `not_implemented`). Consumes the already-live `updateDealStage` pattern for the PATCH shape.
- Promote `updateCompany` stub if not already live (consult adapter state at Session C kickoff).

### Phase 2 Day 4 Session C (deal edit — expected)
- **Deal summary edit UI** — Day 3 shipped read-only `DealSummarySection`. Adds inline edit for vertical/product/lead source/competitor + company attributes.
- Promote `updateDeal` stub (currently `not_implemented`). Consumes the already-live `updateDealStage` pattern for the PATCH shape.
- Promote `updateCompany` stub if not already live (consult adapter state at Session C kickoff).

### Phase 2 Day 4 Session D (polish — expected)
- **Kanban filter chips** (deferred from Day 3 and from Session A) — stage multi-select + vertical filter.
- **`DealCard` hover lift revisit** (deferred from Day 3 and from Session A) — re-evaluate whether the second shadow reads muddy now that click-through is the default affordance; may land as `shadow-md` on hover + 1px translate, or stay as the current border-only transition.
- **`prefetch={false}` on PipelineTable row links** (deferred from Day 3) — once the pipeline fills with many rows, auto-prefetch on hover/viewport multiplies the 4-round-trip detail-page load.
- Promote remaining adapter CRUD stubs only if a Session D feature requires them (`upsertCompany`, `updateCompany`, `deleteContact`, `deleteCompany`, `deleteDeal` all stay stubbed otherwise).

### Pre-Phase 4 (hero-page design — expected)
- Run dedicated Claude Design sessions for hero pages (`/intelligence`, `/book`, call-prep card, close-analysis output). Export mockups to `docs/design/mockups/` and reference them in Phase 4+ kickoff prompts. Phase 2–3 proceed from `docs/design/DESIGN-SYSTEM.md` tokens alone; hero-page compositions need Mode 2 design work per DECISIONS.md 3.2. Decision to run this in Claude Design (Anthropic's design product) rather than Claude Code.
- **Data-viz palette** for the Phase 4 intelligence dashboard (pattern counts, rep comparisons, experiment attribution). DESIGN-SYSTEM.md doesn't specify chart colors; extract during the hero-design session as a new token family (likely graphite-300 → signal-500 gradient + semantic success/error reuse). Add to DESIGN-SYSTEM.md before Phase 4 Day 1 implementation.

### Pre-Phase 3 Day 1 (half-day slot — expected)
- **Post-deploy Playwright smoke test.** Promotes the Phase 2 Day 2 hotfix-cycle verification pattern to a permanent CI hook. Scope:
  - Extract the `admin.generateLink` + `@supabase/ssr` cookie-jar + Playwright `context.addCookies` pattern into `@nexus/db` scripts as `pnpm smoke:prod <url> [email]` (deployment URL + persona email, defaults to Sarah).
  - Route matrix: `/dashboard`, `/pipeline`, `/pipeline?view=kanban`, `/pipeline/new`, `/jobs-demo`. Each asserts `h1` presence + absence of `"Application error"` body text + zero uncaught browser exceptions + zero console-error signatures matching RSC-boundary violations (`"Functions cannot be passed directly to Client Components"`) or React-hook-mismatch patterns (`"is not a function"` tied to a React-named import).
  - Wire as a GitHub Actions workflow triggered on Vercel `deployment_status == success` (GitHub `deployment_status` event filtered to `state == "success"` on preview deploys); runs against the preview URL Vercel emits.
  - **Validate at implementation time** that `admin.generateLink` → `verifyOtp` sidesteps the 35s per-address magic-link rate limit — no email send is on that path, so it should bypass, but confirm before wiring to PR triggers. If the rate limit does fire, rotate between the two personas or provision the CI-only persona earlier than planned.
  - Would have caught all three Phase 2 Day 2 hotfixes pre-merge (Sidebar RSC icon-prop crash `2b41c4c`, kanban-toggle prefetch-poisoning `6a77782`, `/pipeline/new` useActionState React-version mismatch `6a77782`).
  - **Post-demo:** provision a dedicated CI persona (e.g. `ci-smoke@nexus-demo.com`) rather than continuing to use Jeff's real Gmail addresses (`jeff.lackey97`/`lackeyjk1997`). Keeps real inboxes out of the CI tooling path.

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
- **End-of-day verification: grep `pnpm build` output for load-bearing signatures.** Zero code; sign-off discipline only. Add to the existing hex-grep + stale-class-grep checks a scan for `Attempted import error`, `Module not found`, `Type error`, `Failed to compile`. Zero hits required. Scoped to these specific signatures rather than bare `warning` / `error` to avoid false positives from transitive-dep deprecations. Applies to every end-of-day sign-off going forward. Precedent: the `useActionState` `Attempted import error` emitted cleanly for two days before crashing in prod during the Phase 2 Day 2 hotfix cycle.

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
- **`pnpm build` warnings are load-bearing — never ignore "Compiled with warnings".** The Phase 2 Day 2 shipment carried `Attempted import error: 'useActionState' is not exported from 'react' (imported as 'useActionState')` as a build warning that Day 2 end-of-day did not grep for. The warning was the fingerprint of a runtime crash: React 19's `useActionState` hook is not available on React 18.3 (what Next 14.2.29 ships). At runtime the import resolves to `undefined`; SSR of `DealCreateForm` throws `TypeError` calling it. Resolution: for React 18 + Next 14, use `useFormState` from `"react-dom"` — identical signature for the two return values used. **Going forward: end-of-day verification must include a grep for `Attempted import error`, `Failed to compile`, and `error in`/`Error:` in build output, not just exit code 0.**
- **Next.js `Link` auto-prefetch can poison the client router if the prefetched route SSR-crashes.** A `<Link>` visible in the viewport or hovered auto-prefetches its href on production builds. If that route's SSR throws, the error payload is cached in Next's client-side `prefetchCache`. When the user takes any action that triggers router reconciliation (soft nav, another `router.push`, a concurrent `prefetch`), the poisoned entry surfaces as a client-side exception — no digest, no stack pointing at the original page. The symptom appears "detached" from the real bug. Phase 2 Day 2 hotfix cycle's "Bug 1" (kanban toggle client-side exception) was this pattern, with `/pipeline/new`'s `useActionState` SSR crash as the upstream cause. Fixing the upstream crash resolved both observable bugs in one commit. **Investigation rule: when a client-side exception appears on route X after an action, check every `<Link>` visible on route X for a sibling route that SSR-crashes — a clean SSR of every reachable route is a precondition for Link-prefetch reliability.**
- **Post-deploy browser verification via Playwright + Supabase admin cookie injection.** Pattern proven during the Phase 2 Day 2 hotfix cycle. Bypasses the 35s magic-link rate limit and the HttpOnly-cookie-from-JS restriction. Steps: (1) `admin.auth.admin.generateLink({type:"magiclink",email})` via service role, (2) `ssr.auth.verifyOtp({...,type:"email"})` through `createServerClient` with an in-memory cookie jar to harvest the Supabase `sb-<ref>-auth-token` cookie value, (3) `playwright.chromium.launch({headless:true})` → `context.addCookies([{name, value, domain:"nexus-v2-five.vercel.app", path:"/", secure:true, sameSite:"Lax"}])`, (4) `page.goto(...)` and assert on `document.body.innerText`, `h1`, form fields + listen on `console.error` and `pageerror`. This is the smoke-test shape the build has been missing for three hotfix cycles now. **Candidate for promotion to a permanent CI/CD hook** — see meta-lesson in the report: runs post-deploy against the preview URL Vercel emits, fails the PR if any auth-gated route shows an "Application error" body or an uncaught browser exception.
- **Dev-only `/api/dev-login` local-test helper pattern.** For fast local iteration against the dev server (not prod), a route handler gated to `host.startsWith("localhost")` that uses service-role admin to `listUsers` → `updateUserById({password: throwaway})` → `signInWithPassword({email,password})` bypasses both the magic-link 35s rate limit AND the OTP single-use lifecycle. Setting the password is harmless for a seeded persona (email/password auth is just another provider in Supabase). Set it again per invocation to avoid state accumulation. **Phase 2 Day 3 promoted this to a permanent route** at `apps/web/src/app/api/dev-login/route.ts` with double guard: `host.startsWith("localhost")` AND `process.env.DEV_LOGIN_ENABLED === "1"`. `.env.example` documents the flag at `0` with an explicit "NEVER set on Vercel" note; `.env.local` sets `1` locally. Retire when the parked Pre-Phase 3 Day 1 Playwright + admin-cookie post-deploy smoke lands.
- **Client components must not import runtime values from `@nexus/shared`.** The package's top-level barrel re-exports `./services` and `./crm`, both of which import `postgres` (and Node's `net`). Tree-shaking (`"sideEffects": false` on the package since Phase 2 Day 3) lets webpack strip unused exports, but **only for type-only imports** — those are erased before webpack sees them. A runtime-value import like `import { MEDDPICC_DIMENSION } from "@nexus/shared"` inside a `"use client"` file causes webpack to trace the barrel and bundle `postgres` into the browser chunk, failing with `Module not found: Can't resolve 'net'`. Rule: in client files, import types only from `@nexus/shared`; runtime values come in as props from the nearest server component (Phase 2 Day 3's `MeddpiccEditCard` takes `dimensions: readonly MeddpiccDimension[]` as a prop from its server page). Enforced by convention today; lint rule is a candidate for Pre-Phase 3 Day 1 alongside the post-deploy smoke.
- **Next `<Link>` auto-prefetch on a multi-round-trip route compounds with view size.** `/pipeline/[dealId]` is 4 HubSpot round trips per cold-cache load (getDeal + getCompany + associations + fan-out getContact). Each visible row on `/pipeline` that links to a detail page will auto-prefetch on hover/viewport in production. With one real deal today the cost is invisible; with 50 deals in view it's 200+ HubSpot calls per page session. Mitigations when the problem surfaces: `prefetch={false}` on row links for the cheapest fix, or server-component `<Suspense>` wrapper on the detail page with a skeleton so the prefetch returns the lightweight shell. Track in the Day-4 + Pre-landing parked items.
- **`MeddpiccService` is the pattern template for future Nexus-only services.** Phase 3's `SignalService`, `ObservationService`, `DealIntelligenceService`, etc., should mirror the shape: class in `packages/shared/src/services/`, `postgres.js` directly (not Drizzle — consistent with other server modules that write raw SQL via postgres.js, and keeps `@nexus/shared` free of a `@nexus/db` dep), `{databaseUrl, sql?}` options for test-injection, `close()` method, request-scoped factory at `apps/web/src/lib/<name>.ts` mirroring `createHubSpotAdapter`. Auth gate at the caller (Server Action or route handler) using `createSupabaseServerClient().auth.getUser()` before touching the service. Phase 2 Day 4 Session A confirmed the pattern generalizes — `StakeholderService` was a clean second outing; no forced-fit. Ready to promote to a Guardrail if/when a third service reproduces the shape.
- **HubSpot v4 `default` association endpoint is the right tool for "associate with the default label" work, not v3 numeric typeIds.** Session-A Finding A: `PUT /crm/v3/objects/deals/{id}/associations/contacts/{id}/4` (typeId 4 = Deal→Contact non-primary per public docs) returned 400 on portal `245978261`, likely because custom association schemas or Starter-tier restrictions render the numeric type invalid. Use `PUT /crm/v4/objects/deals/{id}/associations/default/contacts/{id}` — v4's auto-resolve picks the HubSpot-defined default label for the object-type pair. v4 deletes are similarly easier: `DELETE /crm/v4/objects/deals/{id}/associations/contacts/{id}` removes all labels in one call (no per-typeId enumeration). Live adapter methods `associateDealContact` + `dissociateDealContact` use v4 `default` throughout.
- **HubSpot auto-associates contacts to companies by email-domain matching.** When a contact's `email` domain equals a company's `domain` property, HubSpot creates the Contact↔Company association automatically on contact create/update — no explicit API call required. Convenient for Session-A's "Create new stakeholder in deal's company" flow (upsertContact didn't need to pass companyId to get the association). Not guaranteed: if a customer's HubSpot portal disables this feature, or if the rep enters a non-matching email domain, the contact is orphaned from the company and won't appear in `listContacts({companyId})` candidate lists. Production-safety item parked: extend `upsertContact` (or add explicit follow-up in the server action) to PUT a Contact↔Company default association when `companyId` is provided. Not urgent for demo where seeded company domains match; matters for production.
- **Pattern A tables (e.g., `observations`) use postgres.js-direct writes with observer_id passed from the SSR `auth.getUser()` result — the service-role bypasses RLS, so the application layer enforces the Pattern A invariant.** Unlike Pattern D (read-all, service-role writes — DECISIONS.md §2.2.1), Pattern A's "own rows only" constraint is baked into the RLS policy (`observer_id = auth.uid()`). A postgres.js connection uses the pooler / service-role credentials and doesn't have `auth.uid()`, so the service cannot let Postgres enforce the constraint at the row layer. Enforcement lives at the route boundary: (1) SSR client `auth.getUser()` validates the Supabase JWT + returns `user.id`, (2) the server action passes `user.id` as `observerId` to the service, (3) the service writes that as `observer_id`. The `test-rls-observations.ts` script verifies Pattern A separately at the anon+JWT-client layer (where Postgres DOES enforce the policy) — that's the canary for schema/policy drift. Any future Pattern A service (user-authored content in Phase 4+) mirrors this two-layer design.
- **`shadcn dlx add <primitive>` always lands unskinned defaults that MUST be reskinned to Graphite & Signal tokens before use.** Pattern locked through Day 1's seven-primitive reskin + Session B's Dialog reskin. Checklist:
  - Replace `bg-background`, `text-foreground`, `bg-card`, `text-card-foreground`, `bg-primary`, `text-primary-foreground`, `bg-destructive`, `text-muted-foreground`, `text-destructive-foreground` with semantic tokens (`bg-surface`, `text-primary`, `text-tertiary`, `text-error`, etc.).
  - Replace `border-border` → `border-subtle`. Replace `ring-ring` / `ring-offset-background` / `focus:ring-*` → `focus:shadow-[0_0_0_3px_var(--ring-focus)]` (the baked Input/Dialog focus-ring pattern from Day 1).
  - Replace any `bg-black/*` or other inline opacity hex → a dedicated baked-rgba CSS variable in `globals.css :root`. Session B's `--backdrop: rgba(8, 10, 14, 0.6)` is the Dialog overlay precedent, mirroring Day-1's `--ring-focus`.
  - Check the nothing-is-flat discipline — overlay gets a backdrop, content gets shadow + border + focus ring, transitions on `duration-fast ease-out-soft`.
  - Re-run the `pnpm build` stale-shadcn-class grep (`bg-background|text-foreground|bg-brand|border-border|ring-ring|bg-card|text-card-foreground|bg-primary|text-primary-foreground|bg-destructive|destructive-foreground|text-muted-foreground|ring-offset-background`) — must be zero. Any residue means the reskin is incomplete.
- **`@dnd-kit` uses a client-side counter to assign `aria-describedby` IDs (DndDescribedBy-N); these mismatch between SSR + hydration and React warns every render.** Fix: defer rendering of `useDraggable`/`useDroppable` participants until after `useEffect` mount via a `mounted` boolean. Before mount, render static equivalents (no `{...listeners} {...attributes}`); after mount, swap to the DnD-wrapped versions. DnD requires JS anyway, so the swap is invisible to users. Session B `PipelineKanban.tsx` is the precedent.
- **Supabase's shared transaction pooler caps at ~200 concurrent clients. Each `postgres.js` pool per service stays up for `idle_timeout: 30s` after the last query.** Current per-service `max` values after the Session-B trim: MeddpiccService = 1, StakeholderService = 1, ObservationService = 1, HubSpotAdapter = 2. Peak per request: ~5 connections. If the pooler saturates again, the Phase 3 Day 1 proper mitigation is a process-wide shared postgres.js client that all services borrow via the `{sql?}` constructor option. With 3 request-scoped services on a deal-detail page view, plus test scripts that open their own pools, plus multiple preview sessions across a work-day, 200 clients saturates within hours — at which point every `MeddpiccService.getByDealId` throws `PostgresError: (EMAXCONN) max client connections reached, limit: 200` and the page returns a 500 with a blank body. Surfaced during Session A's post-split browser re-verification — drain time exceeded a reasonable wait (3+ minutes) because other processes continued to re-saturate. Mitigations for Phase 3 Day 1: (a) drop per-service pool `max` from 3/5 to 1-2 so each request consumes less of the pooler budget; (b) cache a single process-wide `postgres.js` client and have services borrow its `sql` via the existing `{sql?}` injection — eliminates the per-request pool cost; (c) route long-lived processes (background workers) to `DIRECT_URL` instead of the pooler so they don't compete for pooler slots. Until then: if a page returns a blank body + `EMAXCONN` in server logs, stop ad-hoc scripts + preview sessions and wait 2-5 minutes for drainage.

---

## Context for next session

**What's built.** Monorepo scaffolded, deployed to Vercel production at `https://nexus-v2-five.vercel.app` and auto-deploying on push to `main`. Supabase schema complete (38 tables, 31 enums, 49 RLS policies, 5 migrations). Authenticated dashboard works via Supabase Auth magic links; cross-user RLS proven for Pattern A (observations) and Pattern D (meddpicc_scores). Background job infrastructure (`jobs` + `job_results` + `pg_cron` every 10s + Supabase Realtime) live. Unified Claude wrapper at `@nexus/shared/claude` loads `.md` prompt files from `@nexus/prompts`, forces `tool_use` responses, retries transport errors, emits telemetry. First ported prompt (`01-detect-signals`) integration-tested. 14 demo users seeded. **Phase 1 Day 5** added the full CRM layer: `CrmAdapter` interface + `HubSpotAdapter`, webhook receiver with HMAC-SHA256 signature verification, rate-limited HTTP client, `hubspot_cache` read-through, `/pipeline` page. Live HubSpot portal (`245978261`): Nexus Sales pipeline + 9 stages, 38 `nexus_*` custom properties, 18 webhook subscriptions, MedVista Epic Integration. Stage-change round-trip 3–4s under 15s SLA. **Phase 2 Day 1** added the Graphite & Signal design system: three-layer token consumption, Geist + Instrument Serif loading, seven shadcn primitives reskinned with nothing-is-flat defaults, declarative route registry, server-rendered Sidebar + AppShell, five existing routes migrated. Four `pgEnum` tuples single-sourced to `packages/shared/src/enums/`. **Phase 2 Day 2** closed the enum loop (5/5 tuples canonical; `deal_stage` reconciled via ordinal-preserving `ALTER TYPE RENAME VALUE`). ContactRole three-way drift resolved to 9-value canonical via Path B. `listCompanies` promoted. `/pipeline` gained view toggle (table ⇄ kanban) + "New deal" Button. `/pipeline/new` ships deal-creation form. **Phase 2 Day 2 hotfix cycle** (three out-of-band fixes: auth siteUrl hardening, RSC icon-prop crash, React-18 `useActionState` → `useFormState`). **Phase 2 Day 3** added deal detail at `/pipeline/[dealId]`: header + summary + stakeholder preview + MEDDPICC edit via new `MeddpiccService` (first Nexus-only service, postgres.js direct). Four contact-side adapter stubs promoted (`getContact`, `updateContact`, `listContacts`, `listDealContacts`). Kanban cards + table rows click-through to detail. Permanent `/api/dev-login` localhost-gated helper. `@nexus/shared` gained `"sideEffects": false` for tree-shaking. 13 routes total.

**What's next and how to pick up.** Phase 2 Day 4 — stakeholder management UI (adds/removes contacts, assigns roles via `deal_contact_roles` + `setContactRoleOnDeal` stub promotion), kanban DnD stage change (`@dnd-kit/core`), dropdown stage change on detail + table row, Close Won / Close Lost outcome stubs, kanban filter chips (deferred from Day 3), `DealCard` hover-lift revisit (deferred from Day 3), deal summary edit (Day 3 shipped read-only). Orienting triad unchanged: **`docs/DECISIONS.md`** (constitution + amendments 2.1.1, 2.2.1, 2.2.2, 2.6.1, 2.13.1, 2.16.1, 2.18.1) + **`docs/BUILD-LOG.md`** (this file) + **`CLAUDE.md`** (bootstrap). Read that triad before touching code. The primitive library under `apps/web/src/components/ui/`, the three-layer token scheme in `tailwind.config.ts` + `globals.css`, the shared `stage-display.ts` / `meddpicc-display.ts` helpers, and `MeddpiccService`'s postgres-direct shape are the contracts for all Phase 2+ code — reach for semantic utilities (`bg-surface`, `text-primary`, `border-subtle`) by default, raw scales only when the design explicitly demands them, type-only imports from `@nexus/shared` in client files. `PRODUCTIZATION-NOTES.md` is strategic reference only — not required reading for build-day sessions.
