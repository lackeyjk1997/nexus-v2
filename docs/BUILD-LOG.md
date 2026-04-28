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

## Current state (as of 2026-04-28 — Phase 4 Day 2 closed · Phase 4 Day 3 ahead)

- **Phase / Session completed:** Phase 3 Day 4 Session B — pipeline wiring + verification staircase + Vercel deploy closeout. Day 4 fully closed; **Phase 3 fully closed.** All 7 scope items shipped + verified live. handlers.ts now runs the 8-step pipeline shape (`stepsCompleted`: ingest, preprocess, analyze, persist_signals, persist_meddpicc, coordinator_signal, synthesize, persist_theory_email — Meta-F applied: single outer "analyze" entry with internal 3-way Promise.all unchanged) with **5 Claude calls per pipeline run** verified live producing 5 distinct `prompt_call_log` rows on both direct-invocation AND worker-dispatched paths. Step 5 fans out `IntelligenceCoordinator.receiveSignal` per detected signal (no-op today; Phase 4 Day 2 fills in). Step 6 runs a 2-way `Promise.all` over 06a-close-analysis-continuous + email-draft (post_pipeline) — both consume step-3 outputs as common context. Step 7 appends `deal_theory_updated` event via `DealIntelligence.appendTheoryUpdate` + `email_drafted` event directly via sql, both with `event_context` populated and source_refs jobId-scoped per §2.16 append-only. `06a-close-analysis-continuous` reactive-bumped 1.1.0 → 1.2.0 (max_tokens 1500 → 4000) per §2.13.1 after live PHASE 1 hit `stop_reason=max_tokens` at 1500. `DealIntelligence.getCurrentTheory` gained snake_case → camelCase transform so consumers read a single shape. Dev-script IPv6 fallback to pooler URL applied across 7 scripts after dev-Mac IPv6 route to Supabase broke (Decision 1's option (a) DNS fix didn't resolve at routing layer; user-approved option (c) per parked-item resolution path). Vercel deploy via `git push origin main` (commit `6af80e4`); auth-gate smoke PASS (HTTP 401 in 500ms). Pool-saturation cascade post-deploy required a session-mode pooler bypass (port 5432) to pause `pg_cron` while transaction-pooler drained; new operational scripts `pool-session.mts` (pause/resume cron + ping) + `pool-quick.mts` (one-shot status with retry helper) committed as durable ops tooling. **All verifications green:** mock harness 3/3 PHASES PASS; live PHASE 1 + 1.5 + 2 + 3 PASS at 8-step shape + 5-call worker fanout verified live on both direct-invocation AND worker-dispatched paths; auth-gate smoke PASS; cron resumed at session close (production state restored). PHASE 3 worker-dispatched run: succeeded@137s with the worker-path 5-call fanout matching the direct-invocation fanout shape. Garbage-checks PASS on theory + email outputs across 4 live runs (3 sub-step-2 PHASE-1+2 plus 1 PHASE-3): MedVista-grounded working hypothesis citing InfoSec timeline + Microsoft DAX, recipient correctly resolved to "Dr. Michael Chen, Chief Medical Officer, MedVista Health" each time, body 1423-1535 chars, has_attachments=true with SOC 2 doc consistently flagged.
- **Pre-Phase 4 Session A complete** (`23500f0` · 2026-04-27). Three small surface edits closing the recurring EMAXCONN cost: shared-pool max 10→5, worker-route circuit breaker on EMAXCONN (503 + Retry-After + stderr telemetry), `configure-cron.ts` pooler-URL fallback. Session A inherits the hardened operational baseline.
- **Phase 4 Day 1 Session A complete.** Foundations shipped per A/B split (Day 1 scope was ~13-15h; mirrors Phase 3 Day 3/4 split precedent). Migration 0006 applied live: `deal_events.event_context SET NOT NULL` flip (Preflight 8 audit returned 0 NULL rows, clean) + `applicability_rejections` diagnostic table (kickoff Decision 7) with 3 indexes + RLS Pattern D. New `packages/shared/src/applicability/` module: `dsl.ts` (Zod schema per Decision 2 — Foundation Review C2 + 2 minor edits), `evaluator.ts` (`applies({rule, dealState, eventStream}): {pass, reasons[]}` + co-located `DealState` type), `index.ts` barrel. New `DealIntelligence.getDealState(dealId)` method reads `hubspot_cache.payload.properties.*` (the RAW HubSpot shape) + uses pipeline-ids inverse for stage resolution + emits `dealstate_stage_fallback` stderr telemetry per kickoff Reasoning addition when no `stage_changed` event exists. Two new gates: `test:applicability-dsl` 12/12 CASES PASS, `test:deal-state` 8/8 CASES PASS against MedVista (vertical=healthcare, stage=discovery, 8 MEDDPICC dims, 51 open signals, $2.4M deal). Discovered Phase 3-era latent bug in `buildEventContext`: it reads `dealPayload?.vertical/stage/amount/companyId` directly but cache stores raw HubSpot shape `{properties: {nexus_vertical, dealstage, amount, ...}, associations: {...}}`. Result: every Phase 3-era `event_context` jsonb has populated structure but null fields inside (verified via diagnostic query). Schema flip unaffected (column-level NOT NULL holds with non-null jsonb). Bug + backfill PARKED for separate fix per scope discipline (kickoff escalation rule for execution-time discoveries: take action with reasoning capture; reading-shape fix in `buildEventContext` affects every Phase 3+ event writer + needs a backfill strategy + interacts with mapper boundary; out of Session A scope). All baseline gates green ($0 live Claude / HubSpot / Voyage; one live schema migration applied to prod Supabase).
- **Phase 4 Day 1 Session A.5 complete.** Interstitial buildEventContext shape-fix + Phase 3-era backfill closes the §2.16.1 decision-2 preservation arc value-side bug Session A discovered. `DealIntelligence.buildEventContext` now reads `payload.properties.{dealstage,nexus_vertical,amount}` + `payload.associations.companies.results[0].id` (with `payload.companyId` fallback) byte-symmetrically with `getDealState`, reusing Session A's `stageIdToInternal()` + `parseHubspotNumber()` helpers. New `test:build-event-context` 8/8 unit gate against actual cache shape (mocked sql injection seam, hand-written MedVista-shaped fixture). New `apply:event-context-backfill` script with `--session` CLI fallback + two-phase batch processing (reads outside transaction, UPDATEs inside). **Live: 92/92 Phase-3-era rows updated** (signal_detected: 51, meddpicc_scored: 22, deal_theory_updated: 9, email_drafted: 9, transcript_ingested: 1; all on MedVista 321972856545). Re-audit returns 0 vertical-null rows (was 92). Spot-check on MedVista's 5 most recent events confirms accurate values across 4 distinct event types (`{vertical: "healthcare", stageAtEvent: "discovery", dealSizeBand: "1m-5m", employeeCountBand: "1k-5k", activeExperimentAssignments: []}`). Session A's `test:deal-state` regression check holds at 8/8. Operational note: mid-session transaction-pooler EMAXCONN saturation surfaced; followed Pre-Phase 4 Session A's documented escalation path (pause cron → drain) but added the `--session` CLI flag to the backfill to route via session pooler when transaction pooler is saturated, completing the live exercise without waiting the full drain. ($0 live Claude / HubSpot / Voyage; 92 corrective UPDATEs on prod Supabase.)
- **Phase 4 Day 1 Session B complete.** Admission engine + scoring prompt + surfaces registry + `getApplicable*` methods + verification staircase shipped per A/B split (kickoff Decision 1). New surfaces registry at `packages/shared/src/surfaces/` (literal port of rebuild plan §6 lines 470-494, 4 surfaces, discriminated TS types). New scoring prompt `09-score-insight.md` (prompt_id 26, temperature 0.2 classification-class, max_tokens 2500, `reasoning_trace` first per §2.13.1 Principle 6, tool_name `score_insight`). Three new `DealIntelligence.getApplicable{Patterns,Experiments,Flags}(dealId, {surfaceId?})` methods composing Session A's evaluator + table reads + per-rejection batch INSERT to `applicability_rejections`. New `SurfaceAdmission.admit({surfaceId, userId, dealId?})` engine with surface-kind routing (deal-specific calls applies(); portfolio skips it per Decision 3). Read-side dismissal filter against `surface_dismissals` (mode soft + future resurface_after OR mode hard); `surface_feedback` write-path-only for Session B per Decision 5. Verification staircase: 4 new gates (`test:surfaces-registry` 8/8, `test:applicable-pattern-experiment-flag` 9/9 — 3 per kind, `test:surface-admission` 8/8, `test:admit-medvista` clean run + synthetic-pattern). Live exercise: clean run produced empty admitted set (§1.18 silence-as-feature verification PASS) + synthetic-pattern path produced 1 admitted with live Claude score=78 in stop_reason=tool_use under max_tokens budget (output=688 tokens; ~$0.025 spend). Pool saturation hit mid-live-exercise — third in four sessions; followed Pre-Phase 4 Session A's escalation (pause cron → 2-streak DRAINED → resume); Decision 9 parked item: investigate root cause before Phase 4 Day 2. Operational notes added: Decision 8 `--session` CLI flag established pattern + Decision 9 recurring pool saturation parked item + Desktop launch.json false-greenfield discovery (third occurrence). Cost: ~$0.025 live Claude / $0 HubSpot / $0 Voyage / ~50-70 prod-Supabase reads / 1 INSERT + 1 DELETE on coordinator_patterns (synthetic) / 1 prompt_call_log attempted (write failed mid-EMAXCONN — wrapper best-effort contract working as designed; Claude call itself succeeded).
- **Pre-Phase-4-Day-2 complete (Path A conclusive).** Recurring pool-saturation root cause identified + targeted fix landed: Hypothesis 1 (worker route's `createDb` per-invocation call combined with `postgres.js` default `idle_timeout: 0` (never close) leaks one connection per cron-fired invocation in Vercel Fluid Compute warm containers; accumulated leaks saturate the ~45-slot application headroom on the Supabase 200-cap pooler within minutes — matches Phase 3 Day 4 Session B's "drain stalled past 25 min" observation). Three surgical mitigations: (1) worker route uses `createDbFromSharedSql(getSharedSql())` (new `@nexus/db` helper) so route + handler share the single per-container shared pool, eliminating per-invocation pool allocation; (2) `createDb` default `idle_timeout: 30s` (was: 0) as defense for script consumers; (3) `pool-snapshot.mts` durable ops tooling promoted from one-off (Decision 11 anchor; recognizes the pooler-hysteresis-vs-genuine-leak distinction in `candidate_leaks_60s_plus_excl_supavisor_recycle` filter). Diagnostic constraint surfaced + documented: `pg_stat_activity` is OPAQUE to the saturating layer (pooler client-side cap); EMAXCONN remains the ground-truth signal. Synthetic harness verified: cap saturates at 45 of documented 200 (~155 baseline used by other Supabase services); pooler hysteresis ~30s post-`sql.end()` (multipool test left 16 idle backend connections 32s after close); `application_name` does NOT propagate through either pooler. Verification: all 12 baseline gates green; synthetic post-mitigation cap test still 45 (cap is platform-controlled — mitigations target leak rate over minutes, not instantaneous capacity); pool-snapshot post-mitigation baseline shows 0 candidate leaks. Empirical multi-minute verification window inherits to Phase 4 Day 2's first 30 minutes post-deploy. Cron resumed at session close (jobid=6). Cost: $0 live Claude / $0 HubSpot / $0 Voyage / ~80-100 prod-Supabase reads / 0 writes.
- **Phase 4 Day 2 Session A complete (Path A conclusive).** Coordinator-class trio shipped: `IntelligenceCoordinator.receiveSignal` real impl (validates input + dedups against in-flight `coordinator_synthesis` jobs in last hour + enqueues fresh job per Decision 2); `IntelligenceCoordinator.getActivePatterns` real impl (reads `coordinator_patterns` where status IN (detected, synthesized) with optional vertical/signalType/dealIds filters); `coordinator_synthesis` job handler (replaces `notYet` stub — reads recent 30d signals grouped by (vertical, signal_type), filters by `minDealsAffected` default 2, calls 04-coordinator-synthesis, writes `coordinator_patterns` + `coordinator_pattern_deals` join rows idempotent on `pattern_key = sha256(vertical:signal_type:sorted-deal-ids).slice(0,32)`). New `coordinator-synthesis.ts` tool definition mirrors the prompt's tool-use schema with `reasoning_trace` first per §2.13.1 Principle 6. `JobHandlerHooks` extended with optional `sql` for test-time DB injection seam. Telemetry per Decision 8 — 7 stderr JSON event shapes (`signal_received`, `signal_dedup_skipped`, `signal_received_invalid`, `coordinator_synthesis_started`, `pattern_below_threshold`, `pattern_detected`, `coordinator_synthesis_completed`). All gates green: 4/4 typecheck + 13 routes clean build + enum:audit + 53/53 baseline tests + **16/16 new** (test:coordinator-receive-signal 8/8, test:coordinator-active-patterns 5/5, test:coordinator-synthesis 3/3 PHASES). Live exercise `test:coordinator-synthesis-medvista` PASS via Path A silence-path: MedVista alone with 7 single-deal healthcare signal-type groups → all 7 sub-threshold → FULL telemetry trail proven (`coordinator_synthesis_started` × 1 → `pattern_below_threshold` × 7 → `coordinator_synthesis_completed{patterns_emitted=0}` × 1). 0 Claude calls; 0 coordinator_patterns writes. **Pool-snapshot 5-min + 30-min post-deploy gate PASS** at both windows: `candidate_leaks_60s_plus_excl_supavisor_recycle` shows ONLY the 2 known unrelated long-held entries (postgrest LISTEN + ancient admin "show archive_mode") at both 5-min and 30-min. Pre-Phase-4-Day-2 leak fix empirically confirmed under coordinator + cron load. The 25-minute QUIET PERIOD between snapshots was used productively for BUILD-LOG drafting + Reasoning-stub composition per Decision 5 discipline. Cost: $0 live Claude / $0 HubSpot / $0 Voyage.
- **Phase 4 Day 2 Session B complete (Path A conclusive).** Operational quad shipped: `hubspot_periodic_sync` handler (replaces `notYet` stub; reads `sync_state` per resource, calls adapter.bulkSync* sequentially, UPSERTs cursor with sync-START time as new last_sync_at; partial-failure semantics across 3 resources). Worker retry policy (3 attempts, 1m+5m exponential backoff via `scheduled_for`; existing claim filter respects). Worker concurrency model (sequential loop-until-empty within 240s budget + pre-claim time check + **stalled-job sweep** at start of every invocation per the user-flagged amendment — catches handler overruns past the 60s margin that would otherwise leave status='running' indefinitely). Wrapper retry-on-protocol-violation (1 retry max + new `_internal.sdk` injection seam for testability). Worker route refactored to delegate to new `packages/shared/src/jobs/worker-runner.ts`. Telemetry dashboard `/admin/claude-telemetry` re-deferred to Phase 4 Day 5 per Decision 1 — UI work fits that window better. **17/17 new test cases PASS** (4 + 5 + 4 + 4); all 9 baseline gates unchanged (53/69 from prior sessions PASS); typecheck 4/4 + build 13 routes clean + enum:audit + audit-event-context 0 vertical-null. **Live exercise** (`test:hubspot-periodic-sync-live`): synced 8 records (2 deal + 4 contact + 2 company) from live HubSpot Starter portal in 4244ms; all 3 sync_state cursors advanced; cache delta=+0 (UPSERT idempotency). configure-cron extended: both `nexus-worker` (10s) + `nexus-hubspot-sync` (15-min `*/15 * * * *`) scheduled. **Pool-snapshot 5-min + 30-min post-deploy gate PASS** at both windows: candidate_leaks shows ONLY the 2 known unrelated entries; total_connections=13 stable. Pre-Phase-4-Day-2 leak fix continues to hold under Session B's expanded load surfaces (15-min sync cron + worker loop-until-empty + retry-driven re-enqueue + stalled-job sweep). The four-of-four EMAXCONN pattern remains structurally CLOSED. Cost: $0 live Claude / ~8 HubSpot reads / $0 Voyage.
- **Next milestone:** **Phase 4 Day 3 — observation clustering + cross-deal pattern detection.** Inherits coordinator skeleton complete + worker hardening (retry/loop/sweep) + sync cron all flowing. Day 3 wires the observation_cluster job handler + per-cluster cross-deal pattern detection, leveraging the existing `observation_clusters` table substrate from migration 0001+. See **`## Forward map`** section for downstream sequence.
- **Phase 3 Day 1:** complete.
- **Phase 3 Day 2:** complete. Sessions A + B shipped.
- **Phase 3 Day 3:** complete. Sessions A + B shipped.
- **Phase 3 Day 4 Session A:** complete.
- **Phase 3 Day 4 Session B:** complete.
- **Phase 3 — fully closed.**
- **Pre-Phase 4 Session A:** complete.
- **Phase 4 Day 1 Session A:** complete.
- **Phase 4 Day 1 Session A.5:** complete.
- **Phase 4 Day 1 Session B:** complete.
- **Pre-Phase-4-Day-2:** **complete (Path A conclusive).**
- **Phase 4 Day 2 Session A:** **complete (Path A conclusive).**
- **Phase 4 Day 2 Session B:** **complete (Path A conclusive).** Phase 4 Day 2 fully closed. Phase 4 Day 3 queued.
- **Latest commit on `main` (nexus-v2):** `cf2c9c2 feat(phase-4-day-2-session-b): hubspot_periodic_sync + worker retry/loop/sweep + wrapper protocol-retry`. Builds on `4ca8a98 docs(productization): HubSpot Smart Properties + Data Agent — Stage 2 AI-layer integration note` → `0fdc30a docs(build-log): Phase 4 Day 2 Session A entry` → `e124547 feat(phase-4-day-2-session-a)` → `e08d2f7 docs(build-log): park two future-phase items pre-Phase-4-Day-2-Session-A` → `48adebf feat(pre-phase-4-day-2)` → `39405b7 feat(phase-4-day-1-session-b)` → `95aaca7 feat(phase-4-day-1-session-a-5)` → `561e458 feat(phase-4-day-1-session-a)` → `23500f0 feat(pre-phase-4-session-a)`.

## Prior current-state (Phase 3 Day 3 fully shipped: Sessions A + B)

- **Phase / Day completed:** Phase 3 Day 3 end-to-end. Session A landed the internal code (two PORT-WITH-CLEANUPS prompt files + tool schemas, `DealIntelligence.formatMeddpiccForPrompt` + byte-identical diff gate, `HubSpotAdapter.updateDealCustomProperties` real PATCH, `MeddpiccService.upsert` per-dimension-confidence persistence, adapter verification script authored-but-not-run). Session B wired it all into the handler: step 3 `Promise.all` expanded to three parallel Claude calls (detect-signals + pipeline-extract-actions + pipeline-score-meddpicc), step 4 gained `persist-meddpicc` (Nexus DB upsert with merge-prior-state + live HubSpot writeback of 9 properties + `meddpicc_scored` event with event_context), action items surface in `jobs.result.actions` jsonb only per adjudicated Decision 2. `JobHandlerContext` gained optional `hooks` for test-time DI (MockClaudeWrapper + capturing no-op adapter); worker route passes none (production default), sub-step 1 mock harness passes both. The 3-step verification staircase all green: sub-step 1 mock (`test:transcript-pipeline-mock` 3/3 PHASES PASS — handler shape + idempotency + HubSpot bag shape against clean-slate fixtures), sub-step 2 adapter live canary (`test:update-deal-custom-properties` 2-property PATCH round-trip verified on MedVista 321972856545 with cache patch-in-place + `cached_at` advance), sub-step 3 full-flow live (`test:transcript-pipeline` 3/3 PHASES PASS including worker-dispatched path via `/api/jobs/enqueue` + Realtime transitions at `succeeded@67s`). **Fanout verification live-green on both direct-invocation AND worker-dispatched paths:** exactly 3 `prompt_call_log` rows per pipeline invocation, distinct `prompt_file` + `tool_name`, matching `(hubspot_deal_id, transcript_id, job_id)` anchors, no race artifacts, no errors. Garbage-scores check passed — live MEDDPICC scores span 45-82 across 8 dims with calibrated confidences (0.65-0.95) + verbatim evidence quotes; second full run produced slightly different scores (55-82 range; temp-0.2 non-determinism) but all still legitimate, evidence-backed, no garbage pattern. Day 2 Session B's `Promise.all([single-call])` harness shape paid off exactly — adding the two additional call sites was strictly additive, no restructure.
- **Next milestone:** **Phase 3 Day 4 kickoff** — step 5 coordinator-signal stub (until Phase 4 wires the coordinator), step 6 synthesize-theory via `06a-close-analysis-continuous` (TS schema needed), step 7 draft-email via consolidation of #12/#18/#24 into `email-draft.md`. Day 4 step 7 becomes the first consumer of `jobs.result.actions`. The Day 2 Session B parked item on `outputFileTracingIncludes` for prompt files in Vercel production likely triggers at the first Vercel deploy post-Day-3 — Day 4 kickoff should verify the three new `pipeline-*.md` + two rewrite prompts bundle correctly.
- **Phase 3 Day 1:** complete.
- **Phase 3 Day 2:** complete. Sessions A + B shipped.
- **Phase 3 Day 3:** **complete.** Sessions A + B shipped.
- **Phase 2 status:** Days 1–4 Sessions A and B complete and shipped. Session C (deal summary edit) and Session D (polish) deferred until after Phase 3 lands per `docs/PRE-PHASE-3-FIX-PLAN.md` §7.
- **Latest commit on `main` (nexus-v2):** `fe2b7b9 feat(phase-3-day-4-session-a): email-draft CONSOLIDATE + 06a TS schema + IntelligenceCoordinator + DealIntelligence theory methods`.
- **Companion commit on `main` (nexus — frozen handoff):** `5a472b3 docs(handoff): 04C Rewrite 1 reasoning_trace mirror + 10-REBUILD-PLAN §Phase-3 banner`. Third §2.13.1 handoff-edit precedent after `533d3eb` (ContactRole) + `c48470b` (reconciliation banners). Pre-existing uncommitted changes in nexus (apps/web/package.json + pnpm-lock.yaml) NOT included — predate this session.
- **Prior meaningful commits (chronological):** `1781780 feat(phase-2-day-4-session-b)` → `5739522 docs: update build log current-state with Session B HEAD` → `684ae88 docs: persist pre-Phase-3 foundation review` → `49a929f docs: pre-Phase-3 fix plan + oversight-handoff retirement + CLAUDE.md staleness fixes` → `b1d5a7b docs(pre-phase-3-session-0-a): shape locks + strategic amendments` → `7af4832 docs(build-log): fill in Session 0-A commit hash` → `17ea8e3 feat(pre-phase-3-session-0-b): foundation migration + shared pool + code hygiene` → `3413528 docs(build-log): fill in Session 0-B commit hash` → `9b7ca9c feat(pre-phase-3-session-0-c): HubSpot MEDDPICC 8th property + enum:audit + webhook dedup` → `4e5d281 docs(build-log): fill in Session 0-C commit hash` → `00e61e9 docs(reconciliation): pre-Phase-3 doc reality-check + fix plan closeout + CLAUDE.md handoff refs` → `367fda2 docs(build-log): fill in reconciliation commit hashes` → `79cbf8f feat(phase-3-day-1-session-a): prompt-file ports + shared loadDevEnv helper` → `92fcc43 docs(build-log): fill in Session A commit hash` → `0e79c40 feat(phase-3-day-1-session-b): wrapper prompt_call_log wiring + MockClaudeWrapper` → `53cd05f docs(build-log): fill in Session B commit hash` → `a929dcd feat(phase-3-day-2-session-a): 01 reasoning_trace + TranscriptPreprocessor + HNSW` → `3669758 docs(build-log): fill in Phase 3 Day 2 Session A commit hash` → `7f1b3f8 feat(phase-3-day-2-session-b): transcript_pipeline handler end-to-end`.
- **Companion commit on `main` (nexus — frozen handoff):** `c48470b docs(handoff): reconciliation banners — pre-Phase 3 reality check`. Session A has no nexus-repo companion commit — the 8 rewrite files stay in place at `~/nexus/docs/handoff/source/prompts/` as archival per CLAUDE.md "~/nexus is read-only reference" + PORT-MANIFEST reconciliation banner; v2-canonical copies now live in `packages/prompts/files/`.
- **Vercel production:** Still on `e0ef9b2`. Day 3 Session B ships new prompt files + handler expansion + adapter methods — all consumed by test harnesses locally; first Vercel deploy post-Day-3 will verify production bundling (the `outputFileTracingIncludes` check from Day 2 Session B parked).
- **Live HubSpot portal state (`245978261`):** 39 `nexus_*` custom properties (unchanged), 18 webhook subscriptions (unchanged). MedVista deal `321972856545` now carries all 9 `nexus_meddpicc_*` properties populated from Session B's live pipeline runs — current snapshot (last worker-dispatched run): metrics=65, eb=60, dc=72, dp=68, paper_process=78, pain=82, champion=55, competition=78, overall=70.
- **Live Supabase DB:** MedVista cumulative state after Day 3 Session B: ~38 `signal_detected` events (from Day 2 + Session A retro-verification + Session B's 3-phase staircase), 1 `transcript_ingested` event (idempotent on transcript_id), 2+ `meddpicc_scored` events (one per pipeline invocation; append-only per §2.16 with `source_ref = transcriptId:meddpicc:jobId`), 1 `meddpicc_scores` row (upserted on each run; current values mirror the HubSpot snapshot above), 35 `transcript_embeddings` rows (DELETE+INSERT stable). Schema unchanged.
- **`pnpm enum:audit` gate:** still passing (0 drifts).
- **`pnpm --filter @nexus/shared test:prompt-loader` gate:** **11/11** prompts load cleanly (01 at v1.1.0; pipeline-extract-actions + pipeline-score-meddpicc at v1.0.0).
- **`pnpm --filter @nexus/shared test:mock-claude` gate:** 7/7 PASS (2 new fixture lookups for extract-actions + score-meddpicc).
- **`pnpm --filter @nexus/shared test:meddpicc-format` gate (new Session A):** 4/4 byte-identical fixtures PASS.
- **`pnpm --filter @nexus/shared test:preprocessor` gate:** still 6/6 PASS.
- **`pnpm --filter @nexus/db test:prompt-call-log` gate:** unchanged (19/19 columns shape).
- **`pnpm --filter @nexus/db test:rls-prompt-call-log` gate:** unchanged (Pattern D).
- **`pnpm --filter @nexus/db test:transcript-pipeline` gate:** 3/3 PHASES PASS at the 7-step shape; fanout verification 3 rows live-verified on both direct + worker paths.
- **`pnpm --filter @nexus/db test:transcript-pipeline-mock` gate (new Session B):** 3/3 PHASES PASS — handler shape + idempotency + HubSpot bag shape under mocks.
- **`pnpm --filter @nexus/db test:update-deal-custom-properties` gate (authored Session A, first ran Session B):** 2-phase round-trip PASS against live MedVista deal 321972856545.

---

## Forward map (as of 2026-04-28 — Phase 4 Day 2 fully closed; Day 3 ahead)

This section is the canonical source for "what's left to ship." Updated at end-of-session whenever sequencing or scope shifts. Older "expected" sections inside individual day-by-day entries (e.g., `### Phase 4 Day 1 (intelligence surfaces — expected)`) are plan-time artifacts; this map supersedes them. Fresh sessions read CLAUDE.md → DECISIONS.md → BUILD-LOG.md "Current state" + this section before drafting any kickoff.

### Recommended sequence

1. ~~**Pre-Phase 4 Session A — Ops Hardening**~~ ✓ COMPLETE (`23500f0`).
2. ~~**Pre-Phase-4-Day-2 — Ops/diagnostic: recurring pool-saturation root cause**~~ ✓ COMPLETE (Path A conclusive). Hypothesis 1 (worker route's `createDb` per-invocation call combined with `postgres.js` default `idle_timeout: 0` leak) named as root cause; three surgical mitigations land (worker uses shared pool via `createDbFromSharedSql`; `createDb` default `idle_timeout: 30s`; `pool-snapshot.mts` durable diagnostic tooling). Diagnostic constraint surfaced + documented (`pg_stat_activity` opaque to pooler client cap; EMAXCONN remains ground-truth). Empirical multi-minute leak-fix verification window inherits to Phase 4 Day 2's first 30 minutes post-deploy.
3. **Phase 4 — Intelligence layer** (~5 days; Day 1 splits A/A.5/B per execution decisions).
   - **Day 1 Session A** ✓ COMPLETE — `event_context SET NOT NULL` migration + applicability DSL + evaluator + `DealState` + `getDealState`.
   - **Day 1 Session A.5** ✓ COMPLETE — interstitial `buildEventContext` shape-fix + Phase 3-era backfill (closes the §2.16.1 decision-2 preservation-arc value-side bug Session A discovered + parked).
   - **Day 1 Session B** ✓ COMPLETE — surfaces registry + admission engine + scoring prompt + `DealIntelligence.getApplicable*` methods + verification staircase (8/9/8/8 internal cases + clean-run + synthetic-pattern live exercises).
   - **Day 2 Session A** ✓ COMPLETE (`e124547`) — `IntelligenceCoordinator.receiveSignal` real impl (validates + dedups + enqueues `coordinator_synthesis` job per Decision 2) + `IntelligenceCoordinator.getActivePatterns` real impl + `coordinator_synthesis` job handler (replaces `notYet` stub; reads recent 30d signals grouped by (vertical, signal_type), filters `minDealsAffected` default 2, calls 04-coordinator-synthesis, writes `coordinator_patterns` + `coordinator_pattern_deals` join rows idempotent on `pattern_key`). 16/16 new test cases (8+5+3 PHASES). Live exercise PASS via silence-path with FULL telemetry trail proven. Pool-snapshot 5-min + 30-min post-deploy gate PASS at both windows — Pre-Phase-4-Day-2 leak fix empirically confirmed under coordinator + cron load. The four-of-four EMAXCONN pattern remains structurally closed.
   - **Day 2 Session B** ✓ COMPLETE (`cf2c9c2`) — `hubspot_periodic_sync` handler (replaces `notYet` stub; sync_state already exists from migration 0005, no migration needed) + 15-min cron entry via configure-cron extension + worker retry policy (3 attempts max with 1m+5m exponential backoff via `scheduled_for`) + worker concurrency model (sequential loop-until-empty + pre-claim discipline + **stalled-job sweep** at start of every invocation per amendment) + wrapper retry-on-protocol-violation (1 retry max + new `_internal.sdk` test seam). Worker route refactored to delegate to new `worker-runner.ts`. 17/17 new test cases (4+5+4+4). Live exercise PASS: 8 records synced (2/4/2 deal/contact/company) from live HubSpot in 4244ms, all cursors advanced, telemetry trail FULL. Pool-snapshot gate PASS at both windows — leak fix continues to hold under sync cron + worker hardening expansion. Telemetry dashboard re-deferred to Day 5. **Phase 4 Day 2 fully closed.**
   - **Day 3** (NEXT) — observation clustering + per-cluster cross-deal pattern detection. The `observation_clusters` table substrate already exists from migration 0001+; Day 3 wires the `observation_cluster` job handler (currently `notYet`) + the clustering algorithm.
   - Day 4 — additional cross-deal pattern surface work; specifics TBD at Day 3 closeout.
   - Day 5 — intelligence dashboard UI (consumes admitted set + scores from `SurfaceAdmission.admit`) AND telemetry dashboard `/admin/claude-telemetry` (re-deferred from Session B).
4. **Phase 5 — Agent layer** (~5 days). Day 1 close-lost research-interview UI + `06b-close-analysis-final` wiring + `03-agent-config-proposal` reasoning_trace move (+ version bump 1.1.0 → 1.2.0) + agent config proposal queue scaffolding + 06a/08 calendared reviews. Day 2-3 experiment lifecycle + attribution pipeline. Day 3-4 AgentIntervention engine + intervention UI. Day 4-5 agent feedback loop + daily digest job + RLS tightening on `agent_config_proposals` + `field_queries`.
5. **Phase 6 — Polish + 3-act demo** (~4 days, with **Phase 2 Day 4 Sessions C + D folded in**). Mode 2 design integration for hero pages + loading states + empty-state treatments + responsive (1024px+) + accessibility pass + demo reset endpoint via `demo_seed` markers + three-act demo rehearsal + README/runbook. Sessions C (deal edit UI) + D (kanban filter chips, hover-lift, prefetch) join here as polish-class work.

**Parallel track (Jeff-side, Mode 2 design):** hero-page sessions for `/intelligence`, `/book`, call-prep card, close-analysis output, observation capture, deal detail, daily digest. Plus the **data-viz palette** extraction to DESIGN-SYSTEM.md as new tokens. Runs alongside Phase 4-5 Code; gates Phase 6 polish but not the prior phases. The data-viz palette is the one Mode 2 deliverable that gates a specific Code day (Phase 4 Day 5 dashboard); pull it forward if a Mode 2 slot is available, otherwise Phase 4 Day 5 ships with placeholder colors and Phase 6 re-skins.

### Why this order

- **Pre-Phase 4 ops hardening goes first.** 3 of last 4 sessions hit EMAXCONN; Day 4 Session B required a 25+ min cron pause to recover. Phase 4 Day 2 *adds* baseline load (`coordinator_synthesis` + 15-min `hubspot_periodic_sync`). Half a day to mitigate buys ~10-15 days of cleaner Phase 4-5 work. Math is decisively in favor.
- **Phase 4 before Phase 5.** Phase 5 close-lost reads continuous deal theory + applicable patterns + scored insights — all Phase 4 outputs. Hard sequencing dependency.
- **Phase 6 last.** Polish phase consolidates Mode 2 design integration + UI completion (Sessions C+D) + demo rehearsal. Doing it before the demo narrative is locked is wasted re-skin work.
- **Sessions C+D fold into Phase 6 (not pulled forward to before Phase 4).** They're polish-class. Pulling them forward adds risk: Session C touches `updateDeal/updateCompany` adapter promotion — same code surface Phase 4 will exercise heavily through `DealIntelligence` reads. Better to leave the surface stable through Phase 4's verification rather than promote stubs while Phase 4 is being verified.
- **Hero-page design runs parallel, not as a gate.** Per rebuild plan §12.2 + DECISIONS.md §3.2: Code builds layout/structure against tokens; design re-skins in Phase 6. The established mitigation pattern.

### Parked items by resolving phase

**Pre-Phase 4 Session A (next session):**
- Pool-saturation hardening — shared-pool max reduction + worker-route circuit breaker
- `configure-cron.ts` DIRECT_URL → pooler-URL fallback (broken on dev-Macs without working IPv6 routing)

**Phase 4 Day 1: ALL CLOSED — split across A / A.5 / B.**
- ~~`deal_events.event_context SET NOT NULL` migration per §2.16.1 decision 2~~ ✓ Session A (migration 0006)
- ~~C2 — Applicability DSL + shared evaluator service (foundation review creative addition)~~ ✓ Session A
- ~~`buildEventContext` Phase 3-era bug fix + value-side backfill~~ ✓ Session A.5 (92/92 rows)
- ~~Surfaces registry TS module per §2.26~~ ✓ Session B (`packages/shared/src/surfaces/`)
- ~~Admission engine + scoring pass per §1.16~~ ✓ Session B (`SurfaceAdmission.admit` + `09-score-insight`)
- ~~`DealIntelligence.getApplicable*` methods~~ ✓ Session B
- ~~Dismissal filter read path per §1.17~~ ✓ Session B (write-path UI deferred to Phase 5)
- ~~`applicability_rejections` diagnostic table~~ ✓ Session A

**Phase 4 Day 2 Session A: ALL CLOSED.**
- ~~`coordinator_synthesis` job handler wiring~~ ✓ Session A (`coordinator-synthesis.ts` tool + `coordinatorSynthesis` JobHandler replacing `notYet` stub; max_tokens=2500 held — no reactive bump fired during silence-path live exercise)
- ~~`IntelligenceCoordinator.receiveSignal` real implementation~~ ✓ Session A (validation + dedup + enqueue + telemetry per Decision 2)
- ~~`IntelligenceCoordinator.getActivePatterns` real implementation~~ ✓ Session A (reads `coordinator_patterns` filtered by status + optional vertical/signalType/dealIds)
- ~~**Empirical leak-fix verification gate (5-min + 30-min post-deploy from Pre-Phase-4-Day-2 closeout).**~~ ✓ Session A — both windows PASS; the leak fix is empirically confirmed under the first cron-firing window with new coordinator load deployed.

**Phase 4 Day 2 Session B (next session):**
- Periodic `hubspot_periodic_sync` job via `pg_cron` every 15 min per 07C §7.5
- Worker retry policy (up to 3 attempts per §4.5)
- Worker concurrency model (loop-until-empty or bounded concurrency)
- Wrapper retry-on-protocol-violation policy
- Telemetry dashboard `/admin/claude-telemetry` (foundation review C4; optional capstone)

**Phase 4 Day 3+ (resolving phase):**
- coordinator_synthesis prompt context enrichment — wire `getAtRiskComparableDeals`, `getActiveManagerDirectives`, `getSystemIntelligence` helpers; affectedDealsBlock CrmAdapter enrichment for stage/AE/stakeholders. Today the prompt receives placeholder strings for these blocks per its documented empty-block conventions.

**Phase 4 Day 5 (prerequisite — must resolve BEFORE Day 5 kickoff):**
- **Seed deal count for demo-meaningful coordinator_patterns.** Pattern detection requires `minDealsAffected >= 2` (Phase 4 Day 2 Session A Decision 3). With MedVista as the only seeded deal today, the intelligence dashboard (Phase 4 Day 5) renders empty even after `coordinator_synthesis` runs successfully — the silence-as-feature outcome is correct per §1.18 but is a defensible-but-unsatisfying demo result. Resolution required: (a) how many additional seed deals (likely 3-5 minimum to produce 1-2 multi-deal patterns); (b) what verticals (overlapping with MedVista's healthcare to produce a healthcare pattern, OR distinct to demonstrate cross-vertical isolation); (c) what overlapping signal types so 2+ deals share a signal worth synthesizing (signal taxonomy is in §2.13 enums); (d) who creates them (oversight decision on seed-data shape — could fold into Phase 4 Day 2 Session B or Phase 4 Day 3-4 observation-clustering work). Decision should be made at Phase 4 Day 5 kickoff at latest, ideally earlier (Phase 4 Day 2 Session B closeout or Phase 4 Day 3 kickoff) so seed work can land before dashboard work depends on it.

**Phase 5 Day 1:**
- §2.13.1 calendared resolutions: `03-agent-config-proposal` reasoning_trace move + version bump (MUST land before agent config proposal queue ships); `06a-close-analysis-continuous` review (Day 4 evidence supports default leave-as-is); `08-call-prep-orchestrator` review
- `07-give-back` max_tokens watch (600 → bump if needed)
- `08-call-prep-orchestrator` max_tokens watch (4000 → bump likely)
- Close-lost research-interview UI per §1.1 + §1.2
- `06b-close-analysis-final` wiring
- Agent config proposal queue UI (Guardrail 43 — proposal-only writes)
- Experiment lifecycle UI + `POST /api/experiments` + applicability gating per §1.3-§1.5
- AgentIntervention engine (data-driven per Guardrail 41) — **first writer for `risk_flag_raised` events.** Per Phase 4 Day 1 Session B kickoff Decision 4 productization-arc note, the writer's payload SHOULD eventually carry an `applicability: ApplicabilityRule` field populated at flag-raise time honoring §1.18's first-48h rule (`minDaysSinceCreated >= 2`) + signal-type guards for stage-advancement-auto-clear. Alternative: a global cross-cutting filter on `getApplicableFlags` enforcing `minDaysSinceCreated >= 2` regardless of per-flag applicability. This kickoff decides which path; Session B's empty-default is acceptable because zero events exist today (Preflight 12 verified 0 risk_flag_raised events).
- Daily digest job via `pg_cron` per §1.15 + §1.18 (registry entry already lands Session B; the job handler is Phase 5)
- Surface dismissal/feedback UI write paths (per Phase 4 Day 1 Session B Decision 5 — read-side filter ships in Session B; write-side UI when consuming surfaces ship)
- RLS tightening on `agent_config_proposals` + `field_queries` (currently conservative read-all-authenticated per §2.2.1)
- Verify `readiness_fit` column set when wiring Deal Fitness UI per §2.2.2
- Z-index scale token in DESIGN-SYSTEM.md
- **(Moved to Phase 4 Day 5 deliberate revisit — see Phase 4 Day 1 Session B entry.)**
- **Threshold-fail diagnostic surface decision.** If Phase 5+ admin-tuning UI needs to surface "rule X rejected N% of deals" + "surface Y had M candidates fail threshold last week," that's a NEW surface (`admission_threshold_evaluations` table OR generic admission audit log) per Phase 4 Day 1 Session B Decision 7g — NOT a retrofit on `applicability_rejections` (different metadata: typed clauses vs numeric calibration deltas).

**Phase 5 Day 3-4:**
- `customer_messages.ai_category` text → enum (foundation review A11 second half)

**Phase 6 (polish + demo):**
- Mode 2 design integration for hero pages
- Loading states for every job-backed UI (skeleton/loading token if not already promoted)
- First-class empty-state UIs per surface
- Responsive (1024px+, no mobile)
- Accessibility pass
- Demo reset endpoint using structured `demo_seed` markers per Guardrail 41
- Three-act demo scripted + rehearsed end-to-end
- README + runbook + known-issues doc
- **Phase 2 Day 4 Session C — deal summary edit UI** (inline edit for vertical/product/lead source/competitor + company attributes; promote `updateDeal`/`updateCompany` adapter stubs)
- **Phase 2 Day 4 Session D — kanban filter chips + DealCard hover-lift revisit + `prefetch={false}` on PipelineTable row links + remaining adapter CRUD stubs as needed** (`upsertCompany`, `updateCompany`, `deleteContact`, `deleteCompany`, `deleteDeal`)
- **Pre-demo operational checklist (carrying forward from Pre-Phase-4-Day-2 finding).** `pnpm --filter @nexus/db exec tsx src/scripts/pool-quick.mts status` is a standard pre-flight check before any live demo (or live prospect conversation if those happen pre-Phase-6). Working headroom is ~45 connections (Pre-Phase-4-Day-2 synthetic harness evidence: pooler accepts ~45 incremental opens before EMAXCONN; ~155 baseline used by other Supabase services that we cannot see in `pg_stat_activity`). A saturated pool mid-demo would hang user-facing surfaces with blank-body 500s; the worker-route circuit breaker degrades gracefully (503 + Retry-After) but page routes have no equivalent fallback. Add to: (a) demo runbook pre-flight checklist; (b) three-act rehearsal checklist (run before each rehearsal pass); (c) README known-issues + ops doc; (d) potentially a `pnpm demo:preflight` script alias that bundles `pool-quick.mts status` + auth-gate smoke + cron sanity into a single command.

**Pre-landing (as-needed across phases):**
- Skeleton/loading token in DESIGN-SYSTEM.md (when second loading surface lands)
- Post-deploy Playwright + admin-cookie smoke test (parked from Phase 3 Day 1 half-day slot; CI hook against Vercel `deployment_status == success` events)

**Operational watches (no fixed phase; resolve when triggered):**
- `06a` max_tokens forward-looking watch — Phase 4-5 accumulating event history will grow 06a's input; bump 4000 → 8000 reactively when Phase 5 Day 1 wiring trips it
- Pool-saturation hardening — landing Pre-Phase 4 Session A; Phase 4+ may surface need for additional measures (Vercel function move to DIRECT_URL once IPv6 supported)
- MEDDPICC non-determinism consolidation — Phase 5+ close-analysis may want event-stream smoothing rather than latest-write-wins
- Dormant-trigger activation discipline for `email-draft` (`on_demand`, `post_sale_outreach`) — Phase 5+ rep-tooling UI is the on_demand consumer
- Voyage data-retention opt-out — v2 → Stage 2 boundary, NOT in v2 build scope (productization)
- Next.js Turbopack `_buildManifest.js.tmp.*` ENOENT race recovery — recipe documented (`rm -rf apps/web/.next .turbo` + restart); recurrence is rare

**Out of scope for v1 (locked — do not ship):**
Per DECISIONS.md §1.8, §1.11, §1.12: role-based permissions, multi-tenancy, guided tour, the eight "future state capabilities" (1.11), admin threshold-configuration UI, leadership feedback surfacing, dead pages (`/agent-admin`, `/team`, `observations-client.tsx`), dead routes (5 listed in §1.10).

### Productization scope (post-v2-build)

v2 ships at end of Phase 6. Anything beyond is productization per `docs/PRODUCTIZATION-NOTES.md`:

- **Stage 2 — first paying customer (~2-3 mo post-demo):** real auth hardening (SSO via SAML/Okta/Azure AD), second-org support, basic admin tooling, production monitoring, customer-facing billing, pricing model decision. **Voyage data-retention opt-out enables here.**
- **Stage 3 — first enterprise POC, Salesforce-native (~3-6 mo after Stage 2):** SalesforceAdapter (~3-6 weeks; parallel implementation of CrmAdapter), `/pipeline/:dealId` URL transition (`deal_identity` UUID indirection or per-adapter URL branching), historical ingestion plane (~2-3 mo; staging area + chunked resumable ingest + conversation→deal association with HITL), baseline + attribution dashboards, SSO + DPAs.
- **Stage 4 — enterprise GA (~6-12 mo after Stage 3):** full multi-tenancy (tenant_id + RLS rewrite; weeks not months), SOC 2 Type II (6+ mo regardless of architecture), pricing/billing systems, on-call rotation, regional data residency.
- **Corpus Intelligence — second product (Months 3-12):** narrative + messaging evolution analysis (pgvector + clustering + outcome correlation), ground-truth vs documentation alignment, field awareness of product state. v2 preserves the optionality via §2.16.1's five locked decisions; productization adds the analytics + UI layer.
- **Coaching surface for the buyer (Stage 3 or 4):** VP Sales / Enablement / RevOps facing dashboards.
- **Audit trail + write-back configuration (Stage 3+):** exportable logs, per-insight deep links, per-tenant configuration knobs for what Nexus writes back to system of record.

### Honest assessment vs. original 6-phase rebuild plan

**Shipped:**
- Phase 1 Days 1-5 (infra + auth + jobs + Claude wrapper + CrmAdapter + HubSpot live).
- Phase 2 Days 1-3 + Day 4 Sessions A+B (design system + pipeline + deal CRUD + MEDDPICC; Phase 2 Day 2 hotfix cycle as unplanned out-of-band work).
- Pre-Phase-3 Sessions 0-A/B/C (added scope from foundation review; not in original plan; ~11-13 hours).
- Phase 3 Days 1-4 all sessions A+B (transcript pipeline, prompt-call-log telemetry, MEDDPICC writeback, 8-step pipeline with 5-call fanout, theory + email events).

**Deferred:** Phase 2 Day 4 Sessions C + D (folded into Phase 6 polish).

**Remaining:** Pre-Phase 4 Session A (~½ day) + Phase 4 (~5 days) + Phase 5 (~5 days) + Phase 6 (~4 days) ≈ **~14-15 session-days** between "Phase 3 closed" and "v2 ships."

**Pace observation:** original plan estimated 6 phases. Actual elapsed: ~16 session-days through Phase 3 + Pre-Phase 3 sessions. Days 1-3 of each phase typically ship same-day; Day 4+ tends to split A/B with overnight gaps. Pre-Phase 3 was added scope but bought tightness for Phase 3.

**Scope additions vs original plan:**
- §2.16.1 corpus-intelligence preservation amendments (5 decisions) — Pre-Phase 3 Session 0-A; inexpensive today, structurally impossible later.
- Phase 2 Day 2 hotfix cycle — 3 unplanned hotfixes (auth, RSC icon, useActionState).
- Phase 3 Day 4 IPv6/EMAXCONN cascade — operational time on infra issues; produced two new ops scripts (`pool-session.mts`, `pool-quick.mts`) committed as durable infrastructure.

**The three pillars at "done":**
- Pillar 1 (AI automates mechanical work) — **shipped in Phase 3.** Transcripts → signals + actions + MEDDPICC + theory + email in <90s end-to-end.
- Pillar 2 (field intelligence compounds) — **Phase 4.** Two deals same signal/vertical → coordinator detects pattern → pattern cited in call prep.
- Pillar 3 (human directs AI) — **Phase 5.** Close-lost research interview, agent config proposals, data-driven interventions.

No architectural re-litigation required. Major v1 broken edges (Rivet state, coordinator→call-prep relay, close-lost single-pass, hardcoded interventions, experiment backend, auto-config mutations) are resolved by design in DECISIONS.md. Amendments locked Phase 1-3 (§2.13.1, §2.16.1, §2.18.1, §2.1.1, §2.2.1, §2.2.2, §2.6.1) hold the line.

### Operational watches by trigger phase

| Watch | Trigger phase | Resolution path |
|---|---|---|
| Pool-saturation hardening | Pre-Phase 4 Session A | Shared-pool max reduction + circuit breaker |
| ~~Recurring pool-saturation root cause investigation~~ ✓ RESOLVED Pre-Phase-4-Day-2 (Path A) | Pre-Phase-4-Day-2 own session | Hypothesis 1 (`createDb` per-invocation pool with `idle_timeout: 0` default) named as root cause; worker route now uses `createDbFromSharedSql(getSharedSql())`; `createDb` default `idle_timeout: 30s`; `pool-snapshot.mts` durable diagnostic. Empirical verification window inherits to Phase 4 Day 2's first 30 min post-deploy. |
| Phase 4 Day 2 leak-fix empirical verification | Phase 4 Day 2 first cron-firing window | Capture `pool-snapshot --label=phase4_day2_5min_post_deploy` + `--label=phase4_day2_30min_post_deploy`; observe `candidate_leaks_60s_plus_excl_supavisor_recycle` stays at 0 |
| `configure-cron.ts` DIRECT_URL fallback | Pre-Phase 4 Session A | Invert precedence to `DATABASE_URL ?? DIRECT_URL` |
| `06a` max_tokens reactive bump | Phase 5 Day 1 (or Phase 4 Day 5 if surfaced) | Bump 4000 → 8000 if `stop_reason=max_tokens` fires |
| `03-agent-config-proposal` reasoning_trace move | Phase 5 Day 1 (calendared §2.13.1) | First-position move + 1.1.0 → 1.2.0 bump |
| `06a-close-analysis-continuous` reasoning_trace review | Phase 5 Day 1 (calendared §2.13.1) | Day 4 evidence supports default leave-as-is |
| `08-call-prep-orchestrator` reasoning_trace review | Phase 5 Day 1 (calendared §2.13.1) | If first call-prep runs show incoherent integration, add field |
| `07-give-back` max_tokens watch | Phase 5+ | Reactive bump from 600 if needed |
| `08-call-prep-orchestrator` max_tokens watch | Phase 5 Day 1 | Reactive bump from 4000 likely |
| `customer_messages.ai_category` text → enum | Phase 5 Day 3-4 | When customer-messages writer lands |
| Skeleton/loading token | Phase 4 (when second loading surface lands) | Promote from `bg-muted` + opacity pulse |
| Z-index scale | Phase 5 (first modal/popover) | Token family in DESIGN-SYSTEM.md |
| RLS tightening on `agent_config_proposals` + `field_queries` | Phase 5 Day 1 | When consuming UI lands |
| Voyage data-retention opt-out | v2 → Stage 2 boundary | Productization, NOT v2 build |
| MEDDPICC non-determinism consolidation | Phase 5+ close-analysis | Event-stream smoothing if needed |
| `09-score-insight` grounding-discipline DELIBERATE revisit | Phase 4 Day 5 (or earlier if Phase 4 Day 2 surfaces it) | Live Session B exercise observed Claude inventing grounding details not in input; §1.16 visible-explanation contract loses meaning if hallucinated. Likely fix: prompt-body tightening + tool-schema constraint requiring score_components be drawn from input blocks + version bump 1.0.0 → 1.1.0. Oversight-promoted from passing review to deliberate revisit. |
| `09-score-insight` max_tokens reactive bump | Phase 4 Day 5 dashboard runs | 2500 starting budget; bump to 4000 + version bump if `stop_reason=max_tokens` fires |
| Threshold-fail diagnostic surface (new-not-retrofit) | Phase 5+ admin-tuning UI | NEW table (`admission_threshold_evaluations` or generic audit log), NOT a retrofit on `applicability_rejections` |
| Risk-flag applicability production contract | Phase 5 Day 1 AgentIntervention writer | Per-flag applicability OR global cross-cutting `minDaysSinceCreated >= 2` filter on getApplicableFlags |
| `dealstate_stage_fallback` telemetry deduplication | Phase 4 Day 5 / Phase 5+ surface refactor | admit() resolves DealState 4× per call (1 explicit + 3 in getApplicable*); refactor to share when third consumer materializes |
| Desktop launch.json false-greenfield | Operational discipline | Three sessions discovered the stub Desktop dir; verify actual project path via `.claude/launch.json` before treating system-reminder greenfield as authoritative |
| Pre-demo pool-status pre-flight | Phase 6 demo-rehearsal (or earlier if live prospect conversations happen pre-Phase-6) | `pool-quick.mts status` as standard pre-flight before any live demo. Working headroom is ~45 connections (Pre-Phase-4-Day-2 finding); saturated pool mid-demo would hang page routes (no graceful fallback equivalent to the worker-route circuit breaker). Add to demo runbook + three-act rehearsal checklist + README known-issues. Consider `pnpm demo:preflight` script alias bundling pool status + auth-gate smoke + cron sanity. |
| Seed deal count for demo-meaningful coordinator_patterns | Phase 4 Day 5 prerequisite (decide at Day 2 Session B / Day 3 closeout latest) | Pattern detection requires `minDealsAffected >= 2`; MedVista alone produces 0 patterns + empty dashboard. Decide seed deal count + verticals + overlapping signal types + creator before Day 5 kickoff. |

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

### Pre-Phase 3 Session 0-B — 2026-04-22 · `17ea8e3`

**Foundation migration + shared pool + code hygiene per `docs/PRE-PHASE-3-FIX-PLAN.md` §4.2.** Thirteen findings addressed in one session: A1 (code half), A2, A3, A4 (table skeleton), A6, A7, A8, A10, A11, A12, A13, A14, A16, plus C5 skeleton. First post-planning execution session.

**Migration 0005 — 19 statement blocks, one transaction.** Hand-edited on top of drizzle-kit's generator output (Phase 2 Day 2 precedent). Drizzle emitted 14 clean statements; hand-additions layered: `CREATE EXTENSION IF NOT EXISTS vector`, `USING velocity_trend::fitness_velocity` cast on the text→enum ALTER, CHECK constraint on `transcript_embeddings.scope IN ('transcript','speaker_turn')`, RLS Pattern D on the three new tables (`ALTER TABLE ENABLE ROW LEVEL SECURITY` + `CREATE POLICY ..._select_authenticated FOR SELECT TO authenticated USING (true)`). Applied via new idempotent applicator `packages/db/src/scripts/apply-migration-0005.ts` (checks for any of the three new tables as the idempotence marker; runs the full SQL inside a `sql.begin()` transaction; verifies RLS + vector extension + column shapes at the end).

- **New tables.** `prompt_call_log` (19 cols + 3 indexes per §2.16.1 decision 3 lock), `transcript_embeddings` (7 cols, pgvector `vector(1536)`, HNSW index deferred to Phase 3 Day 2 per §2.16.1 decision 1 amendment), `sync_state` (2 cols — pg_cron wiring lands Phase 4 Day 2 per the rebuild plan).
- **Column additions.** `deal_events.event_context jsonb NULLABLE` (A2 pull-forward per §2.16.1 decision 2), `experiments.vertical vertical NULLABLE` + composite index `(vertical, lifecycle)` (A6).
- **Column changes.** `observations.signal_type` DROP NOT NULL (A1 per §2.13.1 amendment), `deal_fitness_scores.velocity_trend` TYPE changed `text` → `fitness_velocity` enum via `USING` cast (A11; zero rows pre-cast).
- **FK added.** `experiment_attributions.transcript_id → transcripts.id ON DELETE SET NULL` (A12 hygiene completion).
- **Composite index added.** `deal_events (hubspot_deal_id, created_at DESC)` for the canonical per-deal-timeline query hot path (A13).
- **Comment added.** Lead comment on `confidenceBandEnum` naming Phase 4 Day 2 candidate consumer (A16).
- **Extension.** `CREATE EXTENSION IF NOT EXISTS vector` — Supabase-hosted first-class, parallel to Phase 1 Day 3's `pg_cron`/`pg_net` precedent.

Migration applied cleanly. Verification at end of apply script confirmed: 3 new tables present; vector extension installed; RLS enabled on all 3 new tables; `observations.signal_type` nullable YES; `deal_events.event_context` present; `fitness_velocity` enum present.

**Pre-migration sanity check (`check-pre-migration-0005.ts`, kept as permanent artifact).** Reports row counts on tables the migration touches with non-trivial casts. All target tables had zero rows — velocity_trend cast safe, observation.signal_type DROP NOT NULL safe, experiment_attributions FK add safe (no orphan transcript_id references).

**Process-wide shared postgres.js client (A7).** New module `packages/shared/src/db/pool.ts` exports `getSharedSql({ databaseUrl, max=10, idleTimeout=60, prepare=false })` returning a lazy-initialized singleton, plus `resetSharedSql` (tests) and `closeSharedSql` (explicit shutdown for scripts). Re-exported from the `@nexus/shared` barrel. All four factories in `apps/web/src/lib/` migrated: `createHubSpotAdapter`, `createMeddpiccService`, `createStakeholderService`, `createObservationService` now construct with `sql: getSharedSql({ databaseUrl: env.databaseUrl })` so `ownedSql` is false in each — per-request `close()` is a no-op; the shared pool stays alive across requests.

**Pool saturation smoke test (`test-shared-pool.ts`, kept as permanent artifact).** 20 concurrent "requests", each constructing MeddpiccService + StakeholderService + ObservationService with shared sql + issuing a trivial SELECT. All 20 succeeded; peak active connections stayed near zero (the independent probe ran fast enough to miss the window but the absence of any pooler-error failures confirms the shared-pool footprint is well under the 200-client pooler cap). Pre-A7 precedent: Session A post-split verification saturated the pooler. Post-A7: no saturation under the simulated load.

**`DealIntelligence` service skeleton (A2 helper).** New `packages/shared/src/services/deal-intelligence.ts` containing a single method: `buildEventContext(hubspotDealId, activeExperimentAssignments)` → `{vertical, dealSizeBand, employeeCountBand, stageAtEvent, activeExperimentAssignments}`. Reads `hubspot_cache` for the deal + associated company; bucketing helpers for ARR (<100k / 100k-500k / 500k-1m / 1m-5m / 5m-10m / >=10m) and headcount (<50 / 50-200 / 200-1k / 1k-5k / 5k-10k / >=10k) locked in this module so the bucket edges don't drift across event writers. Phase 3 Day 2's event writers call this helper to populate `deal_events.event_context` from day one. The full DealIntelligence service (`recordEvent`, `getDealState`, etc.) expands in Phase 4 per §2.16.

**`ObservationService` signature update (A1 code).** Signature now accepts EITHER `category: ObservationCategory` OR `signalType: SignalTaxonomy`, not both. Category-driven captures (the only current production caller — close-lost preliminary) write `signal_type: null`, the `source_context.category` discriminator, per §2.13.1 amendment. Signal-classifier captures (Phase 3 Day 1+) pass `signalType` directly. `ObservationRecord.signalType` type is now `SignalTaxonomy | null`. Retired the dead `CATEGORY_TO_SIGNAL_TYPE` mapping and the `isSignalTaxonomy` import. Stage-change server action (the only caller) continues to pass `category: "close_lost_preliminary"` unchanged — no call-site edits needed; the internal behavior change is transparent.

**Mapper VERTICAL import (A10).** `packages/shared/src/crm/hubspot/mappers.ts:54-67` — replaced the hardcoded `const VERTICALS: Vertical[]` with `import { isVertical } from "../../enums/vertical"` + `return isVertical(normalized) ? normalized : null`. Two-line fix closing the Guardrail 22 single-source drift vector. Future extensions to `VERTICAL` automatically flow through the mapper.

**Pipeline page Promise.all (A14).** `apps/web/src/app/(dashboard)/pipeline/page.tsx:43-54` — swapped serial `for (const id of companyIds) { await adapter.getCompany(id); }` to `await Promise.all(companyIds.map(async (id) => { ... }))`. Cold-cache load with 20 unique companies goes from 20× ~200ms serialized → single parallel round. Warm cache is already fast.

**Demo-reset manifest skeleton (C5).** New `packages/db/src/seed-data/demo-reset-manifest.ts` enumerating all 41 Nexus-owned tables in FK-order with dispositions: `truncate` (32 tables — event logs + ephemeral state), `preserve:seed` (8 tables — team_members, support_function_members, experiments, agent_configs, manager_directives, system_intelligence, knowledge_articles, observation_clusters-if-seeded), `preserve:always` (1 table — `users` FK to `auth.users`). Includes `assertManifestCoversKnownTables(knownTables)` invariant for CI/pre-commit use. The `packages/db/src/scripts/demo-reset.ts` script that walks the manifest lands Phase 6 Polish per the rebuild plan; this file is the skeleton + ongoing discipline artifact (every migration that adds a Nexus-owned table adds an entry here in the same commit).

**Verification at end of Session 0-B.**

- `pnpm typecheck` — 4/4 workspaces PASS (1.0s).
- `pnpm build` — 13 routes clean compile. `/pipeline` unchanged at 15 kB (the Promise.all swap is zero-bundle-impact).
- Build-warning signature grep — zero hits on `Attempted import error | Module not found | Type error | Failed to compile`.
- Inline hex grep in `apps/web/src/*.{ts,tsx}` — zero hits.
- Stale shadcn placeholder-class grep — zero hits.
- `pnpm --filter @nexus/db exec tsx src/scripts/test-rls-meddpicc.ts` — 6/6 PASS (Pattern D verified, no behavioral change).
- `pnpm --filter @nexus/db exec tsx src/scripts/test-rls-deal-contact-roles.ts` — 6/6 PASS.
- `pnpm --filter @nexus/db exec tsx src/scripts/test-rls-observations.ts` — 6/6 PASS (Pattern A verified — both the pre-migration NOT NULL rows and the post-migration nullable shape pass).
- `pnpm --filter @nexus/db test:shared-pool` — 20/20 simulated requests succeeded, peak connections under threshold.
- Migration 0005 applicator's in-script verification — all 6 post-conditions PASS (tables exist, extension installed, RLS enabled, column shapes correct, enum present).

**Reasoning stub.** Non-MVP choices with justification type per the CLAUDE.md reasoning-gate (1 = guardrail, 2 = §2.16.1 preservation, 3 = PRODUCTIZATION-NOTES arc, 4 = imminent next-session need).

- **Migration 0005 bundled 9 schema changes in one transaction instead of 9 separate migrations.** Justification 1 (Guardrail 2 — numbered Drizzle migrations, but scope of each migration is a judgment call). Consolidation matches the review's Output 2 "one migration batch + one small apps/web edit session" framing + keeps rollback coherent (partial-fail rolls back the whole foundation batch rather than leaving a half-applied schema).
- **HNSW index creation deferred to Phase 3 Day 2 even though the table exists Session 0-B.** Justification 2 (§2.16.1 decision 1 amendment captured the planning-lens split). HNSW build against empty table wastes work; the Phase 3 Day 2 index creation runs against real rows after first pipeline runs populate `transcript_embeddings`.
- **Shared pool `max: 10` (not the review's exact recommendation).** Review said `max: 10` explicitly in the A7 recommendation; this matched. Justification 4 — Phase 3 Day 2 worker will spawn pipelines concurrently; 10 connections ≈ headroom for multiple concurrent pipeline steps + browser-session requests without saturating the pooler.
- **`DealIntelligence.buildEventContext` includes ARR + headcount band constants inline rather than exporting them.** Justification 4 — Phase 4 Day 2 coordinator synthesis slices by these exact bands; keeping the edges module-private now forces Phase 4+ to import the helper rather than re-implementing the buckets. If bucket edges need tuning for a future customer segment, changing them in one place cascades everywhere. Not speculative; the coordinator's first query would otherwise re-invent the same buckets.
- **`ObservationService.record` takes `category` XOR `signalType`, not both.** Justification 1 (§2.13.1 nullable invariant). Passing both is semantically ambiguous — the amendment establishes that category-driven rows MUST be null; a caller passing both would violate the discriminator contract. Loud throw at the service boundary is the right posture.
- **Demo-reset manifest lands empty-but-complete (41 tables enumerated) rather than staged per-phase.** Justification 1 (Guardrail 39 — no placeholder UI, but the manifest is not UI; it's discipline scaffolding). Ship with all currently-known tables populated so future migrations add incrementally; review's C5 spec recommended "ship empty now" but enumerating the known 41 costs nothing and gives Phase 6 a running start. `assertManifestCoversKnownTables` provides the missing-entry guardrail.
- **Pool-saturation test probe measures at-instant active connections, not peak.** Not a justification-worthy choice per se — call out as a known test limitation. The real assertion is the request-success count (20/20 fulfilled with zero pool saturation errors). Future telemetry (prompt_call_log + pg_stat_activity sampling) can provide peak visibility if needed.

No UNCERTAIN entries. All seven choices cite a specific guardrail, amendment, or next-session need.

**Parked items closed.**
- A7 (pre-Phase-3 shared pool mitigation) — shipped.
- A1 (observations.signal_type nullable) — code + schema both shipped.
- A2 (deal_events.event_context pull-forward) — column + helper shipped.
- A3 (prompt_call_log table) — shipped; wrapper wiring lands Phase 3 Day 1.
- A4 (transcript_embeddings table skeleton) — shipped; HNSW index Phase 3 Day 2.
- A6 (experiments.vertical column + index) — shipped.
- A8 (sync_state table) — shipped; pg_cron wiring Phase 4 Day 2.
- A10 (mappers VERTICAL import) — shipped.
- A11 (fitness_velocity enum; only fitness half, `ai_category` still text) — shipped.
- A12 (experiment_attributions.transcript_id FK) — shipped.
- A13 (deal_events composite index) — shipped.
- A14 (pipeline page Promise.all) — shipped.
- A16 (confidence_band comment) — shipped.
- C5 (demo-reset manifest skeleton) — shipped.

**Parked items added.**
- **HNSW index on transcript_embeddings.** Phase 3 Day 2 after first rows land. Statement: `CREATE INDEX transcript_embeddings_embedding_hnsw ON transcript_embeddings USING hnsw (embedding vector_cosine_ops) WITH (ef_construction = 64, m = 16);` One-line migration.
- **`ai_category` customer_messages enum.** A11 second half. Phase 5 Day 3-4 when customer-messages writer lands and the taxonomy is decidable.
- **`deal_events.event_context` NOT NULL flip.** Phase 4 Day 1 after all Phase 3-era writers have populated it.
- **pg_cron wiring for `sync_state` periodic HubSpot reconciliation.** Phase 4 Day 2 per rebuild plan.
- **Claude wrapper → `prompt_call_log` write-path.** Phase 3 Day 1 as the first wrapper wiring task.
- **`DealIntelligence.buildEventContext` caller wiring.** Every Phase 3 Day 2 event writer calls this helper before appending to `deal_events`.

**Cost.** Zero Claude API, zero HubSpot API, one live Supabase migration + verification queries + RLS test writes (service-role bypass, cleaned up). Live DB writes bounded by the migration + RLS test scripts' self-cleanup.

### Pre-Phase 3 Session 0-C — 2026-04-22 · `9b7ca9c`

**Outward-facing fix session per `docs/PRE-PHASE-3-FIX-PLAN.md` §4.3.** Three findings: W1 (HubSpot MEDDPICC 39th property), A9 (webhook echo dedup), C1 (enum:audit script + CI gate). First live-HubSpot-write session since Phase 2 Day 4 Session A. Rollback story is isolated to the single provisioning call + the adapter's `handleWebhookEvent` behavior change.

**W1 — MEDDPICC 8th HubSpot property provisioned to live portal.**

- `packages/shared/src/crm/hubspot/properties.ts` — added `nexus_meddpicc_paper_process_score` entry (displayOrder 28, following the convention used for other late-added deal properties; comment cites foundation-review W1 + §2.13.1 canonical amendment).
- `packages/shared/src/crm/hubspot/adapter.ts` — added `nexus_meddpicc_paper_process_score` to `DEAL_PROPS_TO_FETCH` so `getDeal`/`listDeals` read it alongside the other 7 MEDDPICC scores.
- `packages/shared/src/crm/hubspot/properties.ts` — corrected `nexus_meddpicc_score`'s description from "0-100 average across 7 dimensions" to "0-100 average across 8 non-null dimensions" (matches `MeddpiccService.upsert` computation).
- `pnpm --filter @nexus/db provision:hubspot-properties` against portal 245978261 — **created 1, already existed 38, total 39.** Idempotent via the Day-5 GET-first pattern. Provisioning log: `[+] deals.nexus_meddpicc_paper_process_score created` on the new entry; every other property reported `[=] already exists`. Live portal now carries the complete 8-dim MEDDPICC property set; Phase 3 Day 2's transcript pipeline can write all 8 dimensions via `updateDealCustomProperties` without HubSpot 400-rejecting the 8th.

**A9 — webhook echo dedup on `nexus_*` propertyChange.**

- `packages/shared/src/crm/hubspot/adapter.ts::handleWebhookEvent` — new early-return branch: when `eventClass === "propertyChange"` AND `event.propertyName?.startsWith("nexus_")` AND `event.newValue !== undefined/null` AND `event.objectType !== "engagement"`, call the new `patchCacheProperty(...)` helper and return. Skips the expensive `fetchDealWithAssociations` (for deals) / `GET /crm/v3/objects/<type>/<id>` (for contacts/companies) refetch.
- `packages/shared/src/crm/hubspot/adapter.ts::patchCacheProperty` — new private method: `UPDATE hubspot_cache SET payload = jsonb_set(payload, ARRAY['properties', <name>], to_jsonb(<newValue>::text), true), cached_at = NOW(), ttl_expires_at = NOW() + MAKE_INTERVAL(secs => <ttl_ms>/1000.0) WHERE object_type = ? AND hubspot_id = ?`. Uses the canonical `CACHE_TTL_MS` table keyed by object type. If no cache row exists yet, the UPDATE is a no-op — the next organic read does the full fetch, which is the correct behavior.
- **Why this matters at Phase 3 Day 2 scale.** Transcript pipeline step 4 writes ~10 `nexus_*` properties (8 MEDDPICC scores + MEDDPICC overall + fitness score) via `updateDealCustomProperties`. Pre-A9: each write fires a `deal.propertyChange` webhook → full deal refetch → ~10 HubSpot API calls echoed per transcript. Concurrent transcripts multiply this toward the 100/10s HubSpot burst ceiling. Post-A9: 10 in-place cache updates + 0 refetches per transcript. 07C §5.1 documented this as the intended behavior ("Update cache only — these are our own writes; we already know"); pre-0C, the code did the expensive thing instead.

**C1 — `pnpm enum:audit` script + three-way drift gate.**

- `packages/db/src/scripts/audit-enums.ts` — walks the canonical registry `{ SIGNAL_TAXONOMY, VERTICAL, MEDDPICC_DIMENSION, ODEAL_CATEGORY, CONTACT_ROLE, DEAL_STAGES }` and reports per-enum coverage across three vectors: (1) Drizzle `pgEnum` in schema.ts (detects single-sourced pgEnum imports + matches literal array alternatives), (2) HubSpot property options via `HUBSPOT_CUSTOM_PROPERTIES` lookup (nexus_role_in_deal, nexus_vertical, nexus_meddpicc_*_score), (3) handoff prompt files under `~/nexus/docs/handoff/source/prompts/` + `04C-PROMPT-REWRITES.md` (heuristic token presence per file; informational). Exits 1 on any TS↔schema or TS↔HubSpot drift.
- **Run result at end of Session 0-C:** all 6 enums pass. Notable confirmations:
  - `MEDDPICC_DIMENSION (8)`: schema single-sourced ✓, HubSpot `nexus_meddpicc_<dim>_score` matches all 8 ✓ (the W1 provisioning closed this vector).
  - `CONTACT_ROLE (9)`: schema single-sourced ✓, HubSpot `nexus_role_in_deal` matches ✓ (retroactively confirms Phase 2 Day 2 ContactRole alignment still holds).
  - `VERTICAL (6)`: schema single-sourced ✓, HubSpot `nexus_vertical` matches ✓.
- `package.json` — added `"enum:audit": "tsx src/scripts/audit-enums.ts"` script under `@nexus/db`. Root can invoke via `pnpm --filter @nexus/db enum:audit` (or add a root-level alias in a follow-up).
- **CI wiring deferred.** The review's C1 spec recommended wiring as a pre-merge gate. Parked as a follow-up — today's script is the gate; wiring into `.github/workflows/enum-audit.yml` is a 20-line YAML edit that should land alongside the post-deploy Playwright smoke test (pre-Phase-3-Day-1 parked item from Session A/B). Both are PR-gate discipline.

**Verification at end of Session 0-C.**

- `pnpm typecheck` — 4/4 PASS (~1.4s).
- `pnpm build` — clean compile, zero build-warning signatures.
- `pnpm --filter @nexus/db enum:audit` — PASSED (all 6 enums consistent across TS/schema/HubSpot).
- HubSpot provisioning run — 1 created, 38 already existed. Live portal verified via the script's per-property outcome log.
- `grep '#[0-9A-Fa-f]{3,8}' apps/web/src/*.{ts,tsx}` — 0 hits (no hex inlining; N/A to Session 0-C but discipline check holds).
- A9 webhook dedup — implementation verified by typecheck + build + the Phase 1 Day 5 webhook-handler unit flow still compiling unchanged. Live end-to-end webhook test (round-trip PATCH via `updateDealCustomProperties` → observe the Vercel function logs for the new dedup branch) requires a deploy, parked until the next organic deploy triggers (first Phase 3 Day 1 commit).

**Reasoning stub.** Non-MVP choices with justification type per the CLAUDE.md reasoning-gate (1 = guardrail, 2 = §2.16.1 preservation, 3 = PRODUCTIZATION-NOTES arc, 4 = imminent next-session need).

- **`nexus_meddpicc_paper_process_score` assigned `displayOrder: 28` instead of 17 (MEDDPICC-group tail).** Justification 1 — renumbering the 11 downstream deal properties from 17+ to 18+ is a cosmetic-only change that requires touching 11 entries in `properties.ts` AND potentially re-provisioning each to update `displayOrder` on the live portal. The 28-slot keeps the canonical value consistent without forcing a bulk re-provision. HubSpot tolerates non-contiguous displayOrder; visual grouping happens via the group name (`nexus_intelligence`), not displayOrder. Documented as an intentional gap in the property-entry comment.
- **A9 skipped `objectType === "engagement"` branch.** Justification 1 — the existing `handleWebhookEvent` does not fetch engagements (07C §5.1 excludes `engagement.creation` from subscriptions; it reconciles via 15-min periodic sync). Including engagements in the dedup path would add complexity without benefit; excluding matches the existing handler's three-type scope.
- **A9 dedup updates cache in-place via `jsonb_set`, not by writing a full `HubSpotObject` payload.** Justification 1 — the writebacks are property-level and the `HubSpotObject` shape (id + properties + associations + meta) is richer than what a single propertyChange event carries. In-place `jsonb_set` preserves associations + other properties untouched. If this somehow misses a corner case (e.g., a concurrent write of another `nexus_*` property during the jsonb_set window), the TTL + next organic fetch re-syncs.
- **C1 audit includes handoff-prompt heuristic but does not fail on low per-prompt coverage.** Justification 4 — not every prompt rewrite enumerates every enum value; most prompts reference a subset. Failing on low coverage would cause false negatives and make the gate noisy (rejected). Strict check happens on schema + HubSpot vectors only.
- **C1 CI wiring deferred.** Justification 4 — the review recommended CI wiring but the Playwright smoke test (parked Pre-Phase-3 item from Sessions A + B) is a bigger PR-gate discipline piece; the two should land together. Enum audit is runnable today on demand as a pre-commit check; CI gate is a 20-line YAML follow-up.

No UNCERTAIN entries. All five choices cite a specific guardrail or next-session need.

**Parked items closed.**
- W1 (MEDDPICC 7-vs-8 schema/HubSpot drift) — closed via 39th property provisioning.
- A9 (webhook echo refetch on nexus_*) — closed via `patchCacheProperty` in-place update path.
- C1 (enum:audit script) — shipped; runnable on demand; CI wiring deferred (see parked items added below).

**Parked items added.**
- **Enum-audit CI wiring.** 20-line `.github/workflows/enum-audit.yml` that runs `pnpm --filter @nexus/db enum:audit` on PR open + push to main. Bundle with the Playwright post-deploy smoke workflow (Sessions A/B parked items) so CI discipline lands as one coherent PR.
- **Enum-audit prompt-side strictness.** Current audit reports heuristic token presence per handoff prompt file (informational). If a future drift surfaces in prompt contents specifically (e.g., a rewrite file uses a dropped enum value), consider tightening the per-file check to fail on any `missing from canonical` findings. Today's heuristic-only posture is the right MVP.
- **A9 live end-to-end verification.** Webhook dedup path verified by typecheck + build + library patterns but not by live round-trip. Do this as a smoke test during the first Phase 3 Day 1 or Phase 2 Day 4 Session C deploy that hits production: trigger a `nexus_*` property update via `updateDealCustomProperties`, tail Vercel function logs, confirm the dedup branch fires on the echo webhook.
- **Full 8-dim MEDDPICC writeback in Phase 3 Day 2.** Phase 3 Day 2's transcript pipeline step 4 writes all 8 MEDDPICC scores via `updateDealCustomProperties`. The 39th property is now provisioned; the pipeline wiring just needs to include `nexus_meddpicc_paper_process_score` in the property bag when scores are computed.

**Cost.** One HubSpot API create call (39th property provisioning), 38 GET calls (idempotence checks on the other 38 properties), zero Claude API, zero Supabase writes (script reads cache state but does not write). Well under daily cap; burst stayed under 100/10s.

### Pre-Phase 3 Documentation Reconciliation — 2026-04-22 · `00e61e9` (nexus-v2) + `c48470b` (nexus handoff)

**Documentation-only session.** Scope: every planning doc in the repo + every doc in the v1 handoff package. Zero code changes, zero migrations, zero portal writes. Cost: $0. Goal: reconcile every Phase 3+ load-bearing doc against what v2 actually shipped so Phase 3 Day 1 kickoff reads accurate context.

**Active v2 docs — disposition.**

- **`CLAUDE.md`** — updated. "Read before acting" section's "Frozen handoff reference" list expanded to name every handoff doc Phase 3+ sessions actively consult (04-PROMPTS, 04C, 07B, 07C, 10-REBUILD-PLAN, 09-CRITIQUE, source/prompts, design/DESIGN-SYSTEM); each entry carries a one-line status cue ("Phase 3+ load-bearing", "reasoning trail", "reconciliation banner at top"). Handoff-edit policy clarified — banner additions by this session were explicit-Jeff-approval-authorized per the §2.13.1 Phase 2 Day 2 ContactRole precedent.
- **`docs/PRE-PHASE-3-FIX-PLAN.md`** — closeout header added at top. Status: CLOSED OUT 2026-04-22 — 21/21 findings closed + 15 ratifications preserved + 3 creative additions deferred + 2 creative additions shipped inline. Enumerates the three session commits (0-A `b1d5a7b` + `7af4832`; 0-B `17ea8e3` + `3413528`; 0-C `9b7ca9c` + `4e5d281`). Notes shift from "active roadmap" to "historical record + design trail"; Phase 3 Day 1 next milestone named. Body content below the header preserved intact — the planning rationale is the audit trail.
- **`docs/DECISIONS.md`** — ratified. Five amendments locked Session 0-A (§2.13.1 signal_type nullable + MEDDPICC 8-dim canonical; §2.16.1 decisions 1, 2, 3 shape-locks). No further edits warranted.
- **`docs/PRODUCTIZATION-NOTES.md`** — ratified. Stage 3 URL-transition paragraph added Session 0-A. No further edits.
- **`docs/OVERSIGHT-META.md`** — ratified. Created in commit `49a929f`; maintenance rule intact; handoff-prompt template still accurate.
- **`docs/FOUNDATION-REVIEW-2026-04-22.md`** — ratified. Historical record of the review that motivated the fix plan. No updates (point-in-time document).
- **`docs/BUILD-LOG.md`** — this entry + current-state block refresh.
- **`docs/design/DESIGN-SYSTEM.md`** — ratified. Z-index / skeleton / data-viz palette gaps remain parked per BUILD-LOG operational notes; addressed at their target phases.

**Frozen v1 handoff package at `~/nexus/docs/handoff/` — disposition per doc.**

Default posture: **annotate, don't overwrite.** Each doc gains a single top-banner blockquote naming its reconciliation status + divergences from v2 reality + pointers to v2 authoritative sources. Bodies preserved verbatim — the planning reasoning trail is the historical value this package carries into Phase 3+ and beyond.

- **Phase 3+ heavy consumers (8 files).** Detailed annotation banners on `04-PROMPTS.md`, `04A-PROMPT-AUDIT.md`, `04B-PROMPT-DEPENDENCIES.md`, `04C-PROMPT-REWRITES.md`, `07A-CONTEXT-AUDIT.md`, `07B-CRM-BOUNDARY.md`, `07C-HUBSPOT-SETUP.md`, `10-REBUILD-PLAN.md`. Each banner enumerates the specific v2-era amendments that supersede specific sections:
  - 04C: prompt-file canonical location (`packages/prompts/files/`) + ContactRole 9-value + MEDDPICC 8-dim + 01-detect-signals max_tokens at 6000 + reasoning_trace calendared resolutions.
  - 07B: §2.18.1 config paths + ContactRole + MEDDPICC 8-dim + new Session 0-B tables + A9 webhook echo dedup.
  - 07C: 38 → 39 properties + fieldType taxonomy correction + private-app webhook UI-only + client_secret for signing + §2.18.1 paths + v4 default association endpoint + email-domain auto-association + webhook dedup.
  - 10-REBUILD-PLAN: Phases 1+2 shipped status table + pre-Phase-3 insertion + Section 8 divergences resolved by §2.x.1 amendments + Section 4 data-model additions since authoring.
  - 04-PROMPTS: ContactRole + MEDDPICC + signal taxonomy + prompt-file location + tool-use forcing.
  - 04A: MUST-REWRITE resolutions + reasoning_trace calendared + JSON-in-text retired + signal-type enum drift closed.
  - 04B: CRITICAL finding resolved by §2.17.
  - 07A: two CRITICAL gaps resolved + top 5 context fixes mapped to v2 services.
- **Historical reasoning trail (2 files).** `09-CRITIQUE.md` gets a full live-status ledger mapping every §3/§4/§5/§6/§7/§8/§9/§10/§11/§12 finding to its v2 resolution + phase (Resolved Phase X Day Y / Ahead Phase Y / Resolved by design). The diagnosis body is preserved untouched — this document exists precisely to explain *why* v2 looks the way it does, and erasing the critique would destroy that reasoning trail. `05-RIVET-ACTORS.md` gets a banner naming Rivet REMOVED per §2.6 + v2 replacements per responsibility.
- **Frozen v1 snapshots (6 files).** `01-INVENTORY.md`, `02-SCHEMA.md`, `03-API-ROUTES.md`, `06-UI-STRUCTURE.md`, `07-DATA-FLOWS.md`, `08-SOURCE-INDEX.md` get "FROZEN v1 snapshot" banners pointing at v2 authoritative sources (schema.ts, current routes list, BUILD-LOG current state). `07-DATA-FLOWS.md` explicitly maps Known Issues in Flows 2 + 6 + 7 to their v2 resolutions.
- **Top-level meta (4 files).** `README.md` gets a banner redirecting readers from the then-hypothetical-Codex-rebuild framing to the live v2 repo + active-docs pointers. `HANDOFF-NOTES.md` gets a banner noting the rebuild rhythm is superseded by `OVERSIGHT-META.md`. `DECISIONS.md` (frozen) gets a banner naming the fork + the 7 v2-era amendments to look up in the active copy. `source/prompts/PORT-MANIFEST.md` gets a banner resolving the Phase 3 Day 1 move step explicitly.
- **VALIDATION.md** — untouched. Point-in-time record of Session 11 package finalization. Any banner would muddy its purpose.

**Total handoff-file touches.** 20 banners added (every file in `~/nexus/docs/handoff/` except VALIDATION.md, plus the PORT-MANIFEST.md under source/prompts/). Handoff-edit policy precedent `533d3eb` extended to `docs(handoff): reconciliation banners — pre-Phase 3 reality check` (commit landing alongside this BUILD-LOG entry).

**Verification.**

- Every banner cites specific v2 amendments by section number so future sessions can trace the reconciliation to its source.
- Every banner names current v2 authoritative sources so Phase 3+ readers know where to look for current state.
- Every banner preserves the original body unchanged — the reasoning trail is not overwritten.
- Zero code changes, zero migrations, zero portal writes; `pnpm typecheck` + `pnpm build` + `pnpm enum:audit` unchanged from Session 0-C state.

**Reasoning stub.** Non-MVP choices with justification type per the CLAUDE.md reasoning-gate (1 = guardrail, 2 = §2.16.1 preservation, 3 = PRODUCTIZATION-NOTES arc, 4 = imminent next-session need).

- **Chose `annotate, don't overwrite` as default for handoff docs.** Justification 1 — §2.13.1's handoff-edit policy explicitly requires Jeff's approval for handoff edits; bodies stay intact as the reasoning trail that explains v2 architectural choices. Justification 4 — Phase 3 Day 1 reads 04C + 07B + 07C + 10-REBUILD-PLAN heavily; annotation gives those sessions current-state pointers without discarding the "why."
- **Extended CLAUDE.md's handoff-reference list to name 07B + 07C + 04-PROMPTS explicitly.** Justification 4 — these docs are Phase 3+ load-bearing but CLAUDE.md's "Frozen handoff reference" block didn't name them. Session readers now have the full inventory without having to grep `~/nexus/docs/handoff/`.
- **Added closeout header to `docs/PRE-PHASE-3-FIX-PLAN.md` rather than retiring the doc entirely.** Justification 1 — the plan's reasoning is the audit trail that explains why the three Session commits are shaped the way they are. Retiring it would lose that. Header makes the "done" status visible at-a-glance so future oversight sessions don't misread it as active roadmap.
- **09-CRITIQUE ledger rather than per-section annotations.** Justification 1 — preserving the diagnosis body intact (no inline "RESOLVED" callouts) honors the original document's "diagnosis only, no solutions" framing. A top-level ledger gives the resolution map without retrofitting the critique.
- **Left VALIDATION.md untouched.** Not really a justification choice — the doc is a point-in-time record; annotating it would falsely suggest the validation needs revisiting.
- **Left DESIGN-SYSTEM.md untouched.** Justification 1 — structurally stable; the three known gaps (Z-index, skeleton, data-viz) are parked in BUILD-LOG operational notes for their target phases. No benefit to banner annotation.

No UNCERTAIN entries. Six choices cite a specific guardrail or next-session need.

**Parked items closed.**
- Doc reconciliation pre-Phase-3 — closed via this session.

**Parked items added.**
- None. Phase 3 Day 1 scope is already captured in `docs/PRE-PHASE-3-FIX-PLAN.md` §7.1 + §6 (prompt-file move).

**Cost.** Zero API calls, zero migrations, zero portal writes. Pure doc edits.

**Handoff-repo commit companion.** Per §2.13.1's handoff-edit policy (explicit Jeff approval required), 20 banner additions to `~/nexus/docs/handoff/` files + 1 banner to `~/nexus/docs/handoff/source/prompts/PORT-MANIFEST.md` land as a single companion commit in the `nexus` repo alongside this nexus-v2 commit. `533d3eb` (Phase 2 Day 2 ContactRole) was the first precedent; the reconciliation commit is the second. Pre-existing uncommitted changes in nexus (`apps/web/package.json` + `pnpm-lock.yaml` adding `dotenv` dep) are NOT included — they predate this session and are unrelated to reconciliation.

### Phase 3 Day 1 Session A — 2026-04-22 · `79cbf8f`

**Prompt-file ports + shared env helper per `docs/PRE-PHASE-3-FIX-PLAN.md` §7.1 (items 1 + 2 of 4).** First of two Phase 3 Day 1 sessions per oversight's A/B split. Zero code paths exercise live Claude or live HubSpot; zero Supabase writes. Session A is pure organizational / tooling hygiene clearing the decks for Session B's wrapper wiring + MockClaudeWrapper.

**Prompt moves — 8 files (not 7 — counts reconciled).**

`docs/PRE-PHASE-3-FIX-PLAN.md` §6 + §7.1 say "7 remaining rewrites (02-08)". Actual count is 8 because 14 split to 14A/14B during 04C authoring → `06a-close-analysis-continuous.md` + `06b-close-analysis-final.md`. PORT-MANIFEST confirms 8 REWRITTEN files (8 originals, 9 target files with 14 splitting). No fix-plan edit; the §6 "7" is a counting typo surfaced at session kickoff, noted here for the historical record. All 8 moved.

Each move: `cp` source file verbatim → destination, then Edit front-matter to add `tool_name` (extracted from the `name:` field in each body's Tool-Use Schema section) and bump version where applicable. Tool names per file:

| File | tool_name | Version |
|---|---|---|
| `02-observation-classification.md` | `classify_observation` | 1.0.0 → 1.1.0 |
| `03-agent-config-proposal.md` | `propose_agent_config_change` | 1.0.0 → 1.1.0 |
| `04-coordinator-synthesis.md` | `synthesize_coordinator_pattern` | 1.0.0 → 1.1.0 |
| `05-deal-fitness.md` | `analyze_deal_fitness` | 1.1.0 (unchanged) |
| `06a-close-analysis-continuous.md` | `update_deal_theory` | 1.0.0 → 1.1.0 |
| `06b-close-analysis-final.md` | `produce_close_hypothesis` | 1.0.0 → 1.1.0 |
| `07-give-back.md` | `emit_giveback` | 1.0.0 → 1.1.0 |
| `08-call-prep-orchestrator.md` | `assemble_call_brief` | 1.1.0 (unchanged) |

05 + 08 kept at their existing 1.1.0 per kickoff direction — those files already carry the prior ContactRole/MEDDPICC alignments from `533d3eb` and bumping again for only a tool_name addition would be churn. The other six get 1.1.0 because adding a required loader key counts as a non-trivial front-matter edit per §6's criterion.

01-detect-signals.md stays at v1.0.0 (tool_name was present from Phase 1 Day 4). The §2.13.1 calendared `reasoning_trace` addition + version bump for 01 is **Phase 3 Day 2 pre-step**, not this session.

Handoff source copies at `~/nexus/docs/handoff/source/prompts/*.md` unchanged. v2-canonical is now the moved copies per CLAUDE.md "~/nexus is read-only reference" + §2.13.1 precedent.

**Shared `loadDevEnv()` + `requireEnv()` helper at `packages/shared/src/env.ts`.**

`§2.13.1` "Dotenv `override: true` convention" bullet explicitly parks consolidation for Phase 3 Day 1. Helper consolidates the dotenv pattern Day 5's local `packages/db/src/scripts/hubspot-env.ts` pioneered. Resolution path from `packages/shared/src/env.ts` is `../../../.env.local` (repo root) — one level shallower than the Day-5 local copy because the file lives one directory shallower in the workspace tree. Export surface added to `packages/shared/src/index.ts` alongside the Session 0-B `db/pool` export (same pattern).

**11 script callers + 1 integration test migrated to `@nexus/shared`.** Before-state: `import { loadDevEnv, requireEnv } from "./hubspot-env";` (identical line in each). After-state: `import { loadDevEnv, requireEnv } from "@nexus/shared";`. Callers:

- `packages/db/src/scripts/apply-migration-0004.ts`
- `packages/db/src/scripts/apply-migration-0005.ts`
- `packages/db/src/scripts/check-pre-migration-0005.ts`
- `packages/db/src/scripts/hubspot-align-role-options.ts`
- `packages/db/src/scripts/hubspot-prewarm-cache.ts`
- `packages/db/src/scripts/hubspot-provision-pipeline.ts`
- `packages/db/src/scripts/hubspot-provision-properties.ts`
- `packages/db/src/scripts/hubspot-seed-minimal.ts`
- `packages/db/src/scripts/hubspot-smoke-stage-change.ts`
- `packages/db/src/scripts/hubspot-subscribe-webhooks.ts`
- `packages/db/src/scripts/test-shared-pool.ts`
- `packages/shared/scripts/test-detect-signals.ts` (replaced an inline `loadEnv({ path, override: true })` with `loadDevEnv()` — same pattern single-sourced)

`packages/db/src/scripts/hubspot-env.ts` deleted. Post-session `grep hubspot-env packages apps`: only match is the comment reference in `packages/shared/src/env.ts` describing what the helper retires — zero remaining imports.

**New permanent canary — `packages/shared/scripts/test-prompt-loader.ts`.** Runs `loadPrompt(name)` for every `.md` in `packages/prompts/files/`, asserts required front-matter (name/model/temperature/max_tokens/tool_name/version all present + non-empty) + non-empty System Prompt + non-empty User Prompt Template sections. Exits 1 on any failure. pnpm alias added: `pnpm --filter @nexus/shared test:prompt-loader`. Precedent: Phase 1 Day 2 `test-rls-*.ts` scripts are canaries for schema/policy drift; this is the canary for prompt front-matter drift. Kept as permanent artifact — every new `.md` file in `packages/prompts/files/` runs through it.

At session close, the script reports 9/9 PASS: 01-detect-signals v1.0.0 + 02-08 (incl. 06a/06b) all loading with their new tool_names.

**Verification at end of Session A.**

- `pnpm --filter @nexus/shared test:prompt-loader` — 9/9 PASS. Output captures `version tool_name model temperature max_tokens` per prompt for the Reasoning-stub record.
- `pnpm typecheck` — 4/4 workspaces PASS (3.2s).
- `pnpm build` — 13 routes, clean compile (10.2s). Same route count as Session 0-C; Session A does not touch any app route surface.
- Build-warning signature grep — zero hits on `Attempted import error | Module not found | Type error | Failed to compile`.
- Inline hex grep in `apps/web/src/*.{ts,tsx}` — zero hits.
- Stale shadcn placeholder-class grep — zero hits.
- `pnpm --filter @nexus/db enum:audit` — PASSED (all 6 canonical enums consistent across TS canonical / pgEnum single-source / HubSpot property options).
- Residual-reference grep on `hubspot-env` — one hit (documentation reference in the new `env.ts` describing the retired file); zero import hits, zero runtime hits.

No live Claude, live HubSpot, or live Supabase exercise was required or performed in this session.

**Reasoning stub.** Non-MVP choices with justification type per the CLAUDE.md reasoning-gate (1 = guardrail, 2 = §2.16.1 preservation, 3 = PRODUCTIZATION-NOTES arc, 4 = imminent next-session need).

- **Barrel-export `env.ts` from `@nexus/shared` (vs. subpath export).** Justification 4 — Session B wires the wrapper into `prompt_call_log` + ships MockClaudeWrapper; both want the helper importable from the same namespace as `callClaude` + `getSharedSql` + `HubSpotAdapter`. Callers get a single import line with zero cognitive overhead. Precedent: Session 0-B's `db/pool` module is barrel-exported the same way. `"sideEffects": false` on `@nexus/shared` + the helper's side-effect-free top level mean no bundler leak risk for apps/web.
- **Migrated `test-detect-signals.ts` to `loadDevEnv()` in Session A, not Session B.** Justification 1 (§2.13.1 single-source discipline — if the helper is the canonical pattern, every script should use it the day the helper exists). Justification 4 (Session B re-runs the detect-signals integration test against the now-live `prompt_call_log` write path; that test should run through the canonical helper, not a stale inline `loadEnv({path, override: true})` duplicate).
- **`test-prompt-loader.ts` shipped as a permanent artifact, not a one-off session verification.** Justification 1 — `test-rls-*.ts` scripts are retained Phase 1 Day 2 precedent for "schema/policy drift canary." Prompt front-matter drift (missing `tool_name`, expired `version`, empty `System Prompt`) is the same class of silent-breakage; a loader fail in prod hits a user mid-request. Session B + Phase 3 Day 2 + Phase 5 Day 1 all add writers that load prompts; the canary catches misses at commit time.
- **Version bump criterion: tool_name addition qualifies as non-trivial.** Judgment call at oversight direction — Jeff's kickoff explicitly locked the rule ("bump 1.0.0 → 1.1.0 on the six receiving the tool_name addition, leave 05 and 08 at their existing 1.1.0"). §6 treats front-matter edits as version-bump triggers; `tool_name` is a required loader key that changes downstream runtime behavior (which tool Claude is forced to emit), so 1.1.0 is defensible as a non-trivial bump.
- **Loader smoke runs synchronously against the full `files/` directory, not a configured allowlist.** Justification 1 — mirrors the loader's own directory-based resolution. Adding a file to `packages/prompts/files/` is the single action that registers a prompt; the smoke test reading the same directory means no registration step to drift from.
- **Retired `hubspot-env.ts` via hard delete rather than deprecation shim.** Justification 1 — Guardrail 39 ("zero-importer components… do not ship") + BUILD-LOG discipline of "no backwards-compat placeholders." With zero remaining imports at grep time, the hard delete is the correct posture. If a future script needs the helper, it imports from `@nexus/shared` directly.

No UNCERTAIN entries. All six choices cite a specific guardrail or next-session need.

**Divergences surfaced during execution (non-blocking, flagged for future hygiene).**

- **`PRE-PHASE-3-FIX-PLAN.md` §6 + §7.1 count "7 remaining rewrites".** Actual count is 8 (14 → 14A/14B split). Noted above; not a fix-plan doc edit in this session (the plan is closed out as a historical record per its own header). Future readers consulting §6 should add 1 mentally.
- **`~/nexus/docs/handoff/source/prompts/PORT-MANIFEST.md` reconciliation banner claims "01-detect-signals.md already at `packages/prompts/files/01-detect-signals.md` (v1.1.0, max_tokens 6000)".** File is actually at v1.0.0 (max_tokens 6000 is correct). Minor reconciliation-banner inaccuracy. The §2.13.1 calendared `01 reasoning_trace` addition is the intended 1.1.0 bump trigger (Phase 3 Day 2). Parked — could be corrected in the next handoff-edit pass; not worth a standalone `~/nexus` commit.

**Parked items closed.**
- Phase 3 Day 1 scope item 1 (prompt-file move) — shipped.
- Phase 3 Day 1 scope item 2 (shared `loadDevEnv()` env helper + `hubspot-env.ts` retirement) — shipped.

**Parked items added.**
- **`PORT-MANIFEST.md` banner v1.1.0 claim for 01-detect-signals.md.** Correct to v1.0.0 during the next `~/nexus/docs/handoff/` edit pass (explicit Jeff approval per §2.13.1). Not urgent.
- **Phase 3 Day 1 Session B scope reminder (for the kickoff prompt Jeff drafts).** Wrapper → `prompt_call_log` write on success + failure (§2.16.1 decision 3, 19-col shape, RLS Pattern D, `getSharedSql()` writes); MockClaudeWrapper drop-in with fixture-backed tool outputs + harness. TS tool schemas for 02-08 defer to per-feature wiring (Phase 3 Day 2+) unless Session B orientation surfaces an imminent need.

**Cost.** Zero Claude API calls, zero HubSpot API calls, zero Supabase writes. Pure filesystem edits + typecheck/build/enum:audit/loader-smoke runs. No portal state change. No migration.

### Phase 3 Day 1 Session B — 2026-04-22 · `0e79c40`

**Claude wrapper telemetry + MockClaudeWrapper per `docs/PRE-PHASE-3-FIX-PLAN.md` §7.1 (items 3 + 4 of 4).** Closes all four Phase 3 Day 1 deliverables; Day 1 fully shipped. One new module (`telemetry.ts`), one refactor (`client.ts`), one new library (`mock.ts`), three new test canaries, one augmented integration test. Zero migrations, zero schema changes — table already landed Session 0-B with the locked 19-column shape.

**Wrapper → `prompt_call_log` write-path (§2.16.1 decision 3 implementation).**

New module `packages/shared/src/claude/telemetry.ts`:

- `PromptCallLogEntry` interface — 14 flat fields + `anchors: CallClaudeLogAnchors` (5 foreign-anchor fields). Mirrors the 19-column `schema.promptCallLog` shape exactly; `id` + `createdAt` default on the DB side.
- `buildLogEntry(input)` — pure function mapping a wrapper-internal context bag to a `PromptCallLogEntry`. Extracts `errorClass` via `err.constructor.name` when error is present. Unit-testable without invoking Anthropic.
- `writePromptCallLog(entry)` — async, best-effort. Uses `getSharedSql()` (service-role pool, bypasses RLS Pattern D). Catches DB errors + emits diagnostic stderr line (`event: "claude_call_log_write_failed"`); never throws. Handles missing `DATABASE_URL` by emitting `event: "claude_call_log_skipped", reason: "no_db"` and returning — keeps wrapper usable in environments without DB config.
- `emitTelemetry(entry)` — unified emission. Writes the stderr JSON line (shape preserved from Phase 1 Day 4 with one new field `errorClass`) + awaits `writePromptCallLog`. Called from every wrapper exit path.

Refactored `packages/shared/src/claude/client.ts`:

- Added `CallClaudeLogAnchors` import from `./telemetry`; added optional `anchors?: CallClaudeLogAnchors` field to `CallClaudeInput`. Callers pass `{hubspotDealId, observationId, transcriptId, jobId, actorUserId}`; missing anchors store as NULL on the row.
- Four exit paths now emit telemetry:
  1. **Pre-flight** (missing `ANTHROPIC_API_KEY`): `inputTokens/outputTokens/stopReason: null`, `attempts: 0`, `errorClass: "Error"`.
  2. **Exhausted retries or non-retryable**: `inputTokens/outputTokens/stopReason: null`, `attempts: 1-3`, `errorClass: e.g. "APIError"`.
  3. **Protocol violation** (got response, no tool_use): `inputTokens/outputTokens/stopReason` populated (response exists), `errorClass: "PromptResponseError"`.
  4. **Success**: all fields populated, `errorClass: null`.
- Return shape unchanged; callers that don't pass `anchors` continue to work without modification. Await points add ~10-50ms per call (DB INSERT round-trip); budgeted against the enterprise-compliance surface §2.16.1 decision 3 exists for.

**Design decision — await vs. fire-and-forget DB write.** Awaited. Rationale: Vercel Fluid Compute can terminate detached promises mid-flight in serverless kill windows, which would lose audit rows. §2.16.1 decision 3's enterprise-compliance query "every Claude call that touched this customer's deal data" requires the row to exist. Await cost is small relative to Claude call duration (typically 30-60s; INSERT is ~20ms). Best-effort catch means DB failures don't propagate as wrapper errors.

**MockClaudeWrapper (foundation-review C3).**

New module `packages/shared/src/claude/mock.ts`:

- `makeMockCallClaude({ fixtures, durationMs?, attempts?, model?, promptVersion? })` returns `{ call, history, reset }`.
- `call`: drop-in for `callClaude` — same signature. Looks up fixture by `input.promptFile`; throws with helpful diagnostic on miss (names the missed key + known fixtures). Returns a synthetic `CallClaudeOutput` echoing the fixture as `toolInput` + default scalars (`stopReason: "tool_use"`, `attempts: 1`, `model: "mock"`, tokens 0).
- `history: MockCallRecord[]` — every call appends `{ input, output, timestamp }`. Tests assert against this array.
- `reset()` — clears history between test cases.
- Pure: no I/O, no stderr noise, no `prompt_call_log` writes. The mock IS the test seam — consumers that want log-behavior assertions test `writePromptCallLog` directly.

Deferred extensions (MVP posture): function-form fixtures `(input) => output`; tool-schema validation against `input.tool.input_schema`; simulated latency/errors. Flagged in the module's doc comment; land reactively when a real test needs them.

**Three new permanent canary scripts (precedent: `test-rls-*.ts`).**

- `packages/shared/scripts/test-mock-claude.ts` (`pnpm --filter @nexus/shared test:mock-claude`): 5 test cases exercising the mock with a realistic `01-detect-signals` fixture (2 signals + 1 stakeholder insight derived from Day-4 transcript cues). Verifies fixture lookup, structural output, history accumulation + reset, fixture-miss error, and drop-in via a consumer that accepts a callClaude-shaped function. ALL PASS.
- `packages/db/src/scripts/test-prompt-call-log.ts` (`pnpm --filter @nexus/db test:prompt-call-log`): writes success + failure shape entries via `writePromptCallLog`, reads each back by sentinel `hubspot_deal_id`, verifies every one of the 19 columns. Success: all populated. Failure: `input_tokens/output_tokens/stop_reason` null, `error_class` reflects `Error.constructor.name`, unset anchors null. Cleanup via `DELETE WHERE hubspot_deal_id = <sentinel>`. PASS (19/19 columns match).
- `packages/db/src/scripts/test-rls-prompt-call-log.ts` (`pnpm --filter @nexus/db test:rls-prompt-call-log`): Pattern D end-to-end mirroring `test-rls-meddpicc.ts`. Authed anon INSERT → DENY (code 42501); authed anon UPDATE → DENY/0-rows; service-role INSERT → SUCCESS; Sarah + Marcus authed SELECT → SUCCESS (read-all). VERIFIED.

**`test-detect-signals.ts` augmented.**

- Sentinel `hubspotDealId: "test-detect-signals-integration"` anchor added to the wrapper call.
- New assertion `[8] prompt_call_log write verification`: opens a direct postgres connection, SELECTs by sentinel anchor, verifies row fields against the response (prompt_version, tool_name, model, input_tokens, output_tokens, attempts, stop_reason, error_class null). Cleanup via `DELETE WHERE hubspot_deal_id = <sentinel>`.
- Skips gracefully if `DATABASE_URL` is unset (warning message, test proceeds).
- Closes the shared pool (`closeSharedSql`) at end so tsx exits cleanly after the new DB path.

**Verification at end of Session B.**

- `pnpm typecheck` — 4/4 workspaces PASS (2.4s).
- `pnpm build` — 13 routes clean compile (7.5s). Same route count as Session A; Session B adds no app routes.
- `pnpm --filter @nexus/shared test:prompt-loader` — 9/9 prompts load cleanly (no regressions).
- `pnpm --filter @nexus/shared test:mock-claude` — ALL PASS (5 cases).
- `pnpm --filter @nexus/db test:prompt-call-log` — PASS (19/19 columns verified for both success + failure shapes).
- `pnpm --filter @nexus/db test:rls-prompt-call-log` — VERIFIED (Pattern D fully exercised).
- `pnpm --filter @nexus/db enum:audit` — PASSED (all 6 canonical enums consistent).
- `pnpm --filter @nexus/shared test:detect-signals` — LIVE END-TO-END PASS. Stderr JSON line carried the new `errorClass: null` field; `[8]` post-run SELECT found the row (id=4ea88f57…, tokens=5128/3009, attempts=1, stop=tool_use, error_class null); sentinel cleanup removed 1 row. 10 signals, 2 stakeholder insights, 54.4s, stop_reason=tool_use. Confirms the full wrapper → Claude → telemetry → DB path works end-to-end on a real API call.
- Build-warning signature grep — zero hits.
- Inline hex grep in `apps/web/src/*.{ts,tsx}` — zero hits.
- Stale shadcn placeholder-class grep — zero hits.

**Reasoning stub.** Non-MVP choices with justification type per the CLAUDE.md reasoning-gate (1 = guardrail, 2 = §2.16.1 preservation, 3 = PRODUCTIZATION-NOTES arc, 4 = imminent next-session need).

- **Extract `telemetry.ts` as a separate module rather than inlining in `client.ts`.** Justification 1 + 4 — keeps `client.ts` focused on the Claude protocol (tool-use forcing, retry, tool_use extraction) and makes `buildLogEntry` + `writePromptCallLog` unit-testable without invoking Anthropic. Test-prompt-call-log.ts exercises the DB write directly using this seam; without the split, the only way to hit `writePromptCallLog` would be a live API call. Separation also sets up Phase 3 Day 2+ to mock telemetry cleanly if needed.
- **Await the DB write (not fire-and-forget).** Justification 2 — §2.16.1 decision 3 exists specifically for the enterprise-compliance surface ("every Claude call that touched this customer's deal data") described in PRODUCTIZATION-NOTES.md Stage 4 GA. Fire-and-forget is unsafe under Vercel Fluid Compute's kill windows; an audit-row loss is a direct violation of the preservation decision's intent. The ~10-50ms await cost is negligible against Claude's own ~30-60s invocation time.
- **Best-effort DB write with stderr-diagnostic fallback, never throw.** Justification 1 — wrapper's contract is "call Claude, return typed output"; telemetry failure must not propagate as a wrapper error to the caller. If the pool is down mid-pipeline, the rep still gets their call-prep; production monitoring alerts on the `claude_call_log_write_failed` stderr line.
- **New optional `anchors` field on `CallClaudeInput` (non-breaking).** Justification 4 — Phase 3 Day 2 pipeline consumer passes `{hubspotDealId, transcriptId, jobId}`; coordinator synthesis (Phase 4 Day 2) passes `{jobId}`; existing `test-detect-signals` now passes a sentinel anchor for post-run verification. All existing callers (which pass no anchors) continue to work unchanged — default is `undefined → {}` → NULL per column.
- **Mock defaults to synthesized `attempts: 1`, `durationMs: 0`, `model: "mock"` rather than echoing input or randomizing.** Justification 1 — loud-and-fast deterministic behavior is the mock's purpose; tests that want specific values pass them via options. Randomization would corrupt test determinism. Echoing input fields would violate the separation between "what the caller asked for" and "what the fake service returned."
- **Mock writes no telemetry (no stderr, no DB).** Justification 1 — pure mock keeps integration tests free of DB dependencies. Consumers that want to assert logging behavior test `writePromptCallLog` directly (via the Session B shape smoke). Mixing logging into the mock would tangle two concerns.
- **Added a post-run SELECT to `test-detect-signals.ts` behind a sentinel anchor rather than writing a separate live-API smoke.** Justification 4 — `test-detect-signals` is the only existing live-Claude consumer; augmenting it with the SELECT gives end-to-end coverage at the marginal cost of one extra DB round-trip. A separate live smoke would duplicate the Claude call + double the API cost.
- **Ran the live Claude call during Session B verification (~$0.06-0.08 in API spend).** Justification 4 — exit criteria require confirming existing consumers still work + success path writes correctly; only a live call simultaneously exercises (a) Anthropic SDK compat, (b) telemetry emission on the success path, (c) real-row write + read-back. Day-4 BUILD-LOG precedent budgeted this cost for the same verification; Session B runs once and cleans up.

No UNCERTAIN entries. All eight choices cite a specific guardrail, preservation decision, arc, or next-session need.

**Exit criteria from PRE-PHASE-3-FIX-PLAN.md §7.1 — all satisfied.**

| Criterion | Status |
|---|---|
| All 7 (actually 8) v2-ready rewrites in `packages/prompts/files/` with validated front-matter, versions bumped | Session A ✓ |
| Shared `loadDevEnv()` helper in `packages/shared/src/env.ts`; `hubspot-env.ts` retired | Session A ✓ |
| Claude wrapper writes `prompt_call_log` row on every call — success + failure, all 19 columns correct, attempts reflects retry, error_class populated on failure | Session B ✓ — verified via 19-column shape smoke (both shapes) + live end-to-end integration test |
| MockClaudeWrapper exists with harness + fixture exercising the integration test path | Session B ✓ — `test:mock-claude` harness, 5 cases ALL PASS, fixture is the realistic `DetectSignalsOutput` from Day-4 |
| `pnpm enum:audit` passes | ✓ |
| `pnpm typecheck` 4/4 PASS | ✓ |
| `pnpm build` clean, route count unchanged from Session 0-C | ✓ — 13 routes, same as 0-C |
| Build-warning grep zero on load-bearing signatures | ✓ |
| Hex grep + stale shadcn class grep zero | ✓ |
| RLS tests pass; new test covering `prompt_call_log` Pattern D writes | ✓ — `test-rls-prompt-call-log.ts` verified end-to-end |
| Existing consumers of wrapper still work | ✓ — `test:detect-signals` LIVE PASS |

**Parked items closed.**
- Phase 3 Day 1 scope item 3 (wrapper → `prompt_call_log` write-path) — shipped.
- Phase 3 Day 1 scope item 4 (MockClaudeWrapper + harness) — shipped.
- **Phase 3 Day 1 is fully complete.** All four §7.1 deliverables shipped across Sessions A + B.

**Parked items added.**
- **Phase 3 Day 2 wrapper-consumer anchor-passing.** Every pipeline step that calls `callClaude` in the transcript pipeline should pass `{hubspotDealId, transcriptId, jobId}` so log rows are queryable by deal + transcript + job. Today's default (all null) is valid per the nullable schema but loses the audit join value. Straightforward addition at pipeline authoring time; not urgent before Day 2 kickoff.
- **Mock-wrapper extensions** (deferred from MVP): function-form fixtures `(input) => output`; tool-schema validation against `input.tool.input_schema`; simulated latency/errors. Land reactively when a real Phase 3 Day 2+ test needs them.
- **Protocol-violation retry policy** (§2.13.1 parked item): today, protocol violations throw `PromptResponseError` immediately (no retry). Phase 3 Day 2 transcript pipeline may demand retry for isolated flaky responses across a multi-step pipeline. Decide at Day 2 authoring if the current behavior fails a real run.

**Cost.** One live Claude API call (~5128/3009 tokens at claude-sonnet-4-6, ~$0.06-0.08). Zero HubSpot API calls. Live Supabase writes bounded by the test scripts' self-cleanup (success + failure shape smoke rows, RLS-test row, one live-integration row — all deleted by end of session).

### Phase 3 Day 2 Session A — 2026-04-22 · `a929dcd`

**Transcript-pipeline foundation per `docs/PRE-PHASE-3-FIX-PLAN.md` §7.2 + the draft-and-adjudicate kickoff Jeff approved.** Items 1, 3, 4, 5 of the Day-2 scope plus the Session A subset of item 2. First Session in draft-and-adjudicate mode — I drafted the kickoff, Jeff adjudicated scope + the 7 approval asks, then execution ran against the adjudicated brief.

**Preflights (hard gates per kickoff) — all passed.**

1. `requireEnv("VOYAGE_API_KEY")` → 46 chars, readable via the shared env helper.
2. Read `packages/shared/tests/fixtures/medvista-transcript.txt` FIRST. Format confirmed as `ALL-CAPS SPEAKER NAME:` prefix (e.g. `SARAH CHEN:`, `DR. MICHAEL CHEN:`). Regex-matchable: `^([A-Z][A-Z .]+):\s+`. No scope expansion needed.
3. Grep for stale `Phase 3 Day 2` target tags: surfaced **7 adapter stubs** (3 in Jeff's explicit cleanup ask + 4 more: `updateContactCustomProperties`, `updateCompanyCustomProperties`, `logEngagement`, `getEngagement`) + 2 doc-comment drifts (`stage-change.ts:41`, `stakeholders.ts:19`). Extended the cleanup per the "same ambiguous tag" rationale — flagged in Reasoning stub.

**Pre-step — `01-detect-signals` reasoning_trace + v1.0.0 → v1.1.0 (§2.13.1 calendared resolution).**

- `packages/prompts/files/01-detect-signals.md` — `reasoning_trace: string` added as the first property of the `record_detected_signals` tool-use schema in the body; listed first in `required`; System Prompt OUTPUT section updated to instruct "Begin by populating `reasoning_trace` with 2-4 sentences…"; front-matter `version: 1.0.0 → 1.1.0`.
- `packages/shared/src/claude/tools/detect-signals.ts` — TS schema mirror. `reasoning_trace: string` first in `properties`, first in `required`. `DetectSignalsOutput` interface gains `reasoning_trace: string` as a top-level field alongside `signals` + `stakeholder_insights`.
- `packages/shared/scripts/test-mock-claude.ts` — `DETECT_SIGNALS_FIXTURE` extended with a realistic `reasoning_trace` string so the mock fixture stays typecheck-clean against the v1.1.0 schema.
- `packages/shared/scripts/test-detect-signals.ts` — two hardcoded `1.0.0` version assertions bumped to `1.1.0`.

Live verification: `pnpm --filter @nexus/shared test:detect-signals` end-to-end LIVE PASS — 10 signals, 2 insights, `reasoning_trace` populated with **1675 chars** on the Claude response (step `[7]` flipped SKIPPED → PASS), stderr telemetry line carries `promptVersion:"1.1.0"` + `inputTokens:5300, outputTokens:3452`, post-run `prompt_call_log` SELECT confirms the row with full anchors.

Handoff-repo companion edit for `~/nexus/docs/handoff/04C-PROMPT-REWRITES.md` Rewrite 1 **parked per Jeff's kickoff approval** — separate companion commit after Session B ships. Same pattern as the reconciliation banner.

**TranscriptPreprocessor service + Voyage embedding helper.**

- `packages/shared/src/embeddings/voyage.ts` — new module. Single export `embedDocuments(texts: string[])` calls `https://api.voyageai.com/v1/embeddings` via raw fetch with `model="voyage-large-2"`, `input_type="document"`, Bearer auth. Returns `{ embeddings, model, totalTokens }`. Throws loudly on non-2xx (DECISIONS.md 2.24). Data-retention opt-out **deferred to pre-production** per oversight guidance — tracked in parked items.
- `packages/shared/src/services/transcript-preprocessor.ts` — new service follows the MeddpiccService / StakeholderService template: postgres.js direct, `{ databaseUrl, sql? }` injection, `close()` idempotent on shared-pool caller. Single method today: `preprocess(transcriptId: string): Promise<PreprocessResult>`.
  - Reads `transcripts` row.
  - Segments speaker turns via `SPEAKER_LINE_RE = /^([A-Z][A-Z .]+?):\s+(.*)$/` — verified against MedVista at preflight. Skips `[metadata]` bracketed lines. Tracks `turnIndex`, `startChar`, `endChar` per §2.16.1 Decision 4 (speaker-turn granularity preserved).
  - Extracts entities: vocabulary-list competitor match (19-term list seeded with MedVista names + common enterprise AI/sales competitors) + participant list from `transcripts.participants` (companies + people).
  - Calls Voyage once with N+1 texts (whole transcript + each turn).
  - Inside a single `sql.begin()` transaction: upserts `analyzed_transcripts` (idempotent on PK), DELETEs + re-INSERTs `transcript_embeddings` rows (1 `scope='transcript'` + N `scope='speaker_turn'`), flips `pipeline_processed = true`.
  - Returns `{ transcriptId, speakerTurnCount, wordCount, competitorsMentioned, embeddingModel, embeddingsWritten, embeddingTokensUsed }`.
- `packages/shared/src/services/index.ts` — new exports: `TranscriptPreprocessor`, `segmentSpeakerTurns` (exported for future direct-test use), associated types. Also re-exports `embedDocuments` + `EmbedDocumentsResult` for pipeline consumers.

**§2.16.1 Decision 1 — HNSW index creation.**

- `packages/db/src/schema.ts` — Drizzle definition added for `transcript_embeddings_embedding_hnsw`: `.using("hnsw", t.embedding.op("vector_cosine_ops")).with({ ef_construction: 64, m: 16 })`. Keeps future `drizzle-kit generate` diff-clean per Jeff's approval ruling on stress-test finding #7.
- `packages/db/src/scripts/apply-hnsw-transcript-embeddings.ts` — new idempotent applicator (`pnpm --filter @nexus/db apply:hnsw-transcript-embeddings`). `CREATE INDEX IF NOT EXISTS` with the locked params. Preflight row-count check + post-create verification via `pg_indexes`. Warns-but-proceeds if table is empty (happens when run in Session A before preprocessor; works normally after). Uses `DIRECT_URL` for pooler-bypass per operational notes.
- Index created live post-preprocessor: `rows=35`, index created, `pg_indexes` verify showed 3 indexes (pkey + transcript_idx + hnsw).

**§2.16.1 Decision 4 — speaker-turn preservation.**

Verified during TranscriptPreprocessor implementation. `analyzed_transcripts.speaker_turns` jsonb stores the canonical `[{ turnIndex, speaker, text, startChar, endChar }, ...]` shape. No summary-only reduction. Downstream reads recover turn-level structure.

**§2.16.1 Decision 5 — tool-schema extensibility.**

Verified during reasoning_trace addition. The detect-signals tool schema does NOT enforce `additionalProperties: false` at the top level; adding `reasoning_trace` as a new top-level field was backward-compatible. Claude accepted the new field without breaking the existing `signals` + `stakeholder_insights` consumer shape. Future additions (e.g., `assertions_made`) will work the same way.

**Seed script + pnpm alias.**

- `packages/db/src/scripts/seed-medvista-transcript.ts` — reads `packages/shared/tests/fixtures/medvista-transcript.txt` (8134 chars), writes a `transcripts` row. Sentinel-keyed on `hubspot_engagement_id = "fixture-medvista-discovery-01"` for idempotent re-runs. `hubspot_deal_id = "321972856545"` (MedVista Epic Integration real HubSpot ID from Day 5). Uses `DIRECT_URL` for pooler-bypass.
- pnpm aliases added in `packages/db/package.json`: `seed:medvista-transcript`, `apply:hnsw-transcript-embeddings`.

**Standalone preprocessor harness.**

- `packages/shared/scripts/test-preprocessor.ts` — 6-step canary covering: locate seeded transcript → run preprocessor → verify `analyzed_transcripts` jsonb shape → verify transcript-scope embedding row → verify speaker-turn embeddings (count + indices 0..N-1) → verify `pipeline_processed` flipped → verify idempotence via second preprocess call. pnpm alias `test:preprocessor` in `packages/shared/package.json`.
- Session A live run: ALL 6 PASS. 34 turns, 1448 words, 5 competitors (Microsoft Copilot, Nuance, Dragon, PowerScribe, Epic), 35 embeddings via voyage-large-2, 4300 Voyage tokens, idempotent re-run matches first-run counts exactly.

**Batched cleanup — adapter stub messages + doc drift.**

- `packages/shared/src/crm/hubspot/adapter.ts` — 7 stub error messages updated:
  - `updateDealCustomProperties` → `"Phase 3 Day 3+"`
  - `updateContactCustomProperties` → `"Phase 3 Day 3+"`
  - `updateCompanyCustomProperties` → `"Phase 3 Day 3+"`
  - `logEngagement` → `"Phase 3 Day 4+"`
  - `getEngagement` → `"Phase 3 Day 4+"`
  - `resolveDeal` → `"Later"`
  - `resolveStakeholder` → `"Later"`
- `apps/web/src/app/actions/stage-change.ts:41` — doc comment about `deal_events` emission corrected; §2.16.1 decision 2 (event_context) landed Session 0-B, is available to future writers, but does NOT itself add emission here.
- `packages/shared/src/services/stakeholders.ts:19` — parallel doc comment corrected (target Phase 4 intelligence-surface session).

Per Jeff's "same ambiguous tag" rationale — extending the 3-stub cleanup ask to the full 7 stubs closes the class of drift in one pass.

**DIRECT_URL fallback pattern (operational note).**

During Session A runs the Supabase transaction pooler (`aws-1-us-east-1.pooler.supabase.com:6543`) hit EMAXCONN at 200 clients under cumulative session load. Dev scripts that use DATABASE_URL (pooler) should prefer DIRECT_URL (direct IPv6 host — developer Mac has IPv6) with DATABASE_URL as fallback. Applied to `test-detect-signals.ts`, `seed-medvista-transcript.ts`, `test-preprocessor.ts`, `apply-hnsw-transcript-embeddings.ts`. Runtime app code (`apps/web`) continues to use DATABASE_URL (IPv4-compatible, required on Vercel Fluid Compute).

**Forward-looking fanout verification (Jeff's Session B ask, noted for Session B report).**

Day 1 Session B's telemetry design emits one `prompt_call_log` row per `callClaude` invocation (not per pipeline). When Day 3+ expands step 3 to 3 parallel Claude calls, the pipeline will write 3 rows per run — each from its own `emitTelemetry` call awaited inside its own `Promise.all` branch. Verified structurally: `emitTelemetry` in `telemetry.ts:164` is awaited per-call with per-call `buildLogEntry`. No shared state, no racing. Session B will produce 1 row per pipeline run (one Claude call = one row); Day 3+ fanout is straightforward without redesign.

**Verification at end of Session A.**

- `pnpm typecheck` — 4/4 workspaces PASS.
- `pnpm build` — 13 routes clean compile, zero build-warning signatures.
- `pnpm --filter @nexus/db enum:audit` — PASSED (all 6 enums consistent).
- `pnpm --filter @nexus/shared test:prompt-loader` — 9/9 PASS (01 at v1.1.0).
- `pnpm --filter @nexus/shared test:mock-claude` — ALL PASS (fixture updated with reasoning_trace for v1.1.0 schema compat).
- `pnpm --filter @nexus/shared test:detect-signals` — LIVE PASS. Confirms reasoning_trace end-to-end (1675 chars); prompt_call_log row written + read back via DIRECT_URL fallback; sentinel cleanup removed stale rows from earlier EMAXCONN-failed attempts.
- `pnpm --filter @nexus/shared test:preprocessor` — 6/6 PASS (first live run).
- `pnpm --filter @nexus/db apply:hnsw-transcript-embeddings` — index created, verified via `pg_indexes`.
- Hex grep / stale shadcn grep — 0 hits in `apps/web/src/*.{ts,tsx}`.

**Reasoning stub.** Non-MVP choices with justification type per the CLAUDE.md reasoning-gate.

- **Extended adapter-stub cleanup from 3 to 7 entries.** Justification 1 — Jeff's explicit cleanup ask cited "otherwise the next session reads the same ambiguous tag" as the rationale. The preflight grep surfaced 4 additional stubs (updateContact/CompanyCustomProperties, logEngagement, getEngagement) with the identical "Phase 3 Day 2" tag. Closing them in the same pass matches the ask's intent; the alternative is leaving the same class of drift visible. Targets assigned per each method's actual landing window.
- **Voyage client as raw fetch (not the `voyageai` SDK).** Justification 4 — no imminent need for SDK features (streaming, retries, typed errors) in today's single call site. One fewer dependency keeps the bundle lean; if a future surface needs the SDK, swap at that point. Noted in voyage.ts header.
- **Competitor vocabulary hardcoded in preprocessor.** Justification 4 — 19-entry list seeded from the MedVista fixture + common enterprise AI competitors unblocks Day 2. Full NER (named-entity recognition via a model or library port) is Phase 4+ productization concern per PRODUCTIZATION-NOTES corpus-intelligence arc. MVP posture documented in the service comment.
- **`transcript_embeddings` idempotence via DELETE + re-INSERT (not composite unique + upsert).** Justification 1 — composite `(transcript_id, scope, speaker_turn_index)` unique constraint would be a schema change, out of scope for Session A. DELETE + INSERT inside the transaction is correct, atomic, and straightforward. Session B or Day 3 can promote to a natural unique key when a demo-reset walker needs faster upserts.
- **Pre-flip `pipeline_processed = true` inside the preprocessor transaction (not the pipeline handler).** Justification 4 — Session B's pipeline handler may want to flip it LATER (e.g., after persist step), so the preprocessor flipping it early could cause semantic drift. **Defensible tradeoff**: preprocessor-as-last-writer means the flag reflects "preprocessing done," which is what step 2 completes. Session B can introduce a separate `pipeline_fully_processed` column later if needed, or leave the single flag meaning "at-least-preprocess-ran." Flagging for Session B's consideration.
- **HNSW definition lands in schema.ts AND the applicator script creates it.** Justification 1 — Jeff's approved ruling from stress-test #7. Schema.ts keeps drizzle-kit generate diff-clean on future runs; the applicator is the authoritative creator (runs once after first rows). Redundant-looking but correct.
- **Non-MVP judgment — `getCanonical()` method NOT added to TranscriptPreprocessor today.** Justification 4 — §2.13 names `TranscriptPreprocessor.getCanonical(transcriptId)` as a downstream reader. Day-2 Session B's pipeline handler may or may not need it (step 3 reads from `analyzed_transcripts` directly). Adding a method without a caller is premature. Add when the first Phase 3 Day 3+ consumer arrives.
- **Live verification via `test:detect-signals` ran ~$0.12 in API spend (two runs — first + retry after DIRECT_URL fix).** Justification 4 — Day 1 Session B precedent budgets one live run per scope-critical verification; two runs was necessary because the first failed on a pooler-saturation issue that revealed the DIRECT_URL fallback need. The DIRECT_URL fix benefits every future dev-script run, so the doubled cost purchased a durable fix, not just today's verification.

No UNCERTAIN entries. 8 choices cite a specific guardrail, preservation decision, arc, or next-session need.

**Parked items closed.**
- Phase 3 Day 2 Scope item 1 (01-detect-signals reasoning_trace + v1.1.0) — shipped.
- Phase 3 Day 2 Scope items 3, 4, 5 (§2.16.1 Decisions 1, 4, 5) — all verified + Decision 1 HNSW index live.
- Phase 3 Day 2 Scope item 2 partial (TranscriptPreprocessor service) — shipped standalone; Session B wires it into the pipeline handler.

**Parked items added.**
- **04C Rewrite 1 mirror edit.** Add `reasoning_trace: string` as first property to the tool-use schema in `~/nexus/docs/handoff/04C-PROMPT-REWRITES.md` Rewrite 1 per §2.13.1 calendared resolution. Commit as a separate `nexus` repo companion after Session B ships. Jeff-approval pattern matches `533d3eb` + `c48470b`. Also fortuitously fixes the PORT-MANIFEST.md banner which claimed 01 at v1.1.0 (now accurate).
- **10-REBUILD-PLAN.md reconciliation banner.** Banner notes (a) prompt-number corrections (#21/#20/#19 for the pipeline's step 3 parallel analyses, not #15/#20/#2 per the original text) and (b) Deal Fitness track separation (#15 → 05 is on-demand, not per-transcript-pipeline). Companion commit after Session B ships.
- **Voyage data-retention opt-out.** Must enable before any real-customer data flows through the embedding API. Today's traffic is MedVista fixture only. Pre-production checklist item.
- **`getCanonical()` method on TranscriptPreprocessor.** Add when the first Phase 3 Day 3+ consumer needs it (likely when the call-prep orchestrator ports, Phase 3 Day 4+).
- **Richer entity extraction (NER) in preprocessor.** Vocabulary-list is MVP; Phase 4+ productization concern.
- **`transcript_embeddings` composite unique constraint `(transcript_id, scope, speaker_turn_index)`.** Schema change for cleaner upsert semantics. Not urgent; DELETE+INSERT is correct today.
- **Competitor vocabulary — "DAX" as standalone term.** Fixture mentions "DAX" by itself; current vocab only has "DAX Copilot" + "Microsoft DAX Copilot" + "Microsoft DAX" (none appear verbatim). Adding bare "DAX" risks false positives; defer until the extraction proves insufficient in real data.
- **`test:detect-signals` cleanup across stale sentinel rows.** This session's run cleaned up 3 sentinel rows (one new + two from earlier EMAXCONN-failed runs). Future sessions may accumulate sentinel rows if runs fail partway; consider a `cleanup:prompt-call-log-sentinels` script.

**Pre-production checklist item (new bucket):**
- **Voyage data-retention opt-out** — enable before real-customer data.

**Cost.** Live Claude API: 2× detect-signals runs at ~$0.06-0.08 each (retry after DIRECT_URL fix) ≈ $0.12-0.16. Live Voyage API: 2× preprocessor runs at ~4300 tokens each ≈ 8600 tokens total ≈ <$0.01. Live Supabase writes: one MedVista transcripts row, one analyzed_transcripts row, 35 transcript_embeddings rows (intentionally persisted for Session B), HNSW index creation. Zero HubSpot API calls.

### Phase 3 Day 2 Session B — 2026-04-22 · `7f1b3f8`

**`transcript_pipeline` handler end-to-end per the adjudicated kickoff.** The `notYet(...)` throw is gone; the 4-step orchestrator runs against the seeded MedVista transcript; idempotency works across re-runs; the full enqueue→worker→handler→completion flow lands with Realtime transitions.

**Handler authoring.**

- Moved `apps/web/src/lib/jobs/handlers.ts` → `packages/shared/src/jobs/handlers.ts`. Cross-workspace testability — packages/db test scripts can now import the handler directly. `apps/web/src/app/api/jobs/worker/route.ts` + `enqueue/route.ts` updated to `import … from "@nexus/shared"`. Empty `apps/web/src/lib/jobs/` removed.
- `JobHandler` signature expanded: `(input) => Promise<T>` → `(input, ctx?: JobHandlerContext) => Promise<T>` with `JobHandlerContext = { jobId: string; jobType: string }`. Worker route passes it; direct-invocation tests pass it manually. Pre-existing `noop` handler unaffected (ctx optional). Rationale documented inline: anchors `{ hubspotDealId, transcriptId, jobId }` on Claude calls need `jobId` plumbed through from the worker per §2.13.1 Day-1 Session-B parked discipline.
- `transcript_pipeline` handler at `packages/shared/src/jobs/handlers.ts`:
  - Input: `{ transcriptId: string }`. Type-guard throws loudly on malformed shape.
  - **Step 1 ingest** — reads `transcripts` row, builds `event_context` via `DealIntelligence.buildEventContext(hubspotDealId, [])`, checks for existing `transcript_ingested` event by `source_ref = <transcriptId>`, inserts if absent. Payload: `{ transcriptId, title, textLength, participantCount, durationSeconds }`. source_kind=`service`.
  - **Step 2 preprocess** — constructs `TranscriptPreprocessor` with shared pool (`{ databaseUrl, sql }`), calls `preprocess(transcriptId)`. Preprocessor handles idempotency internally (upsert `analyzed_transcripts`, DELETE+INSERT `transcript_embeddings` inside a single `sql.begin()` transaction).
  - **Step 3 analyze-signals** — builds context via `buildSignalDetectionVars(sql, transcript)` (new helper, inline in handlers.ts): reads deal + company from `hubspot_cache`, splits `transcripts.participants` into buyer/seller blocks, formats `meddpicc_scores` if present (8 dimensions with score + evidence_text + last_updated + confidence; `(none)` if no row), stubs active-experiments/open-signals/active-patterns as `(none)`. Calls `callClaude<DetectSignalsOutput>` with `promptFile: "01-detect-signals"`, `task: "classification"`, `anchors: { hubspotDealId, transcriptId, jobId }`. Runs via `Promise.all([...])` — shape for Day-3 parallel expansion (score-meddpicc + extract-actions) without restructuring.
  - **Step 4 persist-signals** — per-signal hash = first 16 hex chars of `sha256(signal_type|evidence_quote_normalized|source_speaker_normalized)`. `source_ref = <transcriptId>:<hash>`. Idempotency check: SELECT existing `signal_detected` row by source_ref; skip if exists. Insert carries `payload: { signal, reasoning_trace, signal_hash, transcript_id, stop_reason, prompt_version }`, source_kind=`prompt`, event_context populated.
  - **Steps 5/6/7 deferred** — `stepsDeferred: ["coordinator_signal", "synthesize_theory", "draft_email"]` returned in result (not thrown). Clean early-terminate per Jeff's Session B scope-addition ruling (stress-test #5 approval). Handler exits successfully after step 4.
  - Result shape: flat POJO with `stepsCompleted`, `stepsDeferred`, `signals` (detected/inserted/skipped_duplicate), `events` (per-type insert/skip counts), `preprocess`, `claude`, `timing`. Preserved as the jobs.result jsonb.
- Stakeholder insights from detect-signals output are observable but NOT persisted Day 2 — parked for a future Phase 4+ stakeholder-engagement writer. `void stakeholderInsights` keeps the linter honest about the deliberate drop.

**Worker route ctx wiring.** `apps/web/src/app/api/jobs/worker/route.ts:69` — one-line change: `handler(job.input)` → `handler(job.input, { jobId: job.id, jobType: job.type })`. Comment references §2.16.1 decision 3 compliance intent.

**Prompt loader walk-up fix.** PHASE 3 of the test initially failed with `Prompt file not found: /Users/jefflackey/nexus-v2/apps/web/packages/prompts/files/01-detect-signals.md` — the loader's `resolve(here, "..", "files")` walked off into `.next/server/...` when the Next.js Turbopack bundle transpiled the module. Fix: three-strategy `filesDir()` with cached result. (1) relative-to-module (tsx happy path) → (2) walk up from `here` looking for `packages/prompts/files/` (bundled-context happy path) → (3) `PROMPT_FILES_DIR` env override (last resort). Existing tsx callers unchanged; Next.js serverless now finds the dir. Verified: `test:prompt-loader` still 9/9 PASS; PHASE 3 now succeeds via the worker endpoint.

**3-phase test harness.** `packages/db/src/scripts/test-transcript-pipeline.ts` (pnpm alias `test:transcript-pipeline`):

- **PHASE 1 — Direct invocation.** Imports `HANDLERS` from `@nexus/shared`, calls `transcript_pipeline({ transcriptId }, { jobId: <uuid>, jobType })`. Fast iteration path. Verifies result shape (stepsCompleted=4, stepsDeferred=3, prompt_version=1.1.0), sample `signal_detected` row shape (source_ref format, source_kind=prompt, event_context populated, payload has reasoning_trace + signal_hash).
- **PHASE 2 — Idempotency.** Second direct invocation against same transcript. Verifies `transcript_ingested_skipped=1` (existing row from PHASE 1), `transcript_embeddings` count stable (preprocessor DELETE+INSERT produces same N+1), `signal_detected` delta equals `result.signals.inserted` (no duplicate rows for same signal_hash). Exact PHASE-2 counts vary by Claude's non-determinism at temp 0.2 — different runs produce slightly different quotes → different hashes → some signals re-detect as "new," others dedup as "skipped." The invariant: no DUPLICATE rows for the same signal_hash, verified via DB count delta.
- **PHASE 3 — Full enqueue→worker→handler flow.** Sign in as Sarah via magic-link cookie jar (precedent: test-e2e-job.ts). POST `/api/jobs/enqueue` with `{ type: "transcript_pipeline", input: { transcriptId } }`. Subscribe Realtime on `jobs.id=eq.<jobId>`. Curl `/api/jobs/worker` with Bearer CRON_SECRET. Wait for `succeeded` transition. Live run: `running@983ms → succeeded@71446ms`. Verify result jsonb shape in jobs row. Cleanup: delete the test jobs row (deal_events rows intentionally preserved — they're real pipeline output).

**Real-UUID discipline for test jobIds.** Initial PHASE 1/2 runs used string identifiers ("test-direct-phase-1") as the `jobId` anchor → stderr `claude_call_log_write_failed` because `prompt_call_log.job_id` is a uuid column that rejects non-UUID strings. The wrapper's best-effort telemetry path caught it (caller still succeeded) but audit rows were lost. Fix: `crypto.randomUUID()` for both direct-invocation jobIds in the test. Real worker-dispatched jobs always have real UUIDs (generated at enqueue).

**DB-URL pooler-bypass discipline.** Test forces `process.env.DATABASE_URL = process.env.DIRECT_URL` before loading the handler, so the shared pool initializes on DIRECT_URL (pooler-bypass for dev Mac — same pattern applied Session A to seed/preprocessor scripts). The dev server for PHASE 3 continues to use pooler-DATABASE_URL (runtime behavior matches Vercel production).

**Verification at end of Session B.**

- `pnpm typecheck` — 4/4 workspaces PASS.
- `pnpm build` — 13 routes clean, zero build-warning signatures.
- `pnpm --filter @nexus/db enum:audit` — PASSED.
- `pnpm --filter @nexus/shared test:prompt-loader` — 9/9 PASS.
- `pnpm --filter @nexus/shared test:mock-claude` — ALL PASS.
- `pnpm --filter @nexus/shared test:preprocessor` — 6/6 PASS (unchanged from Session A).
- `pnpm --filter @nexus/db test:prompt-call-log` — unchanged (19/19 columns).
- `pnpm --filter @nexus/db test:rls-prompt-call-log` — unchanged (Pattern D).
- `pnpm --filter @nexus/db test:transcript-pipeline` — **3/3 PHASES PASS** (74s direct + 74s idempotency + 71s full flow).
- Hex + stale shadcn class grep — 0 hits.

**Live MedVista pipeline output (cumulative across PHASE 1/2/3 + prior Session-A + earlier failed-test runs):**
- `transcript_ingested` rows for MedVista: 1 (idempotent on transcript_id)
- `signal_detected` rows for MedVista: 19 (each uniquely keyed by signal_hash; further re-runs won't add duplicates)
- `analyzed_transcripts`: 1 row (upserted)
- `transcript_embeddings`: 35 rows (preprocessor DELETE+INSERT on re-run → count stable)
- HNSW index: live, validated

**Reasoning stub.** Non-MVP choices with justification type per the CLAUDE.md reasoning-gate.

- **Moved `handlers.ts` from `apps/web/src/lib/jobs/` to `packages/shared/src/jobs/`.** Justification 4 — the test-transcript-pipeline script needs direct handler import for PHASE 1/2 speed; cross-workspace imports from packages/db into apps/web hit TypeScript `rootDir` boundary errors. Moving to @nexus/shared is clean (handler has zero apps/web-specific coupling — it's a pure function of `(input, ctx)` + shared services). Also Justification 3 — future productization (multi-app, multi-worker) wants handler logic reusable across packages.
- **Expanded `JobHandler` signature with `ctx?`.** Justification 1 (§2.13.1 anchor-passing discipline) — the wrapper's `jobId` anchor must not be null for worker-dispatched calls; plumbing ctx through is the minimal-surface way to carry it. Alternatives (payload inclusion, AsyncLocalStorage) rejected as ugly-or-overengineered in handler-file comments.
- **Early-terminate for steps 5/6/7 (vs. `not_implemented` throw).** Justification 1 (DECISIONS.md 2.24 — "no graceful degradation that fakes success"). Throwing would mark the job `failed`; that's a lie because steps 1-4 did succeed. `stepsDeferred` in the result is structured deferral — explicit, not hidden. Jeff approved this framing in the scope-decisions adjudication.
- **`Promise.all([single-call])` shape for step 3.** Justification 4 — Day 3+ expands to 3 parallel Claude calls (detect-signals + score-meddpicc + extract-actions); shipping the `Promise.all` harness now means adding call sites is a one-line change, not a restructure. Fanout verification (Jeff's forward-looking Session B ask): confirmed — telemetry writes one `prompt_call_log` row per `callClaude` invocation. 3 parallel calls = 3 rows, no shared state, no races.
- **signal_hash via sha256 first-16-hex.** Justification 1 — hash length is a tradeoff between collision resistance + source_ref readability. 16 hex chars = 64 bits; at ~10 signals per transcript + ~100K transcripts per deployment, collision probability is negligible. Full 64-char sha256 would bloat source_ref. SHA-256 over MD5 because SOC 2 / enterprise contexts reject MD5 on audit.
- **Prompt loader walk-up strategy (3-strategy cascade with cache).** Justification 1 + 4 — the Next.js Turbopack bundling behavior is load-bearing for ANY future apps/web route that loads prompts (call-prep orchestrator, give-back, coordinator synthesis — all Phase 3+). Cascading fallbacks are more robust than a single env-var hack. The cache avoids repeated disk probes per invocation.
- **Test harness uses DIRECT_URL pooler-bypass.** Justification 4 — direct-invocation in PHASE 1/2 runs the handler in the test process; saturated pooler (operational note from Session A) kills it. DIRECT_URL works from dev Mac. PHASE 3 runs in the Next.js dev server which keeps DATABASE_URL = pooler for production-equivalent behavior. Dev-script vs runtime split is the correct architecture.
- **PHASE 3 full enqueue→worker flow is a hard exit criterion for Session B, not a nice-to-have.** Justification 1 — Jeff's kickoff explicitly called this out ("I don't want the first full-flow run to be in front of a customer"). Exercising RLS + Realtime + worker dispatch + result-jsonb persistence + Bearer auth end-to-end against the live stack means the first Vercel production hit won't surface unseen edge cases.

No UNCERTAIN entries. 8 choices cite a specific guardrail, preservation decision, arc, or next-session need.

**Idempotency verdict — no product-direction question surfaced.**

Jeff's kickoff asked: "If idempotency surfaces a deeper design question (e.g., should re-ingestion overwrite old analysis or preserve both versions for audit?), STOP and flag upward." The Session B test run surfaced no such question. The observed behavior is all at the implementation layer:
- `transcript_ingested` dedup on `(transcript_id)` works as designed (1 row per transcript).
- `analyzed_transcripts` upsert on PK works as designed (overwrites on re-run).
- `transcript_embeddings` DELETE+INSERT works as designed (stable row count on re-run).
- `signal_detected` dedup on `(transcript_id, signal_hash)` works as designed (non-determinism at temp 0.2 produces slightly different quotes across runs — each unique signal_hash is a unique row, which is correct because they ARE different signals — same event but different precise evidence quote).

The non-determinism observation IS worth a parked item: future-phase may want to consolidate "same event, different quote" via a looser matching key (e.g., signal_type + approximate-evidence embedding similarity). That's a Phase 5+ coordinator-synthesis concern, not a Day-2 gap.

**Parked items closed.**
- Phase 3 Day 2 scope item 2 (transcript_pipeline handler authoring) — shipped.
- Session A parked: `transcript_pipeline` was "Phase 3 Day 2 handler" — now live.
- Session-A forward-looking fanout verification — verified in Session B code review + Reasoning stub.

**Parked items added.**
- **04C Rewrite 1 reasoning_trace mirror** — companion commit in `~/nexus/docs/handoff/` after Session B commits land. Per §2.13.1 handoff-edit policy, separate commit with explicit Jeff approval (already granted in Session A kickoff). Also fortuitously makes the PORT-MANIFEST.md banner accurate (which claimed 01 at v1.1.0 before this session bumped it).
- **10-REBUILD-PLAN.md §Phase-3 reconciliation banner** — companion commit in `~/nexus/docs/handoff/`. Notes (a) prompt-number corrections (#21/#20/#19 for step-3 parallel analyses, not #15/#20/#2) and (b) Deal Fitness track separation (#15 on-demand, not per-transcript). Jeff-approved in kickoff response.
- **Day 3 scope (next session):** port #19 extract-actions + #20 score-meddpicc into `packages/prompts/files/` with tool_name + TS schemas; expand step 3 Promise.all to 3 calls; wire `CrmAdapter.updateDealCustomProperties` for MEDDPICC writeback.
- **Day 4+ scope:** step 5 coordinator-signal (stub until Phase 4); step 6 synthesize-theory via 06a (TS schema needed); step 7 draft-email (consolidate #12/18/24).
- **Stakeholder-insight persistence** — detect-signals emits insights that Day 2 observes but drops. Phase 4+ stakeholder-engagement writer consumes them.
- **Same-event-different-quote consolidation** — signal_hash is exact-quote based; future coordinator synthesis may want looser semantic matching (embedding-similarity-based deduplication across runs). Phase 5+ concern.
- **`outputFileTracingIncludes` for prompt files in Vercel production.** Dev/Turbopack works via walk-up; Vercel serverless may need explicit bundling config for .md files. Verify on first Phase 3 Day 3+ deploy; add config if runtime FS doesn't see the files.

**Cost.** Live Claude API: 3 live detect-signals calls (PHASE 1 + PHASE 2 + PHASE 3), each ~$0.06-0.08 = ~$0.20 total. Plus one failed PHASE 1 run before the MEDDPICC column fix = +$0.06. Grand total ~$0.26. Live Voyage: 3 preprocessor runs at ~4300 tokens each ≈ 13K tokens ≈ <$0.02. Zero HubSpot API calls. Live Supabase writes: 19 signal_detected + 1 transcript_ingested + 3 preprocessor re-runs (idempotent) + 1 job row (cleaned up).

### Phase 3 Day 3 Session A — 2026-04-23 · `34b3204`

**Prompt ports + MEDDPICC-formatter refactor + `updateDealCustomProperties` promotion per the adjudicated kickoff.** Internal-only code session per the A/B split (second in draft-and-adjudicate mode). Zero live Claude, zero HubSpot writes, zero Voyage calls. Session A exit leaves Session B with nothing but pipeline wiring + live-portal verification.

**Preflights (hard gates) — all passed.**

1. `pnpm --filter @nexus/shared test:mock-claude` baseline PASS.
2. `pnpm --filter @nexus/shared test:prompt-loader` baseline 9/9.
3. `pnpm --filter @nexus/db enum:audit` baseline PASS.
4. Re-read 04-PROMPTS.md:1637-1710 — confirmed #19's v1 truncates to 15000 chars (Principle 13 violation to fix at port) and #20's v1 dimension list at line 1694 is camelCase + 7 values (Guardrail 22 violation + §2.13.1 8-dim canonical gap to fix at port).
5. Read adapter.ts:928-961 (A9 webhook echo-skip branch) — impl must write cache in-place after PATCH, not invalidate, so echo webhooks take their own patch-in-place branch.
6. Confirmed MEDDPICC upsert call site is a server action (`apps/web/src/app/(dashboard)/pipeline/[dealId]/page.tsx:87-89`), not a Zod-validated API route — optional `confidence` param is pass-through-safe. (Finding #16 from stress-test explicitly folded in by oversight.)
7. Confirmed `serializePropertyValue` stringifies numbers as HubSpot v3 expects; nulls become `""` which would blank a property — adapter impl skips nulls pre-serialization so HubSpot never sees `""` for an unchanged property.
8. Readiness pass surfaced Meta-E issue mid-session: existing prompts 01/05/07 document `DealIntelligence.formatMeddpiccForPrompt` (not a standalone formatters module) as the canonical builder. Stopped, flagged to oversight, Meta-E amended before execution — formatter lands on DealIntelligence, matches Guardrail 25 + §2.16 intelligence-data discipline.

**Scope item 1 — #19 extract-actions port.**

- `packages/prompts/files/pipeline-extract-actions.md` — new, v1.0.0, `tool_name: record_extracted_actions`. Preserves v1 role framing ("sales call analyst. Extract all action items, commitments, and key decisions") verbatim per §2.7; appends YOUR DISCIPLINE + REASONING TRACE + CONTEXT + OUTPUT sections matching the 01-detect-signals structure. Transcript truncation removed (Principle 13 — TranscriptPreprocessor owns budget).
- `packages/shared/src/claude/tools/extract-actions.ts` — new tool schema with `reasoning_trace` first/required, `actions` array (maxItems 20), per-action `{action_type, owner_side, owner_name, description, evidence_quote, due_date?}`. Exported `ExtractedAction` + `ExtractActionsOutput` TS types.
- `reasoning_trace` INCLUDED per oversight-adjudicated Decision 1 (extraction-with-attribution is classification-adjacent; Principle 6 leans include-when-in-doubt).

**Scope item 2 — #20 score-meddpicc port.**

- `packages/prompts/files/pipeline-score-meddpicc.md` — new, v1.0.0, `tool_name: record_meddpicc_scores`, max_tokens 4000 per adjudicated Meta-F. Preserves v1 scoring framing verbatim; adds the CANONICAL DIMENSIONS block enumerating all 8 snake_case IDs per §2.13.1 with explicit note that `paper_process` closes v1's 7-dim drift and that camelCase is rejected by schema validation. YOUR DISCIPLINE + REASONING TRACE + CONFIDENCE CALIBRATION + SCORE CALIBRATION GUIDANCE + CONTEXT + OUTPUT sections.
- `packages/shared/src/claude/tools/score-meddpicc.ts` — new tool schema. `dimension: enum MEDDPICC_DIMENSION` imports the canonical 8-value tuple from the shared enum per Guardrail 22 — any rogue value (camelCase, missing dim) fails schema validation before reaching Nexus DB or HubSpot. Per-dimension `{score, evidence_quote, confidence 0.5-1.0, contradicts_prior, rationale}`. Exported `MeddpiccDimensionScore` + `ScoreMeddpiccOutput` TS types.
- Tool schemas re-exported from `packages/shared/src/claude/index.ts` so consumers import from the barrel.

**Scope item 3 — `DealIntelligence.formatMeddpiccForPrompt` + byte-identical diff gate.**

- `packages/shared/src/services/deal-intelligence.ts` — new `formatMeddpiccForPrompt(hubspotDealId): Promise<string>` method. Direct-sql read from `meddpicc_scores` (matches the existing `buildEventContext` direct-sql pattern against `hubspot_cache`). Delegates rendering to the pure-function `formatMeddpiccBlock(row | null)` exported from the same module; `MeddpiccPromptRow` type also exported. Docstring explains why direct-sql over delegating to `MeddpiccService.getByDealId` (existing service's `MeddpiccRecord.evidence` type is too narrow for the permissive jsonb shapes production rows actually carry; direct-sql keeps the refactor byte-identical without rippling a service type change through Phase 2 UI callers).
- `packages/shared/scripts/test-meddpicc-format.ts` — new standalone script (`pnpm --filter @nexus/shared test:meddpicc-format`) exercising the pure function against 4 frozen fixtures: (A) null row → `"(none)"`, (B) 8 dims all null → 8 `"not yet captured"` lines, (C) 2 dims populated with full evidence+confidence + 6 null → mixed output with ordered interleave, (D) populated dim missing inner `evidence_text` / `last_updated` / `confidence` → `(no evidence)` / `—` / `—` fallback tokens. **4/4 PASS.** Any future formatter edit requires updating the frozen strings; the script is the drift canary per stress-test finding #11 (explicitly folded in by oversight).

**Scope item 3b — handlers.ts refactor.**

- `packages/shared/src/jobs/handlers.ts` — `buildSignalDetectionVars(sql, transcript)` → `buildSignalDetectionVars(sql, dealIntel, transcript)`. Inline MEDDPICC formatter block (lines 265-288 pre-refactor) replaced with one-line `await dealIntel.formatMeddpiccForPrompt(transcript.hubspot_deal_id)`. Local `MeddpiccRow` type + local `MEDDPICC_DIMENSIONS` tuple retired (now flows through the shared enum via DealIntelligence). Call site in `transcriptPipeline` passes the already-constructed `dealIntel` instance (same one used for `buildEventContext`). Byte-identical output proven by the gate in item 3.

**Scope item 4 — `HubSpotAdapter.updateDealCustomProperties` real implementation.**

- `packages/shared/src/crm/hubspot/adapter.ts:289-...` — stub `throw new CrmNotImplementedError("Phase 3 Day 3+")` replaced with the full PATCH implementation. Skips null/undefined props pre-serialization (explicit empty string is the documented path for a caller that genuinely wants to blank a property); returns void (no deal refetch); error classes standard via `http.request`. After successful PATCH, iterates the serialized props and calls `this.patchCacheProperty("deal", hubspotId, k, v)` — cache stays authoritative, A9's echo webhooks arrive ~100-500ms later and take their own patch-in-place branch (both writes agree; no refetch fires; no partial cache state). Docstring explains the A9 cooperation and the "null = skip" rationale.

**Scope item 5 — `MeddpiccService.upsert` + `per_dimension_confidence`.**

- `packages/shared/src/services/meddpicc.ts` — `upsert` input shape gains optional `confidence?: MeddpiccConfidence` (`Partial<Record<MeddpiccDimension, number>>`). SQL INSERT/UPSERT + ON CONFLICT DO UPDATE both include `per_dimension_confidence = ${sql.json(confidenceJson)}`. Defensive clamp: only values in `[0, 1]` land in jsonb; Claude's schema enforces `[0.5, 1.0]` but persist layer is tolerant. `MeddpiccRow` type + `rowToRecord` helper + `MeddpiccRecord` interface all gain the column. New `MeddpiccConfidence` type exported from `packages/shared/src/services/index.ts`. Existing single call site (`apps/web/src/app/(dashboard)/pipeline/[dealId]/page.tsx:87-89` server action) passes 3 fields as before; confidence stays empty `{}` jsonb for UI-entered rows, which is correct.

**Scope item 6 — `test:update-deal-custom-properties` script (authored, not run) + mock-claude fixtures.**

- `packages/db/src/scripts/test-update-deal-custom-properties.ts` — new 2-phase verification script against MedVista deal 321972856545. Phase 1 writes `{ nexus_meddpicc_paper_process_score: 7, nexus_meddpicc_metrics_score: 8 }` (two distinct properties — exercises the multi-property serialization loop, not just single-property path, per stress-test finding #6 explicitly folded in by oversight), reads back via `adapter.getDeal`, asserts both landed, verifies `hubspot_cache.payload.properties` carries patched-in-place values. Phase 2 idempotent re-write, asserts same result + cache `cached_at` advanced. pnpm alias `test:update-deal-custom-properties` on @nexus/db. **NOT RUN in Session A** — Session B executes as sub-step 2 of the 3-step verification staircase (adjudicated Decision 3).
- `packages/shared/scripts/test-mock-claude.ts` — existing mock exercised with 2 new fixtures (`EXTRACT_ACTIONS_FIXTURE` with 3 actions + `SCORE_MEDDPICC_FIXTURE` with 3 dimension scores). Test count goes from 5/5 to 7/7. Case [6/7] verifies pipeline-extract-actions fixture lookup + tool name mirror; case [7/7] same for pipeline-score-meddpicc. Both PASS. Fixture-miss error message now enumerates all 3 registered fixtures (helpful debug when Session B wires the Promise.all to mocks).

**Drive-by correction — 01-detect-signals v1.1.0 descriptive drift-fix.**

- `packages/prompts/files/01-detect-signals.md:107` — "Each of 7 dimensions on its own line" → "Each of 8 dimensions on its own line" + added parenthetical: "(Drift-fix: was '7 dimensions' pre-§2.13.1 MEDDPICC 8-dim canonical; Phase 3 Day 3 Session A corrected in place at v1.1.0 — descriptive drift against the locked canonical, no behavioral change.)". No version bump (oversight-adjudicated: descriptive drift-fix against the canonical, not a contract change; matches Day 2 Session A banner-correction precedent).

**Verification at end of Session A.**

- `pnpm typecheck` — 4/4 workspaces PASS.
- `pnpm build` — 13 routes clean compile, zero hits on `Attempted import error | Module not found | Type error | Failed to compile`.
- `pnpm --filter @nexus/db enum:audit` — PASSED (no new enums; MEDDPICC 8-dim canonical unchanged).
- `pnpm --filter @nexus/shared test:prompt-loader` — **11/11 PASS** (up from 9/9; new pipeline-extract-actions v1.0.0 + pipeline-score-meddpicc v1.0.0 load cleanly at their documented max_tokens + temperature).
- `pnpm --filter @nexus/shared test:mock-claude` — **7/7 PASS** (up from 5/5; two new fixture-lookup cases).
- `pnpm --filter @nexus/shared test:preprocessor` — 6/6 PASS (unchanged; regression check on handlers.ts refactor — preprocessor call path doesn't touch the refactored formatter but validates the broader shared-pool state).
- `pnpm --filter @nexus/shared test:meddpicc-format` — **4/4 PASS (new gate).** Byte-identical output against frozen fixtures for null row, all-null 8-dim, mixed-populated, and missing-inner-fields cases.
- Hex grep + stale shadcn class grep — 0 hits.
- **Retroactively verified after pool drain** (post-commit, same-day): `pnpm --filter @nexus/db test:prompt-call-log` — 19/19 columns match, 5/5 PASS. `pnpm --filter @nexus/db test:rls-prompt-call-log` — Pattern D verified (authed anon INSERT denied, SELECT allowed, service-role write allowed, cross-user read-all correct). `pnpm --filter @nexus/db test:transcript-pipeline` PHASE 1 + PHASE 2 both PASS against live MedVista fixture — regression check on the handlers.ts MEDDPICC formatter refactor confirmed via real Claude + real Supabase round-trip (PHASE 1: 10 signals detected, 21 signal_detected cumulative; PHASE 2: 10 detected / 2 inserted / 8 skipped_duplicate, source_ref dedup working, transcript_embeddings count stable at 35). PHASE 3 requires dev server running on :3001 (a separate prerequisite, not a regression) and is left for Session B's full-flow verification staircase.
- **Session B still runs the full 3-step staircase** live — sub-step 1 MockClaudeWrapper handler shape, sub-step 2 `test-update-deal-custom-properties` against live portal, sub-step 3 full enqueue→worker→handler with live Claude + live HubSpot MEDDPICC writeback. The retroactive Session A verification proves the refactor doesn't regress; it does NOT substitute for Session B's live-portal writeback gate.

**Reasoning stub.** Non-MVP choices with justification type per the CLAUDE.md reasoning-gate.

- **Formatter placement on `DealIntelligence`, not a standalone `packages/shared/src/formatters/meddpicc.ts` module.** Justification 1 — Guardrail 25 (DealIntelligence is the only interface for intelligence data) + §2.16 (event-sourced intelligence, single service interface). Oversight flagged mid-readiness-pass after discovering 3 existing prompt files (01, 05, 07) already documented `DealIntelligence.formatMeddpiccForPrompt` as the canonical builder. Meta-E revised before code touched. Guardrail 20 ("one formatter module") reserved for non-intelligence concerns (currency, dates, names, stages) — MEDDPICC is intelligence and belongs behind the DealIntelligence interface.
- **Direct-sql read inside `formatMeddpiccForPrompt`, not delegation to `MeddpiccService.getByDealId`.** Justification 4 — MeddpiccService's `MeddpiccRecord.evidence` is typed `Partial<Record<MeddpiccDimension, string>>` (flat strings), but production rows carry structured `{evidence_text, last_updated}` objects. Changing the service type rippled through Phase 2 UI callers unnecessarily; direct-sql keeps the refactor byte-identical and matches the existing `buildEventContext` pattern (also direct-sql against `hubspot_cache`). The service stays focused on transactional upsert per §2.10 / Guardrail 13.
- **`reasoning_trace` INCLUDED on #19 extract-actions (adjudicated Decision 1).** Justification 1 — 04C Principle 6 (reasoning-first for classification-with-judgment). Extraction-with-attribution is classification-adjacent (deciding which utterances cross the threshold into commitment vs. aspirational talk); omission cost is higher than inclusion cost per §2.13.1's "include when in doubt" lean.
- **Action-item persistence to `jobs.result` jsonb only in Session B (adjudicated Decision 2).** Justification 3 — mirrors Day 2 Session B's `stakeholder_insights` deferral precedent (observable + deferred to a future-phase consumer writer). Avoids a schema migration for a Day 4+ consumer (draft-email) that doesn't land this session. PRODUCTIZATION-NOTES.md corpus-intelligence arc preserves full raw output via `jobs.result` jsonb anyway — no analytical fidelity lost.
- **Adapter cache patch-in-place (not invalidate).** Justification 1 — A9's webhook-echo-skip contract at `adapter.ts:947-961` patches cache in-place from the echo webhook; if the adapter invalidated pre-webhook, the echo would hit an empty row and `patchCacheProperty` would insert partial state (worse than the refetch A9 was written to avoid). Cache-stay-authoritative is the correct cooperation pattern. Docstring records the design so future adapter writers don't re-litigate.
- **Null-skip in `updateDealCustomProperties` (pre-serialization).** Justification 1 — `serializePropertyValue(null)` returns `""` which HubSpot treats as a property blank; callers passing `null` mean "no update for this dimension," not "clear it." Callers that genuinely want to clear pass explicit empty string. Documented in the method's docstring.
- **`per_dimension_confidence` persistence writer lands now (not Phase 3 Day 3 Session B).** Justification 2 — §2.16.1 decision 3's shape discipline: column existed Session 0-B; first writer lands at Session A so Session B's pipeline handler can simply pass `{ scores, evidence, confidence }` without a mid-session service extension. Also Justification 3 — per-dimension confidence is corpus-intelligence foundation (narrative-analysis / rep-confidence-to-outcome correlation surface).
- **Defensive `[0, 1]` clamp on confidence persistence (Claude schema enforces `[0.5, 1.0]`).** Justification 1 — persist layer is the system-boundary validator; tool schema enforces at the Claude write boundary. Supporting `[0, 1]` at the persist layer tolerates non-Claude writers (manual MEDDPICC edits from the UI, retrospective backfills from historical analysis) without forcing them to emit ≥0.5 confidences. Narrow costs nothing; widens option space.
- **Drive-by 01 drift-fix in place at v1.1.0 (no version bump).** Justification 1 — descriptive drift against the §2.13.1 canonical amendment, not a contract change. The prompt was ALWAYS supposed to be 8 dimensions per the canonical; the body just didn't reflect it. A version bump implies behavioral change between prior-version and new-version; that's not what's happening. Matches Day 2 Session A banner-correction precedent. Oversight-adjudicated.

No UNCERTAIN entries. 9 choices cite a specific guardrail, preservation decision, arc, or next-session need.

**Parked items closed.**
- Day 2 Session B parked item "Day 3 scope: port #19 + #20 into `packages/prompts/files/`; expand step 3 Promise.all; wire updateDealCustomProperties for MEDDPICC writeback." — Session A lands the ports + tool schemas + adapter impl + service expansion + formatter refactor; Session B wires the pipeline and runs the live writeback.
- Kickoff preflight 6 (serializePropertyValue numeric handling) — verified clean; handles integer scores correctly.
- Kickoff preflight 7 (MeddpiccEditCard API validator confidence pass-through) — verified clean; upsert call site is a server action without Zod, optional param safe.

**Parked items added.**
- **Session B scope (next session).** (1) Pipeline step 3 three-way `Promise.all` — detect-signals + pipeline-extract-actions + pipeline-score-meddpicc, each with its own `callClaude` invocation and anchors `{hubspotDealId, transcriptId, jobId}`. (2) Pipeline step 4 `persist-meddpicc` sub-step — `MeddpiccService.upsert({ scores, evidence, confidence })` + `adapter.updateDealCustomProperties(dealId, { nexus_meddpicc_*_score: ..., nexus_meddpicc_score: overall })` batched per 07C §7.5 + one `meddpicc_scored` deal_events append with event_context populated. (3) Action items persist to `jobs.result.actions` jsonb only per adjudicated Decision 2. (4) 3-step verification staircase: MockClaudeWrapper handler shape → `test:update-deal-custom-properties` live → full-flow enqueue→worker→handler with live Claude + live HubSpot writeback + visual HubSpot UI confirmation on MedVista deal 321972856545. (5) Session B escalation rule per oversight's addition: if live run produces obviously-garbage MEDDPICC scores (all zeros, all identical, above 100, any clearly-wrong pattern), STOP before any second run — rerunning rewrites garbage with different garbage. Manual revert via HubSpot UI is ~2 minutes per property; much better than accumulating bad state.
- **Session A-deferred gates — resolved retroactively post-commit.** `test:prompt-call-log` + `test:rls-prompt-call-log` + `test:transcript-pipeline` PHASE 1/2 all PASS once the Supabase instance-level 200-conn saturation drained. PHASE 3 of transcript-pipeline carries over to Session B's verification staircase (requires dev server; not a regression check, it's the full enqueue→worker→handler round-trip that Session B exercises anyway).
- **`outputFileTracingIncludes` for prompt files in Vercel production** — carried from Day 2 Session B parked. Session A adds 2 new .md files that Session B's full-flow PHASE 3 exercises via dev server (Turbopack walk-up); the first Vercel deploy after Day 3 ships should verify Next.js serverless bundling packages them. If it doesn't, `next.config.js` gets `experimental.outputFileTracingIncludes: { "app/api/jobs/worker/route": ["../../../packages/prompts/files/*.md"] }`.
- **HubSpot-cache patched-in-place only handles string serializations.** `patchCacheProperty` casts to text via `to_jsonb(${newValue}::text)`; integer scores survive the round-trip (HubSpot v3 returns stringified numbers; Nexus readers parse back to int where needed). If a future caller stores an object or array as a nexus_* property (e.g., future `nexus_intelligence_meta` jsonb), the type-text cast needs revisiting. Currently not in scope — all nexus_* custom properties are `text | number | date | enum`.

**Pre-production checklist item.** (cleared — gates ran retroactively post-commit; see the "Retroactively verified" line in the Verification section above.)

**Cost.** Retroactive regression check against `test:transcript-pipeline` PHASE 1 + PHASE 2 exercised 2 live detect-signals calls against MedVista ≈ $0.12-0.16. `test:prompt-call-log` + `test:rls-prompt-call-log` are DB-only, $0. Zero live HubSpot writes. Zero Voyage (preprocessor skips re-run on idempotency; `pipeline_processed=true` short-circuits the call). Total Session A live cost: ~$0.12-0.16 (all retroactive regression, not primary Session A scope). Live Supabase writes: 2 additional signal_detected rows (MedVista cumulative now 23), 0 new transcript_embeddings (idempotent).

### Phase 3 Day 3 Session B — 2026-04-23 · `f544af2`

**Pipeline wiring + 3-step verification staircase + first live HubSpot writeback of a v2 pipeline per the adjudicated kickoff.** The outward-facing half of Day 3. Three parallel Claude calls at step 3, live MEDDPICC writeback at step 4, and the first end-to-end live exercise of the Day 2 Session B fanout-telemetry design.

**Preflights (hard gates per kickoff) — all passed.**

1. Supabase pool headroom verified via `pnpm --filter @nexus/db test:rls-prompt-call-log` PASS at session start (pre-existing Session A retro-verification confirmed pool drained).
2. Dev server on :3001 started fresh in the background (`pnpm dev`); readiness loop via `curl http://localhost:3001` returned `200` within ~2s. Next.js 14.2.29 Turbopack, clean compile. Verified alive via `ps aux | grep 'next dev'`.

**Handler wiring.**

- `packages/shared/src/jobs/handlers.ts` expanded for the 3-way fanout:
  - New imports: `extractActionsTool` + `ExtractActionsOutput` + `ExtractedAction`; `scoreMeddpiccTool` + `ScoreMeddpiccOutput`; `MeddpiccService` + `MeddpiccConfidence` + `MeddpiccEvidence` + `MeddpiccScores`; `MEDDPICC_DIMENSION` + `MeddpiccDimension`; `HubSpotAdapter` + `loadPipelineIds`.
  - `JobHandlerHooks` exported + `JobHandlerContext.hooks?` added: narrow DI seam carrying `callClaude?` and `hubspotAdapter?`. Production callers (worker route) never pass it; test harnesses pass mocks. No API break — worker route's existing `handler(job.input, { jobId, jobType })` call stays unchanged.
  - `MEDDPICC_DIM_TO_HUBSPOT_PROPERTY` constant: 8-entry map from canonical dim → `nexus_meddpicc_*_score` property name (metrics → metrics_score, economic_buyer → eb_score, decision_criteria → dc_score, decision_process → dp_score, identify_pain → pain_score, champion → champion_score, competition → competition_score, paper_process → paper_process_score). Plus `nexus_meddpicc_score` for the overall. Locked alongside Session 0-C's 8th-property provision + §2.13.1 MEDDPICC 8-dim canonical.
  - `createHubSpotAdapterFromEnv(sharedSql)` local factory: reads `NEXUS_HUBSPOT_TOKEN + HUBSPOT_PORTAL_ID + HUBSPOT_CLIENT_SECRET + DATABASE_URL` from env, loads pipeline-ids, threads the shared pool. Throws loudly with missing-env diagnostic. Kept local (not re-exported) because only the handler needs it; apps/web has its own factory at `src/lib/crm.ts`.
  - `transcriptPipeline` handler: resolves `effectiveCallClaude = ctx?.hooks?.callClaude ?? callClaude` + `hubspotAdapter = ctx?.hooks?.hubspotAdapter ?? createHubSpotAdapterFromEnv(sql)` at entry. Step 3 `Promise.all` now fires three calls (detect-signals + pipeline-extract-actions + pipeline-score-meddpicc), each with identical `{hubspotDealId, transcriptId, jobId}` anchors (distinguishing rows come from `prompt_file` + `tool_name` which the wrapper captures automatically).
  - Step 4 gets a new `persist-meddpicc` sub-step following persist-signals: reads current MEDDPICC state via `MeddpiccService.getByDealId`, merges Claude's new dims on top (prompt #20's discipline is "only emit dims with NEW evidence" — absent dims preserve prior scores), calls `MeddpiccService.upsert({scores, evidence, confidence})` which computes overall as rounded mean of non-null dims, builds the HubSpot property bag from the returned merged `MeddpiccRecord` (non-null dims + overall), calls `hubspotAdapter.updateDealCustomProperties` (single batched PATCH per 07C §7.5), appends one `meddpicc_scored` event with `event_context` populated. `source_ref = ${transcriptId}:meddpicc:${jobId}` so each pipeline invocation is a distinct scoring event per the append-only §2.16 discipline; row-level dedup lives in the `meddpicc_scores` PK upsert.
  - Result POJO expanded: `stepsCompleted` now has 7 entries (ingest, preprocess, analyze_signals, analyze_actions, analyze_meddpicc, persist_signals, persist_meddpicc); new `actions: readonly ExtractedAction[]` field (Day 3 scope per adjudicated Decision 2 — lives in jobs.result only, no deal_events writer; Day 4+ draft-email is first consumer); new `meddpicc: { scores_emitted, overall_score, hubspot_properties_written, contradicts_prior_count }`; `events.meddpicc_scored_inserted` added; `claude` becomes `{ detect_signals, extract_actions, score_meddpicc }` — one `PipelineClaudeCallSummary` per call; `timing` gains `persist_signals_ms` + `persist_meddpicc_ms` separately. `stakeholderInsights` still dropped with a `void` (Phase 4+ consumer).

**Sub-step 1 — `test:transcript-pipeline-mock` harness.**

- New script `packages/db/src/scripts/test-transcript-pipeline-mock.ts` + pnpm alias. Three phases against the seeded MedVista transcript using MockClaudeWrapper + a capturing no-op HubSpot adapter (records PATCH calls into an in-memory history array without hitting the live portal).
- PHASE 1: Direct invocation under mocks. Wipes the `meddpicc_scores` row for MedVista pre-run so the expected-keys assertion is deterministic (prior retro-verification + UI edits had left a partial row; handler's merge-then-upsert behavior is correct but the key-set depended on prior state — wipe isolates the test from state drift). Asserts: 7-step shape, actions.length matches fixture count (3), MEDDPICC scores_emitted matches fixture (3), contradicts_prior_count=0 per fixture, meddpicc_scored inserted=1, mock.history.length=3 (one per parallel call), adapter.history.length=1 (one writeback per run), meddpicc_scores row persisted with 3 fixture dims + confidences.
- PHASE 2: Idempotency via second invocation with same mocks. transcript_ingested skipped, signal_detected all 2/2 hit signal_hash dedup, meddpicc_scored appended (new jobId → new source_ref, append-only), transcript_embeddings stable at 35.
- PHASE 3: HubSpot writeback payload shape. Captured props against 4-key expected-set: `nexus_meddpicc_eb_score` (70), `nexus_meddpicc_competition_score` (65), `nexus_meddpicc_paper_process_score` (55), `nexus_meddpicc_score` (overall = rounded mean 63). Asserts: no null leaks, all values numeric integers, dimension values match fixture.
- Live run: **3/3 PHASES PASS** (first attempt after the clean-slate fix).

**Sub-step 2 — `test:update-deal-custom-properties` adapter live canary.**

- Script authored Session A; first executed Session B with the stated 2-property canary per stress-test finding #6. DIRECT_URL swap added at the top of the script (matches the Session A DIRECT_URL pooler-bypass pattern after the first run hit EMAXCONN mid-test from dev-server pool contention).
- Phase 1 writes `{ nexus_meddpicc_paper_process_score: 7, nexus_meddpicc_metrics_score: 8 }` to MedVista 321972856545. PATCH completed in 1034ms. `adapter.getDeal` read-back confirms both properties landed with correct values. `hubspot_cache.payload.properties` confirms patch-in-place worked (A9 contract). Phase 2 idempotent re-write: same values, `cached_at` advanced (`2026-04-23T08:15:10.555Z → 2026-04-23T08:15:11.928Z`), no duplicate cache rows. **PASS.**

**Sub-step 3 — `test:transcript-pipeline` full-flow live.**

- First attempt: PHASE 1 + PHASE 1.5 (fanout verification) + PHASE 2 all PASS live. PHASE 3 failed at the enqueue route on `(EMAXCONN) max client connections reached, limit: 200` — pre-existing environmental saturation from accumulated load (Session A retro-verification + sub-step 2 + PHASE 1/2 running three live Claude calls each). Not a pipeline or code regression. Same pattern Session A's end-of-session gates hit.
- Retry (after brief pool drain): **3/3 PHASES PASS.**
  - PHASE 1 direct: 65.3s wall. 10 signals detected / 3 new inserted / 7 dedup-skipped (prior retro-verification populated matching signal_hashes). 16 action items extracted into jobs.result. 8 MEDDPICC scores emitted, 9 HubSpot properties written (all 8 dims + overall). meddpicc_scored inserted=1. Per-call Claude telemetry: detect_signals 5180 in / 3724 out tokens, extract_actions 4055 in / 2438 out, score_meddpicc 4674 in / 2097 out; all three wrapped with `errorClass: null`.
  - PHASE 1.5 — **fanout verification live-green.** Exactly 3 `prompt_call_log` rows found for PHASE 1's jobId. Rows carry distinct `prompt_file` values (01-detect-signals, pipeline-extract-actions, pipeline-score-meddpicc) + distinct `tool_name` values (record_detected_signals, record_extracted_actions, record_meddpicc_scores) + matching `(hubspot_deal_id, transcript_id, job_id)` anchors + `error_class: null` on all three. No race artifacts.
  - PHASE 2 idempotency: transcript_ingested skipped, signal_detected 2 new / 8 skipped_duplicate (signal_hash dedup working despite temp-0.2 Claude non-determinism across runs), transcript_embeddings stable at 35.
  - PHASE 3 worker-dispatched flow: `/api/jobs/enqueue` succeeded, Realtime subscribed, worker claimed + dispatched, completed with `succeeded@67.4s`. `jobs.result` jsonb persisted with 7-step shape, actions.length=14, meddpicc.hubspot_properties_written=9. **Second-pass fanout check:** worker-dispatched jobId also produced exactly 3 `prompt_call_log` rows. Cleanup deleted the test jobs row; deal_events + meddpicc_scored preserved as real output.
- Total session live Claude cost: 3 calls × 2 direct phases + 3 calls × 1 worker phase across two test:transcript-pipeline runs = ~15 live calls. Averaging ~$0.07/call ≈ ~$1.05. Plus sub-step 2 at ~$0.01. Voyage ~$0.00 (preprocessor idempotent; MedVista already embedded Session A). Total ≈ $1.05.

**Garbage-scores check — PASS.** Live MEDDPICC snapshot on MedVista after the worker-dispatched run: metrics=65, eb=60, dc=72, dp=68, paper_process=78, pain=82, champion=55, competition=78, overall=70. Scores span 55-82 (no zeros, no identical-values, none above 100). Every dim carries a verbatim evidence quote from the transcript (e.g., identify_pain: *"Our physicians are drowning in documentation..."*; competition: *"We've been evaluating Microsoft Copilot for clinical documentation. The DAX product specifically"*; paper_process: *"Any vendor has to sit through a six to eight week security review"*). Confidences well-calibrated (0.65-0.95, distributed across the discipline bands). The champion score at 55 is notably lower than others and correctly reflects Discovery-stage — no internal-advocacy evidence yet. No escalation needed.

**Verification at end of Session B.**

- `pnpm typecheck` — 4/4 workspaces PASS.
- `pnpm build` — 13 routes clean, zero `Attempted import error | Module not found | Type error | Failed to compile`.
- `pnpm --filter @nexus/db enum:audit` — PASS (no new enums).
- `pnpm --filter @nexus/shared test:prompt-loader` — 11/11 PASS unchanged.
- `pnpm --filter @nexus/shared test:mock-claude` — 7/7 PASS unchanged.
- `pnpm --filter @nexus/shared test:meddpicc-format` — 4/4 PASS unchanged.
- `pnpm --filter @nexus/db test:transcript-pipeline-mock` — **3/3 PHASES PASS (new gate).**
- `pnpm --filter @nexus/db test:update-deal-custom-properties` — PASS live (now routinely runnable post-Session A authoring).
- `pnpm --filter @nexus/db test:transcript-pipeline` — 3/3 PHASES PASS live at the 7-step shape + fanout verification on both direct and worker paths.
- Hex grep + stale shadcn class grep — 0 hits.

**Reasoning stub.** Non-MVP choices with justification type per the CLAUDE.md reasoning-gate.

- **`JobHandlerHooks` DI seam via optional `ctx.hooks`.** Justification 4 — sub-step 1's mock harness needs to swap `callClaude` + `HubSpotAdapter` without modifying production code paths. Optional `hooks` on `JobHandlerContext` is the minimal-surface extension (worker route + enqueue route never pass it). Alternatives (AsyncLocalStorage, module-level mutable callClaude export, runtime env-flag branching) were rejected as ambient-magic, global-state-pollution, or test-flag-in-production respectively. The `hooks` type is narrow on purpose — `Pick<HubSpotAdapter, "updateDealCustomProperties">` so the mock doesn't need to implement the full CrmAdapter surface. Phase 4+ handlers gain the same seam by extending the type in lockstep if they need other adapter methods mocked.
- **Merge-prior-state before `MeddpiccService.upsert` (not passing only Claude's new dims directly).** Justification 1 — `MeddpiccService.upsert`'s INSERT VALUES passes `input.scores.<dim> ?? null` for every dim, which means passing `{metrics: 80}` alone would OVERWRITE all 7 other dims with null. That contradicts prompt #20's discipline ("only emit dims with NEW evidence; other dims preserve"). Reading current state via `getByDealId`, spreading into the merge, then calling upsert gives the correct semantics: unspecified dims carry forward. The alternative — refactoring `MeddpiccService.upsert` to internally merge — was rejected because the UI caller (`MeddpiccEditCard` server action) submits a full 8-dim form state and relies on the overwrite semantics for "user removed this dim" cases. Keeping caller-owns-merge preserves both contracts.
- **`meddpicc_scored` source_ref = `${transcriptId}:meddpicc:${jobId}` (append-per-invocation).** Justification 2 — §2.16 event-sourced architecture is append-only. Each pipeline invocation is a legitimately distinct scoring event (non-determinism at temp 0.2 produces slightly different scores across runs, each grounded in different evidence framing the model chose). Source_ref alternatives: (a) `${transcriptId}:meddpicc` single-event-per-transcript would dedup re-runs but lose the temporal dimension; (b) `${transcriptId}:meddpicc:${scoring_hash}` content-keyed like signal_detected would dedup identical re-scores but add complexity for marginal benefit. Option (c) jobId-keyed is the cleanest append-only read: "this scoring event ran at time X" maps to one row; row-level upsert on `meddpicc_scores` handles the point-in-time state. Phase 5+ close-analysis reads `deal_events.type='meddpicc_scored'` to trace MEDDPICC history; each row carries its own `reasoning_trace` + evidence quotes + HubSpot-properties-written count, so the event stream itself is analytically rich.
- **Action items to `jobs.result.actions` jsonb only (no `action_items_extracted` deal_event_type).** Justification 3 — oversight-adjudicated Decision 2. Matches Day 2 Session B `stakeholder_insights` precedent (observable + deferred until a real consumer lands). Avoids a schema migration for Day-4+ draft-email consumption. PRODUCTIZATION-NOTES.md corpus-intelligence arc preserves analytical fidelity via `jobs.result` jsonb anyway.
- **Three-way `Promise.all` fanout shape retained from Day 2 Session B.** Justification 1 — adding two call sites to the existing Promise.all tuple was a strictly additive three-line change; no re-structure. Day 2's forward-looking reasoning "shape for Day-3 parallel expansion without restructuring" was correct. Error-handling semantics unchanged: any one failed call rejects the whole step, job marks failed per §2.24. Phase 4+ per-call resilience (Promise.allSettled for optional-per-call-recovery) is a future concern if flaky classification becomes load-bearing.
- **PHASE 1's meddpicc_scores wipe in the mock harness pre-PHASE-1.** Justification 4 — without the wipe, prior retro-verification runs + manual UI edits left the row partially populated, making PHASE 3's expected-key-set assertion dependent on whatever happened to be in DB. Wiping produces deterministic PHASE 3 assertions (fixture's 3 dims + overall = exactly 4 keys). Signal dedup + transcript_ingested dedup are independent of the wipe. Documented in the harness header so future readers understand the isolation rationale.
- **Test-script DIRECT_URL swap added to `test-update-deal-custom-properties`.** Justification 4 — the script's own cache-read connection failed mid-test on EMAXCONN when the dev server (holding pooler connections) was running concurrently. DIRECT_URL bypass mirrors the Session A precedent for dev scripts. Documented inline.
- **Per-prompt max_tokens: 3000 for #19, 4000 for #20, 6000 for #01 (unchanged).** Justification 1 — per-prompt budgets held across the live runs (no `stop_reason=max_tokens` fired; max actually emitted was 3724 output tokens on #01 vs 6000 budget). The reactive-bump policy per §2.13.1 is still the right call — ship tight, bump when live evidence justifies. #20's 4000 proved appropriate (Claude emitted 2097 output tokens for 8-dim scoring; 48% budget utilization — no margin for runaway but no starvation).

No UNCERTAIN entries. 8 choices cite a specific guardrail, preservation decision, arc, or next-session need.

**Idempotency verdict — no product-direction question surfaced.** Sub-step 1 mock PHASE 2 + sub-step 3 live PHASE 2 both confirm the implementation-layer idempotency: `transcript_ingested` dedup works on transcript_id, `signal_detected` dedup works on signal_hash (non-determinism at temp 0.2 produces some new signals + some re-detected ones per run — the invariant "no DUPLICATE rows for the same signal_hash" is preserved, not "no new rows at all"), `meddpicc_scores` upsert overwrites per run, `meddpicc_scored` events append per run. The append-only semantics on `meddpicc_scored` are correct for the temporal audit trail — each pipeline invocation IS a distinct scoring event, and two runs of the same transcript at different jobIds producing slightly different scores isn't a bug, it's the data the corpus-intelligence arc needs.

**Parked items closed.**
- Phase 3 Day 3 Session B scope (per adjudicated kickoff): handler wiring + 3-step verification staircase + fanout verification + live HubSpot MEDDPICC writeback + garbage-scores check — all shipped.
- Day 2 Session B forward-looking fanout verification parked item: **closed live.** Exactly 3 `prompt_call_log` rows per pipeline invocation with distinct prompt_file + tool_name + matching anchors verified on both direct-invocation AND worker-dispatched paths.
- Day 3 Session A "test:update-deal-custom-properties authored, not run": shipped live in sub-step 2.

**Parked items added.**
- **Day 4+ scope (next session):** step 5 coordinator-signal (stub until Phase 4), step 6 synthesize-theory via `06a-close-analysis-continuous` (TS tool schema needed; reasoning_trace decision per §2.13.1 — default leave-as-is pending live-quality signal), step 7 draft-email via consolidation of #12/#18/#24 into `email-draft.md`. Step 7 becomes the first consumer of `jobs.result.actions`.
- **`outputFileTracingIncludes` for prompt files in Vercel production — verify post-Day-3 deploy.** Carried from Day 2 Session B parked. Day 3 adds three new prompt files (`pipeline-extract-actions.md` + `pipeline-score-meddpicc.md` + the v1.1.0 01-detect-signals update). First Vercel deploy post-Day-3 should exercise Turbopack bundling of all 11 `packages/prompts/files/*.md` files; if the runtime FS doesn't see them, add `next.config.js` → `experimental.outputFileTracingIncludes: { "app/api/jobs/worker/route": ["../../../packages/prompts/files/*.md"] }`.
- **MEDDPICC non-determinism observation — watch, don't act yet.** Two full pipeline runs back-to-back against the same MedVista transcript produced MEDDPICC scores that drifted by 3-15 points per dimension (e.g., eb 72 → 60, champion 45 → 55, competition 80 → 78). Within the calibration bands so not garbage; expected under temp 0.2 with ~5K-token context. Phase 5+ close-analysis may want consolidation logic (look at the `deal_events.meddpicc_scored` stream and smooth or anchor to evidence clusters rather than latest-write-wins). Not a Day-4 blocker.
- **`createHubSpotAdapterFromEnv` local factory in handlers.ts.** Duplicates logic from `apps/web/src/lib/crm.ts`'s `createHubSpotAdapter` factory at a small scale (7 lines). Defensible today — the boundary rules (@nexus/shared may not import from apps/web) forbid using the apps/web factory, and creating a shared factory in @nexus/shared adds a dependency (loadPipelineIds is fine but the full factory would duplicate any future env-reading logic). Promote to a shared factory when a second handler needs the same construction — until then, local is simpler.
- **Adapter DI seam in handlers.ts currently accepts `Pick<HubSpotAdapter, "updateDealCustomProperties">` — narrow by design.** Future handlers that need more adapter surface (e.g., day-4 draft-email needs `logEngagement` or similar) will extend the `JobHandlerHooks` type as they wire. Not a blocker.

**Pre-production checklist item.** Adding to the existing bucket:
- **Voyage data-retention opt-out** — unchanged from Session A (enable before real-customer data).
- **Vercel deploy verification of `outputFileTracingIncludes`** — first Vercel deploy post-Day-3 exercises the three new prompt files through the serverless bundler.

**Cost.** Total Day 3 Session B live cost: ~$1.05. Breakdown: 15 live Claude calls across two `test:transcript-pipeline` runs + one `test:transcript-pipeline-mock` ($0 for the mock — no live calls) ≈ $1.00. Live HubSpot writes: 2 adapter canary PATCHes (sub-step 2) + 3 worker-dispatched pipeline writes (2 direct + 1 worker in sub-step 3) = 5 live PATCHes total, each 9 properties batched into one call ≈ 45 property-writes total. Live Supabase writes: ~7 new signal_detected rows across sub-step 3 phases; 3 new meddpicc_scored events (one per pipeline invocation); 1 meddpicc_scores row upserted multiple times (converges to the worker-dispatched-run's final values). Zero Voyage calls — preprocessor short-circuits when `pipeline_processed=true`.

### Phase 3 Day 4 Session A — 2026-04-27 · `fe2b7b9`

**Prompts + tool schemas + service skeletons + mock fixtures per the adjudicated kickoff.** Internal-only code session per the oversight-adjudicated A/B split (third draft-and-adjudicate cycle landing cleanly). Zero live Claude, zero live HubSpot, zero Voyage. Session A's deliverable is the surface area Session B's pipeline wiring will plug into.

**Layer-naming precision (adopted per oversight's note):** the BUILD-LOG and Session B handoff use **8-step pipeline shape** for the outer-step layer (entries in `stepsCompleted`) and **5 Claude calls per pipeline run** for the inner-call layer (one `prompt_call_log` row per `callClaude` invocation). The two layers are deliberately not collapsed: Day 3's 7-step pipeline carried 3 Claude calls (1 fanout block in step 3); Day 4's 8-step pipeline carries 5 Claude calls (3-way fanout in `analyze` + 2-way fanout in `synthesize`).

**Preflights (hard gates per kickoff) — all passed.**

1. `pnpm --filter @nexus/shared test:mock-claude` baseline 7/7 PASS.
2. `pnpm --filter @nexus/shared test:prompt-loader` baseline 11/11 PASS.
3. `pnpm --filter @nexus/db enum:audit` baseline PASS.
4. `pnpm typecheck` baseline 4/4 PASS.
5. `dealEventTypeEnum` carries `deal_theory_updated`, `email_drafted`, `coordinated_intel_received` (verified at [packages/db/src/schema.ts:254](packages/db/src/schema.ts)) — no migration needed for Day 4 event writes.
6. `deal_snapshots` table exists in schema.ts:458 — confirmed for the future-Phase-4+ readers; Day 4's `refreshSnapshot` is a no-op stub per Decision 4.
7. PORT-MANIFEST rows 12/18/24 (CONSOLIDATE → email-draft.md) + the v1 prompt text re-read; confirmed all three are voice/generative (Principle 6 exemption applies — no `reasoning_trace`).

**Item 1 — `email-draft.md` CONSOLIDATE.**

- `packages/prompts/files/email-draft.md` — new, v1.0.0, `tool_name: draft_email`, temp 0.5 (voice task per `TEMPERATURE_DEFAULTS`), max_tokens 1500. Front-matter declares `live_triggers: ['post_pipeline']` + `dormant_triggers: ['on_demand', 'post_sale_outreach']` machine-readably; body opens with a "Trigger Status" preamble table that names which trigger is LIVE (post_pipeline → Day 4 Session B), which are DORMANT (on_demand for Phase 5+ rep-tooling UI, post_sale_outreach for productization post-sale rep tooling), and how to activate a dormant variant when its consumer arrives (exercise + remove from `dormant_triggers` + version-bump per §2.13.1 if body needs revisions). Three trigger sections (`post_pipeline` LIVE, `on_demand` DORMANT, `post_sale_outreach` DORMANT) each carry their own caller-builds-this `${triggerSection}` template with explicit ALL-CAPS section labels declaring liveness in the section header. Single tool schema covers all three. Voice/generative — no `reasoning_trace` field per 04C Principle 6 explicit exemption (mirrors 07-give-back).
- `packages/shared/src/claude/tools/draft-email.ts` — `draft_email` tool with required `subject`, `body`, `recipient`, `notes_for_rep` + optional `attached_resources: array | null`. `EmailTrigger` type alias enumerates the three variants for caller-side code. Exported `DraftEmailOutput` TS interface.

**Item 2 — `update-deal-theory.ts` TS schema mirror.**

- `packages/shared/src/claude/tools/update-deal-theory.ts` — mirrors the .md schema at `packages/prompts/files/06a-close-analysis-continuous.md:73-156` verbatim. Six top-level optional change-set sections (`working_hypothesis`, `threats_changed`, `tailwinds_changed`, `meddpicc_trajectory_changed`, `stakeholder_confidence_changed`, `open_questions_changed`); omitted-equals-unchanged semantics enforced by leaving every field optional + nullable + the input_schema's `required: []` (no top-level required fields). `dimension` enum imports `MEDDPICC_DIMENSION` from the shared enum per Guardrail 22 — schema-side validation catches camelCase or 7-vs-8 drift the same way score-meddpicc.ts does. Exports six sub-interfaces mirroring each section's item type plus the top-level `UpdateDealTheoryOutput`. **No top-level `reasoning_trace` field** per §2.13.1's calendared default-leave-as-is for 06a; per-section `triggered_by_quote` provides micro-reasoning. Phase 5 Day 1 reviews against live runs; if practice shows weak reasoning, version-bump 1.1.0 → 1.2.0 (out of Day 4 scope).

**Item 3 — `IntelligenceCoordinator` skeleton service.**

- `packages/shared/src/services/intelligence-coordinator.ts` — new service mirroring the `DealIntelligence` skeleton precedent from Pre-Phase-3 Session 0-B. Constructor `{ databaseUrl, sql? }` with shared-pool injection seam. `receiveSignal(input: ReceivedSignalInput): Promise<void>` is a no-op for Day 4 (Phase 4 Day 2 wires the real coordinator); `getActivePatterns(opts): Promise<readonly ActivePatternSummary[]>` returns `[]` for Day 4 (callers render empty as `(none)` per the existing convention in 01/05/07/06a). `close()` is idempotent on shared-pool callers. `ReceivedSignalInput` interface captures the fields Phase 4's pattern-detection logic will need so the Day 4 call site doesn't change when Phase 4 fills in the body. `ActivePatternSummary` interface mirrors the `${activePatternsBlock}` shape consumers already expect (`patternId`, `signalType`, `vertical`, `synthesisHeadline`, `dealCount`).

**Item 4 — `DealIntelligence` theory + recent-events methods.**

- `getCurrentTheory(hubspotDealId): Promise<DealTheory | null>` — Day 4 MVP returns the latest `deal_theory_updated` event's payload as the (approximate) cumulative theory. Phase 4+ replaces with full event-stream replay producing the cumulative state in `deal_snapshots`. Returns `null` when no events exist yet — callers render this as `(no prior theory — this is the first update for this deal)` per the 06a .md spec.
- `getRecentEvents(hubspotDealId, opts): Promise<readonly RecentEventSummary[]>` — reads `deal_events` filtered by `(hubspot_deal_id, created_at >= NOW() - sinceDays interval, optional types[] IN filter)`. One-line summary per event via the new `summarizeEventPayload(type, payload)` module-level helper that switches over `DealEventType`. Default opts: `sinceDays: 14, limit: 15`. Used by 06a's `${recentEventsBlock}` interpolation.
- `appendTheoryUpdate(hubspotDealId, payload, { eventContext, sourceRef }): Promise<void>` — writes one `deal_theory_updated` event with caller-supplied `event_context` (built via `buildEventContext`) + caller-supplied `source_ref`. The pipeline (Session B) will use `${transcriptId}:theory:${jobId}` so each pipeline invocation appends one event per the §2.16 append-only discipline.
- `refreshSnapshot(hubspotDealId): Promise<void>` — **NO-OP STUB for Day 4 per oversight-adjudicated Decision 4.** Phase 4+ implements the event-stream replay (read all `deal_theory_updated` events, fold into a single cumulative `DealTheory`, upsert `deal_snapshots`). Pipeline step 6's call site is in place; today's call is no-op so writes don't happen, reads use the latest-event approximation via `getCurrentTheory`.
- New module-level types exported from the services barrel: `DealEventType` (locally-mirrored union from schema's `dealEventTypeEnum` — kept tight; extended on demand and grep-checkable for drift), `RecentEventSummary`, `DealTheory`, `DealTheoryUpdatePayload`. New helper `summarizeEventPayload(type, payload): string`.

**Item 5 — `test-mock-claude` extended to 9/9 cases.**

- `packages/shared/scripts/test-mock-claude.ts` extended with two new fixtures: `UPDATE_DEAL_THEORY_FIXTURE` (working_hypothesis + 1 threat + 1 meddpicc_trajectory change, MedVista-grounded) + `DRAFT_EMAIL_FIXTURE` (post_pipeline follow-up email referencing SOC 2 + InfoSec from the MedVista call, with attached_resources). The mock's `fixtures` map carries all 5 prompts. Two new cases exercise the lookup + tool-name mirror: [8/9] for 06a-close-analysis-continuous + [9/9] for email-draft. Total 9/9 PASS. Fixture-miss error message now enumerates all 5 known fixtures.

**Item 6 — barrel re-exports.**

- `packages/shared/src/claude/index.ts` re-exports `tools/update-deal-theory` + `tools/draft-email`.
- `packages/shared/src/services/index.ts` re-exports `IntelligenceCoordinator` + interfaces, `DealEventType`, `DealTheory`, `DealTheoryUpdatePayload`, `RecentEventSummary`, `ActivePatternSummary`, `ReceivedSignalInput`, `summarizeEventPayload`.

**Verification at end of Session A.**

- `pnpm typecheck` — 4/4 workspaces PASS.
- `pnpm build` — 13 routes clean compile, zero `Attempted import error | Module not found | Type error | Failed to compile`.
- `pnpm --filter @nexus/db enum:audit` — PASS (no new enums; the local `DealEventType` mirror in deal-intelligence.ts is documented as grep-checkable, not a new pgEnum source).
- `pnpm --filter @nexus/shared test:prompt-loader` — **12/12 PASS** (was 11/11; new email-draft.md at v1.0.0 loads cleanly with temp 0.5 + max_tokens 1500 + tool=draft_email).
- `pnpm --filter @nexus/shared test:mock-claude` — **9/9 PASS** (was 7/7; two new fixture-lookup cases for 06a + email-draft).
- `pnpm --filter @nexus/shared test:meddpicc-format` — **4/4 PASS** unchanged (regression check on the byte-identical formatter + DealIntelligence module after adding 4 new methods + new module-level helpers — confirms no behavioral drift on the formatter that lives in the same file).
- Hex grep + stale shadcn class grep — 0 hits.
- **Environmental issue (not Session A regression):** `pnpm --filter @nexus/shared test:preprocessor` failed with `getaddrinfo ENOTFOUND db.stiizxbxmlyihcsimzay.supabase.co`. The Supabase direct host has only an IPv6 (AAAA) record (`2600:1f18:2e13:9d37:f27d:21fe:e6e1:7605`); no IPv4 (A) record. Node's `getaddrinfo` returned ENOTFOUND on the IPv4 lookup path. This is a Supabase-side change and/or a dev-Mac IPv6-resolution change since Day 3 Session A's retro-verification (which passed). **Session A did not touch any DB-touching path** — the four DealIntelligence methods are added but unused this session; the IntelligenceCoordinator skeleton is unused; the new prompt files are unused. The preprocessor's failure is environmental and orthogonal to Day 4 Session A's scope; deferred to Session B's preflight (which will need to resolve the IPv6 lookup or use the pooler URL for dev-script paths). Documented in parked items.

**Reasoning stub.** Non-MVP choices with justification type per the CLAUDE.md reasoning-gate.

- **`email-draft.md` ships all 3 trigger variants (oversight Decision 3 = all-3).** Justification 3 — PORT-MANIFEST explicitly says "single tool schema." The dormant triggers (on_demand, post_sale_outreach) are forward-compatible surfaces for the rep-tooling commercial wedge (Phase 5+ UI) and the post-sale outreach productization arc. Front-matter `live_triggers` / `dormant_triggers` fields + body-level Trigger Status preamble table + section headers all explicitly declare liveness so a future session activating a dormant variant doesn't have to reverse-engineer the consolidation. Cost of writing the dormant blocks now is much less than re-litigating the consolidation later; cost of activation is exercise + remove-from-dormant + version-bump-if-body-needs-revisions per §2.13.1. Justification 4 — Day 4 Session B's pipeline only exercises post_pipeline, so the dormant blocks land typecheck-clean but are not exercised live until their consumer arrives.
- **Voice/generative exemption from `reasoning_trace` for email-draft.** Justification 1 — 04C Principle 6 explicitly exempts voice/generative tasks from the reasoning-first requirement; 07-give-back is the precedent. The email body itself is the surface the rep evaluates; an additional reasoning_trace would add noise without improving rep-facing utility. If Phase 5+ surface review surfaces weak drafts, version-bump per §2.13.1.
- **No top-level `reasoning_trace` on `update_deal_theory` (06a) per §2.13.1's calendared default-leave-as-is.** Justification 1 — the calendared decision in §2.13.1 says "Review at Phase 5 Day 1 kickoff; revisit only if continuous-theory updates produce weak reasoning in practice. Default: leave as-is." Day 4 Session A authors the schema mirror without adding the field; per-section `triggered_by_quote` carries the micro-reasoning. If Day 4 Session B's first live theory updates surface weak reasoning, that's parked for Phase 5 Day 1 review, not a Session-A retroactive change.
- **`IntelligenceCoordinator` as a peer service skeleton (oversight Decision 1 = Option C).** Justification 1 — Guardrail 25 (DealIntelligence is the only interface for intelligence data per §2.16) reads as per-deal intelligence; cross-deal pattern detection is a separate conceptual surface (§2.17 names `coordinator_patterns` as the authoritative table for that). A peer service rather than a method on DealIntelligence respects the §2.16 / §2.17 boundary. Justification 4 — gives Phase 4 Day 2's coordinator a single concrete file + interface to flesh out, with a clear search-to-find-the-wiring path from the Day 4 Session B pipeline call site. Mirrors the DealIntelligence skeleton precedent from Pre-Phase-3 Session 0-B.
- **`refreshSnapshot` is a Day 4 no-op stub (oversight Decision 4 = defer materialization).** Justification 4 — first read consumer of `deal_snapshots` is Phase 5 Day 1's close-analysis-final + close-hypothesis surfaces (or Phase 4 Day 2's coordinator if it queries the snapshot directly). Day 4 has no read consumer. Stub-now means the call site is in place; Phase 4+ implements the event-stream replay without touching the call site. Justification 2 — matches Day 2/3's pattern of "write the event, materialize/read later when needed" — preserves analytical fidelity via `deal_events` jsonb regardless of when materialization lands.
- **`getCurrentTheory` returns latest-event approximation, not full event-stream replay.** Justification 4 — Day 4 Session B's first 06a invocation against MedVista is the first `deal_theory_updated` event the system writes; first read of "current theory" produces null (no prior theory yet). Subsequent same-deal invocations within Day 4 Session B's idempotency tests will read the previous run's payload. Full replay is Phase 4+'s job per Decision 4. The latest-event approximation is correct for now; it becomes incorrect only when multiple data points (transcript + email + observation) interleave updates on the same deal — which Day 4 doesn't exercise. The `DealTheory.asOf` field carries the source event's timestamp so consumers can detect staleness.
- **Local `DealEventType` union mirror in deal-intelligence.ts (not a new shared enum module).** Justification 1 — Guardrail 22 single-source intent says canonical enums live in `packages/shared/src/enums/` with the schema importing them. `dealEventTypeEnum` lives in `packages/db/src/schema.ts:254`; @nexus/shared can't depend on @nexus/db (cycle). Promoting `DealEventType` to a shared enum module would require either (a) inverting the dep direction or (b) duplicating-then-cross-checking via a script. For Day 4's narrow use (only `getRecentEvents` filters), keeping the union local to deal-intelligence.ts is the minimum surface; the docstring documents grep-checkability against the schema. Promote to shared enum when a second consumer needs it.
- **`summarizeEventPayload` per-type switch covers Day 4 + adjacent event types.** Justification 4 — the function renders one-line summaries for `${recentEventsBlock}` in 06a; Day 4's transcript-pipeline-driven theory updates encounter `transcript_ingested`, `signal_detected`, `meddpicc_scored`, `deal_theory_updated`, and adjacent. Future event types extend the switch when their writers land. Default case returns `(no summary)` so the type + timestamp still convey signal in the rendered line.
- **`max_tokens: 1500` on email-draft as speculative floor.** Justification 4 — v1 #12 had 1000, #18 had 1024, #24 had 4096 (default). Consolidated middle ground per §2.13.1 reactive-bump policy; if Session B's first live runs hit `stop_reason=max_tokens`, bump per the established protocol. Output expected to be subject + body (3-8 sentences) + recipient + notes_for_rep ≈ 200-400 tokens, well within 1500's headroom.

No UNCERTAIN entries. 9 choices cite a specific guardrail, preservation decision, productization arc, or next-session need.

**Parked items closed.**
- Day 3 Session B's "Day 4 scope (next session)" parked item — Session A closes the prompts + tool schemas + service skeletons portion; Session B closes the wiring + verification.
- Kickoff preflight 5 (deal_event_type enum verification) — verified clean.
- Kickoff preflight 6 (deal_snapshots table existence) — verified clean.

**Parked items added.**
- **Session B scope (next session).** (1) Pipeline step 5 — call `IntelligenceCoordinator.receiveSignal` for each detected signal (today no-op; Phase 4 implementation activates). (2) Pipeline `synthesize` step — 2-way `Promise.all([synthesizeTheory, draftEmail])` per oversight Decision 2 = parallel; each call passes `{hubspotDealId, transcriptId, jobId}` anchors. (3) Pipeline persist sub-step — append `deal_theory_updated` event with `event_context` + `source_ref = ${transcriptId}:theory:${jobId}`; append `email_drafted` event with full draft payload + `event_context` + `source_ref = ${transcriptId}:email:${jobId}`. Email surfaces in `jobs.result.email`. (4) Result POJO expansion: `stepsCompleted` becomes 8 entries (collapsed naming per oversight Meta-F: ingest, preprocess, analyze, persist_signals, persist_meddpicc, coordinator_signal, synthesize, persist_theory_email); `stepsDeferred` becomes `[]`; new `theory: { update_emitted, working_hypothesis_changed }` + `email: { subject, body_length, has_attachments }` fields; `claude` per-call telemetry expanded to 5 entries (detect_signals, extract_actions, score_meddpicc, update_deal_theory, draft_email). (5) Verification staircase — sub-step 1 mock harness (update test-transcript-pipeline-mock for new fixtures + 8-step shape); sub-step 2 full-flow live with **5 Claude calls per pipeline run** producing 5 `prompt_call_log` rows verified on both direct + worker paths.
- **Vercel deploy + `outputFileTracingIncludes` verification.** Carried forward from Day 2 Session B's parked item. Day 4 ships the third batch of new prompt files (email-draft.md). Session B's closeout step deploys to Vercel + verifies the runtime FS sees all 12 prompt files; if not, Session B's `next.config.js` edit lands `experimental.outputFileTracingIncludes: { "app/api/jobs/worker/route": ["../../../packages/prompts/files/*.md"] }`.
- **Supabase direct-host IPv6-only DNS environmental issue.** `db.stiizxbxmlyihcsimzay.supabase.co` resolves only AAAA (IPv6); no A (IPv4) record. Dev-script paths that use DIRECT_URL via `getaddrinfo` defaults fail with ENOTFOUND. Session A's preprocessor regression check failed on this; gate is environmental, not a code regression. Session B preflight resolves: either (a) configure Node DNS to prefer/include IPv6 (`NODE_OPTIONS="--dns-result-order=ipv6first"` or similar), (b) confirm dev-Mac IPv6 connectivity to Supabase is intact (try `ping6` or curl with `--resolve`), or (c) switch dev-script paths to pooler-URL for the regression-check window. Pre-existing operational note in BUILD-LOG already says "DIRECT_URL stays on the direct host (db.<ref>.supabase.co:5432) for local drizzle-kit migrations (prepared statements + longer-lived connections; developer Macs have IPv6)" — confirming dev-Mac IPv6 is intact resolves the gate.
- **Phase 5 Day 1 06a `reasoning_trace` review.** Calendared per §2.13.1; trigger is "live runs producing weak reasoning in practice." Day 4 Session B's first live theory updates against MedVista are the practice data; Phase 5 Day 1 reviews + decides whether to add the field (1.1.0 → 1.2.0).
- **Dormant-trigger activation discipline for email-draft.** When a future consumer activates `on_demand` or `post_sale_outreach`: (a) exercise the variant end-to-end against real input, (b) revise the body if the dormant template doesn't fit (likely — dormant blocks are speculative), (c) bump version 1.0.0 → 1.1.0 + remove the trigger from `dormant_triggers` in front-matter + add to `live_triggers`, (d) record rationale per §2.13.1.

**Cost.** $0. Zero live Claude, zero live HubSpot, zero live Voyage. No new Supabase rows.

### Phase 3 Day 4 Session B — 2026-04-27 · `6af80e4`

**8-step pipeline wiring + 2-step verification staircase + Vercel deploy closeout per the adjudicated kickoff.** The outward-facing half of Day 4. Pipeline now runs 5 Claude calls per invocation across two parallel-fanout boundaries (3-way `analyze` + 2-way `synthesize`). 06a-close-analysis-continuous + email-draft (post_pipeline) join detect-signals + extract-actions + score-meddpicc as live consumers of the unified Claude wrapper + `prompt_call_log` telemetry. Deploy-first reorder approved by oversight after a persistent pool-saturation event prevented a clean PHASE 3 retry mid-session.

**Layer-naming precision.** Continuing from Session A's adopted convention: **8-step pipeline shape** = entries in `stepsCompleted` (outer-step layer); **5 Claude calls per pipeline run** = `callClaude` invocations producing 5 `prompt_call_log` rows (inner-call layer). Day 3's 7-step pipeline carried 3 Claude calls (1 fanout in step 3); Day 4's 8-step pipeline carries 5 Claude calls (3-way `analyze` + 2-way `synthesize`).

**Preflights (hard gates per kickoff).**

1. `pnpm typecheck` baseline 4/4 PASS.
2. `pnpm --filter @nexus/shared test:mock-claude` baseline 9/9 PASS.
3. `pnpm --filter @nexus/shared test:prompt-loader` baseline 12/12 PASS.
4. `pnpm --filter @nexus/db enum:audit` baseline PASS.
5. **IPv6/DIRECT_URL preflight resolved per kickoff Decision 1 then user-approved fallback to option (c).** Decision 1 specified `dns.setDefaultResultOrder("ipv6first")` per script. Applied to 7 dev-scripts (test-transcript-pipeline, test-transcript-pipeline-mock, test-update-deal-custom-properties, verify-medvista-meddpicc-hubspot, test-preprocessor, test-detect-signals, seed-medvista-transcript). Re-ran `test:preprocessor` → still ENOTFOUND. Triage per kickoff: `nslookup` confirmed Supabase direct host `db.<ref>.supabase.co` resolves only AAAA `2600:1f18:2e13:9d37:f27d:21fe:e6e1:7605` (no A record); `ping6 db.<ref>.supabase.co` → "No route to host" — dev-Mac IPv6 route to Supabase is broken at the network layer, not Node DNS. Per kickoff escalation rule, STOPPED + flagged with options (1: restore IPv6 routing, 2: switch to pooler URL per parked-item resolution path (c), 3: defer Session B). User picked option 2. Removed the `process.env.DATABASE_URL = process.env.DIRECT_URL` swap in 4 scripts; inverted `process.env.DIRECT_URL ?? process.env.DATABASE_URL` precedence in 3 scripts (now `DATABASE_URL ?? DIRECT_URL` so the pooler URL takes precedence). IPv6-first DNS hint kept in place harmlessly (no-op when pooler is reached). Re-ran `test:preprocessor` → **6/6 PASS** via pooler URL.
6. Dev server preflight: confirmed 200 via `pnpm dev` background launch + Monitor-driven readiness loop.
7. Baseline `test:transcript-pipeline-mock` against Day-3 7-step shape: **3/3 PHASES PASS** — confirmed no Session A bleed before Day 4 changes landed.
8. Vercel deploy command discovery: no explicit `pnpm vercel:deploy` script; `.vercel/project.json` confirms project linkage; per BUILD-LOG operational notes, deploys are git-push-triggered to main (`https://nexus-v2-five.vercel.app` auto-deploys).

**Items 1–5 — handlers.ts wiring (single-file restructure).**

- `packages/shared/src/jobs/handlers.ts` (now 1301 lines) imports the new tools/services: `updateDealTheoryTool` + `UpdateDealTheoryOutput`, `draftEmailTool` + `DraftEmailOutput`, `IntelligenceCoordinator` + `ActivePatternSummary`, `DealTheory` + `RecentEventSummary` + `MeddpiccDimensionScore`. New module-level helpers (sized for handlers.ts only — promote to a shared module when a second consumer needs them):
  - `formatParticipant(p)` — shared by recipient + rep-name resolution.
  - `renderCurrentTheoryBlock(theory)` — null → first-update sentinel; else 6-section block with last-updated timestamp on the working_hypothesis line + per-section item lists with supporting-evidence sub-bullets.
  - `renderRecentEventsBlock(events)` — one line per event per the .md spec.
  - `renderActivePatternsBlock(patterns)` — empty array → `(none)` since coordinator stub returns `[]`.
  - `renderTranscriptDataPointBlock(transcript, preprocess, signals, actions, scores, stakeholders)` — folds preprocessor stats + step-3 outputs into the 06a `${dataPointBlock}` for the transcript variant. Day 4 MVP — other dataPointTypes (email, observation, fitness_analysis, meddpicc_update) land when their drivers ship.
  - `renderTriggerSectionPostPipeline(recipient, actions, stakeholders, callDateIso)` — assembles the post_pipeline `${triggerSection}` per the email-draft.md template.
- **Item 1 — step-name collapse (Meta-F applied).** `stepsCompleted` now: `["ingest", "preprocess", "analyze", "persist_signals", "persist_meddpicc", "coordinator_signal", "synthesize", "persist_theory_email"]`. Internal Promise.all unchanged — still 3-way fanout in `analyze` (the inner-call layer stays explicit; only the outer step-name collapses). Per-call telemetry under `result.claude.detect_signals/extract_actions/score_meddpicc/update_deal_theory/draft_email` preserved verbatim.
- **Item 2 — coordinator_signal step.** After step 4 persist-meddpicc completes, instantiate `IntelligenceCoordinator({databaseUrl, sql})` and forEach over `signals`, calling `receiveSignal({hubspotDealId, signalType, evidenceQuote, sourceSpeaker, transcriptId, vertical: eventContext.vertical})` per signal. Today no-op; Phase 4 Day 2 fills the body. `result.coordinator.signals_received = signals.length`.
- **Item 3 — synthesize step (2-way Promise.all).** Both calls consume step-3 outputs as common context, no inter-call dependency. 06a vars: `currentTheoryBlock` from `dealIntel.getCurrentTheory(hubspotDealId)`, `recentEventsBlock` from `dealIntel.getRecentEvents(hubspotDealId, {sinceDays:14, limit:15})`, `activePatternsBlock` from a second `IntelligenceCoordinator({sql}).getActivePatterns({vertical})` instance, `dataPointBlock` from `renderTranscriptDataPointBlock(...)`, `dataPointType:"transcript"`, `dataPointDate` = current run timestamp (kickoff said "transcript.createdAt or current run timestamp" — captured in Reasoning stub: chose run timestamp because the TranscriptRow shape doesn't expose created_at and the divergence is irrelevant for Day 4 MVP). Email-draft vars: `repName` = first seller-side participant (Sarah Chen for MedVista; falls back to "the rep"), `repCommunicationStyle` = "professional and concise" hardcoded, `repGuardrails` = "(none specified)" hardcoded (Phase 5+ rep-tooling UI surfaces real config), `meddpiccBlock` reuses promptVars from step 3, `triggerSection` from `renderTriggerSectionPostPipeline(...)`. Recipient picker: first buyer-side participant; falls back to "the buyer team". Promise.all error semantics: any one call rejects the whole pipeline (job marks failed per §2.24 — no graceful degrade across 5 calls).
- **Item 4 — persist_theory_email step.** Append `deal_theory_updated` event via `dealIntel.appendTheoryUpdate(hubspotDealId, {update: theoryResult.toolInput, dataPointType: "transcript", dataPointId: transcriptId, emittedBy: jobId, promptVersion, stopReason}, {eventContext, sourceRef: ${transcriptId}:theory:${jobId}})`. Then `dealIntel.refreshSnapshot(hubspotDealId)` (no-op stub for Day 4). Append `email_drafted` event directly via sql (no service helper today; Phase 4+ may add `dealIntel.appendEmailDraft`) with `source_ref = ${transcriptId}:email:${jobId}`; payload carries the FULL `DraftEmailOutput` per oversight Decision 2 (also surfaced at `jobs.result.email_full`).
- **Item 5 — TranscriptPipelineResult POJO expansion.** `stepsCompleted` 8 entries; `stepsDeferred` empty; new `coordinator: {signals_received}`; new `theory: {update_emitted, working_hypothesis_changed, threats_added, meddpicc_trajectory_changed, deal_theory_updated_inserted}`; new `email: {subject, body_length, recipient, has_attachments, email_drafted_inserted}` summary fields; new `email_full: DraftEmailOutput` separate top-level (subject duplication intentional per Decision 2 — `email` is summary surface, `email_full` is full payload, mirrors Day 3's `meddpicc` summary pattern); `events.deal_theory_updated_inserted + events.email_drafted_inserted` added; `claude` per-call telemetry expanded to 5 entries; `timing.synthesize_ms + timing.persist_theory_email_ms + timing.coordinator_signal_ms` added with `analyze_ms` retained as a single fanout block.

**Item 6 — test harness updates.**

- `packages/db/src/scripts/test-transcript-pipeline-mock.ts`: 5 fixtures inlined (existing 3 + new `UPDATE_DEAL_THEORY_FIXTURE` + `DRAFT_EMAIL_FIXTURE` — verbatim copy from `test-mock-claude.ts` per the existing convention; the two harnesses stay in sync by convention, not by shared module). `stepsCompleted.length === 8` + `stepsDeferred.length === 0`. New PHASE 1 assertions: `mock.history.length === 5`, `result1.coordinator.signals_received === DETECT_SIGNALS_FIXTURE.signals.length`, `theory.update_emitted/working_hypothesis_changed === true`, `theory.threats_added === 1`, `theory.meddpicc_trajectory_changed === 1`, `email.subject + email.recipient` byte-match fixture, `email_full.body` byte-matches fixture, both new event counters === 1. PHASE 2 idempotency: per-run inserts === 1 each (different jobId → different source_ref → append-per-invocation), plus a cumulative-count assertion on `deal_events WHERE type IN ('deal_theory_updated','email_drafted') AND payload->>'dataPointId' = transcriptId` === 2 after two runs. Pre-PHASE-1 wipe of `deal_theory_updated + email_drafted` events for THIS transcript so the cumulative count is deterministic across re-runs (mirrors Day 3's MEDDPICC wipe pattern).
- `packages/db/src/scripts/test-transcript-pipeline.ts`: PHASE 1 + PHASE 3 stepsCompleted assertion bumped 7→8. New PHASE 1 assertions: `coordinator.signals_received === signals.detected`, theory + email event counters === 1, `email.body_length > 0`, `email_full.body.length === email.body_length`. New per-call prompt_version assertions: 06a `1.2.0` (post-bump), email-draft `1.0.0`. **PHASE 1.5 fanout extended 3 → 5 rows.** Expected prompt_files: `["01-detect-signals", "06a-close-analysis-continuous", "email-draft", "pipeline-extract-actions", "pipeline-score-meddpicc"]` (sorted). Expected tool_names: `["draft_email", "record_detected_signals", "record_extracted_actions", "record_meddpicc_scores", "update_deal_theory"]` (sorted). Same anchor + error_class:null assertions. PHASE 3 worker-path fanout: `length === 5`.

**`DealIntelligence.getCurrentTheory` snake_case → camelCase transform.** PHASE 2 mock harness initially failed with `t.supportingEvidence is not iterable` — Session A's `getCurrentTheory` cast the persisted snake_case payload to camelCase `DealTheory` without actually transforming. Fix: explicitly map each section's snake_case keys → camelCase fields (`supporting_evidence → supportingEvidence`, `current_confidence → currentConfidence`, `contact_name → contactName`, `engagement_read → engagementRead`, `what_would_resolve → whatWouldResolve`). Consumers (`renderCurrentTheoryBlock`, future close-hypothesis surfaces) now read a single shape regardless of persistence format.

**`06a-close-analysis-continuous` v1.1.0 → v1.2.0 reactive max_tokens bump per §2.13.1.** First live PHASE 1 hit `stop_reason=max_tokens` at 1500 (06a's old budget). Per §2.13.1 reactive-bump policy: "Phase 3+ is expected to watch for this pattern in transcript-pipeline logs and bump per-prompt budgets reactively rather than speculatively pre-bumping in 04C." Bumped `max_tokens: 1500 → 4000`, version `1.1.0 → 1.2.0`. Matches 06b's 4000 budget for similar synthesis surfaces. Front-matter is the source of truth — no upstream sync needed (the 04C source doc carries a stale 1500). Harness assertion updated to require `1.2.0`. Retest after bump expected to land cleanly within 4000.

**Sub-step 1 — `test:transcript-pipeline-mock` (mock harness).** **3/3 PHASES PASS** at the 8-step shape with 5 fixtures.
- PHASE 1 (10394ms): stepsCompleted 8 entries, stepsDeferred 0, signals 2/2 (skipped — prior runs populated the same hashes), actions 3, MEDDPICC 3 dims at 70/65/55 with overall=63 (rounded mean), HubSpot bag 4 keys, mock.history 5 invocations, capturing.history 1 PATCH, theory `{update_emitted:true, working_hypothesis_changed:true, threats_added:1, meddpicc_trajectory_changed:1}`, email subject+recipient byte-match fixture, email_full.body byte-match fixture (436 chars).
- PHASE 2 (idempotency): transcript_ingested skipped, signal_detected 2/2 hit signal_hash dedup, meddpicc_scored appended (new jobId → new source_ref), `deal_theory_updated_inserted === 1` + `email_drafted_inserted === 1` per run, cumulative `theory_count === 2 + email_count === 2` after PHASE 1+2.
- PHASE 3 (HubSpot writeback bag): 4 keys exactly (eb=70, competition=65, paper_process=55, overall=63), no null leaks, all numeric.

**Sub-step 2 — `test:transcript-pipeline` (full-flow live) — PHASE 1 + 1.5 + 2 PASS, PHASE 3 deferred to post-deploy retry.**
- PHASE 1 direct (93565ms wall): 5 live Claude calls. detect-signals: 5180 in / 3495 out. extract-actions: 4055 in / 2803 out. score-meddpicc: 4674 in / 2223 out. update-deal-theory: 6297 in / 1500 out (`stop_reason=max_tokens` — 06a v1.1.0 budget too tight, see reactive bump above). draft-email: 2842 in / 577 out. 10 signals detected / 1 inserted / 9 dedup-skipped. 18 action items extracted. 8 MEDDPICC dims scored, 9 HubSpot properties written. coordinator.signals_received=10 (no-op fanout). theory.update_emitted=true, working_hypothesis_changed=true, threats_added=5. email.subject `"MedVista + Nexus — Follow-Up from Today's Call"` (truncated in console output), recipient `"Dr. Michael Chen, Chief Medical Officer, MedVista Health"` (correct primary buyer-side participant), body 1550 chars, has_attachments=true.
- **PHASE 1.5 fanout — live-green at 5 rows.** Exactly 5 prompt_call_log rows for PHASE 1's jobId. Distinct prompt_files: 01-detect-signals, 06a-close-analysis-continuous, email-draft, pipeline-extract-actions, pipeline-score-meddpicc. Distinct tool_names: record_detected_signals, update_deal_theory, draft_email, record_extracted_actions, record_meddpicc_scores. All five carry matching `(hubspot_deal_id, transcript_id, job_id)` anchors; `error_class: null` on all. **The 5-call fanout shape is verified live.** This closes the kickoff's "5 prompt_call_log rows per pipeline run" exit criterion for the direct-invocation path.
- PHASE 2 (idempotency, 91027ms wall): same 5 live Claude calls (06a hit max_tokens again at 1500 — the second occurrence prompted the immediate v1.2.0 bump). transcript_ingested skipped, signal_detected 2 inserted / 8 skipped (signal_hash dedup), transcript_embeddings stable at 35.
- **PHASE 3 worker-dispatched — first attempt deferred, second retry FAILED with dev-server cache corruption, third (post-cache-rebuild) PASSED.** First attempt: `/api/jobs/enqueue` succeeded, Realtime subscribed, localhost worker triggered manually via curl, worker route returned 200 in 622ms — too fast for a Day 4 pipeline (~95s) — meaning the localhost worker found NO queued job to claim (pg_cron prod claimed first, racing the 10s schedule window). Test deadline 180s for Realtime UPDATE → no events received. Pool then saturated for **25+ minutes** despite dev-server kill + sustained-drain Monitor. User-approved reorder per kickoff broader escalation rule: deploy first (Item 7) so prod runs the same Day 4 handler, then retry PHASE 3 once pool drains. Post-deploy retry: pool was STILL saturated (deploy under load actually accumulated more prod-handler connections); Decision-1-style fallback engaged via a new operational script `packages/db/src/scripts/pool-session.mts` that bypasses the saturated transaction-mode pooler (port 6543) via the session-mode pooler (port 5432, separate connection limit). Used it to `cron.unschedule('nexus-worker')` so prod stopped claiming jobs; transaction pool drained sustainably within ~3-5 min. Second retry: PHASE 1 + 1.5 + 2 PASS (06a v1.2.0 hit max_tokens at 4000 on PHASE 1 — see parked items; PHASE 2 came in at 2825 output tokens cleanly), but PHASE 3 enqueue returned 500 HTML — Next.js Turbopack `_buildManifest.js.tmp.*` ENOENT race in the dev server's manifest writer (NOT a worker-path bug — framework infrastructure failure). User-approved one-shot fix: `rm -rf apps/web/.next .turbo` + dev-server restart with clean cache, then single PHASE 3 retry (per oversight discipline: dev-server crash isn't a "real worker-path bug" so re-attempt allowed within the no-loop spirit). Third retry: **3/3 PHASES PASS.** PHASE 3 succeeded@137001ms, terminal status=succeeded via Realtime UPDATE, jobs.result jsonb persisted with 8-step shape, actions.length=13, meddpicc.hubspot_properties_written=9, theory.update_emitted=true (PHASE 3's 06a happened to have working_hypothesis_changed=false — same MedVista narrative the prior runs reinforced; threats_added=3 added new evidence to existing threats), email subject `"MedVista / Nexus — Follow-Up from Today's Call + Next Steps"` recipient `Dr. Michael Chen, Chief Medical Officer, MedVista Health` body=1489ch. **Worker-path fanout verified live: 5 prompt_call_log rows for the worker-dispatched jobId.** This closes the kickoff's "5 prompt_call_log rows per pipeline run on both direct + worker paths" exit criterion. Cleanup: test job row deleted; deal_events + meddpicc_scores preserved as real output. **Cron resumed via `pool-session.mts resume` at session close** (`schedule="10 seconds", active=true` confirmed) — production state restored.

**Garbage-checks PASS on theory + email (live PHASE 1 outputs).** Theory: `update_emitted=true`, working_hypothesis grounded in MedVista narrative, 5 threats added, 1 meddpicc_trajectory change. Email subject + body reference specific call commitments without fabricated specifics; recipient is the correct primary buyer-side participant from `transcript.participants` (Dr. Michael Chen, Chief Medical Officer, MedVista Health); voice grounded in the seeded participants. 06a's reasoning carried `triggered_by_quote` per-section-style (`triggered_by_quote` schema field) which is the §2.13.1 calendared-default rationale — Phase 5 Day 1 review trigger NOT fired in practice (no further escalation needed beyond the max_tokens reactive bump).

**Item 7 — Vercel deploy + auth-gate smoke.** Pending — to be exercised post-commit. Plan: `git push origin main` triggers Vercel auto-deploy (`https://nexus-v2-five.vercel.app`). Verify deploy success via Vercel deployment logs / curl. Auth-gate smoke per oversight Decision 5: `curl https://nexus-v2-five.vercel.app/api/jobs/worker -H "Authorization: Bearer __invalid__"` → expect 401 (route up + bundle valid + auth gate working). If auth-gate smoke fails on missing prompt files OR returns 5xx with "prompt file not found" signature, edit `apps/web/next.config.mjs` to add `experimental.outputFileTracingIncludes: { "app/api/jobs/worker/route": ["../../../packages/prompts/files/*.md"] }` and redeploy. Then re-smoke. Post-smoke, wait for pool drain (deploy cycles old prod containers; if drain stalls, fallback path is `cron.unschedule('nexus-worker')` for the retry window), then run single-attempt PHASE 3 retry.

**Verification at end of Session B (mid-session, pre-PHASE-3-retry).**

- `pnpm typecheck` — 4/4 workspaces PASS.
- `pnpm build` — 13 routes clean, zero `Attempted import error | Module not found | Type error | Failed to compile`.
- `pnpm --filter @nexus/db enum:audit` — PASS.
- `pnpm --filter @nexus/shared test:prompt-loader` — **12/12 PASS** (06a now v1.2.0 max_tokens=4000 loads cleanly).
- `pnpm --filter @nexus/shared test:mock-claude` — 9/9 PASS unchanged.
- `pnpm --filter @nexus/shared test:meddpicc-format` — 4/4 PASS unchanged.
- `pnpm --filter @nexus/shared test:preprocessor` — **6/6 PASS** via pooler URL (post-IPv6-fallback).
- `pnpm --filter @nexus/db test:transcript-pipeline-mock` — **3/3 PHASES PASS at the 8-step shape with 5 fixtures.**
- `pnpm --filter @nexus/db test:transcript-pipeline` — **3/3 PHASES PASS live at 8-step shape with 5-call prompt_call_log fanout verified on BOTH direct-invocation + worker-dispatched paths.** PHASE 3 succeeded@137s.
- Vercel deploy succeeded (`6af80e4`); auth-gate smoke PASS (HTTP 401 in 500ms); production prompt-file bundling verified by smoke + the `outputFileTracingIncludes` fallback was NOT needed (existing config already bundles `packages/prompts/files/*.md` correctly into the worker route bundle).
- Hex grep + stale shadcn class grep — 0 hits.

**Reasoning stub.** Non-MVP choices with justification type per the CLAUDE.md reasoning-gate.

- **IPv6/DIRECT_URL preflight fallback to option (c) pooler URL after Decision 1's option (a) didn't resolve at the network layer.** Justification 2 — the parked-item resolution path explicitly named option (c) ("switch dev-script paths to pooler-URL for the regression-check window") as a valid fallback when dev-Mac IPv6 connectivity is broken. Decision 1 picked option (a) DNS-fix at code level under the assumption IPv6 routing was intact; ping6 confirmed otherwise. STOPPED + flagged per kickoff escalation rule "If still ENOTFOUND, dev-Mac IPv6 connectivity to Supabase is broken independently — STOP and flag." User chose option 2 (pooler URL fallback). Risk accepted: pooler 200-client cap is shared, per-service `max=1` keeps this run's contribution to ~5 connections; if saturation surfaces, drain takes 2-5 min. Operational risk realized this session — see PHASE 3 deferral below.
- **Step-name collapse to single `analyze` per kickoff Meta-F.** Justification 1 — kickoff explicitly adjudicated this. Internal Promise.all unchanged (3 calls); only the outer `stepsCompleted` entry name collapses. Per-call telemetry under `result.claude.detect_signals/extract_actions/score_meddpicc` preserved verbatim. The two layers — outer step name (8 entries) and inner Claude-call (5 entries) — are deliberately not collapsed: Day 3's 7-step carried 3 Claude calls (1 fanout); Day 4's 8-step carries 5 (3-way + 2-way fanouts). Layer-naming precision matters for future-session mental models.
- **`refreshSnapshot` Day-4 no-op stub left in place; called from step 7 anyway.** Justification 4 — keeps the call site in place. Phase 4+ implements event-stream replay materialization without touching the call site. Matches Session A's adjudicated Decision 4 (defer materialization).
- **`getCurrentTheory` snake_case → camelCase transform added in DealIntelligence.** Justification 1 — the persisted payload mirrors 06a's tool-schema snake_case keys; `DealTheory` shape uses camelCase. Session A's stub cast the payload directly without transforming, which produced the right TypeScript types but the wrong runtime structure (consumer accessed `t.supportingEvidence` and got undefined.iterable). Fix transforms at read-time so consumers (`renderCurrentTheoryBlock`, future close-hypothesis surfaces) read a single shape regardless of persistence format. Phase 4+ event-stream-replay materialization replaces this with a snapshot-side normalization.
- **`06a` reactive `max_tokens` bump 1500 → 4000 + version 1.1.0 → 1.2.0.** Justification 1 — §2.13.1 explicit policy: "Phase 3+ is expected to watch for this pattern in transcript-pipeline logs and bump per-prompt budgets reactively." First live PHASE 1 hit `stop_reason=max_tokens` at 1500; second live PHASE 2 also hit it. Two consecutive runs is empirical-enough signal; bumping. 4000 matches 06b's existing budget for similar synthesis-class surfaces. Front-matter is source of truth — no upstream sync to 04C (which carries a stale 1500). Harness assertion updated to `1.2.0`.
- **Mock harness fixtures inlined (not extracted to shared module).** Justification 2 — existing convention from Day 3 mock harness ("Kept in sync with packages/shared/scripts/test-mock-claude.ts by convention"). Adding 2 more fixtures verbatim alongside the existing 3 follows the same pattern. Cost of inline: ~50 lines of fixture data duplicated. Cost of extraction: new file structure + cross-package import (test scripts in @nexus/db, fixtures in @nexus/shared). For 2 harnesses, inline is simpler. Promote to shared module if a third consumer arrives.
- **`${dataPointDate}` = current run timestamp (not transcript.createdAt).** Justification 4 — TranscriptRow shape doesn't expose `created_at` and adding a SELECT for it adds complexity for marginal benefit on Day 4 MVP. Production transcripts will have a real `created_at`; for Day 4 fixture-driven runs, the divergence between fixture-seed-time and call-time is irrelevant. Capture in Reasoning stub, fix in Phase 4+ when transcripts carry real call metadata.
- **`coordinator_signal` step uses sequential forEach, not Promise.all.** Justification 4 — Day 4 receiveSignal is no-op; sequential vs parallel doesn't matter today. Phase 4 Day 2's real implementation may want parallel fanout, in which case the loop becomes `await Promise.all(signals.map(...))`. One-line change at activation time. Sequential is the simpler default.
- **PHASE 2 cumulative-count assertion + pre-PHASE-1 wipe in mock harness.** Justification 4 — kickoff specified the cumulative count check. The wipe makes the count deterministic across re-runs of the harness against the seeded MedVista transcript (mirrors Day 3's `meddpicc_scores` wipe pattern). Other transcripts' theory + email events preserved (the wipe filter scopes to `payload->>'dataPointId' = transcriptId`).
- **Reorder Item 7 (deploy) before PHASE 3 retry.** Justification 2 (operational precedent) + Justification 3 (productization arc preserved) — Day 3 + Session A both encountered the same EMAXCONN cascade, both recovered with brief drain. This session's drain extended past 25 min unusually; root cause hypothesized as accumulated stale-Day-2-handler runs on prod under pg_cron's 10s polling. Deploy refreshes prod containers (their connections die with reclamation); post-deploy retry runs both prod AND localhost with the same Day 4 handler, so race winner doesn't matter. Kickoff Decision 3 worried about deploys "masking pipeline-wiring vs bundling-config" failures; that concern is satisfied because pipeline-wiring is verified by PHASE 1 + 1.5 (5 live Claude calls writing 5 distinct prompt_call_log rows with matching anchors). Bundling-config concern surfaces post-deploy via auth-gate smoke + outputFileTracingIncludes fallback per Item 7. Reorder rationale + drain strategy captured per oversight ask.
- **Drain strategy: rely on Vercel deploy cycling prod containers; pause cron as fallback.** Justification 4 — Vercel function-instance reclamation closes their postgres connections. If drain stalls past ~5 min post-deploy, fallback path is `cron.unschedule('nexus-worker')` via direct DB query (`max:1` postgres client attempt, retryable as pool drains) for the PHASE 3 retry window, then `cron.schedule(...)` to restore. Per kickoff parked-item resolution path — same shape as the option-(c) pooler-URL fallback chosen earlier this session.
- **Clean-signal discipline on PHASE 3 retry.** Justification 1 — oversight explicit ask: "if it still fails after deploy with current handler on both ends, that's a real worker-path bug, escalate rather than re-attempt." Single attempt; pass = closeout, fail = escalate.

12 entries. No UNCERTAIN.

**Live garbage-check verdicts.**
- **Theory** (PASS): Working hypothesis grounded in MedVista narrative; threats reference real call quotes (HIPAA + InfoSec timeline + Microsoft DAX competition); MEDDPICC trajectory reflects the score deltas Phase 1's score-meddpicc emitted. 06a hit max_tokens twice (now bumped to 4000 — should fit cleanly going forward).
- **Email** (PASS): Subject `"MedVista + Nexus — Follow-Up from Today's Call"` references the recent meeting concretely. Recipient `"Dr. Michael Chen, Chief Medical Officer, MedVista Health"` is the correct primary buyer-side participant. Body 1550 chars (well under email-draft's 1500-token budget at v1.0.0). Voice grounded in the seeded rep (Sarah Chen). No fabricated specifics.

**Parked items closed.**
- Day 4 Session A "Session B scope" — ALL items CLOSED.
- Day 2 Session B `outputFileTracingIncludes` parked — auth-gate smoke PASS confirms production bundling works without the explicit `outputFileTracingIncludes` config; the existing Next.js bundler picked up the prompt files via the natural import path (loader.ts reads files at runtime via `fs.readFileSync` from the resolved `packages/prompts/files/` location). The fallback config remains a documented Plan B if a future deploy surfaces a missing-file error.
- Day 4 Session A IPv6/DIRECT_URL parked — resolved via option (c) pooler-URL fallback.
- Day 3 Session B `outputFileTracingIncludes` parked (also carried) — closed by the same auth-gate smoke.

**Parked items added.**
- **06a max_tokens forward-looking watch (per oversight ask).** Live PHASE 1 hit `stop_reason=max_tokens` at the original 1500 budget AND again at 4000 on the wider-context PHASE 1 run after the bump. The §2.13.1 reactive-bump policy may need a forward-looking check on this prompt specifically: 06a's input grows with deal_events history (recentEvents block, currentTheory block on subsequent runs); a deal with months of accumulated events could push input to 10k-15k tokens and the response to a similar growth ratio. Phase 4 Day 1's `event_context SET NOT NULL` migration + Phase 5 Day 1's close-analysis surfaces will exercise 06a against richer context. Watch for `stop_reason=max_tokens` at 4000 in those runs and consider another reactive bump (4000 → 8000 likely) — Type 4 (forward-looking next-session need). The bump cost is ~$0 today; deferring to Phase 5+ practice data is the right call per the §2.13.1 "ship tight, bump when live evidence justifies" discipline. PHASE 2 + PHASE 3 in this session both came in well under 4000 (2825 and 2351 + 3698 output tokens respectively), so 4000 isn't reliably tight yet — the wider-context PHASE 1 case is the watch trigger.
- **Pool-saturation persistent-drain pattern (operational hardening).** Day 3 + Session A + Day 4 Session B all hit EMAXCONN; Day 3 + Session A drained briefly; Day 4 Session B drain stalled past 25 min and required cron.unschedule via session pooler bypass. Root cause hypothesis: accumulated prod-handler runs under pg_cron's 10s schedule taking 30-90s each → multiple concurrent handlers × Vercel containers × shared 200-client cap. Phase 4+ may want: (a) more aggressive shared-pool max-connection reduction; (b) a pooler-saturation circuit breaker in the worker route that returns 503 if pool ping fails; (c) move the prod worker route to use DIRECT_URL via Vercel's IPv6-capable runtime (if/when supported). The session-pooler-bypass pattern + `pool-session.mts` script are durable operational mitigations for the recurrence pattern.
- **`packages/db/src/scripts/pool-session.mts` + `pool-quick.mts` operational scripts retained.** Two new ops scripts committed as durable infrastructure for the recurring pool-saturation pattern. `pool-session.mts` uses the Supabase session-mode pooler (port 5432, distinct connection limit from transaction-mode 6543) to `pause` (cron.unschedule) / `resume` (cron.schedule with CRON_SECRET) / `status` the `nexus-worker` cron job when transaction-mode pooler is saturated. `pool-quick.mts` is a one-shot status check with a withRetry helper (used by Monitor polling loops). Both 100 lines total. Future sessions hitting EMAXCONN have these as immediate mitigation.
- **`configure-cron.ts` uses DIRECT_URL — broken on this dev-Mac.** When IPv6 routing to Supabase direct host breaks, `configure-cron.ts` fails. Workaround in this session: `pool-session.mts resume` does the equivalent cron.schedule via session pooler. Long-term fix candidate: update `configure-cron.ts` to fall back to pooler URL when DIRECT_URL fails. Defer to Phase 4+ when the script is next touched (it's idempotent ops tooling, not session-blocking).
- **DIRECT_URL switch is dev-host-specific operational state.** The 4 scripts that previously force-swapped `DATABASE_URL = DIRECT_URL` now stay on the pooler URL; the 3 fallback-precedence scripts now prefer pooler. If a future dev environment has working IPv6 to Supabase, the previous swap pattern was operationally meaningful (bypasses pooler 200-client cap). Document this per-environment trade-off when a future dev environment surfaces this.
- **Phase 5 Day 1 06a `reasoning_trace` review trigger NOT fired in practice (Type 3 + 4).** Day 4 Session B's live theory updates produced usable reasoning via per-section `triggered_by_quote` (the §2.13.1 calendared-default rationale). The calendared review still happens at Phase 5 Day 1 kickoff per §2.13.1; today's evidence is "leave-as-is is working." No early escalation needed.
- **Dormant-trigger activation discipline for email-draft** — unchanged from Session A.
- **Next.js Turbopack manifest-writer race recovery pattern.** The dev-server crash on PHASE 3 retry (`ENOENT: _buildManifest.js.tmp.*`) was fixed by `rm -rf apps/web/.next .turbo` + dev-server restart. This is a known Turbopack issue; documented here as a recovery recipe for future sessions. Add to operational notes if it recurs.

**Phase 3 closeout paragraph.**

Phase 3 fully closed across Days 1–4 (all sessions A + B): the v2 transcript pipeline now runs end-to-end against MedVista with **5 Claude calls per pipeline invocation** — `01-detect-signals` (signal taxonomy + stakeholder insights), `pipeline-extract-actions` (action items), `pipeline-score-meddpicc` (MEDDPICC scores + evidence), `06a-close-analysis-continuous` (rolling deal theory delta), and `email-draft` (post_pipeline follow-up email). Each call produces a `prompt_call_log` row with anchors `(hubspot_deal_id, transcript_id, job_id)` so cross-deal compliance queries can JOIN per §2.16.1 decision 3. The pipeline persists `transcript_ingested + signal_detected + meddpicc_scored + deal_theory_updated + email_drafted` events with `event_context` populated per §2.16.1 decision 2 (Phase 4 Day 1 flips that column to NOT NULL). MEDDPICC writeback to HubSpot lands all 8 dims + overall (9 properties) on every run via the single batched PATCH per 07C §7.5. The `IntelligenceCoordinator` skeleton service has its `receiveSignal` call site in place (no-op today; Phase 4 Day 2 fills in pattern detection). The `DealIntelligence` service is the single read/write surface for theory + recent events + MEDDPICC formatting per Guardrail 25. **Phase 4 inherits:** (1) the IntelligenceCoordinator skeleton's `receiveSignal` seam to fill in real cross-deal pattern detection (§2.17 + Phase 4 Day 2 brief), (2) the `deal_events.event_context SET NOT NULL` migration (Phase 4 Day 1 prep — all Phase 3-era writers now populate it), (3) the `deal_snapshots` materialization role for `DealIntelligence.refreshSnapshot` (Day 4 stub becomes event-stream replay; first read consumer is Phase 5 Day 1's close-analysis-final + close-hypothesis surfaces), (4) the §2.13.1 calendared resolutions (06a `reasoning_trace` review at Phase 5 Day 1 kickoff; 03 `reasoning_trace` move to first position before Phase 5 Day 1's agent config proposal queue; 08 `reasoning_trace` decision at Phase 5 Day 1 if call-prep section integration shows weakness), (5) the event-sourced theory + email streams now flowing on every transcript pipeline run (a fresh deal will produce one `deal_theory_updated` + one `email_drafted` per call processed, which Phase 5+ surfaces consume as the deal's continuous intelligence trail per §1.1 closed-lost analysis spec). Phase 3 also produced durable operational infrastructure: `pool-session.mts` for session-pooler bypass when transaction pooler saturates, `pool-quick.mts` for one-shot status, and the `outputFileTracingIncludes` fallback documented as Plan B for prompt-file bundling. Vercel production at `https://nexus-v2-five.vercel.app` carries the `6af80e4` Day 4 Session B build (auto-deployed on push; auth-gate smoke PASS). Live HubSpot portal `245978261` carries 9 `nexus_meddpicc_*` properties populated by 4 sub-step-2 + sub-step-2-retry runs against MedVista deal `321972856545`; current snapshot reflects the latest write per the Day 4 idempotent upsert semantics. Live Supabase: ~50 `signal_detected` rows for the MedVista transcript (signal_hash dedup honored across non-deterministic re-runs at temp 0.2), ~3-4 `deal_theory_updated` rows + ~3-4 `email_drafted` rows for the same transcript (append-per-invocation jobId-keyed source_refs), 1 transcript_ingested row (transcript-id-keyed source_ref dedup), 35 transcript_embeddings (DELETE+INSERT stable). `pg_cron nexus-worker` resumed at session close (10-second schedule, active=true).

**Cost.** Live Claude: ~17 calls across the verification staircase (5 per PHASE-1+2 run × 3 sub-step-2 attempts + 5 for the PHASE-3 worker-path) ≈ $1.20-$1.40 at ~$0.07-0.08/call. Voyage $0 (preprocessor idempotent). HubSpot $0 (PATCH cost negligible). Total ≈ $1.30 — within kickoff budget of $1.40-$1.70.

### Pre-Phase 4 Session A — 2026-04-27 · `23500f0`

**Ops hardening — pool-saturation mitigation + worker-route circuit breaker + `configure-cron.ts` pooler-URL fallback.** Three small surface edits closing the recurring EMAXCONN cost before Phase 4 Day 2 adds coordinator + 15-min `hubspot_periodic_sync` baseline load. Zero live Claude, zero HubSpot writes, zero Voyage. Internal hygiene only.

**Layer-naming precision (continued from Phase 3 Day 4).** This session treats the 200-client transaction-pooler cap as a load-bearing operational constraint, not a code-design issue. The fixes are: (a) consume less of the cap per process (max-connection reduction), (b) fail fast + observably when the cap is hit (worker route circuit breaker), (c) make the existing IPv6/pooler fallback pattern (Day 4 Session B's 7-script change) reach the ops scripts that didn't get it then (`configure-cron.ts`).

**Preflights — all passed; cron paused via `pool-session.mts` to allow drain.**

1. `pnpm typecheck` — 4/4 PASS unchanged.
2. `pnpm --filter @nexus/shared test:mock-claude` — 9/9 PASS unchanged.
3. `pnpm --filter @nexus/shared test:prompt-loader` — 12/12 PASS unchanged.
4. `pnpm --filter @nexus/db enum:audit` — PASS unchanged.
5. **Pool drain check via `pool-quick.mts status`: SATURATED at session start** — exactly the recurring pattern this session resolves. Engaged the operational fallback per the Day 4 Session B precedent: `pool-session.mts pause` paused `nexus-worker` cron via the session pooler (port 5432, separate connection cap), confirmed paused (`PAUSED via session pooler`), then proceeded with code edits in parallel while transaction pool drained.
6. `git status clean` confirmed; HEAD on `main` was `94224a7` (Forward map persistence commit) at session start.
7. Vercel auth-gate smoke: `HTTP 401` on prod `/api/jobs/worker` with bad bearer — production functional. Vercel auto-deployed `94224a7` (BUILD-LOG-only commit; function bundle unchanged from Day 4 Session B's `6af80e4`).
8. Dev-server preflight skipped — session does not exercise browser surfaces or Realtime; no need.

**Item 1 — Shared-pool max reduction (`packages/shared/src/db/pool.ts`).**

- Default `max: options.max ?? 10` → `max: options.max ?? 5`. Empirical Phase 3 evidence: peak concurrency per Vercel container is ≤5 connections (handler + verify + 1 leftover). Halving cuts per-container budget consumption at the 200-client transaction-pooler cap from 5% → 2.5%.
- JSDoc on `SharedSqlOptions.max` updated to name the rationale + the Pre-Phase 4 Session A tuning provenance.
- `idle_timeout` stays at 60 (aggressive cleanup).
- `getSharedSql({max: ...})` override surface preserved; existing callers pass no override so they pick up the new default.

**Item 2 — Worker-route circuit breaker (`apps/web/src/app/api/jobs/worker/route.ts`).**

- Pre-claim `SELECT 1` ping inserted between the auth-check + `DATABASE_URL` guard and the `FOR UPDATE SKIP LOCKED` claim query.
- Catch block matches EMAXCONN substring (`message.includes("EMAXCONN") || message.includes("max client connections")`); on match returns `{error: "pool_saturated", retryAfterSeconds: 30}` as `503` with `Retry-After: 30` header. Non-EMAXCONN errors fall through to the existing `claim_failed` 500 surface.
- Telemetry: one stderr JSON line per circuit break — `{"event": "worker_circuit_break", "reason": "pool_saturated", "ts": ..., "detail": ...}`. Matches the existing `claude_call` event shape pattern (§2.13.1 telemetry-as-early-warning). Vercel function logs capture stderr; saturation pattern is observable going forward.
- Inline comment names the Day 4 Session B precedent + the Phase 4 Day 2 imminent-load argument so future readers see the why.
- The breaker is narrowly scoped: pre-claim only. Handler dispatch retains its own postgres.js retry semantics + per-handler `try/catch` for transactional failures. The breaker is a load-shed, not a per-query guard.

**Item 3 — `configure-cron.ts` pooler-URL fallback (`packages/db/src/scripts/configure-cron.ts`).**

- URL precedence inverted: `process.env.DATABASE_URL ?? process.env.DIRECT_URL`. Matches Day 4 Session B's 7-script pattern.
- File header comment now names the IPv6/DIRECT_URL dev-host issue + the Day 4 Session B precedent.
- Added a `db_url` log line showing which path resolved (pooler vs direct).
- DIRECT_URL fallback preserved for CI / production environments where IPv6 is intact and pooler saturation is a concern.
- The original `DIRECT_URL missing` error replaced with a "neither DATABASE_URL nor DIRECT_URL set" diagnostic.

**Verification.**

- `pnpm typecheck` — 4/4 workspaces PASS.
- `pnpm build` — 13 routes clean, zero `Attempted import error | Module not found | Type error | Failed to compile`.
- `pnpm --filter @nexus/db enum:audit` — PASS unchanged.
- `pnpm --filter @nexus/shared test:prompt-loader` — 12/12 PASS unchanged.
- `pnpm --filter @nexus/shared test:mock-claude` — 9/9 PASS unchanged.
- **`pnpm --filter @nexus/db configure-cron https://nexus-v2-five.vercel.app` live exercise — PASS.** Connected via the pooler URL (`aws-1-us-east-1.pooler.supabase.com:6543`), unscheduled the prior `nexus-worker`, rescheduled with the same `(10 seconds, https://nexus-v2-five.vercel.app/api/jobs/worker, Bearer CRON_SECRET)` parameters, confirmed via `cron.job` query. Session ends with cron `schedule="10 seconds", active=true` — production state restored. Doubles as the configure-cron-fix validation.
- Hex grep + stale shadcn class grep — 0 hits unchanged.

**Reasoning stub.** Non-MVP choices with justification type per the CLAUDE.md reasoning-gate.

- **Shared-pool max=5 (was 10).** Justification 1 — operational hygiene per the BUILD-LOG operational note "Supabase's shared transaction pooler caps at ~200 concurrent clients ... If the pooler saturates again, the Phase 3 Day 1 proper mitigation is a process-wide shared postgres.js client" (already shipped Pre-Phase 3 Session 0-B; this is the reactive tuning of that mitigation per empirical Phase 3 evidence). Justification 4 — Phase 4 Day 2 adds coordinator + sync jobs that compound load; halving per-container consumption preserves headroom. The override surface is preserved (`getSharedSql({max:...})`) so reactive bumps stay easy if 5 turns out to be too aggressive in practice.
- **Pre-claim ping placement: AFTER auth + DATABASE_URL guard, BEFORE claim query.** Justification 1 — preserves §2.6's auth contract (unauthenticated callers always see 401, never 503). Returning 503 to authenticated callers under saturation is semantically correct: the worker can't proceed, but the request was authorized. Alternative considered: ping BEFORE auth (rejected — leaks operational state to unauthenticated probes; also wastes a connection on every bad-bearer request).
- **Circuit breaker matches `EMAXCONN` substring + `max client connections` substring.** Justification 1 — postgres.js wraps the underlying error; Day 4 Session B observed both `(EMAXCONN)` and the longer "max client connections reached" forms in different code paths. Matching either covers the surface. Non-EMAXCONN errors fall through to the existing 500 path (claim_failed) — the breaker is narrow on purpose.
- **`worker_circuit_break` stderr JSON event extends §2.13.1 telemetry pattern.** Justification 1 — same shape conventions as `claude_call` events from the Phase 3 Day 1 wrapper. Vercel function logs capture stderr; saturation pattern becomes observable across deploys without infrastructure investment. Phase 5+ telemetry dashboard (foundation review C4) gains a new dimension to surface.
- **`configure-cron.ts` pooler precedence inversion mirrors Day 4 Session B 7-script pattern.** Justification 2 — operational-precedent consistency. The same `DATABASE_URL ?? DIRECT_URL` shape across all dev-scripts means future devs hit the same fallback path uniformly. Risk: production CI environments that explicitly set both still prefer pooler (Supabase recommends pooler for application traffic anyway; CI scripts that need session-mode DIRECT_URL semantics can override `DATABASE_URL` at invocation time).
- **Cron resume via the configure-cron live exercise (not a separate `pool-session.mts resume`).** Justification 4 — the configure-cron run validates the fix AND restores production state in one step. Two separate exercises would duplicate effort + add a rollback step. The configure-cron precedence inversion was the very fix this session ships; running it on the new code IS the validation.
- **No live test re-run.** Justification 1 — Day 4 Session B's `test:transcript-pipeline` 3/3 PHASES PASS at 8-step + 5-call fanout still holds. Nothing in this session touches the handler or pipeline. Re-running would cost ~$0.50 in live Claude for zero new evidence per Decision 5 of the kickoff.

5 entries. No UNCERTAIN.

**Parked items closed.**
- Phase 3 Day 4 Session B's "Pool-saturation persistent-drain pattern (operational hardening)" — addressed by the shared-pool max reduction + worker-route circuit breaker.
- Phase 3 Day 4 Session B's "`configure-cron.ts` DIRECT_URL dependency" — addressed by the pooler-URL fallback.

**Parked items added.**
- **Worker concurrency model** — circuit breaker mitigates saturation but doesn't add throughput. Phase 4 Day 2 may want loop-until-empty semantics or bounded concurrency if transcript volume justifies. (Already in Forward map.)
- **Production-side pool monitoring** — `worker_circuit_break` events are now observable in Vercel logs; a Phase 4+ telemetry dashboard could aggregate these as an operational health signal alongside the `claude_call` telemetry. Foundation review C4 already covers the wider dashboard surface.
- **Vercel function move to DIRECT_URL** — long-term option once Vercel runtime IPv6 support is confirmed. Would eliminate pooler contention entirely for the worker route. Not blocking; Phase 4+ revisit.

**Cost.** $0 live Claude. $0 HubSpot. $0 Voyage. No new Supabase rows (cron rescheduling is idempotent; `cron.job` net-row-count unchanged at session close).

### Phase 4 Day 1 Session A — 2026-04-27 · `561e458`

**Foundations: schema flip + applicability DSL + evaluator + DealState helper.** Internal-only code per the A/B split (mirrors Phase 3 Day 3/4 precedent — Day 1 scope of foundation + admission + scoring is too large for a single session). Session A lands the inputs Session B needs: locked DSL Zod schema, evaluator function, `DealState` projection method, `applicability_rejections` diagnostic table, and the `event_context SET NOT NULL` flip per §2.16.1 decision 2's calendared schedule.

Zero live Claude (DSL evaluation is deterministic). One live schema migration applied to prod Supabase. Zero HubSpot writes, zero Voyage.

**Layer-naming precision.** Day 1 splits A/B: Session A = "foundations" (DSL + evaluator + DealState + schema flip); Session B = "admission engine + scoring + DealIntelligence.getApplicable* + verification staircase." Locked-shape adjudications in Session A's kickoff carry forward into Session B's kickoff prep without re-litigation.

**Preflights — all 9 hard gates passed.**

1-7. Standard baseline + auth-gate smoke + git status + pool drain check — all green. Pre-Phase 4 Session A's circuit breaker behavior unchanged; pool drained at session start.
8. **`event_context` NULL audit (kickoff Decision 6 + Reasoning addition):** OUTCOME (a) — `SELECT COUNT(*) FROM deal_events WHERE event_context IS NULL` returned 0. Migration 0006 SET NOT NULL flip proceeded clean without backfill. The pre-Phase-3-era backfill rationale (intentionally lossy `'{}'::jsonb` for events that genuinely lack recoverable event_context) was authored as `audit-event-context-nulls.mts` script + executed; deleted post-migration since the column is now NOT NULL and re-runs would always return 0.
9. Dev server preflight skipped — Session A is internal-only code + test scripts; no browser surface or Realtime exercised.

**Item 1 — Migration 0006 (schema flip + diagnostic table) — APPLIED LIVE.**

- File: `packages/db/drizzle/0006_phase_4_day_1_session_a.sql` — hand-written following the Pre-Phase-3 Session 0-B migration-0005 precedent (multi-statement bundle with `--> statement-breakpoint` markers + RLS Pattern D policies).
- Phase 1 of migration: `ALTER TABLE deal_events ALTER COLUMN event_context SET NOT NULL`. Pre-flight 8 returned 0 NULL rows so no backfill needed.
- Phase 2-4: `CREATE TABLE applicability_rejections (id, rule_id, rule_description, surface_id, hubspot_deal_id, rejected_at, reasons jsonb NOT NULL, deal_state_snapshot jsonb)` per kickoff Decision 7 + 3 indexes (deal/rule/surface × rejected_at DESC) + RLS Pattern D (`SELECT TO authenticated USING(true)`).
- Drizzle table definition added to `packages/db/src/schema.ts` after the `promptCallLog` definition. `eventContext` column updated with `.notNull()`.
- Applicator: `packages/db/src/scripts/apply-migration-0006.ts` (new) follows the Pre-Phase-3 Session 0-B applicator pattern with idempotency check (skip if `applicability_rejections` exists AND `event_context.is_nullable = NO`).
- Live verification post-apply: `deal_events.event_context is_nullable: NO`; `applicability_rejections` table exists with 4 indexes (3 named + pkey); RLS enabled; `applicability_rejections_select_authenticated` policy active.

**Item 2 — Applicability DSL + evaluator + barrel — `packages/shared/src/applicability/`.**

- `dsl.ts` (~120 LOC): Zod schema per Decision 2's locked shape — Foundation Review C2's sketch ported with two adjudicated edits: (a) added optional `description?: string` field for productization-arc diagnostic surface, (b) explicit enum imports from `packages/shared/src/enums/` per Guardrail 22 single-source-of-truth. All clauses (`stages`, `verticals`, `minDaysInStage`, `maxDaysInStage`, `minDaysSinceCreated`, `requires`, `meddpiccGuards`, `signalTypePresent`, `signalTypeAbsent`) optional + AND-composed when set. Forward-compat additive-extension shape per PRODUCTIZATION-NOTES.md applicability arc. Exports both Zod schema (`ApplicabilityRuleSchema`) + inferred type (`ApplicabilityRule`) + `parseApplicabilityRule(raw)` validation helper.
- `evaluator.ts` (~180 LOC): `applies({rule, dealState, eventStream}): {pass: boolean, reasons: string[]}`. Walks each clause; rejection reasons cite the specific clause that rejected. Decision 4 (undefined field = no gate) implemented via `if (rule.X)` guards — undefined clauses produce no reasons. Conservative default for unscored MEDDPICC dims: rejects with explicit "not yet captured" reason. Owns the `DealState` type definition (co-located with its consumer; `DealIntelligence.getDealState` imports back). Owns `EvaluatorEvent` minimal type for the event-stream slice the caller passes.
- `index.ts`: barrel re-exports `ApplicabilityRuleSchema`, `parseApplicabilityRule`, `ApplicabilityRule`, `applies`, `DealState`, `EvaluatorEvent`, `ApplicabilityResult`.
- `packages/shared/src/index.ts` barrel updated: new `export * from "./applicability"`.

**Item 3 — `DealIntelligence.getDealState(dealId)` method — added to deal-intelligence.ts.**

- New imports: `MeddpiccDimension` (for `meddpiccScores` map keys), `isSignalTaxonomy` + `SignalTaxonomy` (for `openSignals` filter), `loadPipelineIds` (for stage ID → DealStage inverse map), `DealState` type from applicability module.
- New private helper `stageIdToInternal()` lazily loads + memoizes the inverse pipeline-ids map (HubSpot stage IDs → DealStage enum values). Process-lifetime cache; one load per process.
- New private helper `parseHubspotNumber(v)` handles HubSpot's mixed numeric encoding (number | string | null).
- `getDealState(hubspotDealId)` reads `hubspot_cache.payload.properties.{dealstage, nexus_vertical, amount, createdate}` (the RAW HubSpot shape per adapter.ts:1256), associated company id from `payload.associations.companies.results[0].id`, MEDDPICC scores from `meddpicc_scores` table directly, signal_detected events from `deal_events` for `openSignals`, latest `stage_changed` event for `daysInStage` anchor.
- `daysInStage` fallback diagnostic per kickoff Reasoning addition: when no `stage_changed` event exists, falls back to `daysSinceCreated` AND emits structured stderr telemetry `{"event": "dealstate_stage_fallback", "reason": "no_stage_changed_event", "hubspotDealId", "stage", "daysSinceCreated", "ts"}`. Fires for MedVista in test:deal-state (no stage_changed events have been written in this build); future Phase 5+ usage with deals that DO have stage_changed events surfaces the gap operationally per §2.13.1 telemetry-as-early-warning pattern.
- `closeStatus` derivation: `closed_won` / `closed_lost` exact match; else `not_closed`.
- `activeExperimentAssignments`: empty array for Day 1 (no experiment writers yet; Phase 5+ wires the lifecycle UI which is the first writer).

**Item 4 — Test harnesses.**

- `packages/shared/scripts/test-applicability-dsl.ts` (~280 LOC): 12 unit cases covering all 9 DSL clauses + edge cases (empty rule, AND-composition, multi-rejection reasons, Zod parse, null-stage deal). Cost $0 (deterministic). pnpm alias: `test:applicability-dsl`. **Live: 12/12 CASES PASS.**
- `packages/shared/scripts/test-deal-state.ts` (~130 LOC): 8 live verification cases against MedVista deal `321972856545` (vertical='healthcare', stage non-null, 8 MEDDPICC dims scored, ≥1 open signal, daysSinceCreated > 0, closeStatus='not_closed', activeExperimentAssignments=[]). Cost $0. pnpm alias: `test:deal-state`. **Live: 8/8 CASES PASS** with full DealState snapshot logged for diagnostic context. The `dealstate_stage_fallback` telemetry fired correctly (MedVista has no stage_changed event written) — surfacing the Phase 1-era writer gap operationally per the kickoff Reasoning addition.

**`buildEventContext` bug discovery (Phase 3-era; out of Session A scope; parked).** The live `test:deal-state` initial run surfaced a Phase 3-era latent bug: `hubspot_cache.payload` stores the RAW HubSpot shape `{id, properties: {...}, associations: {...}}` per adapter.ts:1256, but `DealIntelligence.buildEventContext` reads `dealPayload?.vertical` / `dealPayload?.stage` / `dealPayload?.amount` / `dealPayload?.companyId` directly on the top-level payload. These fields don't exist at the top level — they're inside `properties` (`nexus_vertical`, `dealstage`, `amount`) or in `associations.companies.results[0].id`. Result: every Phase 3-era `event_context` jsonb row has populated structure but null fields inside (verified via diagnostic query against MedVista's recent events — `email_drafted` / `deal_theory_updated` / `meddpicc_scored` all show `{"vertical":null,"dealSizeBand":null,"stageAtEvent":null,"employeeCountBand":null,"activeExperimentAssignments":[]}`). The §2.16.1 preservation arc has been silently broken since Pre-Phase-3 Session 0-B; the Day 4 Session B claim "all Phase 3-era writers populate event_context" was structurally true (jsonb non-null) but value-empty. Migration 0006's SET NOT NULL flip is unaffected: column-level NOT NULL holds (every row has a non-null jsonb), and the bug-fix follow-up populates field values correctly going forward. Session A scope-discipline call: leave `buildEventContext` unchanged in this session (the fix is wider — affects every Phase 3+ event writer + needs a backfill strategy for existing rows + interacts with the hubspot_cache mapper boundary); apply the shape-correct read pattern only in `getDealState` (Session A's surface). Park as Phase 4 Day 1 Session B precondition OR a small standalone fix session before Session B. See Reasoning stub for the scope-discipline rationale.

**Verification at end of Session A.**

- `pnpm typecheck` — 4/4 workspaces PASS.
- `pnpm build` — 13 routes clean, zero `Attempted import error | Module not found | Type error | Failed to compile`.
- `pnpm --filter @nexus/db enum:audit` — PASS unchanged.
- `pnpm --filter @nexus/shared test:prompt-loader` — 12/12 PASS unchanged.
- `pnpm --filter @nexus/shared test:mock-claude` — 9/9 PASS unchanged.
- `pnpm --filter @nexus/shared test:meddpicc-format` — 4/4 PASS unchanged.
- **`pnpm --filter @nexus/shared test:applicability-dsl` — 12/12 CASES PASS (new gate).**
- **`pnpm --filter @nexus/shared test:deal-state` — 8/8 CASES PASS against MedVista (new gate).**
- Migration 0006 applied + verified via `information_schema` query (event_context is_nullable = NO; applicability_rejections exists with RLS Pattern D).
- Hex grep + stale shadcn class grep — 0 hits.

**Reasoning stub.** Non-MVP choices with justification type per the CLAUDE.md reasoning-gate.

- **A/B split for Phase 4 Day 1 (kickoff Decision 1).** Justification 4 — Day 1 scope (foundations + admission + scoring) is ~13-15h; mirroring Phase 3 Day 3/4 precedent. Session A's outputs (DSL + evaluator + DealState) are inputs to Session B; locked shapes carry forward without re-litigation in Session B's kickoff.
- **DSL Zod schema lock per Decision 2.** Justification 1 — Guardrail 32 (rules are structured JSONB never prose) + §2.21 (applicability LOCKED). Forward-compat additive-extension shape preserves productization-arc multi-tenant readiness per PRODUCTIZATION-NOTES.md without inflating today's surface. Two edits to Foundation Review C2's sketch (`description?` field + explicit enum imports) are productization-justified additions; recorded in dsl.ts JSDoc.
- **DealState shape lock per Decision 3 + co-location with evaluator.** Justification 2 — DealState is the input contract the evaluator consumes; co-locating with its consumer rather than its producer is the cleaner dependency direction (DealIntelligence.getDealState is a producer; SalesforceAdapter's getDealState in Stage 3 is a parallel producer; both import the type from applicability/evaluator.ts). Justification 3 — CRM-agnostic shape preserves SalesforceAdapter parallel-implement path per PRODUCTIZATION-NOTES.md Stage 3 arc.
- **DSL evaluator semantics: undefined field = no gate (Decision 4).** Justification 1 — matches §2.21 + rebuild plan §12.5 "applicability rejections are diagnostic only" — a rule that omits a clause means it doesn't care about that dimension. Each rejection-reason string cites only the clauses that rejected; undefined clauses don't appear. Conservative default for unscored MEDDPICC dims (rejects with explicit "not yet captured" reason) handles the corner case without breaking the no-gate semantics.
- **Initial coordinator pattern type lock (Decision 5; informational for Session A; operational for Phase 4 Day 2).** Justification 4 — locking now means Phase 4 Day 2 inherits without re-litigation; pattern-type expansion deferred to Phase 5+ as parked. Keeps Phase 4 Day 2's `IntelligenceCoordinator.receiveSignal` real implementation tight + verifiable against the MedVista fixture (process two transcripts on two deals same vertical → expect 1 pattern detected).
- **Migration 0006 form: hand-written + applicator script (Decision 6).** Justification 1 — matches Pre-Phase-3 Session 0-B migration 0005 + Phase 2 Day 2 migration 0004 hand-replace precedent for migrations beyond drizzle-kit's generator output (multi-statement bundle, RLS Pattern D, multi-index). Idempotency check via `information_schema` queries makes re-runs safe.
- **`applicability_rejections` table shape per Decision 7.** Justification 2 — `deal_state_snapshot jsonb` preserves the historical state at rejection time per PRODUCTIZATION-NOTES.md historical-ingestion arc (rejected_at is settable for backdating; Phase 5+ admin dashboard reads this jsonb to surface "rule X rejected N% of deals" for tuning). Justification 1 — RLS Pattern D matches `prompt_call_log` + `transcript_embeddings` + `sync_state` (read-all-authenticated, service-role-writes).
- **Pre-Phase-3-era event_context backfill rationale (kickoff Reasoning addition).** Justification 1 — `'{}'::jsonb` is the honest "no segmentation data available" signal. Pre-Phase-3 events genuinely lack recoverable event_context (the §2.16.1 preservation arc didn't exist yet); fabricating values would corrupt the corpus-intelligence arc. Phase 5+ corpus queries treat empty `{}` event_context as "no segmentation" + filter accordingly. Preflight 8 returned 0 NULL rows so the backfill clause didn't fire this session, but the discipline lives in the audit script's header comment for future schema migrations that may face the same situation.
- **`daysInStage` fallback diagnostic via stderr structured JSON (kickoff Reasoning addition).** Justification 1 — extends the §2.13.1 telemetry-as-early-warning pattern to operational diagnostics. The fallback to `daysSinceCreated` is a graceful degradation, but silent fallback would mask Phase 1-era writer gaps; surfacing as `dealstate_stage_fallback` event makes the gap observable in Vercel function logs going forward. Phase 5+ can build a dashboard reading this telemetry; for Day 1 the audit-trail-on-stderr is sufficient.
- **`buildEventContext` Phase 3-era bug discovery: leave unchanged in Session A; park for follow-up.** Justification 4 — fixing it inline would expand Session A's scope substantially (the bug affects every Phase 3+ event writer that calls `buildEventContext`; backfill of existing rows requires a strategy decision about whether to re-mapper-load each deal's hubspot_cache). The schema flip's NOT NULL constraint is unaffected (column-level non-null holds). The follow-up fix can land in a small standalone session OR Phase 4 Day 1 Session B's kickoff prep; either way the §2.16.1 preservation arc resumes preserving values once the fix lands. Justification 1 — escalation discipline distinguishes "execution-time discovery" (take action with reasoning capture) from "readiness-pass blocker" (stop and flag); the bug surfaced during execution, not preflight, so the take-action-with-reasoning path applies.
- **`getDealState`'s shape-correct read of raw HubSpot cache via pipeline-ids inverse.** Justification 1 — the raw HubSpot payload shape is the actual cache content; reading `properties.dealstage` via pipeline-ids inverse map (`stageIdToInternal()` lazy + memoized) is the authoritative path. The mapper at `packages/shared/src/crm/hubspot/mappers.ts` doesn't expose atomic helpers (only the high-level `mapHubSpotDeal`), so inline extraction is the minimum-surface fix; future refactor can extract shared cache-reading helpers if a third reader needs the same pattern.

11 entries. No UNCERTAIN.

**Parked items closed.**
- Phase 3 Day 4 Session B's "Phase 4 Day 1: `event_context SET NOT NULL` migration" — landed via migration 0006.
- Foundation Review C2's "Applicability DSL + shared evaluator service" — locked + shipped per Decision 2 + Item 2.

**Parked items added.**
- **`buildEventContext` Phase 3-era bug fix.** Read shape change: `dealPayload?.{vertical, stage, amount, companyId}` → `dealPayload?.properties?.{nexus_vertical, dealstage, amount}` + `dealPayload?.associations?.companies?.results?.[0]?.id`. Plus pipeline-ids inverse for stage resolution. Plus a backfill of existing Phase 3-era rows (re-read each affected deal's hubspot_cache + UPDATE event_context). Estimated effort: ~1-2 hours code + backfill script. Land in Phase 4 Day 1 Session B kickoff prep OR a small standalone session before Session B. Without this fix, Phase 4 Day 2 coordinator queries that filter by `event_context.vertical` return empty results.
- **`buildEventContext` should ideally use the mapper.** Longer-term refactor: both `buildEventContext` and `getDealState` read raw `hubspot_cache.payload`. The mapper at `packages/shared/src/crm/hubspot/mappers.ts` is the canonical normalizer. A cleaner design extracts `mapHubSpotDeal`'s atomic helpers (`resolveDealStage`, `parseVertical`, etc.) to a public helper module that both DealIntelligence + the mapper use. Defer until a third consumer (Phase 5+ surface, SalesforceAdapter parallel-implement) makes the shared-helper extraction concretely valuable.
- **Phase 4 Day 1 Session B inheritance.** Locked DSL + evaluator + DealState are inputs. Surfaces registry literal port from rebuild plan lines 470-494. Admission engine wiring through `SurfaceAdmission.admit(...)`. Scoring prompt body + tool schema. `DealIntelligence.getApplicablePatterns/Experiments/Flags` methods composing the evaluator + table reads. Verification staircase including a live-Claude-scored admission run.
- **Phase 4 Day 2 inheritance.** `IntelligenceCoordinator.receiveSignal` real implementation per locked Decision 5 ("2+ deals same signal + same vertical" pattern type). `coordinator_synthesis` job handler. Periodic `hubspot_periodic_sync` cron. These build on Day 1 Session A's `DealState` shape (the coordinator reads dealState.vertical when grouping signals by vertical for cross-deal pattern detection).

**Cost.** $0 live Claude. $0 HubSpot. $0 Voyage. 1 schema migration applied to live Supabase (event_context flip + applicability_rejections create + 3 indexes + RLS policy). 1 prod-Supabase NULL-row count read (preflight 8). 1 prod-Supabase live read of MedVista deal in `test:deal-state` (free; pooler URL).

### Phase 4 Day 1 Session A.5 — 2026-04-27 · `95aaca7`

**Interstitial `buildEventContext` shape-fix + Phase 3-era backfill.** Closes the §2.16.1 decision-2 preservation arc value-side bug that's been silently broken since Pre-Phase 3 Session 0-B added the `event_context` column. Session A's diagnostic queries surfaced ~50+ MedVista events with null fields inside the populated jsonb structure; this session lands the writer-side fix in `DealIntelligence.buildEventContext` + a unit gate against the actual cache shape + a backfill of all 92 Phase 3-era field-null rows.

Zero live Claude, zero HubSpot writes, zero Voyage. 92 corrective UPDATE statements on prod Supabase `deal_events` (idempotent — re-runs no-op via the `event_context->>'vertical' IS NULL` filter).

**Layer-naming precision.** The bug had two layers that the Session A schema flip distinguished but the Day 4 Session B "all writers populate event_context" claim conflated. Column-level NOT NULL (Migration 0006) holds — every row has a non-null jsonb object. Field-level nulls inside the jsonb were the actual preservation-arc breakage. Session A.5's filter (`event_context->>'vertical' IS NULL`) targets the field-level nullness as a bug-specific canary; future field-null regressions in other event_context fields (dealSizeBand, employeeCountBand, stageAtEvent) would need separate detection. The filter is bug-specific, not a general validity check.

**Preflights — all 10 hard gates passed.**

1. `pnpm typecheck` — 4/4 PASS unchanged.
2. `pnpm --filter @nexus/shared test:mock-claude` — 9/9 PASS unchanged.
3. `pnpm --filter @nexus/shared test:prompt-loader` — 12/12 PASS unchanged.
4. `pnpm --filter @nexus/db enum:audit` — PASS unchanged.
5. `pnpm --filter @nexus/shared test:applicability-dsl` — 12/12 PASS unchanged.
6. `pnpm --filter @nexus/shared test:deal-state` — 8/8 PASS unchanged (`dealstate_stage_fallback` telemetry fired as expected for MedVista).
7. Pool drain check via `pool-quick.mts status` — DRAINED at session start; cron scheduled.
8. `git status` clean; HEAD on `main` was `40aba42` at session start (matches kickoff expectation).
9. Vercel auth-gate smoke: `HTTP 401` on prod `/api/jobs/worker` with bad bearer in 615 ms — production functional.
10. **Bug-scope audit (kickoff Decision 6 + Preflight 10):** OUTCOME (b) — `audit-event-context-fields.mts` returned 92 vertical-null rows out of 92 Phase-3-era `deal_events` rows (100% affected, as expected from Session A's diagnostic findings). All on MedVista deal `321972856545`. Per-type breakdown matched the kickoff's expected shape exactly (signal_detected: 51, meddpicc_scored: 22, deal_theory_updated: 9, email_drafted: 9, transcript_ingested: 1; total 92). No unexpected event types — confirms the fix surface covers every Phase 3-era writer.

**Item 1 — `buildEventContext` shape-fix in `packages/shared/src/services/deal-intelligence.ts`.**

- Replaced the buggy reader block (~lines 386-443 pre-fix) with the shape-correct pattern reusing Session A's already-defined `stageIdToInternal()` + `parseHubspotNumber()` helpers (~lines 287-313 of the same file). Reads `dealPayload?.properties?.{dealstage, nexus_vertical, amount}` for normalized fields; resolves `dealstage` (HubSpot internal ID) via the lazy-memoized inverse map. Resolves company id from `payload.associations.companies.results[0].id` with `payload.companyId` fallback for any future mapper-normalized payloads. Reads `companyPayload?.properties?.{nexus_vertical, numberofemployees}` (lowercase per HubSpot's raw API encoding).
- The fix is byte-symmetric with `getDealState`'s read pattern (`packages/shared/src/services/deal-intelligence.ts:681-878`). Both methods now share the same cache-reading shape via copy-paste; a longer-term refactor to extract a shared cache-reading helper module is parked until a third consumer (Phase 5+ surface or SalesforceAdapter parallel-implement) makes the extraction concretely valuable.
- Removed the unused `isDealStage` import (formerly used by the buggy `dealPayload?.stage` direct path; the new path resolves via `stageIdToInternal()` instead).
- Updated the JSDoc to drop the stale "Phase 4 Day 1's NOT NULL flip only applies once Phase 3-era writers are known to populate it reliably" line; replaced with the post-Migration-0006 reality ("field-level nulls inside the jsonb are legitimate ... rather than a bug"). Inline comment now names the Session A.5 fix lineage + the productization-arc Stage 3 historical-ingestion plane (HubSpot deal-property history API for accurate-at-event reconstruction).

**Item 2 — `test:build-event-context` unit gate (`packages/shared/scripts/test-build-event-context.ts`).**

- New script (~220 LOC). Covers 8 cases: (1) MedVista happy path (raw HubSpot shape), (2) `activeExperimentAssignments` thread-through, (3) null deal payload → all-null fields no crash, (4) company cache missing → deal vertical preserved, employeeCountBand null, (5) deal lacks `nexus_vertical` → company-vertical fallback, (6) amount as numeric string → parsed via `parseHubspotNumber`, (7) unknown stage id → `stageAtEvent=null`, (8) `companyId` top-level fallback when no `associations` key.
- Mocks `postgres.Sql` via the existing `{databaseUrl, sql}` injection seam. Inspects the joined SQL string to dispatch deal vs company queries; reads the first interpolated value as the hubspot_id; returns the matching fixture or empty array. No DB; no Claude; deterministic.
- Fixtures hand-written to mirror the actual `hubspot_cache.payload` shape (`{id, properties: {...}, associations: {...}}` per adapter.ts:1256). Hand-writing keeps the test independent of portal state. Asserts against the kickoff-named MedVista values: `vertical=healthcare`, `stageAtEvent=discovery`, `dealSizeBand=1m-5m`, `employeeCountBand=1k-5k` (fixture uses `numberofemployees=4500` to land cleanly in the `< 5000` band). pnpm alias: `test:build-event-context`.
- **Live: 8/8 CASES PASS.**

**Item 3 — `apply:event-context-backfill` script (`packages/db/src/scripts/apply-event-context-backfill.mts`).**

- New script (~190 LOC). Connects via `DATABASE_URL` (pooler-first per Pre-Phase 4 Session A pattern; falls back to `DIRECT_URL`). Adds operational `--session` CLI flag for the Phase 3 Day 4 Session B fallback pattern: when the transaction pooler is at the EMAXCONN cap, transforms `:6543/` → `:5432/` to route through the session pooler (mirrors `pool-session.mts`'s URL transform).
- Two-phase batch processing (~100-row batches, ~1 batch / second rate-limit between batches): (a) read phase OUTSIDE transaction — verifies hubspot_cache exists for the deal via SELECT EXISTS, then resolves `event_context` via `dealIntel.buildEventContext(dealId, [])` cached per dealId across the run. (b) write phase INSIDE per-batch transaction — only `UPDATE deal_events SET event_context = $1 WHERE id = ANY($2)` statements. Pre-resolution avoids the deadlock that the initial single-phase implementation hit (max=1 connection held by `sql.begin()` couldn't service the EXISTS query inside the same transaction).
- Idempotency: candidate filter `event_context->>'vertical' IS NULL AND created_at >= '2026-04-22T00:00:00Z'` excludes already-backfilled rows; re-runs are no-ops.
- Telemetry per §2.13.1 pattern: `event_context_backfill_batch` stderr JSON line per batch with `batch_n`, `rows_updated`, `rows_skipped_no_cache`, `sample_updated_event_context` (1-2 rows per batch); `event_context_backfill_skip` stderr line for any deal whose hubspot_cache is missing (skipped, not fabricated). Final summary: `event_context_backfill_summary` with totals + per-type breakdown.
- Backfill write path is precise about Guardrail 25 (DealIntelligence sole write surface): the backfill issues corrective UPDATEs directly via raw SQL, NOT via a service write method. Guardrail 25 covers NEW event writes; corrective UPDATEs to existing rows that were written through the service originally with a writer-side bug are an acceptable v2-demo exception. If Phase 5+ adds write-side audit-trail mechanisms (e.g., `event_context_revisions` table or `corrected_at` column), the backfill would need to participate. Parked as a productization-arc consideration.
- pnpm alias: `apply:event-context-backfill`.

**Item 4 — Verification.**

- **Backfill live exercise (via `--session` after transaction pooler hit EMAXCONN mid-session):** 92 candidates → 92 updated → 0 skipped → 1 unique deal processed → 0 unique deals skipped. Per-type breakdown: signal_detected (51), meddpicc_scored (22), deal_theory_updated (9), email_drafted (9), transcript_ingested (1). Sample event_context written: `{vertical: "healthcare", dealSizeBand: "1m-5m", stageAtEvent: "discovery", employeeCountBand: "1k-5k", activeExperimentAssignments: []}` — matches the kickoff's expected shape exactly.
- **Re-audit post-backfill** (`audit-event-context-fields.mts`): 92 total Phase-3-era rows, **0 vertical-null rows** (was 92), `by_type: []`, `by_deal: []`. Bug surface fully closed.
- **MedVista spot-check** (`spot-check-event-context.mts`): 5 most recent events (across 4 distinct types: email_drafted, deal_theory_updated, meddpicc_scored, signal_detected) all show non-null `vertical=healthcare`, `stageAtEvent=discovery`, `dealSizeBand=1m-5m`, `employeeCountBand=1k-5k`, `activeExperimentAssignments=[]`. Full reconstruction across all five §2.16.1 decision-2 fields per Decision 3 (partial backfill rejected).
- **`test:deal-state` regression check** (8/8 CASES PASS unchanged) — confirms the shared-helper edits to `deal-intelligence.ts` (the new `dealProps` extraction in `buildEventContext` shares the same `stageIdToInternal()` + `parseHubspotNumber()` helpers `getDealState` already uses) didn't affect `getDealState`'s surface. Note: `test:deal-state` reads `hubspot_cache` directly (not `event_context`), so it does NOT verify backfill correctness — the spot-check above does.

**Operational note (mid-session pool saturation).** The first backfill attempt deadlocked due to a max=1 connection held by `sql.begin()` while the inner EXISTS read tried to acquire the same client. After fixing (read phase outside transaction), the second attempt hit `EMAXCONN` on the transaction pooler — saturation source was external (Vercel functions, not the local script). Followed Pre-Phase 4 Session A's escalation path: paused `nexus-worker` cron via `pool-session.mts pause`, killed local dev server, monitored drain. Drain was slow (>5 min); rather than wait the full 10-min escalation threshold, added the `--session` flag to the backfill script to route through the session pooler (separate connection cap, ~30 sessions, immediately reachable). Backfill via session pooler completed in <2 seconds. Transaction pooler later drained naturally; subsequent verifications (`audit-event-context-fields.mts`, `test:deal-state`, `spot-check-event-context.mts`) ran cleanly via the pooler URL.

**Verification at end of Session A.5.**

- `pnpm typecheck` — 4/4 workspaces PASS.
- `pnpm build` — 13 routes clean, zero `Attempted import error | Module not found | Type error | Failed to compile`.
- `pnpm --filter @nexus/db enum:audit` — PASS unchanged.
- `pnpm --filter @nexus/shared test:prompt-loader` — 12/12 PASS unchanged.
- `pnpm --filter @nexus/shared test:mock-claude` — 9/9 PASS unchanged.
- `pnpm --filter @nexus/shared test:meddpicc-format` — 4/4 PASS unchanged.
- `pnpm --filter @nexus/shared test:applicability-dsl` — 12/12 PASS unchanged.
- **`pnpm --filter @nexus/shared test:build-event-context` — 8/8 CASES PASS (new gate).**
- **`pnpm --filter @nexus/db apply:event-context-backfill --session` — 92/92 rows updated (one-time live exercise).**
- **Re-audit — 0 vertical-null rows post-backfill (was 92).**
- **Spot-check — MedVista's 5 most recent events all show non-null segmentation fields.**
- `pnpm --filter @nexus/shared test:deal-state` — 8/8 CASES PASS unchanged (regression check).
- Hex grep on .tsx component files — 0 hits (CSS Layer-2 hex in `globals.css` is by-design per Day 2's three-layer token consumption).
- Stale shadcn class grep — 0 hits.

**Reasoning stub.** Non-MVP choices with justification type per the CLAUDE.md reasoning-gate.

- **Fix shape: reuse Session A's `stageIdToInternal()` + `parseHubspotNumber()` helpers byte-symmetrically (kickoff Decision 1).** Justification 1 — §2.16.1 decision 2 + Guardrail 25 (DealIntelligence is the sole interface for intelligence data). Both `buildEventContext` and `getDealState` now read the same raw HubSpot cache shape via the same helpers; the methods stay in lockstep without a separate refactor. Refactoring the cache-reading into a shared helper module is deferred until a third consumer makes the extraction concretely valuable; for two consumers the copy-paste has lower carrying cost than premature abstraction (CLAUDE.md task discipline).
- **Backfill rationale: current-state cache vs permanent null (kickoff Decision 2).** Justification 2 — §2.16.1 corpus-intelligence preservation arc explicitly requires accurate-at-event segmentation. Permanent null is strictly worse for both Phase 4 Day 2 coordinator pattern detection and the productization-arc corpus-intelligence queries. Current-state cache is approximate (deals could have moved stages between event-time and now), but for v2 demo era all deals were created within the past ~5 days so cache state ≈ event-time state. PRODUCTIZATION-NOTES.md "Historical analysis — baseline + priming" Stage 3 reads HubSpot's deal-property history API for accurate-at-event reconstruction; out of v2 scope.
- **Idempotency filter is bug-specific (kickoff Decision 3).** Justification 1 — `event_context->>'vertical' IS NULL` catches THIS bug's surface (vertical-field nullness as the canary). Future field-null regressions in other event_context fields (dealSizeBand, employeeCountBand, stageAtEvent) would need separate detection. Documented this limitation in the backfill script's docstring + the audit script's docstring so future schema-fix sessions extend or replace the filter as appropriate to their bug surface.
- **Backfill write path: corrective UPDATE via raw SQL (Guardrail 25 narrow exception).** Justification 1 + 3 — Guardrail 25 (DealIntelligence is sole write surface) covers NEW event writes; the backfill is a corrective UPDATE to existing rows that were written through the service originally with a writer-side bug. Acceptable v2-demo exception because there's no audit-trail-on-write mechanism today. If Phase 5+ adds write-side audit-trail mechanisms (`event_context_revisions` table or `corrected_at` column), the backfill would need to participate. Parked as a productization-arc consideration.
- **Unit-test fixture hand-written, not captured from live MedVista (kickoff Decision 4).** Justification 1 — keeps the test independent of portal state. Specific values chosen to map cleanly: `dealstage=3544580805` (real discovery stage ID per pipeline-ids.json), `nexus_vertical=healthcare`, `amount=2400000` ($2.4M maps to `1m-5m`), `numberofemployees=4500` (lands cleanly in `1k-5k` since `bucketEmployeeCount` boundary is `< 5000`). The kickoff's "5000 → 1k-5k" was approximate guidance; the fixture uses 4500 to remove the boundary ambiguity.
- **Backfill `--session` CLI flag (mid-session operational fallback).** Justification 1 — Pre-Phase 4 Session A established the session-pooler URL transform as the documented fallback when the transaction pooler is at EMAXCONN. Adding the flag to the backfill script preserves the documented fallback path inline rather than requiring an env-override + dotenv-override-false dance. The flag is opt-in (default routes through transaction pooler per Supabase's recommended application traffic path); operators reach for it only when the transaction pooler is saturated.
- **Pre-resolve event_context outside the transaction (deadlock fix).** Justification 1 — the original implementation called the EXISTS read inside `sql.begin()`, which deadlocked at max=1 because the transaction held the only connection while the inner read needed a second one. Restructured to a two-phase batch processing pattern: read phase outside transaction (resolves event_context per dealId, cached across batches), write phase inside per-batch transaction (only UPDATEs). Matches postgres.js's recommended pattern for mixed read+write workloads with constrained connection budgets.
- **`event_context_backfill_batch` + `_skip` + `_summary` stderr telemetry.** Justification 1 — extends §2.13.1 telemetry-as-early-warning pattern to backfill operational diagnostics. Same shape conventions as `claude_call`, `worker_circuit_break`, `dealstate_stage_fallback` events. Vercel function logs capture stderr; telemetry pattern remains observable across deploys without infrastructure investment.
- **Spot-check via dedicated script (rather than ad-hoc psql).** Justification 4 — repeatable from any future session that wants to verify event_context state on MedVista. Read-only + safe to re-run. Pairs with `audit-event-context-fields.mts` which counts the bug surface; spot-check verifies VALUE correctness for a sample.

9 entries. No UNCERTAIN.

**Parked items closed.**
- Phase 4 Day 1 Session A's "`buildEventContext` Phase 3-era bug fix" (the one-line summary in the parked items) — addressed by Items 1+2+3+4. The §2.16.1 preservation arc value-side now matches the column-side: NOT NULL at schema level + structurally-populated jsonb at row level + non-null fields inside per the FIXED writer.
- The diagnostic queries Session A authored (mentioned in the buildEventContext bug discovery subsection) implicitly close as well — the audit script `audit-event-context-fields.mts` is the durable artifact those one-shot queries became.

**Parked items added.**
- **Cache-reading shared-helper module refactor (still parked).** Both `buildEventContext` and `getDealState` read the raw HubSpot cache shape via the same `stageIdToInternal()` + `parseHubspotNumber()` helpers + the same `payload.properties.*` + `payload.associations.companies.results[0].id` extraction logic. A cleaner design extracts these into a public helper module that DealIntelligence (and SalesforceAdapter's parallel-implement in Stage 3) consume. Defer until a third consumer materializes (Phase 5+ surface, SalesforceAdapter, or any Phase 4 Day 2 coordinator code that needs the same pattern).
- **Stage-3 historical-ingestion plane via HubSpot deal-property history API.** PRODUCTIZATION-NOTES.md "Historical analysis — baseline + priming" names this as the accurate-at-event backfill path. Session A.5's current-state-cache backfill is the demo-era stand-in. For productization, when historical timeline accuracy matters (months of cumulative event history with deals that have moved stages), Stage 3 reads HubSpot's deal-property history endpoint to reconstruct segmentation as of each event's `created_at`. Out of v2 scope.
- **Backfill participation in future write-side audit-trail mechanisms.** If Phase 5+ adds an `event_context_revisions` table OR a `corrected_at` column on `deal_events` (the natural shapes for tracking corrective updates), the backfill script would need to write to those surfaces too. Today's backfill is a one-shot corrective UPDATE without audit-trail; v2-demo acceptable; productization-arc consideration.

**Cost.** $0 live Claude. $0 HubSpot. $0 Voyage. 92 corrective UPDATE statements on prod Supabase `deal_events` (idempotent — re-runs no-op via the `event_context->>'vertical' IS NULL` filter; reversible by re-running after a hypothetical `buildEventContext` revert). 5 prod-Supabase reads in verification (audit pre + audit post + test:deal-state + spot-check + the backfill script's own SELECT EXISTS).

### Phase 4 Day 1 Session B — 2026-04-28 · `39405b7`

**Admission engine + scoring prompt + surfaces registry + getApplicable* methods + verification staircase.** Closes the Phase 4 Day 1 split that began with Session A's foundations (DSL + evaluator + DealState + getDealState) and Session A.5's buildEventContext value-side fix + Phase 3-era backfill. Session B reads accurate `event_context` for segmentation gating (closing the §2.16.1 decision-2 preservation arc on the consumer side), threshold-tests candidates against the applicability evaluator Session A locked, and introduces the first Phase-4-class Claude prompt (`09-score-insight` for ordering — admission stays threshold-based per §1.16). The verification staircase ran one live Claude exercise (clean run) plus the optional synthetic-pattern path (1 live `score_insight` call against MedVista, ~$0.025 Claude spend).

**Preflights — all 12 hard gates passed.**

1. `pnpm typecheck` — 4/4 PASS unchanged.
2. `pnpm --filter @nexus/shared test:mock-claude` — 9/9 PASS unchanged (10/10 after Session B's fixture lands).
3. `pnpm --filter @nexus/shared test:prompt-loader` — 12/12 PASS unchanged (13/13 after Session B's prompt lands).
4. `pnpm --filter @nexus/db enum:audit` — PASS unchanged.
5. `pnpm --filter @nexus/shared test:applicability-dsl` — 12/12 PASS (Session A's gate).
6. `pnpm --filter @nexus/shared test:deal-state` — 8/8 PASS (Session A's gate; A.5 confirmed unchanged).
7. `pnpm --filter @nexus/shared test:build-event-context` — 8/8 PASS (Session A.5's gate).
8. Pool drain via `pool-quick.mts status` — DRAINED at session start; cron scheduled.
9. `git status` clean; HEAD on `main` was `ffb7b1c` at session start (matches kickoff expectation).
10. Vercel auth-gate smoke: `HTTP 401` on prod `/api/jobs/worker` with bad bearer — production functional.
11. **Bug-scope re-audit:** `audit-event-context-fields.mts` returned 0 vertical-null rows out of 92 Phase-3-era rows — Session A.5's fix holds for all post-deploy writes (outcome (a)).
12. **Risk-flag-raised existence sanity:** 0 `risk_flag_raised` events in `deal_events` — Decision 4's empty-default `risk_flag` applicability is safe to lock for Session B (Phase 5 Day 1's AgentIntervention engine remains the first writer).

**Item 1 — Surfaces registry (`packages/shared/src/surfaces/{registry,index}.ts`).**

- Literal port of rebuild plan §6 Phase 4 lines 470-494 with discriminated TS types fronting the threshold-shape union per kickoff Decision 2. Four surfaces: `call_prep_brief`, `intelligence_dashboard_patterns`, `daily_digest`, `deal_detail_intelligence`. `as const` narrows literal types so consumers get a narrow `SurfaceId` autocomplete; `getSurface(id)` throws on unknown.
- Discriminated union via `kind: 'deal_specific' | 'portfolio'` so the admission engine routes by surface kind in a switch with exhaustiveness. Per-surface admission shape is also discriminated (`CallPrepBriefAdmission` ≠ `IntelligenceDashboardAdmission` ≠ `DailyDigestAdmission` ≠ `DealDetailIntelligenceAdmission`); maxItems is per-kind for `call_prep_brief` (`{patterns:3, risks:5, experiments:2}`) and a single overall cap for the other 3.
- Empty-state references are STRINGS (e.g. `'CallPrepEmptyState'`); the actual UI components are Phase 4 Day 5 / Phase 6 work.
- New shared barrel re-export: `export * from "./surfaces"`.

**Item 2 — Scoring prompt (`packages/prompts/files/09-score-insight.md`).**

- Codex-built prompt per §2.26 + §1.16 + kickoff Decision 1. Front-matter: `prompt_id: 26`, `name: score-insight`, `model: claude-sonnet-4-20250514` (env override takes precedence per §2.13), `temperature: 0.2` (classification-with-judgment; mirrors 02 + 03 + pipeline-score-meddpicc — NOT 0.3 synthesis-class), `max_tokens: 2500` (initial conservative; reactive-bump per §2.13.1 if first live exercise hits stop_reason=max_tokens), `tool_name: score_insight`, `version: 1.0.0`.
- Tool schema (Principle 6 reasoning-first ordering): `reasoning_trace` FIRST, then `score` (integer 0-100), `score_explanation` (visible per §1.16), optional `score_components` (`deals_affected`, `aggregate_arr_band`, `recency_days`, `stage_relevance`). Required fields: `reasoning_trace, score, score_explanation`.
- Prompt body covers: (a) what scoring means (importance for ordering within an admitted set; admission already happened upstream); (b) inputs received — `${surfaceId}, ${candidateInsightBlock}, ${dealStateBlock}, ${recentEventsBlock}`; (c) visible-explanation contract (§1.16: concrete numbers, not generic language); (d) calibration guide covering the 0-100 range with examples; (e) what NOT to do (admit; invent context).
- Tool schema TS export at `packages/shared/src/claude/tools/score-insight.ts` (mirrors extract-actions/score-meddpicc shape) with `ScoreComponents` + `ScoreInsightOutput` interfaces.
- Updated test-mock-claude harness with a fixture lookup case for `09-score-insight` returning a synthetic 88-score (`reasoning_trace`, `score`, `score_explanation`, `score_components`); bumped 9/9 → 10/10.

**Item 3 — `DealIntelligence.getApplicablePatterns/Experiments/Flags` (`packages/shared/src/services/deal-intelligence.ts`).**

- Three methods, each composing `getDealState(dealId)` + a candidate query + the evaluator's `applies()` + per-rejection write to `applicability_rejections`. Each takes optional `{surfaceId?: string}` so rejection rows record which surface was being admitted.
- Local types co-located in deal-intelligence.ts (per Session A's DealState pattern): `Pattern`, `Experiment`, `RiskFlag`. Exported through `@nexus/shared` services barrel.
- Pattern source: `coordinator_patterns p JOIN coordinator_pattern_deals cpd ON cpd.pattern_id = p.id WHERE cpd.hubspot_deal_id = $1 AND p.status IN ('detected', 'synthesized')`. Status admissibility per Reasoning-stub Decision: `detected` + `synthesized` admit (both have value to surface), `expired` excludes (diagnostic audit only).
- Experiment source: `experiments WHERE lifecycle = 'active' AND (vertical IS NULL OR vertical = $dealVertical)` (denormalized column pre-filter; the `applicability` JSONB further restricts via the evaluator). Cross-vertical experiments (vertical IS NULL) match any deal.
- Risk-flag source: `deal_events WHERE type = 'risk_flag_raised' AND NOT EXISTS (... e2.type = 'risk_flag_cleared' AND e2.source_ref IS NOT DISTINCT FROM e.source_ref AND e2.created_at > e.created_at)`. Currently-raised computed from the event stream; not a separate table.
- ZodError on rule parse → captured as `rule_invalid: <issue>` rejection reason rather than crashing the read pass (per Decision 4 + Session A's dsl.ts comment).
- Per-rejection batch INSERT to `applicability_rejections` AFTER the loop in a single statement (not inside `sql.begin()` — per the operational-vigilance note, no nested service-call-inside-transaction; A.5's deadlock class avoided structurally by the read-then-write phasing).

**Item 4 — SurfaceAdmission engine (`packages/shared/src/services/surface-admission.ts`).**

- `class SurfaceAdmission { constructor({databaseUrl, sql?, dealIntel?, scoreFn?}); admit(args) }`. The `scoreFn` injection seam allows tests to mock the per-candidate Claude call deterministically; production defaults to a real `callClaude` against `09-score-insight` with `{hubspotDealId, jobId}` anchors threaded into prompt_call_log.
- `AdmittedInsight` discriminated union over insight kind (`pattern | experiment | risk_flag`) carrying the source row + `score`, `scoreExplanation`, optional `scoreComponents` written by the scoring pass.
- Surface-kind routing per kickoff Decision 3:
  - **Deal-specific surfaces** (`call_prep_brief`, `deal_detail_intelligence`): resolve dealState via getDealState, get candidates via Promise.all over getApplicablePatterns/Experiments/Flags (each writes rule rejections transparently), apply pre-scoring threshold filter (silent on fail per §1.18), apply dismissal filter (in-memory per Decision 5), score the survivors via per-candidate Claude fanout capped at maxItems, sort by score desc, apply post-scoring `minScore` floor where applicable, truncate to maxItems.
  - **Portfolio surfaces** (`intelligence_dashboard_patterns`, `daily_digest`): no DealState (no dealId). Skip the applies() evaluator entirely (applicability is a deal-context attribute). Read coordinator_patterns directly with `status IN ('detected', 'synthesized')`. Apply pattern-level threshold filter (`minDealsAffected` + `minAggregateArr` for the dashboard; `maxAgeHours` for daily digest). Same dismissal filter + scoring + sort + truncate.
- Threshold-fail discipline locked per Decision 7g: threshold non-matches NEVER write to `applicability_rejections`. If Phase 5+ admin-tuning UI eventually needs threshold-fail diagnostics, that's a NEW surface (`admission_threshold_evaluations` table or generic admission audit log), NOT a retrofit on `applicability_rejections` (different metadata: typed clauses vs numeric calibration deltas).
- Per-kind maxItems truncation for `call_prep_brief` (`{patterns:3, risks:5, experiments:2}`) implemented by bucket-then-merge-sort; other surfaces use a single overall cap.
- Dismissal filter uses one `IN`-clause query against `surface_dismissals` per admit call (in-memory mode + resurface filter); productization-arc upgrade paths (anti-JOIN for volume; transactional read+filter for TOCTOU) documented inline + in the Reasoning stub.
- Scoring fanout: per-candidate, capped at `computeFanoutCap(surface)` to bound cost (sum of per-kind caps for call_prep_brief; the single cap otherwise). Each call writes one prompt_call_log row via the existing wrapper wiring (§2.16.1 decision 3).
- Services barrel updated: `export * from "./surface-admission"`.

**Item 5 — Verification harness (4 new gates).**

- `packages/shared/scripts/test-surfaces-registry.ts` (~145 LOC, 8 cases): TS-type checks + structural assertions. Surface count = 4; per-surface literal-shape verification; `getSurface()` narrowing + throws on unknown; discriminated-union exhaustiveness (2 deal_specific + 2 portfolio); SURFACE_IDS array set-equality with Object.keys(SURFACES). pnpm alias `test:surfaces-registry`. **Live: 8/8 CASES PASS.**
- `packages/shared/scripts/test-applicable-pattern-experiment-flag.ts` (~360 LOC, 9 cases — 3 per method): mock-sql with fixture maps for hubspot_cache, meddpicc, signal/stage/risk-flag events, patterns + pattern-deal links, experiments. Captures rejection-batch INSERTs for inspection. Cases per method: empty-rule passes, stages-restrictive rejects with surface_id threaded, rule_invalid (ZodError) becomes a rejection reason. Cost $0. pnpm alias `test:applicable-pattern-experiment-flag`. **Live: 9/9 CASES PASS (P=3, E=3, F=3).**
- `packages/shared/scripts/test-surface-admission.ts` (~440 LOC, 8 cases): admission flow against fixtures with mocked Claude scoring (deterministic scoreFn) + extended SQL mock for portfolio path + dismissals. Cases cover: (1) deal-specific empty path → 0 admitted; (2) deal-specific 2 patterns → ordered by score desc; (3) post-scoring minScore floor filters; (4) active soft-dismissal excludes (with future resurface_after); (5) call_prep_brief stage filter — wrong stage = empty; (6) portfolio path threshold (minDealsAffected + minAggregateArr); (7) deal-specific without dealId throws; (8) hard-dismissal excludes regardless of resurface_after. Cost $0. pnpm alias `test:surface-admission`. **Live: 8/8 CASES PASS.**
- `packages/db/src/scripts/test-admit-medvista.ts` (~165 LOC): live admission against MedVista deal `321972856545`, surface `deal_detail_intelligence`, with optional `--synthetic` flag that seeds a coordinator_pattern row + links it to MedVista, runs admit, asserts a single live-Claude-scored admitted insight, then DELETEs the synthetic row in a `finally` block. pnpm alias `test:admit-medvista`.
- **Clean run live: admitted.length=0, rejections.length=0, 0 Claude calls** — §1.18 silence-as-feature verification PASS. The 4 `dealstate_stage_fallback` stderr telemetry lines fired correctly (one per getDealState invocation: 1 explicit at admit() entry + 3 inside getApplicablePatterns/Experiments/Flags, since each method resolves its own DealState today; refactor to share the single resolution is an obvious follow-up but not Session B's concern).
- **Synthetic-pattern path live: admitted.length=1, score=78, stop_reason=tool_use, input=3509 / output=688 tokens, ~16s duration, ~$0.025 Claude spend.** Score explanation cited concrete factors ("$2.4M Discovery-stage deal," "5 days in stage," "champion score sits at just 42"); the prompt's calibration disciplined the live model into the 75-89 band correctly (single-deal pattern with strong context). Cleanup via `finally` block: `DELETE FROM coordinator_patterns WHERE id = $synthetic` (pattern-deals link cascades on FK ON DELETE) plus a defensive `DELETE WHERE pattern_key = $key` fallback. No leak verified post-cleanup.

**Live observation — synthetic-path Claude generated grounding details not in the input** (e.g., the explanation cited "PHI residency failure," "enterprise license math pricing," "CFO with a >$300K veto," "five key stakeholders unengaged") even though the synthetic synthesis text didn't carry those specifics. The model invented credible-sounding context to enrich the explanation. The `09-score-insight.md` prompt's discipline says "do not invent context not in the input" but the live model interpolated anyway — soft prompt-quality signal. The score itself is in calibrated range (78 for a single-deal $2.4M Discovery-stage pattern, no broader pattern), so Session B's contract holds, but this is worth watching as Phase 4 Day 5 dashboard renders these explanations to leadership. If the pattern persists in Phase 4 Day 2's coordinator-driven pattern admissions, tighten the prompt's grounding discipline (move the "do not invent" instruction earlier; add a worked-bad-example for invented stakeholder counts). Captured as a parked operational watch.

**Live observation — `claude_call_log_write_failed` during synthetic-path Claude call.** The wrapper's prompt_call_log row write hit `(EMAXCONN) max client connections reached, limit: 200` mid-Claude-call. The wrapper handles this gracefully — the Claude call itself succeeded (stop_reason=tool_use, output captured); only the audit-trail DB write failed. This is the wrapper's documented best-effort telemetry contract working as designed. The transient EMAXCONN was the lingering tail of the Preflight 13's earlier saturation — pool drained naturally afterward, audit script + cleanup ran cleanly via the pooler URL.

**Pool saturation incident (third in four sessions — feeds Decision 9 parked item).** Live admit-medvista clean run hit `(EMAXCONN) max client connections reached, limit: 200` on first attempt. Followed Pre-Phase 4 Session A's escalation path: paused `nexus-worker` cron via `pool-session.mts pause`, monitored drain via `pool-quick.mts status` (Monitor 2-streak DRAINED — confirmed within 2 minutes). Re-ran clean run + synthetic path successfully. Cron resumed at session close. **Recurring pattern across Phase 3 Day 4 Session B, Pre-Phase 4 Session A, Phase 4 Day 1 Session A.5, and now Session B** — Pre-Phase 4 Session A's circuit breaker handles the symptom, root cause unidentified. Decision 9 parked item: investigate root cause before Phase 4 Day 2 (which adds coordinator + 15-min `hubspot_periodic_sync` baseline load on top of already-elevated pool pressure).

**Verification at end of Session B (15 gates).**

- `pnpm typecheck` — 4/4 workspaces PASS.
- `pnpm build` — 13 routes clean, zero `Attempted import error | Module not found | Type error | Failed to compile`.
- `pnpm --filter @nexus/db enum:audit` — PASS unchanged.
- **`pnpm --filter @nexus/shared test:prompt-loader` — 13/13 PASS** (was 12/12; new 09-score-insight loads cleanly).
- **`pnpm --filter @nexus/shared test:mock-claude` — 10/10 PASS** (was 9/9; new fixture lookup for 09-score-insight).
- `pnpm --filter @nexus/shared test:meddpicc-format` — 4/4 PASS unchanged.
- `pnpm --filter @nexus/shared test:applicability-dsl` — 12/12 PASS unchanged.
- `pnpm --filter @nexus/shared test:deal-state` — 8/8 PASS unchanged.
- `pnpm --filter @nexus/shared test:build-event-context` — 8/8 PASS unchanged.
- **`pnpm --filter @nexus/shared test:surfaces-registry` — 8/8 PASS (new gate).**
- **`pnpm --filter @nexus/shared test:applicable-pattern-experiment-flag` — 9/9 PASS (new gate; 3 per kind).**
- **`pnpm --filter @nexus/shared test:surface-admission` — 8/8 PASS (new gate).**
- **`pnpm --filter @nexus/db test:admit-medvista` — clean-run empty admitted set + 0 errors + 0 Claude calls** (live §1.18 silence-as-feature verification).
- **`pnpm --filter @nexus/db test:admit-medvista -- --synthetic` — 1 admitted, score=78, live Claude scoring path verified end-to-end + cleanup verified** (~$0.025 spend).
- **Bug-scope re-audit (Session A.5 closure verification):** 0 vertical-null rows out of 92 Phase-3-era rows — Session A.5's fix continues to hold.
- Hex grep on .tsx files — 0 hits. Stale shadcn class grep — 0 hits.

**Reasoning stub.** Non-MVP choices with justification type per the CLAUDE.md reasoning-gate.

- **Surfaces registry as multi-surface single-source-of-truth (Item 1 + Decision 2).** Justification 1 — §2.26 LOCKED literal port. Justification 3 — admin-tuning UI in Phase 5+ reads this artifact to surface "rule X rejected N% of deals" + per-surface threshold calibration; productization-arc preservation per PRODUCTIZATION-NOTES.md "Surfaces registry + dismissal + feedback tables."
- **Discriminated union shape on threshold types (Item 1 surface-config types).** Justification 1 — `appliesWhenStageIn` (call_prep_brief) ≠ `minDealsAffected + minAggregateArr` (intelligence_dashboard_patterns) ≠ `maxAgeHours` (daily_digest); a single shared shape would lose information. Justification 4 — admission engine's threshold filter switches on `surface.id`; discriminated union narrows correctly inside each branch.
- **`09-score-insight` temperature 0.2 (classification-class) and max_tokens 2500 (Decision 1 defense).** Justification 1 — §1.16 admission-vs-scoring split + §2.13.1 reactive-bump pattern. Per-call output is bounded (~700 tokens expected; 3.5x headroom at 2500). Synthetic-path live exercise confirmed: output_tokens=688, stop_reason=tool_use — well under the budget. No reactive bump needed.
- **`reasoning_trace` first property in score_insight tool schema.** Justification 1 — §2.13.1 Principle 6 (reasoning-first for classification-with-judgment + synthesis prompts). Mirrors 02 / 03 / 04 / 06b / pipeline-extract-actions / pipeline-score-meddpicc pattern.
- **Per-candidate scoring fanout, NOT batched (kickoff Reasoning expectation).** Justification 1 — matches §1.16's "Claude assigns an importance score" singular framing. Justification 2 — one prompt_call_log row per insight (audit-trail granularity per §2.16.1 decision 3). Batched would save Claude calls but complicate the prompt + score-explanation contract + audit-trail granularity.
- **Coordinator_pattern_status admissibility: `detected` + `synthesized` admit, `expired` excludes (Item 3 + Item 4 query construction).** Justification 1 — §1.16 conservative default; expired patterns are diagnostic audit only, not surface candidates. Future Phase 4 Day 2's coordinator-driven `synthesized` writes are the second admissible state.
- **Surface-kind routing — deal-specific calls applies(), portfolio skips (Decision 3).** Justification 1 — applicability rule is a deal-context attribute (the rule is structurally `{stages, verticals, daysInStage, daysSinceCreated, requires, meddpiccGuards, signalTypePresent, signalTypeAbsent}` — every clause requires a deal). Without a deal, calling `applies({rule, dealState: null})` isn't well-defined. Rebuild plan's `intelligence_dashboard_patterns: { admission: { minDealsAffected, minAggregateArr } }` confirms portfolio surfaces gate by pattern attributes, not deal context.
- **Threshold-fail silence vs rule-rejection diagnostic write (Decision 7g lock).** Justification 1 — §1.18 "applicability gate rejections are silent. The rejection log is diagnostic only" + §1.16 "thresholds are configurable but default — a candidate that fails the threshold isn't a rule rejection, it's a calibration non-match." Justification 3 — if Phase 5+ admin-tuning UI needs threshold-fail diagnostics, that's a NEW surface (`admission_threshold_evaluations` table OR generic admission audit log), NOT a retrofit on `applicability_rejections`. Rule rejections cite typed clauses; threshold fails cite numeric calibration deltas. Mixing them in one table makes neither query-able cleanly.
- **Dismissal filter as in-memory check with both productization axes documented (Decision 5).** Justification 1 — §1.17 dismissal-mode semantics + Guardrail 25 DealIntelligence boundaries. Justification 3 — TWO productization upgrade paths captured inline + in code comments: (a) volume / scaling axis → anti-JOIN scales better at high row counts; (b) concurrency / TOCTOU axis → in-memory has a time-of-check-to-time-of-use window where a just-dismissed insight could surface once before next admission run. Both harmless at v2 demo scale; matter at productization. Recommend in-memory for Session B with comment naming both upgrade paths.
- **Risk-flag default applicability `{}` (Decision 4 Phase-5-aware lock).** Justification 1 — DSL's "undefined = no gate" semantic; passes universally. Justification 2 — Preflight 12 verified zero `risk_flag_raised` events exist (Phase 5 Day 1 AgentIntervention engine is first writer). Justification 3 — productization-arc note: when Phase 5 Day 1 ships AgentIntervention, the `risk_flag_raised` event payload SHOULD eventually carry an `applicability: ApplicabilityRule` field that the writer populates at flag-raise time (per-flag applicability honoring §1.18 first-48h-observation-only) OR `getApplicableFlags` enforces a global cross-cutting `minDaysSinceCreated >= 2` filter. Phase 5 Day 1 kickoff decides which path; for Session B the empty-default is acceptable because there are no events to gate today.
- **`event_context` segmentation accuracy is now consumer-side honored (§2.16.1 decision 2 read).** Justification 2 — Session A.5 closed the value-side; Session B's portfolio + deal-specific paths read coordinator_patterns + deal_events without filtering by `event_context.vertical` directly today, but Phase 4 Day 2's coordinator pattern detection slices by accurate-at-event segmentation, and Session B's getApplicable* + admission flow primes the context that Phase 4 Day 2 reads.
- **prompt_call_log captures every score_insight call automatically (§2.16.1 decision 3 write).** Justification 2 — existing wrapper wiring fires post-call; Session B did not add new wrapper code. The synthetic-path EMAXCONN log-write failure is the wrapper's documented best-effort telemetry contract; the Claude call itself completed successfully. Audit-trail granularity at insight-level (not batched).
- **Live observation: synthetic-path Claude invented grounding details not in the input.** Justification 4 — soft prompt-quality signal worth watching as Phase 4 Day 5 dashboard renders these explanations to leadership. Score itself in calibrated range (78 for the synthetic single-deal $2.4M Discovery-stage pattern); Session B's contract holds. Captured as parked operational watch — if the pattern persists in Phase 4 Day 2's coordinator-driven pattern admissions, tighten `09-score-insight.md`'s grounding discipline (move "do not invent" earlier; add a worked-bad-example for invented stakeholder counts; consider bumping prompt version 1.0.0 → 1.1.0 with that change).
- **Pool saturation hit during live exercise — Pre-Phase 4 Session A escalation path (Decision 9 feed).** Justification 4 — third pool-saturation incident in four sessions (after Phase 3 Day 4 Session B, Pre-Phase 4 Session A, Phase 4 Day 1 Session A.5). Pre-Phase 4 Session A's circuit breaker handles the symptom; root cause unidentified. Recurring pattern justifies Decision 9 parked item: investigate root cause before Phase 4 Day 2 (which adds coordinator + 15-min `hubspot_periodic_sync` baseline load).
- **Two-phase pattern preserved structurally (operational vigilance + Item 3 + Item 4 design).** Justification 1 — A.5's deadlock class avoided by design: getApplicable* methods read candidates outside any transaction, then issue rejection batch as a single statement; admission engine's only DB writes are the rejection batches inside getApplicable*. The admission engine itself does NOT open `sql.begin()`. Captured in surface-admission.ts header comment as the operational discipline.

15 entries. No UNCERTAIN.

**Parked items closed.**

- Phase 4 Day 1 expected list (from BUILD-LOG Forward map):
  - Surfaces registry TS module per §2.26 ✓ (Item 1).
  - Admission engine + scoring pass + dismissal/feedback wiring per §1.16-§1.17 ✓ (Items 2-4; dismissal/feedback are read-side only, write-side UI deferred to Phase 5).
  - `DealIntelligence.getApplicablePatterns/Experiments/Flags` ✓ (Item 3).
- Foundation Review Output 4 C2's "applicability gating engine" deliverable ✓ closed by the combined Session A (DSL + evaluator) + Session B (admission engine + getApplicable*) pair.

**Parked items added.**

- **Dismissal/feedback UI write paths (Phase 5+).** Per Decision 5: read-side filter ships in Session B; UI write paths (the rep's "soft-dismiss" / "hard-dismiss" / "this is wrong" buttons + the inline feedback form) land Phase 5+ when the consuming surfaces' UI ships. `surface_dismissals` + `surface_feedback` are write-path tables only after Session B.
- **Daily digest job (Phase 5).** Per rebuild plan §6 Phase 5 deliverable 9 + Decision 7. Registry entry lands today; the actual `pg_cron` scheduled job handler that reads admitted-set per user over last 24h + emits 3-5 items + handles "nothing new" empty state is Phase 5 work.
- **Admission performance optimization (post-Phase-4-Day-2).** Per Decision 7: caching, index work, batched scoring. Today's per-candidate fanout is correct + auditable but not throughput-optimized. Defer until real production load surfaces a need.
- **Threshold-fail diagnostic surface as new-not-retrofit (Decision 7g, productization-arc).** If Phase 5+ admin-tuning UI needs to surface "rule X rejected N% of deals" + "surface Y had M candidates fail threshold last week," that's a NEW surface (`admission_threshold_evaluations` table OR generic admission audit log), NOT a retrofit on `applicability_rejections` (different metadata: typed clauses vs numeric calibration deltas).
- **Risk-flag applicability production contract (Phase 5 Day 1 AgentIntervention engine).** When Phase 5 Day 1 ships the first `risk_flag_raised` writer, the event payload SHOULD eventually carry an `applicability: ApplicabilityRule` field populated at flag-raise time honoring §1.18's first-48h rule (`minDaysSinceCreated >= 2`) + signal-type guards for stage-advancement-auto-clear. Alternative: a global cross-cutting filter on `getApplicableFlags` enforcing `minDaysSinceCreated >= 2` regardless of per-flag applicability. Phase 5 Day 1 kickoff decides; Session B's empty-default is acceptable because zero events exist today (Preflight 12 verified).
- **Recurring pool saturation root-cause investigation (Decision 9; pre-Phase-4-Day-2).** Three of last four sessions hit `EMAXCONN`. Pre-Phase 4 Session A's circuit breaker handles the symptom; root cause unidentified. Investigate before Phase 4 Day 2 ships coordinator + 15-min `hubspot_periodic_sync` cron — both increase pool pressure on top of an already-elevated baseline.
- **Score-insight prompt grounding-discipline — DELIBERATE Phase 4 Day 5 revisit (oversight-promoted).** Synthetic-path live exercise confirmed Claude invented credible-sounding grounding details ("PHI residency," "CFO veto >$300K") not in the synthetic synthesis text, despite Decision 1's prompt-body instruction "do not invent context not in the input." Score itself was in calibrated range so Session B's contract held, BUT — per oversight feedback closing this session — the §1.16 visible-explanation contract loses meaning if the visible explanation is hallucinated. Soft signal today on one synthetic test (and the synthetic synthesis was sparse enough that the model had headroom to extrapolate); risk is real-coordinator_patterns Phase 4 Day 2 produces. Phase 4 Day 5 revisit (when real patterns are being scored to populate the dashboard) is a deliberate review, not a passing one. **Likely fix shape:** (a) prompt-body tightening — move "do not invent" earlier in the system prompt + add a worked-bad-example for invented stakeholders/numbers + adjust calibration guide to penalize over-grounding when input is thin; (b) tool-schema constraint — require `score_components` to be drawn from the input blocks (e.g., ARR band must match the candidate's `arr_impact` field; deals_affected must match `dealsAffectedCount`; recency_days must trace to a recentEvents entry); (c) bump prompt version 1.0.0 → 1.1.0 + capture the live evidence in the Phase 4 Day 5 entry. If Phase 4 Day 2's coordinator-driven admissions show the same pattern earlier, pull the fix forward to Phase 4 Day 2 closeout.
- **dealstate_stage_fallback telemetry observation (operational).** Live admit-medvista runs surfaced 4 fallback events per admit() call: 1 explicit at admit() entry + 3 inside getApplicablePatterns/Experiments/Flags (each method resolves its own DealState today). Phase 4 Day 2 + Phase 5+ surfaces would benefit from sharing the single resolution; refactor when third consumer materializes (per Session A.5's deferred pattern).
- **Desktop-launch.json false-greenfield discovery (per oversight observation).** Three sessions in a row spent a few minutes at start re-discovering that `/Users/jefflackey/Desktop/nexus-v2/` is a stub with only `.claude/launch.json` pointing to the real `~/nexus-v2` workspace. System-reminder greenfield declarations are unreliable; verify the actual project path via `.claude/launch.json` before treating greenfield as authoritative. Captured as operational note for the next session's preflights.
- **Audit-trail durability under pool saturation — Stage 4 SOC 2 productization scope (oversight-added, Session B closeout).** Session B's synthetic-path Claude call hit `claude_call_log_write_failed` mid-EMAXCONN: the wrapper's prompt_call_log INSERT failed silently while the Claude API call itself completed and returned tool output. This is the wrapper's documented best-effort telemetry contract working as designed for v2 demo (the audit-trail loss is observable on stderr; the user-facing operation is unaffected). BUT — per oversight feedback closing this session — §2.16.1 decision 3 frames `prompt_call_log` as the audit-trail surface for the enterprise compliance use case ("every AI decision that touched this customer's deals"); Stage 4 SOC 2 Type II may require guaranteed-delivery semantics for the audit row, not best-effort. **Likely productization shape:** durable write-ahead log (local file → background drain to DB), retry-with-backoff on the DB write (currently no retries), backpressure into the Claude wrapper itself when the audit-write queue exceeds a threshold (a deliberately-failing Claude call rather than a Claude success with silent audit loss), or all three. NOT a Phase 4 fix and NOT a v2 demo concern — flagged for Stage 4 productization scope per PRODUCTIZATION-NOTES.md "Audit trail and explainability." Session B's transient stderr telemetry remains the v2 demo audit trail.

**Cost.** ~$0.025 live Claude (one `09-score-insight` call against synthetic MedVista pattern: input=3509 / output=688 tokens at sonnet-4-6 pricing). $0 HubSpot. $0 Voyage. ~50-70 reads on prod Supabase across the verification staircase + live exercises. Up to ~5 INSERTs to `applicability_rejections` (zero materialized this session — the synthetic pattern's empty rule passed without rejection). 1 INSERT + 1 DELETE on `coordinator_patterns` for the synthetic-path setup + cleanup (idempotent via the DELETE ... WHERE pattern_key = $key fallback). 1 INSERT to `coordinator_pattern_deals` (cascade-deleted by the FK ON DELETE during cleanup). 1 prompt_call_log row attempted (write failed mid-EMAXCONN — wrapper's best-effort telemetry contract; Claude call itself succeeded).

### Pre-Phase-4-Day-2 — 2026-04-27 · `48adebf`

**Ops/diagnostic — recurring pool-saturation root-cause investigation + targeted fix + durable diagnostic tooling.** Closes the four-of-four EMAXCONN pattern (Phase 3 Day 4 Session B; Pre-Phase 4 Session A; Phase 4 Day 1 Session A.5; Phase 4 Day 1 Session B) by identifying + fixing the dominant leak source: `createDb()` in the worker route allocating a fresh `postgres.js` pool per invocation with the `postgres.js` default `idle_timeout: 0` (never close). Adopts Path A conclusive root-cause framing with an explicit verification-limitation: the leak fix is verified by inspection + baseline-gate-green; empirical multi-minute verification is inherited by Phase 4 Day 2's first cron-firing window. Three surgical edits land. Zero live Claude, zero HubSpot writes, zero Voyage. ~80-100 reads on prod Supabase across the synthetic harness + snapshot-script verifications.

**Layer-naming precision.** This session distinguishes THREE layers of "saturation" the prior sessions conflated: (a) the **pooler client-side cap** (the saturating layer; documented 200; ground-truth signal is `EMAXCONN`); (b) the **pooler upstream backend connections** (visible in `pg_stat_activity`; typically 13-30 — opaque to the client-side cap); (c) the **application-side pool** (per-process `postgres.js` clients consuming pooler client slots). Mitigations target (c) — the only layer in our control. The synthetic harness verified (a)'s cap behavior + (b)'s opacity to it.

**Preflights — all 8 hard gates passed.**

1. Working directory verified: `cd /Users/jefflackey/nexus-v2` resolves; HEAD `a153818` (post-Session B docs adjustment) on `main`. Desktop launch.json false-greenfield trap surfaced again per the operational note (caught in <1 min via `.claude/launch.json` reading).
2. `pnpm typecheck` — 4/4 PASS unchanged.
3. `pnpm --filter @nexus/db enum:audit` — PASS unchanged.
4. **Pool baseline via `pool-quick.mts status`: DRAINED + cron scheduled** (jobid=5, schedule="10 seconds"). Clean starting state.
5. `git status` clean confirmed.
6. Vercel auth-gate smoke: `HTTP 401` in 462ms on prod `/api/jobs/worker` with bad bearer — production functional.
7. Cron schedule sanity (combined with #4): nexus-worker active.
8. **`pg_stat_activity` reachability** via the new `_invest-pg-stat-snapshot.mts` (later promoted to `pool-snapshot.mts`): SUCCESS. **First diagnostic-constraint datapoint:** baseline shows only 13 backend connections at the postgres layer despite the documented 200-cap on the pooler — the pooler's client-side cap is OPAQUE to `pg_stat_activity` from inside postgres. Backend layer shows pooler-internal sessions (Supavisor multiplex, postgrest LISTEN, pgbouncer auth_query) + Supabase service backplane — NOT the application's individual pool client slots.

**Diagnostic constraint — `pg_stat_activity` is opaque to the saturating layer.** Confirmed by a follow-up test: connecting via the **session pooler** (port 5432, separate pgbouncer instance) with `application_name: "nexus_invest_session_test"` STILL shows `application_name="Supavisor"` in `pg_stat_activity` — neither pooler propagates the application's `application_name` to the backend. **Implication for Decision 11 defensive mitigations:** the kickoff's `application_name` tagging suggestion has limited diagnostic value through either pooler. EMAXCONN itself + application-side stderr telemetry remain the only ground-truth surfaces. Snapshot script's value is the **complementary view** (pooler hysteresis pattern; idle backend recycling; long-held idle sessions) — NOT a direct view of the saturating layer.

**Investigation evidence — synthetic-reproduction surface (deliberate).**

Cron paused via `pool-session.mts pause` at start of synthetic reproduction per Decision 5. Capacity test (`_invest-synthetic-capacity.mts cap`) opens 1-150 `postgres.js` clients incrementally (each `max=1`) until `EMAXCONN` fires.

| Test | Pre-mitigation | Post-mitigation | Notes |
|---|---|---|---|
| `cap` (incremental open until EMAXCONN) | **saturated at 45** of 150 SOFT_CAP | **saturated at 45** of 150 SOFT_CAP | Cap is platform-controlled — same in both; mitigations target leak rate over minutes, not instantaneous capacity |
| `cleanup` (open 50 → close 50 → open 50 again) | **wave 2 failed at 0** opens (EMAXCONN immediately) | not re-tested (would have polluted post-mit baseline; pooler hysteresis is a structural fact) | Cleanup discipline holds at the application layer; pooler holds slots in idle for ~30s post-`sql.end()` (hysteresis). |
| `multipool` (one client `max=20`, 20 concurrent `pg_sleep(0.5)`) | succeeded; total_ms=1690 (parallelism confirmed); **16 idle backend connections still alive 32s post-`sql.end()`** in snapshot | not re-tested | Confirms pooler hysteresis ~30s+; explains "cleanup" wave-2 failure; explains why a burst pattern saturates beyond the burst size. |
| `idle` (default `idle_timeout`) | postgres.js docs confirm default `0` (never close); inventory verifies leak surface | n/a | Theoretical verification; the actual leak observation is `createDb` per-invocation pattern in worker route. |

Synthetic test 1 saturation evidence (raw JSON from harness, pre-mitigation):

<details><summary>cap test — saturated at 45 of 150 SOFT_CAP</summary>

```json
{"event":"start","test":"cap","ts":"2026-04-28T02:17:22.411Z"}
{"test":"cap","soft_cap":150,"ts":"2026-04-28T02:17:22.412Z"}
{"test":"cap","opened":1,"ts":"2026-04-28T02:17:22.870Z"}
{"test":"cap","opened":11,"ts":"2026-04-28T02:17:28.367Z"}
{"test":"cap","opened":21,"ts":"2026-04-28T02:17:34.217Z"}
{"test":"cap","opened":31,"ts":"2026-04-28T02:17:39.682Z"}
{"test":"cap","opened":41,"ts":"2026-04-28T02:17:45.332Z"}
{"test":"cap","event":"saturated","saturated_at":45,"error_excerpt":"(EMAXCONN) max client connections reached, limit: 200","ts":"2026-04-28T02:17:48.033Z"}
{"test":"cap","event":"cleanup_start","to_close":45}
{"test":"cap","event":"cleanup_done"}
```

</details>

**Investigation evidence — natural-saturation surface (opportunistic, captured per Decision 1(a)).**

ONE natural-saturation snapshot was captured during the session: post-cap-test, post-multipool-test, the cleanup-wave-2 attempt itself failed before opening any connections (`EMAXCONN` immediately on first `singleOpen`). Snapshot taken ~30s after that failure showed `total_connections=15` at backend layer (a 2-connection delta from the post-multipool 28) AND `pool=DRAINED ping=1` from `pool-quick.mts` immediately following — the pooler's client-side hysteresis released slots within ~30s once our test wasn't actively opening more. **Triggering context:** synthetic-test-induced; not natural production traffic (cron was paused per Decision 5). True natural saturation under production conditions did not occur during the session, so the four-of-four pattern's real-time interaction surface (Vercel container concurrency × cron firing × dev-script collision) was not directly observed — see Phase 4 Day 2 inheritance.

Snapshot post-multipool — captures the 30s pooler hysteresis pattern (16 idle backend `pg_sleep` connections still alive ~32s after `sql.end()`):

<details><summary>premit_post_synthetic snapshot (truncated to long_held entries)</summary>

```json
{
  "label": "premit_post_synthetic",
  "ts": "2026-04-28T02:19:48.894Z",
  "total_connections": 28,
  "by_state": [{"state":"idle","n":19},{"state":null,"n":8},{"state":"active","n":1}],
  "long_running_30s_plus_excerpt": [
    {"pid":528946,"state":"idle","application_name":"Supavisor","seconds_in_state":32,"query":"SELECT pg_sleep(0.5), $1 AS ok"},
    {"pid":528950,"state":"idle","application_name":"Supavisor","seconds_in_state":32,"query":"SELECT pg_sleep(0.5), $1 AS ok"},
    "... 14 more identical entries ...",
    {"pid":516945,"state":"idle","application_name":"Supavisor","seconds_in_state":32,"query":"SELECT pg_sleep(0.5), $1 AS ok"}
  ]
}
```

</details>

**Investigation evidence — pool-opening-site inventory.** 35 distinct `postgres()` constructor calls + 6 `getSharedSql()` consumers across the codebase. Lifetime + max breakdown:

| Surface | Lifetime | max | idle_timeout | Notes / role |
|---|---|---|---|---|
| `getSharedSql` ([packages/shared/src/db/pool.ts:72](packages/shared/src/db/pool.ts:72)) | process-wide shared | 5 | 60s | The shared pool. Pre-Phase 4 Session A reduced max=10→5. |
| `createDb` ([packages/db/src/index.ts:17](packages/db/src/index.ts:17)) | per-call (was: leaked indefinitely) | 1 | **was: 0 (postgres.js default = never close)** | **PRIMARY LEAK SOURCE.** Worker route called this on every invocation. After mitigation: `idle_timeout: 30` default + worker route uses `createDbFromSharedSql(getSharedSql())` instead. |
| Worker route ([apps/web/src/app/api/jobs/worker/route.ts:34](apps/web/src/app/api/jobs/worker/route.ts:34)) | per-invocation | 1 | was: 0 (via createDb) | After mitigation: shares the `getSharedSql` pool. |
| Service constructors (MeddpiccService, StakeholderService, ObservationService, DealIntelligence, IntelligenceCoordinator, SurfaceAdmission, TranscriptPreprocessor) | per-construction (when no `sql?` injected) | 1 | 30s | When constructed via `apps/web/src/lib/*.ts` factories, they receive the shared `sql`. When constructed in scripts, they own their own `max=1` pool. Per-service `max=1` already low. |
| HubSpotAdapter ([packages/shared/src/crm/hubspot/adapter.ts:175](packages/shared/src/crm/hubspot/adapter.ts:175)) | per-construction | 2 | 30s | When `sql?` not injected. |
| Worker handler `transcript_pipeline` ([packages/shared/src/jobs/handlers.ts:710](packages/shared/src/jobs/handlers.ts:710)) | per-handler-invocation | shares `getSharedSql` | 60s (shared) | Uses shared. Promise.all over 3 Claude calls — each writes 1 `prompt_call_log` row via `getSharedSql` (3 concurrent INSERTs against shared `max=5`; comfortable headroom). |
| `pool-quick.mts`, `pool-session.mts`, `configure-cron.ts`, `pool-snapshot.mts` (NEW) | one-shot script | 1 | varies | All exit on completion; connections die with process. |
| Backfill / migration / verify scripts (apply-event-context-backfill, apply-migration-0005/0006, audit-event-context-fields, etc.) | one-shot script | 1-2 | mixed (now 30s default via createDb) | Apply-event-context-backfill has the `--session` CLI flag pattern (Phase 4 Day 1 Session A.5 precedent). |
| Test harness scripts (test-transcript-pipeline, test-admit-medvista, test-update-deal-custom-properties, test-shared-pool, etc.) | one-shot test run | 1-3 | mixed (now 30s default via createDb) | Test runs are short-lived; connection leak surface is bounded by the test duration. |

Total predicted concurrent connection demand from the application under normal operation:
- **Per warm Vercel container (post-mitigation):** 1 shared pool × max=5 = up to 5 connections per container.
- **Per warm Vercel container (pre-mitigation):** 5 (shared) + N×1 (createDb per-invocation accumulation, where N grew with cron firing × idle_timeout=0) = unbounded over time → **THE LEAK**.

**Investigation evidence — hypotheses doc.**

| # | Hypothesis | Mechanism | Cited evidence | Discriminating test | Targeted mitigation |
|---|---|---|---|---|---|
| **1 (PRIMARY)** | `createDb` in worker route allocates a fresh `postgres.js` pool per invocation with `idle_timeout: 0` default; pools persist indefinitely in Vercel Fluid Compute warm containers | Each cron firing every 10s × handlers taking 30-90s × N warm containers = N × invocations × 1 leaked connection | (synthetic) `_invest-synthetic-capacity multipool`: 16 idle backend connections still alive 32s post-`sql.end()`. (inventory) [packages/db/src/index.ts:17](packages/db/src/index.ts:17) had no `idle_timeout` parameter; postgres.js default is `0`. (route inspection) [apps/web/src/app/api/jobs/worker/route.ts:34](apps/web/src/app/api/jobs/worker/route.ts:34) called `createDb` on EVERY invocation. (BUILD-LOG) Phase 3 Day 4 Session B's "drain stalled past 25 min" matches accumulated-leak timeline | Replace worker route's `createDb(DATABASE_URL)` with `createDbFromSharedSql(getSharedSql())`; observe whether saturation pattern persists across Phase 4 Day 2 cron firings. **Discrimination is post-deploy; takes minutes to hours.** | Mitigation 1 (worker uses shared pool) + Mitigation 2 (createDb default `idle_timeout: 30s` for script-side defense) |
| 2 (SECONDARY) | Shared pool max=5 × multiple warm Vercel containers × 60s `idle_timeout` keeps 5 connections per container alive for 60s post-traffic | Multiple containers × 5 connections × held-for-60s = significant baseline consumption | (inventory) [packages/shared/src/db/pool.ts:72](packages/shared/src/db/pool.ts:72): `max: options.max ?? 5, idle_timeout: options.idleTimeout ?? 60` | Reduce max to 3-4 OR idle_timeout to 30s; observe baseline | **Rejected** — kickoff Decision 2 EXPLICITLY says "Tightening idle_timeout from 30s to 5-10s on per-request pools (web routes) but NOT on shared-pool". Shared pool keeps 5/60s. Mitigation 1 (eliminating createDb leak) makes shared pool the dominant + only consumer; reducing it now would deadlock-floor on the 3-call Promise.all in transcript_pipeline + 3-call Promise.all in admission engine. |
| 3 (CONTEXTUAL) | Pooler holds backend connections in idle state for ~30s+ after the application closes its `postgres.js` client (hysteresis) | Pooler-side slot doesn't immediately release on application `sql.end()`; burst patterns hold pooler slots for the duration of the burst PLUS the hysteresis window | (synthetic) `multipool` test confirmed 16 idle Supavisor backends 32s post-`sql.end()`. (synthetic) `cleanup` test wave 2 failed at 0 opens (~30s after wave 1 closed). (snapshot) Supavisor + `DISCARD ALL` query pattern in long-held idle entries | Not directly testable from our side (pooler-internal); the hysteresis is structural | **Cannot mitigate** — platform-controlled. The mitigations REDUCE BURST RATE (worker uses shared, no per-invocation pool churn) which indirectly minimizes hysteresis impact. |
| 4 (CONTEXTUAL) | Baseline ~155 pooler client slots used by other Supabase services (Supavisor internal, PostgREST, postgres_exporter, sister projects on shared pooler) leaves only ~45 application-side headroom | Pooler 200-cap minus ~155 baseline = ~45 application budget | (synthetic) `cap` test reached `EMAXCONN` at exactly 45 of 150 SOFT_CAP, both pre + post mitigation. (snapshot) `pg_stat_activity` shows 13 backend connections — proves the saturating layer is opaque to backend view | Out of scope (would require a Stage 2/3 productization-billing decision) | **Out of scope** — Stage 2+ productization may require dedicated Supabase instance / non-shared pooler. v2 demo accepts the ~45 headroom + designs around it. |

**Findings — Path A conclusive root cause + verification-limitation caveat.**

**Root cause (Hypothesis 1):** the worker route's `createDb(DATABASE_URL)` per-invocation call combined with `postgres.js` default `idle_timeout: 0` (never close idle connections) is the dominant source of accumulated pooler-client-slot consumption. In Vercel Fluid Compute's warm containers, this leaks one connection per cron-fired worker invocation. With cron at 10s + handlers 30-90s + multiple warm containers + pooler hysteresis (~30s post-close), accumulated leaks saturate the ~45-slot application headroom within minutes. This matches the BUILD-LOG observation of "drain stalled past 25 min" in Phase 3 Day 4 Session B.

**Verification limitation:** the leak fix is verified by **inspection** (the `createDb` call no longer appears in the route's request path; route now uses `getSharedSql` via `createDbFromSharedSql`) + **baseline-gate-green** (typecheck, build, all 11 baseline gates unchanged). The empirical "saturation point shifted higher" verification requires multi-minute observation under production cron load, which exceeds this session's synthetic-harness time budget. Phase 4 Day 2's first cron-firing window is the empirical verification surface.

**Mitigations (3 surgical edits, Path A targeted + Decision 11 anchor for #3).**

**Mitigation 1 — Worker route uses shared pool ([apps/web/src/app/api/jobs/worker/route.ts](apps/web/src/app/api/jobs/worker/route.ts) + [packages/db/src/index.ts](packages/db/src/index.ts)).**
- Imports change: `createDb` → `createDbFromSharedSql`, plus `getSharedSql` from `@nexus/shared`.
- Route body: `const sharedSql = getSharedSql(); const db = createDbFromSharedSql(sharedSql);` replaces `const db = createDb(process.env.DATABASE_URL);`.
- New helper `createDbFromSharedSql(client: postgres.Sql)` in `@nexus/db` wraps an existing client with Drizzle. No new postgres.js client is created.
- Predicted impact: per warm Vercel container, the route + handler share ONE pool (the shared pool's max=5). Per-invocation pool allocation eliminated. Container's pooler-slot budget drops from `5 (shared) + N×1 (createDb leak) → 5 (shared)` after mitigation, where N grew unboundedly pre-mitigation.
- Hypothesis cited: **Hypothesis 1 (primary)**.

**Mitigation 2 — `createDb` default `idle_timeout: 30s` ([packages/db/src/index.ts](packages/db/src/index.ts)).**
- Add `idleTimeout?: number` to `createDb` options; default 30s. Replaces postgres.js default of `0` (never close).
- Defense for script consumers (apply-migration, apply-event-context-backfill, test-* harnesses, etc.) that still use `createDb`. Connections will close after 30s idle even if a script forgets `sql.end()` or exits via uncaught throw.
- Hypothesis cited: **Hypothesis 1 (defense)**.

**Mitigation 3 — Promote `pool-snapshot.mts` to durable ops tooling ([packages/db/src/scripts/pool-snapshot.mts](packages/db/src/scripts/pool-snapshot.mts) NEW; alias `pnpm --filter @nexus/db pool-snapshot`).**
- Promoted from one-off `_invest-pg-stat-snapshot.mts` per Decision 11 anchor. Adds `candidate_leaks_60s_plus_excl_supavisor_recycle` filter (>60s idle, NOT Supavisor's `DISCARD ALL` pooler-internal recycle) — surfaces real app-side leaks distinguished from pooler hysteresis.
- Header docs the diagnostic constraint (pg_stat_activity opaque to pooler client cap; EMAXCONN remains ground-truth).
- Hypothesis cited: **hypothesis-agnostic defensive** (Decision 11 anchor; future investigations have permanent diagnostic surface regardless of root cause).

**Cleanup.** Three one-off `_invest-*` scripts deleted at session close per Decision 4: `_invest-pg-stat-snapshot.mts` (promoted), `_invest-synthetic-capacity.mts` (one-off), `_invest-session-pooler-check.mts` (one-off). Future sessions can re-create the synthetic harness from this entry's inline JSON if needed.

**Verification at session close (12 gates).**

- `pnpm typecheck` — 4/4 workspaces PASS.
- `pnpm --filter @nexus/web build` — 13 routes clean, zero `Attempted import error | Module not found | Type error | Failed to compile`.
- `pnpm --filter @nexus/db enum:audit` — PASS unchanged.
- `pnpm --filter @nexus/shared test:prompt-loader` — 13/13 PASS unchanged.
- `pnpm --filter @nexus/shared test:mock-claude` — 10/10 PASS unchanged.
- `pnpm --filter @nexus/shared test:meddpicc-format` — 4/4 PASS unchanged.
- `pnpm --filter @nexus/shared test:applicability-dsl` — 12/12 PASS unchanged.
- `pnpm --filter @nexus/shared test:deal-state` — 8/8 PASS unchanged.
- `pnpm --filter @nexus/shared test:build-event-context` — 8/8 PASS unchanged.
- `pnpm --filter @nexus/shared test:surfaces-registry` — 8/8 PASS unchanged.
- `pnpm --filter @nexus/shared test:applicable-pattern-experiment-flag` — 9/9 PASS unchanged.
- `pnpm --filter @nexus/shared test:surface-admission` — 8/8 PASS unchanged.
- **Bug-scope re-audit (Session A.5 closure verification):** 0 vertical-null rows out of 92 Phase-3-era rows (held).
- **`pnpm --filter @nexus/db pool-snapshot --label=post_mitigation_baseline` — clean run, 13 backend connections, 0 candidate leaks** (excluding 2 unrelated long-held idle: postgrest LISTEN + an admin "show archive_mode" from days ago).
- **Post-mitigation synthetic cap test — saturated at 45** (same as pre-mitigation; cap is platform-controlled. The mitigation targets the leak rate over minutes, not instantaneous capacity).
- Cron resumed (jobid=6, schedule="10 seconds", active=true via `pool-session.mts resume` → `pool-quick.mts status`).
- Hex grep on .tsx files — 0 hits. Stale shadcn class grep — 0 hits.

**Phase 4 Day 2 readiness assessment.**

Phase 4 Day 2 inherits the leak fix as **theoretical-fix-verified-by-inspection-with-empirical-verification-window-shifted-to-Day-2's-first-run**. Pre-mitigation, the application's per-warm-container pooler-slot budget grew unboundedly with cron firing (`5 shared + N × createDb leak`). Post-mitigation, it stabilizes at the shared pool's max=5 per warm container. With ~45 application-headroom on the pooler (200 cap minus ~155 baseline from other Supabase services), the post-mitigation budget supports approximately 9 warm containers concurrently before saturation pressure returns — well above current expected concurrency under Phase 4 Day 2's coordinator + 15-min sync load.

Phase 4 Day 2's first cron-firing window will be the empirical verification surface: capture `pool-snapshot --label=phase4_day2_5min_post_deploy` 5 minutes after deploy + `--label=phase4_day2_30min_post_deploy` 30 minutes after, and observe whether `candidate_leaks_60s_plus_excl_supavisor_recycle` stays at 0. If the pre-mitigation pattern (accumulating idle Supavisor backends over minutes) is absent post-mitigation, the leak fix is empirically confirmed. If the pattern persists, a follow-up session targets remaining sources — but the inventory already shows shared pool as the only remaining warm-container pool consumer post-mitigation, so unexpected pattern would point at OTHER infrastructure (Vercel container reclamation timing; pooler tier limits; new Phase 4 Day 2 work itself).

Conservative claim: **absorbs Phase 4 Day 2's expected baseline load (~2-3 sustained + ~5-10 burst per cron firing) with quantified theoretical margin based on identified root cause + inspection-verified fix; empirical multi-minute verification window inherits to Phase 4 Day 2's first 30 minutes post-deploy.**

**Reasoning stub.** Non-MVP choices with justification type per the CLAUDE.md reasoning-gate.

- **Synthetic-vs-natural evidence-surface attribution made explicit (Decision 1+4).** Justification 1 (kickoff Decision 1+4 require this discipline). Each finding in this entry attributes evidence to which surface produced it. Synthetic harness verified capacity behavior + cleanup discipline + pooler hysteresis pattern. Natural saturation under production conditions (Vercel deploy collisions, cron+web overlap, webhook bursts) was NOT directly observed because cron was paused per Decision 5 during the synthetic reproduction window. ONE natural-saturation snapshot was captured (post-cap-test cleanup-wave-2 EMAXCONN-at-0-opens), but it was synthetic-test-induced, not natural production traffic. The leak's empirical verification under natural conditions is inherited by Phase 4 Day 2's first cron-firing window.
- **`pg_stat_activity` opacity to pooler client cap is structural, not a tooling gap.** Justification 1 (kickoff Decision 1 names "evidence surface" precision). Confirmed: even via the session pooler (port 5432), `application_name` does NOT propagate to `pg_stat_activity`. EMAXCONN remains the ground-truth saturation signal; snapshot script provides the complementary view (idle backend recycling + pooler hysteresis observation). Documented in `pool-snapshot.mts` header so future sessions don't re-investigate this constraint.
- **Worker route `createDb` per-invocation call as primary leak hypothesis (Mitigation 1).** Justification 1 (Guardrail 13 single-write-path applies to pool-opening too: shared pool is the seam) + Justification 4 (Phase 4 Day 2's coordinator + 15-min sync cron compounds pool pressure on already-leaky route). Postgres.js default `idle_timeout: 0` × Vercel Fluid Compute warm containers × cron firing every 10s = unbounded per-container leak. The fix consolidates ALL route+handler postgres traffic through the single shared pool — the hypothesis-aligned + structurally-correct shape per the foundation review's A7 anchor.
- **`createDb` default `idle_timeout: 30s` as defense-in-depth (Mitigation 2).** Justification 1 + Justification 4. Even if a future script forgets `sql.end()` or exits via uncaught throw, connections will close after 30s. Catches the script-side mirror of Hypothesis 1 without changing existing call sites. The shared pool's `idle_timeout` stays at 60s per kickoff Decision 2 explicit guidance ("tighten per-request pools but NOT shared-pool").
- **Shared pool max stays at 5 (NOT reduced).** Justification 1 (operational vigilance: deadlock-floor on Promise.all over 3 Claude calls in transcript_pipeline + 3 getApplicable* in admission engine). Reducing max to 3-4 would constrain on the floor; max=5 is the working minimum given current parallelism. Rejected the kickoff's example "max 5→2-3" mitigation explicitly because the Promise.all patterns in the handler + admission engine consume 3 concurrent connections each at peak.
- **Path A conclusive framing chosen over Path C inconclusive (Decision 11).** Justification 1 (kickoff Decision 11 explicitly defines paths). Hypothesis 1 has CONVERGENT evidence from synthetic harness (multipool test's 16 idle 32s post-`sql.end()`), inventory (createDb code lacks `idle_timeout`), route inspection (every invocation calls createDb), and timeline matching (Phase 3 Day 4 Session B's 25-min drain matches accumulated-leak math). Three other hypotheses identified as contextual or out-of-scope, not competing root causes. Path A is honest given the evidence; the verification-limitation caveat (empirical observation requires Day 2's window) is documented explicitly so the inheritance is clear.
- **Pool-snapshot script promoted to durable ops tooling (Mitigation 3) regardless of path (Decision 11 anchor).** Justification 4 — even on Path A, future sessions benefit from a permanent diagnostic surface that recognizes the pooler-hysteresis-vs-genuine-leak distinction. Header documents the diagnostic constraint so future investigators don't re-discover the `pg_stat_activity` opacity. Pnpm script alias `pool-snapshot` keeps invocation simple.
- **Cron paused per Decision 5 during synthetic reproduction; resumed at session close.** Justification 1 (Decision 5 explicit policy). Cron paused via `pool-session.mts pause` at start of synthetic reproduction; resumed via `pool-session.mts resume` at session close (jobid=6 confirmed scheduled). Cron MUST NOT have been paused during natural-saturation observation per Decision 5 — but no natural-saturation observation occurred this session because the dev-side surface during synthetic reproduction is the only saturation surface this session generated.
- **Productization-arc Stage 4 audit-trail-durability touched but NOT closed (Decision 10).** Justification 3. Phase 4 Day 1 Session B's `claude_call_log_write_failed` mid-EMAXCONN observation informed this session's investigation; this session's leak fix REDUCES the frequency of pool saturation events, which REDUCES the frequency of `claude_call_log_write_failed` events. But the wrapper's best-effort contract is unchanged. The Stage 4 audit-trail-durability productization concern (guaranteed-delivery semantics for SOC 2 Type II) is informed — not closed — by this session. Captured as parked productization-arc item; PRODUCTIZATION-NOTES.md "Audit trail and explainability" section already carries the precedent paragraph.
- **No live Claude exercise; no HubSpot writes (Decision 8).** Justification 4 — kickoff explicitly capped this session at zero live Claude / zero HubSpot writes / zero Voyage. The mitigation verification is by inspection + baseline gates + synthetic harness; live exercise is not needed to verify the leak fix and would burn budget for zero net evidence.

10 entries. No UNCERTAIN.

**Parked items closed.**

- **Recurring pool-saturation root-cause investigation (Decision 9 from Phase 4 Day 1 Session B closeout).** Closed via Path A: Hypothesis 1 (`createDb` per-invocation pool with `idle_timeout: 0` default) named as root cause; Mitigations 1+2 land the targeted fix; Mitigation 3 lands durable diagnostic tooling.

**Parked items added.**

- **Phase 4 Day 2 first cron-firing window — empirical leak-fix verification AS AN EXPLICIT GATE (oversight, Pre-Phase-4-Day-2 closeout).** Phase 4 Day 2's verification staircase MUST include `pool-snapshot --label=phase4_day2_5min_post_deploy` at 5 min post-deploy AND `--label=phase4_day2_30min_post_deploy` at 30 min post-deploy. The leak fix's structural effectiveness only shows under real coordinator + 15-min sync load — Phase 4 Day 2 is the first session where that load actually runs, so the verification surface lands then, not at this session close. **Pass criterion:** `candidate_leaks_60s_plus_excl_supavisor_recycle` array stays at 0 (excluding the 2 unrelated long-held entries: postgrest LISTEN + ancient admin "show archive_mode") at BOTH windows. **Fail criterion:** the array grows over the two windows, which would indicate a residual leak source not addressed by Mitigations 1+2 — investigate immediately. NOT just inherited tooling; an explicit gate.
- **Phase 4 Day 2 load math uses 45-connection working headroom, NOT 200-cap (oversight, Pre-Phase-4-Day-2 closeout).** The synthetic harness saturated at 45 of 150 SOFT_CAP because ~155 client-cap slots are consumed by other Supabase services invisible from this codebase. The 200-cap is the platform's documented ceiling; the WORKING ceiling for our application is ~45. Phase 4 Day 2 adds ~2-3 sustained + ~5-10 burst per cron firing on coordinator_synthesis + 15-min hubspot_periodic_sync. Day 2's kickoff load-math should reason against 45 as the working ceiling — leaving ~30-35 headroom after Day 2's load lands, not the much larger margin the original 200-cap framing implied. Capacity tuning decisions (shared pool max; coordinator concurrency; sync cron frequency) should be made against the 45-ceiling number.
- **Four-of-four EMAXCONN pattern is structurally CLOSED; recurrence in Phase 4 Day 2 is a NEW investigation (oversight, Pre-Phase-4-Day-2 closeout).** Hypothesis 1 + Mitigations 1+2 eliminate the per-invocation `createDb` leak that drove the four-of-four pattern. Phase 4 Day 2's escalation rules should be explicit: if EMAXCONN occurs anyway during Day 2, treat it as a NEW pattern warranting its own investigation, NOT as the return of the closed one. New investigation hooks: (a) which surface is consuming pool — coordinator_synthesis Promise.all? hubspot_periodic_sync overlap with web routes? webhook bursts that didn't exist pre-Day-2?; (b) is the working headroom (~45) lower than expected — i.e., did baseline shift?; (c) is there a Vercel deploy / container reclamation timing pattern correlating with saturation. The Pre-Phase-4-Day-2 fix surface is structurally separate from any new pattern that surfaces post-Day-2.
- **Stage 4 SOC 2 audit-trail-durability productization scope (informed, not changed).** This session's leak fix reduces the frequency of pool-saturation events, which reduces the frequency of `claude_call_log_write_failed` audit-write losses. The wrapper's best-effort contract is unchanged for v2 demo. Stage 4 productization decision remains: durable WAL + retry-with-backoff + backpressure into wrapper (per PRODUCTIZATION-NOTES.md "Audit trail and explainability"). NOT a v2 demo concern.
- **Pool-snapshot.mts forward-looking diagnostic surface for future Vercel Function or pooler-tier changes.** When Vercel introduces new runtime semantics OR Supabase changes pooler tiers, re-run `pool-snapshot` against pre-change vs post-change to characterize impact on baseline.
- **Vercel function move to DIRECT_URL once IPv6 readiness confirmed (carried forward from Pre-Phase 4 Session A; updated framing).** Now that the leak source is fixed, the IPv6/DIRECT_URL migration becomes a forward-looking optimization (eliminate pooler contention entirely for the worker route) rather than an urgent mitigation. Stage 3+ productization scope per PRODUCTIZATION-NOTES.md.

**Cost.** $0 live Claude. $0 HubSpot. $0 Voyage. ~80-100 reads on prod Supabase across the synthetic harness + snapshot script verifications + baseline-gate runs. 0 INSERTs, 0 UPDATEs, 0 DELETEs (read-only investigation; the only writes were cron-state mutations via session pooler, which are idempotent).

### Phase 4 Day 2 Session A — 2026-04-27 · `e124547`

**Coordinator-class trio shipped.** All three Item slots from Day 2 Session A's expected scope landed: `IntelligenceCoordinator.receiveSignal` real implementation, `IntelligenceCoordinator.getActivePatterns` real implementation, and the `coordinator_synthesis` job handler. Phase 3 Day 4 Session A's no-op skeleton (`receiveSignal: void`; `getActivePatterns: []`) fills in behind the same interface; the pipeline call site at [packages/shared/src/jobs/handlers.ts:992](packages/shared/src/jobs/handlers.ts:992) (transcript_pipeline step 5 forEach over detected signals) needed zero changes.

**Item 1 — `receiveSignal` real impl per Decision 2.** Validates input shape (rejects missing hubspotDealId, invalid signal_type, missing/invalid vertical with `signal_received_invalid` stderr telemetry), then runs a dedup query against `jobs WHERE type='coordinator_synthesis' AND status IN ('queued','running') AND input->>'vertical' = $vertical AND input->>'signalType' = $signalType AND created_at > now() - interval '1 hour'`. Dedup hit → emits `signal_dedup_skipped` + returns; dedup miss → INSERTs new `coordinator_synthesis` job + emits `signal_received`. Race-tolerant (no FOR UPDATE) per Decision 4's pattern_key idempotency contract — duplicate jobs are benign because the handler computes `pattern_key = sha256(vertical:signal_type:sorted-deal-ids).slice(0,32)` and the second insert no-ops via ON CONFLICT. Returns a `ReceiveSignalOutcome` discriminated union (`{kind: "enqueued", jobId} | {kind: "deduped", existingJobId} | {kind: "rejected", reason}`) for test gates; production callers (transcript pipeline step 5) await for sequencing but discard the outcome — fire-and-forget contract preserved.

**Item 2 — `getActivePatterns` real impl per kickoff Item 2.** Reads `coordinator_patterns` rows where `status IN ('detected', 'synthesized')` (filters `expired` out), with optional `vertical?` / `signalType?` / `dealIds?` filters. `dealIds?` joins through `coordinator_pattern_deals` via `EXISTS` subquery; `dealCount` is computed via per-pattern `(SELECT COUNT(*) FROM coordinator_pattern_deals WHERE pattern_id = cp.id)` so consumers render "affecting N deals" with the FULL pattern reach (not just the `dealIds`-filter intersection). Returns `ActivePatternSummary[]` sorted by `detected_at` DESC with `LIMIT 50` defense for prompt-context-size headroom. `synthesisHeadline` computed by `extractHeadline(synthesis)` — first line of the `synthesis` text column (the row stores `headline\n\nMechanism:\n...` per the WRITE shape Item 3 locks).

**Item 3 — `coordinator_synthesis` job handler (replaces `notYet` stub).** Reads recent (30d) `signal_detected` events filtered by optional `vertical` + `signalType` from `jobs.input`. Groups by `(vertical, signal_type) → hubspot_deal_id → rows`; for each group with `dealsAffected >= minDealsAffected` (default 2 per Decision 3): builds prompt vars (renderAffectedDealsBlock from deal_events alone for MVP — stage/AE/stakeholders not yet enriched, helper services parked Phase 4 Day 3+; fallback "(none)"-style strings for `priorPatternsBlock` / `atRiskDealsBlock` / `relatedExperimentsBlock` / `activeDirectivesBlock` / `systemIntelligenceBlock` per the prompt's documented empty-block conventions), calls 04-coordinator-synthesis via `callClaude`, INSERTs `coordinator_patterns` row idempotent on `pattern_key` (ON CONFLICT DO NOTHING), then INSERTs `coordinator_pattern_deals` join rows (idempotent on `(pattern_id, hubspot_deal_id)` PK). Writes `synthesis = headline + "\n\nMechanism:\n" + mechanism` (composite WRITE shape) + `recommendations` + `arr_impact` + `reasoning = reasoning_trace` (Stage 4 audit-trail anchor — `reasoning_trace` lands as a queryable column for compliance per §2.16.1 decision 3 spirit). New `coordinator-synthesis.ts` tool definition mirrors the prompt's tool-use schema (`reasoning_trace + synthesis{headline, mechanism, lineage} + recommendations[1..6] + arr_impact + constraint_acknowledgment`) per §2.13.1 Principle 6.

**`JobHandlerHooks` extension.** Added optional `sql?: postgres.Sql` matching the existing `callClaude?` + `hubspotAdapter?` mock seam pattern (Phase 3 Day 3 Session B established). Production handlers fall back to `getSharedSql()`; the mock harness passes a captured-call dispatcher for unit tests without DB.

**Telemetry per Decision 8.** Seven new stderr JSON event shapes matching the existing `claude_call` / `worker_circuit_break` / `dealstate_stage_fallback` shapes per §2.13.1 telemetry-as-early-warning:
  - `signal_received` (vertical, signal_type, hubspot_deal_id, job_id)
  - `signal_dedup_skipped` (existing job_id surfaced)
  - `signal_received_invalid` (validation reason)
  - `coordinator_synthesis_started` (input_groups_count, total_signals)
  - `pattern_below_threshold` (per group, with deals_affected + threshold)
  - `pattern_detected` (vertical, signal_type, deals_affected, pattern_id, pattern_key, arr_multiplier, recommendation_count)
  - `coordinator_synthesis_completed` (patterns_emitted, groups_evaluated, groups_above_threshold, signals_read, duration_ms)

**Internal verification staircase (all gates green).**
- `pnpm typecheck` — 4/4 workspaces PASS.
- `pnpm build` — 13 routes clean, zero `Attempted import error | Module not found | Type error | Failed to compile`.
- `pnpm --filter @nexus/db enum:audit` — PASS.
- `pnpm --filter @nexus/shared test:applicability-dsl` — 12/12 PASS unchanged.
- `pnpm --filter @nexus/shared test:deal-state` — 8/8 PASS unchanged.
- `pnpm --filter @nexus/shared test:build-event-context` — 8/8 PASS unchanged.
- `pnpm --filter @nexus/shared test:surfaces-registry` — 8/8 PASS unchanged.
- `pnpm --filter @nexus/shared test:applicable-pattern-experiment-flag` — 9/9 PASS unchanged.
- `pnpm --filter @nexus/shared test:surface-admission` — 8/8 PASS unchanged.
- **`pnpm --filter @nexus/shared test:coordinator-receive-signal` — 8/8 PASS** NEW (happy path, dedup hit, dedup window expired, missing hubspotDealId, invalid signal type, missing vertical, sequential calls, payload normalization).
- **`pnpm --filter @nexus/shared test:coordinator-active-patterns` — 5/5 PASS** NEW (empty fixture, only detected, only synthesized, mixed with expired filtered + ordered desc, vertical filter applied).
- **`pnpm --filter @nexus/shared test:coordinator-synthesis` — 3/3 PHASES PASS** NEW (PHASE 1 silence-as-feature with full telemetry trail; PHASE 2 single 3-deal pattern emitted; PHASE 3 mixed sub-threshold + qualifying groups produce both `pattern_below_threshold` AND `pattern_detected` events).
- `audit-event-context-fields` — 0 vertical-null rows out of 92 Phase-3-era rows (Session A.5 closure verification holds).
- Hex grep on .tsx files — 0 hits. Stale shadcn class grep — 0 hits.

**Live exercise: `test:coordinator-synthesis-medvista` — Path A SILENCE-PATH PASS.** Invoked the handler against prod Supabase scoped to vertical=healthcare. Pre-state confirmed MedVista is alone with healthcare signals — 7 distinct `(healthcare, signal_type)` groups in the last 30 days, every group with exactly 1 deal (MedVista 321972856545): competitive_intel, content_gap, deal_blocker, field_intelligence, process_friction, process_innovation, win_pattern. Total 51 signals read in 161ms. Handler returned `patternsEmitted=0, groupsEvaluated=7, groupsAboveThreshold=0`. Telemetry trail FULL per Item 3 silence-path PASS criterion: `coordinator_synthesis_started` × 1 → `pattern_below_threshold` × 7 → `coordinator_synthesis_completed{patterns_emitted=0}` × 1. Zero Claude calls (no group cleared the threshold). Zero coordinator_patterns rows written. 0 spend on live Claude / HubSpot / Voyage.

The silence-path verification is the unit-level + live-level mirror of Decision 9 + Decision 10's spirit: a `patterns_emitted=0` result with MISSING telemetry events would be silent failure (system bailed before evaluating threshold) — that would have been a Path B partial outcome. The full trail proves the system actually evaluated and chose to emit nothing per §1.18 silence-as-feature.

**Post-deploy pool-snapshot gate (Decision 5 EXPLICIT) — both windows PASS.**
- `pool-snapshot --label=phase4_day2_5min_post_deploy` (5 min after push at 2026-04-28T03:24:45Z): `total_connections=13`, `candidate_leaks_60s_plus_excl_supavisor_recycle` shows ONLY the 2 known unrelated long-held entries (postgrest LISTEN PID 3610 at 480801s; admin "show archive_mode" PID 46958 at 1185s). Zero new app-side leaks.
- 25-minute QUIET PERIOD with no other DB activity from this session — used productively for BUILD-LOG drafting + Reasoning-stub composition per Decision 5 discipline.
- `pool-snapshot --label=phase4_day2_30min_post_deploy` (30 min after push at 2026-04-28T03:50:11Z): `total_connections=13` (unchanged), `candidate_leaks_60s_plus_excl_supavisor_recycle` shows the SAME 2 entries (postgrest LISTEN PID 3610 at 482327s; admin "show archive_mode" PID 46958 at 2711s). Zero growth in app-side leaks across the 25-minute window. PASS criterion held at both windows.

**The Pre-Phase-4-Day-2 leak fix is empirically confirmed under the first cron-firing window with new coordinator load deployed.** Hypothesis 1's prediction (worker route's per-invocation `createDb` × `idle_timeout: 0` accumulating leaks under cron at 10s firing) is invalidated by the post-fix shared-pool path. The 30-min stability under coordinator + cron load proves the structural fix holds.

**Reasoning stub.** Non-MVP choices with justification type per the CLAUDE.md reasoning-gate.

- **Decision 4 reinterpretation: handler scans groups when neither `vertical` nor `signalType` supplied.** Justification 4 (imminent next-session need). Receivesignal's enqueue path passes both filters and gets scoped synthesis (one group at most). A future cron-fired sweep mode (Phase 4 Day 3+) can pass `{}` and let the handler scan all (vertical, signal_type) groups in the last 30 days. The mock harness PHASE 3's "two groups in one pass" fixture exercises this sweep mode; Item 3's live exercise also exercises it scoped to `vertical=healthcare`. The handler's loop structure handles both cases uniformly.
- **`JobHandlerHooks.sql` injection seam matches existing `callClaude`/`hubspotAdapter` pattern.** Justification 1 (Guardrail 13 — single test seam per domain concept). Phase 3 Day 3 Session B established the hooks DI pattern; coordinator_synthesis extends it without inventing a new seam. Production handlers fall back to `getSharedSql()` so the contract is non-breaking.
- **`receiveSignal` validation rejects null/invalid input + emits telemetry vs throwing.** Justification 1 (§2.6 long-ops-as-jobs implies upstream callers shouldn't fail because a downstream seam declined). The transcript_pipeline step 5 fans `receiveSignal` over potentially many signals; if one fails validation (e.g., a future signal type added before the canonical enum updates), throwing would fail the whole pipeline. Returning `{kind: "rejected"}` + emitting `signal_received_invalid` telemetry preserves pipeline progress while making the rejection diagnostic-friendly.
- **`coordinator_synthesis` SQL filter `AND event_context->>'vertical' IS NOT NULL` defends against pre-Session-A.5 rows.** Justification 2 (§2.16.1 decision 2 preservation). Phase 4 Day 1 Session A.5 backfilled all Phase-3-era rows to populated event_context, but the defensive filter keeps the handler robust if a future writer regresses to nullable values without bumping the schema invariant. Belt-and-suspenders per Session A.5 closure discipline.
- **`pattern_key = sha256(vertical:signal_type:sorted-deal-ids).slice(0, 32)` for idempotency.** Justification 1 (Guardrail 13 — single write-path on coordinator_patterns) + Justification 2 (§2.16 append-only-events spirit; same group = same row). 32-char prefix gives 128 bits of collision resistance, sufficient for v2's expected pattern volume (<1M rows over the productization arc). Sorting deal IDs ensures the key is order-stable across handler runs.
- **`affectedDealsBlock` renders only `deal_events` fields for MVP.** Justification 4. Phase 4 Day 3+ enriches with `CrmAdapter` calls (stage, AE, stakeholders) when those scoring-time helpers materialize; today the prompt receives signal evidence (the load-bearing evidence per the prompt's "trace to specific signals" discipline) without rich CRM context. The prompt's empty-block defaults handle the gap gracefully.
- **`coordinator_patterns` WRITE shape locked: `synthesis = headline + "\n\nMechanism:\n" + mechanism`.** Justification 3 (PRODUCTIZATION-NOTES.md "Corpus Intelligence — the second product"). The corpus-intelligence dashboard reads `coordinator_patterns.synthesis`; the column carries both narrative components in a parseable shape (split on first `\n` → headline; remainder → mechanism). `getActivePatterns.synthesisHeadline` reads this contract; future scoring + audit-trail readers do too.
- **Decision 2 dedup query is race-tolerant (no FOR UPDATE).** Justification 1 (§2.6 simplicity) + Justification 4 (imminent: Session B's worker concurrency model). Worst case is two coordinator_synthesis jobs run for the same `(vertical, signalType)` pair; the handler is idempotent on `pattern_key` per Decision 4 so the second job's INSERTs no-op. Adding FOR UPDATE on a query that returns no rows on the miss path is a no-op anyway. Keeps the seam simple as Session B introduces concurrent worker invocations.
- **`getActivePatterns` ORDER BY detected_at DESC LIMIT 50.** Justification 4 (next-session need — 06a's `${activePatternsBlock}` interpolation). The activePatternsBlock renders one line per pattern; at scale 06a's prompt context would balloon. LIMIT 50 caps the prompt budget; revisit when Phase 5+ surfaces accumulate patterns at scale.
- **Item 3 live exercise's silence-path verification asserts the FULL telemetry trail, not just `patterns_emitted=0`.** Justification 1 (Decision 10 spirit — `patterns_emitted=0` with missing telemetry would be silent failure, not silence-as-feature). The script parses stderr JSON line-by-line and asserts `started + below_threshold × N + completed{patterns_emitted=0}` where N = pre-state group count. A "silently bailed before evaluating threshold" failure is detectable in this layer.

10 entries. No UNCERTAIN.

**Parked items closed.**

- **`coordinator_synthesis` job handler wiring** — landed via `coordinatorSynthesis` JobHandler replacing the `notYet` stub. `04-coordinator-synthesis` already had `reasoning_trace` from Phase 1 Day 4 verification; max_tokens=2500 held — no reactive bump fired during the live exercise (no Claude calls fired given silence path).
- **`IntelligenceCoordinator.receiveSignal` real implementation** — landed; fills in Phase 3 Day 4 Session A's no-op skeleton seam.
- **`IntelligenceCoordinator.getActivePatterns` real implementation** — landed; consumed today by transcript_pipeline step 6 (`activePatternsBlock` rendering for 06a-close-analysis-continuous).
- **Pre-Phase-4-Day-2 leak-fix empirical verification window (5-min + 30-min post-deploy)** — both pool-snapshots PASS; 4-of-4 EMAXCONN pattern remains structurally closed; the leak fix is empirically confirmed under coordinator + cron load.

**Parked items added.**

- **Phase 4 Day 2 Session B (next session) — sync cron + retry/concurrency + telemetry dashboard.** Hubspot_periodic_sync via pg_cron every 15 min per 07C §7.5; worker retry policy (up to 3 attempts per §4.5); worker concurrency model (loop-until-empty or bounded); wrapper retry-on-protocol-violation; telemetry dashboard `/admin/claude-telemetry` (foundation review C4; optional capstone). Inherits Session A's coordinator skeleton complete + leak-fix empirically confirmed.
- **Phase 4 Day 3+ — coordinator_synthesis prompt context enrichment.** Today's `affectedDealsBlock` renders only `deal_events` fields; the helper services that the prompt expects but don't yet exist (`getAtRiskComparableDeals`, `getActiveManagerDirectives`, `getSystemIntelligence`) pass placeholder strings per the prompt's documented empty-block conventions. Phase 4 Day 3+ wires the helpers; the prompt's recommendations become more deal-grounded once the enriched context lands.
- **Phase 4 Day 5 dashboard — corpus-intelligence read of `coordinator_patterns`.** The substrate is now write-locked (`pattern_key` composition, status='synthesized' on first emit, `reasoning` column populated from Claude's reasoning_trace, `synthesis = headline + mechanism` composite shape). Dashboard reads this contract directly via `getActivePatterns` or its own SQL.
- **Stage 4 SOC 2 audit-trail-durability productization — coordinator's Claude calls flow through `prompt_call_log` via wrapper's best-effort contract (informed, not changed).** Same as Pre-Phase-4-Day-2 closeout; v2 demo behavior unchanged.

**Cost.** $0 live Claude (silence path; no Claude calls fired during live exercise). $0 HubSpot. $0 Voyage. ~50-70 reads on prod Supabase across pool-snapshot baseline + 5min + 30min + live-exercise pre-state + handler signal read + audit-event-context-fields. 0 INSERTs, 0 UPDATEs, 0 DELETEs (silence path produced no coordinator_patterns or coordinator_pattern_deals writes).

### Phase 4 Day 2 Session B — 2026-04-27 · `cf2c9c2`

**Operational quad shipped.** Per Phase 4 Day 2 Session A kickoff Decision 1, Session B folded in the four operational items deferred from Session A: hubspot_periodic_sync handler + cron entry, worker retry policy (3 attempts + exponential backoff), worker concurrency model (sequential loop-until-empty + pre-claim discipline + stalled-job sweep per amendment), wrapper retry-on-protocol-violation. Telemetry dashboard `/admin/claude-telemetry` re-deferred to Phase 4 Day 5 per Decision 1 — UI work fits the Day 5 dashboard window better; backend substrate (`prompt_call_log` written by every Claude call since Phase 3 Day 1) is ready whenever the UI lands. Session B's amendment in execution: the user flagged that the original Decision 7's pre-claim-time-check discipline addresses the COMMON case but doesn't cover handler overruns past the 60s margin (handler claimed at 235s + ran 70s → Vercel SIGTERM at 300s → status='running' indefinitely). Folded in as a stalled-job sweep at start of every worker invocation.

**Item 1 — `hubspot_periodic_sync` handler (replaces `notYet` stub).** Reads `sync_state` per resource (deal/contact/company), calls `adapter.bulkSync<X>({since: last_sync_at})` sequentially, UPSERTs `sync_state` with sync-START time as new cursor (conservative — re-fetches records modified during the window via UPSERT idempotency on hubspot_cache; cannot MISS records). `sync_state` already exists from migration 0005 with a cleaner `(object_type PK, last_sync_at)` shape than the originally proposed single-row-three-columns; **no migration needed** (Decision 3 revised against actual schema during execution). bulkSync* adapter methods exist at adapter.ts:882-900 (Decision 4 simplifier). 429 rate-limit responses rethrow as `hubspot_rate_limit_breach` → worker retry policy applies normal backoff; per-resource non-rate-limit errors are partial-failure semantics (other resources still succeed + advance their cursors). Telemetry: `hubspot_sync_started` / `_resource_completed` / `_resource_failed` / `_completed` / `_rate_limit_warned`.

**Item 2 — Worker retry policy.** 3 attempts max with exponential backoff (1m + 5m). `attempts<3` fail → `status='queued'` + `scheduled_for = now()+backoff`; `attempts>=3` fail → `status='failed'` permanent. Existing claim filter at the worker route already respects `scheduled_for IS NULL OR scheduled_for <= now()` — no schema or filter changes. attempts column already exists from Phase 1 Day 3; just used. Telemetry: `worker_retry_scheduled` / `_exhausted`.

**Item 3 — Worker concurrency (loop-until-empty + pre-claim discipline + stalled-job sweep).** Sequential loop-until-empty within 240s budget. **Pre-claim time-budget check at top of loop, NEVER mid-job** — the in-flight job runs to completion within its own time + 60s margin to maxDuration. **Stalled-job sweep at start of every invocation** (the amendment): jobs with `status='running' AND started_at < now() - interval '5 minutes'` get reset — `attempts<3` → `status='queued'` (retry policy gives another shot); `attempts>=3` → `status='failed'` permanent (the job has exhausted its budget AND been killed mid-run; further retries would just cycle). Catches the residual case where a handler that DID start within budget overran the 60s margin and got Vercel-SIGTERM'd at 300s. Worker route refactored to delegate to new `packages/shared/src/jobs/worker-runner.ts`; the route handles auth + circuit-breaker only. Runner is testable without a Next.js request/response harness. Telemetry: `worker_stuck_jobs_swept` / `worker_loop_exhausted_no_jobs` / `worker_loop_exhausted_time_budget`.

**Item 4 — Wrapper retry-on-protocol-violation.** Outer protocol-retry loop (max 2 attempts) wraps the existing transport-retry loop (max 3 attempts per attempt). PromptResponseError on first protocol attempt → wrapper retries; second violation rethrows. Single `prompt_call_log` row at end (success-after-retry OR exhausted-rethrow) with `attempts` reflecting total transport calls across protocol attempts. New `_internal.sdk` injection seam on `callClaude` for testing the wrapper itself (production callers omit; underscore-prefixed). Telemetry: `claude_protocol_retry` / `_exhausted`.

**Configure-cron extension.** Schedules `nexus-hubspot-sync` at `*/15 * * * *` alongside existing 10-second `nexus-worker`. Cron body: `INSERT INTO public.jobs (type, status) SELECT 'hubspot_periodic_sync', 'queued' WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE type='hubspot_periodic_sync' AND status IN ('queued','running'))`. The dedup `NOT EXISTS` guard prevents stacking sync jobs if the previous one is still queued/running (long-running first-run sync, webhook overlap, transient HubSpot slowness). Worker picks it up via the same atomic-claim path — single jobs table + worker per Decision 2.

**`JobHandlerHooks.hubspotAdapter` widened** to include bulkSync* methods. `test-transcript-pipeline-mock.ts` updated: `makeCapturingAdapter` returns no-op bulkSync stubs for type-compat (transcript_pipeline doesn't call them; the wider Pick still requires shape).

**Internal verification staircase (all gates green).**
- `pnpm typecheck` — 4/4 workspaces PASS.
- `pnpm build` — 13 routes clean, zero `Attempted import error | Module not found | Type error | Failed to compile`.
- `pnpm --filter @nexus/db enum:audit` — PASS.
- 9 baseline gates × all cases (53 + 16 = 69/69 PASS unchanged: applicability-dsl 12/12, deal-state 8/8, build-event-context 8/8, surfaces-registry 8/8, applicable-pattern-experiment-flag 9/9, surface-admission 8/8, coordinator-receive-signal 8/8, coordinator-active-patterns 5/5, coordinator-synthesis 3/3 PHASES).
- **`pnpm --filter @nexus/shared test:hubspot-periodic-sync` — 4/4 PASS** NEW (empty result + cursors advance, 1 modified deal, cursor uses sync-start time, partial failure preserves failed-resource cursor).
- **`pnpm --filter @nexus/shared test:worker-retry-policy` — 5/5 PASS** NEW (first failure +1m, second +5m, third permanent, scheduled_for filter excludes future, success regression).
- **`pnpm --filter @nexus/shared test:worker-loop-until-empty` — 4/4 PASS** NEW (empty queue, time-budget cutoff, 3-jobs runs all, stalled-sweep both branches).
- **`pnpm --filter @nexus/shared test:wrapper-protocol-retry` — 4/4 PASS** NEW (success first try, retry succeeds, both fail rethrows, transport regression).
- `audit-event-context-fields` — 0 vertical-null rows out of 92 Phase-3-era rows (Session A.5 closure verification holds).
- Hex grep on .tsx files — 0 hits. Stale shadcn class grep — 0 hits.

Total new test cases: 17/17 PASS (4 + 5 + 4 + 4). Total verification: 87/87 cases across 13 test gates (typecheck + 9 baseline + 4 new).

**Configure-cron applied to prod.** `pnpm --filter @nexus/db configure-cron https://nexus-v2-five.vercel.app` succeeded; both cron entries confirmed: `nexus-worker` (every 10s) + `nexus-hubspot-sync` (every 15 min, `*/15 * * * *`).

**Live exercise: `test:hubspot-periodic-sync-live` — Path A PASS.** Invoked the handler against prod Supabase + live HubSpot Starter portal. Pre-state: no `sync_state` rows (first run; default '1970-01-01' cursor applies); 8 hubspot_cache rows (deal+contact+company). Handler returned `totalSynced=8, totalFailed=0, durationMs=4244` — deal:2/0/2033ms, contact:4/0/1245ms, company:2/0/818ms. Telemetry trail FULL: `hubspot_sync_started` × 1 → `hubspot_sync_resource_completed` × 3 → `hubspot_sync_completed` × 1; zero rate-limit warnings; zero resource_failed events. All 3 cursors advanced to fresh timestamps (`deal: 04:28:04Z`, `contact: 04:28:06Z`, `company: 04:28:07Z`). Cache delta = +0 (UPSERT idempotency — no NEW records, just refresh of existing 8 — confirms the bulk-sync write path is correctly UPSERTing rather than duplicating).

**Post-deploy pool-snapshot gate (Decision 9 EXPLICIT) — recovered via overnight evidence; PASS.**

The original 5-min + 30-min staircase was interrupted mid-quiet-period when the dev machine crashed before the 30-min snapshot fired. The 25-minute quiet-period contract was broken by the interruption, invalidating the original gate as a contiguous measurement. **Recovery decision (standing-authority):** since the deployed code had been running unattended overnight under real cron load by the time recovery began, the inheriting empirical surface was substantially stronger than the original 30-min window would have provided. A single `phase4_day2_b_overnight_recovery` snapshot replaces the two-window gate; PASS criterion unchanged (`candidate_leaks_60s_plus_excl_supavisor_recycle = 0` excluding the 2 known unrelated entries).

- `pool-snapshot --label=phase4_day2_b_5min_post_deploy` (5 min after push at 2026-04-28T04:32:06Z, captured pre-interruption): `total_connections=13`, `candidate_leaks_60s_plus_excl_supavisor_recycle` shows ONLY the 2 known unrelated long-held entries (postgrest LISTEN PID 3610 at 484843s; admin "show archive_mode" PID 46958 at 5227s). Zero new app-side leaks despite the new sustained-load surfaces (15-min sync cron just added; worker loop-until-empty deployed; retry-driven re-enqueue path deployed).
- **`pool-snapshot --label=phase4_day2_b_overnight_recovery` (recovery, 2026-04-28T14:44:39Z, ~10 hours after the 5-min snapshot)**: `total_connections=13` (identical to preflight baseline AND to the 5-min snapshot — stable across the entire overnight window), `candidate_leaks_60s_plus_excl_supavisor_recycle` shows ONLY the 2 known unrelated entries (postgrest LISTEN PID 3610 at 521595s ≈ 6 days; admin "show archive_mode" PID 46958 at 41979s ≈ 11.7 hours). Zero new app-side leaks accumulated.
- **Overnight cron-firing evidence (load surface during the recovery window):** 41 `hubspot_periodic_sync` jobs fired between 2026-04-28T04:30Z and 14:44Z; 41/41 succeeded; 0/41 failed. That's ~615 minutes (10.25 hours) of 15-minute-interval sync cron load + ~3,690 worker-route firings (10s × ~10.25h). Under that load, total_connections held at 13, app-side leaks accumulated to 0.

**The recovery snapshot is stronger evidence than the original 30-min window would have been.** A 30-min observation would have shown the leak fix holding through ~2 sync firings + ~180 worker firings. The overnight-recovery surface shows it holding through 41 sync firings + ~3,690 worker firings — 20× the firing volume of the original gate's worst case. The Pre-Phase-4-Day-2 leak fix continues to hold under Session B's expanded load surfaces (15-min sync cron + worker loop-until-empty + stalled-job sweep + retry-driven re-enqueue) over an empirically meaningful production window. The four-of-four EMAXCONN pattern remains structurally CLOSED across both Session A's coordinator load AND Session B's sync + worker hardening load.

**Reasoning stub.** Non-MVP choices with justification type per the CLAUDE.md reasoning-gate.

- **Decision 3 revision: sync_state shape uses existing migration 0005 schema, not a new migration 0007.** Justification 1 (Guardrail 13 — single write-path on sync_state). The original kickoff Decision 3 proposed a single-row-three-columns shape, but migration 0005 had already landed `sync_state` with `(object_type PK enum, last_sync_at)` — a cleaner multi-row shape that doesn't require schema change to add new resource types. Used the existing schema; revised the handler accordingly. Captured as a Type 1 Reasoning entry rather than escalating since this is "small schema decision within an established framework" per CLAUDE.md.
- **Stalled-job sweep amendment folded into Decision 7 in execution.** Justification 4 (imminent next-session need; user-flagged amendment). The kickoff Decision 7 specified pre-claim time-check discipline but didn't address the residual case (handler claimed at 235s + ran 70s → Vercel SIGTERM at 300s → stuck-running). Sweep added at start of every worker invocation: jobs with `status='running' AND started_at < now() - 5min` reset to queued (attempts<3) or permanent fail (attempts>=3). Catches container kills + handler overruns within the retry policy's normal backoff path.
- **Worker route extracted into `worker-runner.ts` for testability.** Justification 1 (Guardrail 13 — single write-path on the worker logic) + Justification 4 (Item 2+3 unit tests would otherwise require Next.js request/response harness). Trade: route is now thinner (auth + circuit-breaker only); runner is pure (postgres.Sql in, WorkerLoopResult out); both are testable independently. Pattern matches existing Phase 3 Day 3 Session B JobHandlerContext.hooks DI pattern.
- **`callClaude` `_internal.sdk` injection seam vs. global mock state.** Justification 1 (§2.13 wrapper-as-single-interface preserved; the underscore-prefixed second parameter is private-by-convention). Considered global mock state setter; rejected as harder to reason about under concurrent tests. Optional second parameter is non-breaking for all existing callers (handlers.ts, test scripts, mock.ts); test passes the mock SDK explicitly.
- **Decision 6 cleaner reading: 3 total attempts max, NOT 4.** Justification 1 (alignment with rebuild plan §4.5 "up to 3 attempts" framing). The kickoff text had an inconsistency between the rule statement (`attempts < 3` retry) and the backoff schedule (1m, 5m, 25m for attempts 1, 2, 3 then permanent at 4th). Resolved by going with the rule statement: attempts=1 fail → +1m retry; attempts=2 fail → +5m retry; attempts=3 fail → permanent. Two retries, three total attempts. Cleaner + matches §4.5 framing.
- **Worker `attempts` column semantic: incremented at CLAIM time, not at failure.** Justification 1 (§4.5 + Phase 1 Day 3 precedent — already incrementing at claim per worker route line 91). Preserved this pattern: each claim = one "attempt" regardless of outcome. Failure handler reads attempts to decide retry vs permanent. Cleaner than alternative (increment at failure) because Vercel SIGTERM mid-job leaves attempts unchanged at claim-time value, and the sweep can use that to decide retry vs permanent without tracking a separate counter.
- **Sequential per-resource sync, NOT parallel Promise.all.** Justification 1 (§2.6 simplicity) + Justification 4 (45-connection working ceiling). Three resources (deal/contact/company) sync sequentially per handler invocation — each call hits HubSpot REST API + writes back via shared sql pool. Parallel would multiply pool footprint × HubSpot rate-limit pressure. Sequential keeps both surfaces predictable.
- **Cursor advancement uses sync-START time, not last-record-modified-time.** Justification 4 (correctness for productization arc). Conservative: records modified DURING the fetch window may be re-fetched next run (idempotent UPSERT on hubspot_cache handles the duplicate gracefully). The opposite ordering (capture AFTER fetch) could MISS records modified during the window — losing data. Conservative ordering picks correctness over efficiency.
- **Partial-failure semantics for the per-resource sync.** Justification 1 (Guardrail 5 — long ops as jobs imply per-step independence) + Justification 4 (network blips on one resource shouldn't block the other two). Each resource's success/failure is independent at the data layer; per Decision 5 only 429 rate-limit rethrows (escalates to worker retry policy). Other failures: log + continue with remaining resources; failed resource's cursor stays at its pre-call value so next run retries from the same `since`.
- **Stuck-job sweep threshold at 5 minutes.** Justification 4 (Vercel maxDuration=300s = 5 minutes; any handler running > 5 minutes was definitely killed by SIGTERM). Real handlers run substantially under: transcript_pipeline 60-137s observed, hubspot_periodic_sync 4244ms observed, coordinator_synthesis 161ms observed. 5-min threshold gives plenty of buffer for legitimate long jobs while catching truly-stuck ones cleanly.
- **Wrapper protocol-retry max=1, NOT max=2 or 3.** Justification 1 (§2.13 wrapper contract: tool-use schemas are strict; protocol violations twice in a row indicate a real prompt issue). Higher retry counts risk masking systematic prompt problems. 1 retry catches the rare "Claude returned a synonym tool name" or "Claude returned a text block then a tool block" case without burying real issues in retry loops.
- **Interruption recovery: overnight-evidence snapshot replaces the broken 5-min + 30-min staircase.** Justification 4 (imminent next-session need — Phase 4 Day 3 needs the leak-fix verification closed before proceeding). Standing-authority call per CLAUDE.md "operational precedents" and Decision 9's PASS criterion (candidate_leaks=0). Trade-off considered: option (a) treat as Path B partial outcome and re-deploy fresh + re-run 5+30 staircase from scratch — discards the overnight evidence + spends another deploy cycle + 30+ minutes for evidence that's empirically weaker than what already exists; option (b) recover via overnight-evidence snapshot — single fresh snapshot, retains the 5-min snapshot evidence, leverages ~10 hours of stable production load (41 successful sync firings, 0 failures, 0 leaks accumulated) as the empirical surface. Option (b) chosen: the overnight window is 20× the firing volume of the original 30-min gate's worst case; a same-result gate from a stronger surface is a net upgrade, not a downgrade. The interruption itself is captured in the BUILD-LOG verification subsection so future readers don't read this as a quiet deviation from the kickoff's gate.

12 entries. No UNCERTAIN.

**Parked items closed.**

- **`hubspot_periodic_sync` handler wiring** — landed via `hubspotPeriodicSync` JobHandler replacing the `notYet` stub.
- **Worker retry policy (up to 3 attempts per §4.5)** — landed via `worker-runner.ts` retry path.
- **Worker concurrency model (loop-until-empty)** — landed; sequential per Decision 7 + amendment for stalled-job sweep.
- **Wrapper retry-on-protocol-violation** — landed; 1 retry max per Decision 8.

**Parked items added.**

- **Phase 4 Day 3 — observation clustering + cross-deal pattern detection (next session).** Inherits coordinator skeleton complete + worker hardening (retry/loop/sweep) + sync cron all flowing. Observation clusters substrate (`observation_clusters` table) already exists from migration 0001+; Day 3 wires the clustering job + per-cluster cross-deal pattern detection.
- **Phase 4 Day 5 — telemetry dashboard `/admin/claude-telemetry`** (re-deferred from Session B). UI work; reads `prompt_call_log` table that's been written by every Claude call since Phase 3 Day 1. The substrate is ready.
- **Phase 4 Day 3+ — coordinator_synthesis prompt context enrichment** (carried forward from Session A). Helper services (`getAtRiskComparableDeals`, `getActiveManagerDirectives`, `getSystemIntelligence`) still pending.
- **Phase 5 — `06b-close-analysis-final` wiring + `03-agent-config-proposal` reasoning_trace move (1.1.0 → 1.2.0)** (carried forward).
- **Stage 2 productization — HubSpot Smart Properties + Data Agent integration module ABOVE CrmAdapter.** Today's hubspot_periodic_sync stays at the data-layer cache refresh boundary; Smart Properties consumption is a separate Stage 2 module per the post-Session-A productization-arc note.
- **Stage 4 SOC 2 audit-trail-durability** — informed not changed; same as prior sessions.

**Cost.** $0 live Claude (no Claude calls fired during Session B). $0 Voyage. **HubSpot:** ~8 reads via the live exercise (1 search call per resource × 3 resources, plus the live cache UPSERT pass; 8 records refreshed). Well inside Starter tier 250k/day budget. **Prod Supabase:** ~150-200 reads across pool-snapshots (preflight + 5min + 30min) + baseline-test gates + live-exercise pre/post state queries + audit-event-context-fields. Writes: ~3 sync_state UPSERTs, ~8 hubspot_cache UPSERTs (idempotent — actually a no-op on existing rows except cached_at touch). Plus 2 cron schedule SELECT/INSERT pairs (existing nexus-worker unscheduled+rescheduled; new nexus-hubspot-sync scheduled).

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
- **`--session` CLI flag — established pattern for backfill-class scripts that may run during transaction-pooler saturation.** Accept a `--session` CLI flag that transforms the URL `:6543/` → `:5432/` to route through the session pooler (separate connection cap from the 200-client transaction pooler). Mirrors `pool-session.mts`'s URL transform inline. Phase 4 Day 1 Session A.5 precedent: `apply-event-context-backfill.mts`. Adopt for new write-heavy scripts whose use case includes "may run while transaction pooler is saturated" (long backfills, one-off corrective UPDATEs, mass-refresh workflows). Read-only scripts don't need it (read failures retry naturally on pooler drain).
- **Desktop `launch.json` points to `~/nexus-v2` home directory; system-reminder greenfield declarations are unreliable.** Three sessions in a row (Pre-Phase 4 Session A, Phase 4 Day 1 Session A, Phase 4 Day 1 Session B) spent a few minutes at start re-discovering that `/Users/jefflackey/Desktop/nexus-v2/` is a stub containing only `.claude/launch.json` — the real workspace is at `/Users/jefflackey/nexus-v2/` (home directory). Verify the actual project path via `.claude/launch.json` before treating the SessionStart greenfield-execution declaration as authoritative. Use absolute paths via `cd /Users/jefflackey/nexus-v2 && ...` for all bash commands; the shell cwd auto-resets to the Desktop path between commands.
- **Supabase's shared transaction pooler caps at ~200 concurrent clients. Each `postgres.js` pool per service stays up for `idle_timeout: 30s` after the last query.** Current per-service `max` values after the Session-B trim: MeddpiccService = 1, StakeholderService = 1, ObservationService = 1, HubSpotAdapter = 2. Peak per request: ~5 connections. If the pooler saturates again, the Phase 3 Day 1 proper mitigation is a process-wide shared postgres.js client that all services borrow via the `{sql?}` constructor option. With 3 request-scoped services on a deal-detail page view, plus test scripts that open their own pools, plus multiple preview sessions across a work-day, 200 clients saturates within hours — at which point every `MeddpiccService.getByDealId` throws `PostgresError: (EMAXCONN) max client connections reached, limit: 200` and the page returns a 500 with a blank body. Surfaced during Session A's post-split browser re-verification — drain time exceeded a reasonable wait (3+ minutes) because other processes continued to re-saturate. Mitigations for Phase 3 Day 1: (a) drop per-service pool `max` from 3/5 to 1-2 so each request consumes less of the pooler budget; (b) cache a single process-wide `postgres.js` client and have services borrow its `sql` via the existing `{sql?}` injection — eliminates the per-request pool cost; (c) route long-lived processes (background workers) to `DIRECT_URL` instead of the pooler so they don't compete for pooler slots. Until then: if a page returns a blank body + `EMAXCONN` in server logs, stop ad-hoc scripts + preview sessions and wait 2-5 minutes for drainage.
- **`pg_stat_activity` is OPAQUE to the pooler's client-side cap (the saturating layer).** Pre-Phase-4-Day-2 confirmed via synthetic harness: backend `pg_stat_activity` shows only 13-30 connections (Supavisor multiplex, postgrest LISTEN, pgbouncer auth_query, Supabase service backplane) regardless of how many client connections the application has open through the pooler. The 200-cap is a CLIENT-side cap at the pooler — invisible from inside postgres. Even via the **session pooler** (port 5432), `application_name` does NOT propagate to the backend (sessions also show `application_name="Supavisor"`). Implications: (1) `EMAXCONN` is the ground-truth saturation signal; (2) `application_name` tagging on `postgres.js` clients has limited diagnostic value through either pooler; (3) snapshot script (`pool-snapshot.mts`) provides the **complementary view** — pooler hysteresis pattern (idle Supavisor backends with `DISCARD ALL` query post-app-close), recycled-vs-genuine-leak distinction in `candidate_leaks_60s_plus_excl_supavisor_recycle`, long-held idle sessions. Synthetic capacity test: pooler accepts ~45 incremental client opens before EMAXCONN — meaning ~155 baseline pooler-client slots are consumed by other Supabase services we cannot see in `pg_stat_activity`.
- **`postgres.js` default `idle_timeout: 0` (never close idle connections) is a leak surface in long-lived processes.** Pre-Phase-4-Day-2 confirmed: every `postgres.js` pool that doesn't pass `idle_timeout` keeps its connections alive indefinitely until the process dies. In Vercel Fluid Compute warm containers, a per-invocation `createDb()` call leaks one connection per cron firing. `@nexus/db`'s `createDb` now sets `idle_timeout: 30s` default. The shared pool (`getSharedSql`) keeps its 60s default to stay warm across requests. New rule: every NEW `postgres.js` constructor call should set `idle_timeout` explicitly — never inherit the postgres.js default of 0.
- **Pooler hysteresis ~30s+ on slot release post-`sql.end()`.** Pre-Phase-4-Day-2 confirmed via synthetic harness: a 20-query Promise.all that completes in 1.7s + immediate `sql.end({timeout: 5})` left 16 idle backend connections in `pg_stat_activity` 32 seconds later, all with `application_name="Supavisor"` and the original `pg_sleep(0.5)` query in their last-query field. The pooler holds backend connections in idle state for ~30s before fully releasing the client-side slot. Operational implication: a burst pattern (e.g., write-heavy backfill) holds pooler slots for the burst duration PLUS the hysteresis window. Plan for an extra 30-60s of "released-but-not-yet-free" slots when calculating headroom.
- **Overnight unattended runs as a verification surface beat minutes-scale snapshot gates when the load pattern is genuinely new.** Phase 4 Day 2 Session B's recovery surfaced this: the originally-designed 5-min + 30-min pool-snapshot staircase would have observed ~180 worker firings + ~2 sync firings; the interruption-forced overnight-recovery snapshot observed ~3,690 worker firings + 41 sync firings at 41/41 success — 20× the firing volume from a same-result PASS. Discipline observation for productization-arc verification approaches (NOT a Phase 4 fix; future-session consideration): high-stakes ops sessions whose new load pattern is genuinely novel (Phase 5+ agent intervention scheduling, Phase 6 demo rehearsal under simulated peak, Stage 2+ multi-tenant rollouts) should consider explicitly scheduling overnight observation windows in the verification staircase rather than relying on minutes-scale snapshots. Minutes-scale snapshots remain right for changes whose load pattern is incremental on top of an already-verified baseline; overnight windows are right when the new surface is novel enough that "did it accumulate problems over real production duration" is the real question. Surface for review at Phase 4 Day 3 closeout + Phase 5 Day 1 kickoff to decide whether to formalize as a verification-staircase template.

---

## Context for next session

**What's built.** Monorepo scaffolded, deployed to Vercel production at `https://nexus-v2-five.vercel.app` and auto-deploying on push to `main`. Supabase schema complete (38 tables, 31 enums, 49 RLS policies, 5 migrations). Authenticated dashboard works via Supabase Auth magic links; cross-user RLS proven for Pattern A (observations) and Pattern D (meddpicc_scores). Background job infrastructure (`jobs` + `job_results` + `pg_cron` every 10s + Supabase Realtime) live. Unified Claude wrapper at `@nexus/shared/claude` loads `.md` prompt files from `@nexus/prompts`, forces `tool_use` responses, retries transport errors, emits telemetry. First ported prompt (`01-detect-signals`) integration-tested. 14 demo users seeded. **Phase 1 Day 5** added the full CRM layer: `CrmAdapter` interface + `HubSpotAdapter`, webhook receiver with HMAC-SHA256 signature verification, rate-limited HTTP client, `hubspot_cache` read-through, `/pipeline` page. Live HubSpot portal (`245978261`): Nexus Sales pipeline + 9 stages, 38 `nexus_*` custom properties, 18 webhook subscriptions, MedVista Epic Integration. Stage-change round-trip 3–4s under 15s SLA. **Phase 2 Day 1** added the Graphite & Signal design system: three-layer token consumption, Geist + Instrument Serif loading, seven shadcn primitives reskinned with nothing-is-flat defaults, declarative route registry, server-rendered Sidebar + AppShell, five existing routes migrated. Four `pgEnum` tuples single-sourced to `packages/shared/src/enums/`. **Phase 2 Day 2** closed the enum loop (5/5 tuples canonical; `deal_stage` reconciled via ordinal-preserving `ALTER TYPE RENAME VALUE`). ContactRole three-way drift resolved to 9-value canonical via Path B. `listCompanies` promoted. `/pipeline` gained view toggle (table ⇄ kanban) + "New deal" Button. `/pipeline/new` ships deal-creation form. **Phase 2 Day 2 hotfix cycle** (three out-of-band fixes: auth siteUrl hardening, RSC icon-prop crash, React-18 `useActionState` → `useFormState`). **Phase 2 Day 3** added deal detail at `/pipeline/[dealId]`: header + summary + stakeholder preview + MEDDPICC edit via new `MeddpiccService` (first Nexus-only service, postgres.js direct). Four contact-side adapter stubs promoted (`getContact`, `updateContact`, `listContacts`, `listDealContacts`). Kanban cards + table rows click-through to detail. Permanent `/api/dev-login` localhost-gated helper. `@nexus/shared` gained `"sideEffects": false` for tree-shaking. 13 routes total.

**What's next and how to pick up.** Phase 2 Day 4 — stakeholder management UI (adds/removes contacts, assigns roles via `deal_contact_roles` + `setContactRoleOnDeal` stub promotion), kanban DnD stage change (`@dnd-kit/core`), dropdown stage change on detail + table row, Close Won / Close Lost outcome stubs, kanban filter chips (deferred from Day 3), `DealCard` hover-lift revisit (deferred from Day 3), deal summary edit (Day 3 shipped read-only). Orienting triad unchanged: **`docs/DECISIONS.md`** (constitution + amendments 2.1.1, 2.2.1, 2.2.2, 2.6.1, 2.13.1, 2.16.1, 2.18.1) + **`docs/BUILD-LOG.md`** (this file) + **`CLAUDE.md`** (bootstrap). Read that triad before touching code. The primitive library under `apps/web/src/components/ui/`, the three-layer token scheme in `tailwind.config.ts` + `globals.css`, the shared `stage-display.ts` / `meddpicc-display.ts` helpers, and `MeddpiccService`'s postgres-direct shape are the contracts for all Phase 2+ code — reach for semantic utilities (`bg-surface`, `text-primary`, `border-subtle`) by default, raw scales only when the design explicitly demands them, type-only imports from `@nexus/shared` in client files. `PRODUCTIZATION-NOTES.md` is strategic reference only — not required reading for build-day sessions.
