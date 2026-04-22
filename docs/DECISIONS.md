> **Fork notice — this is the active working copy for Nexus v2.**
>
> This file was forked from `~/nexus/docs/handoff/DECISIONS.md` at the v1 handoff baseline. The handoff copy is **frozen** as historical reference; all v2-era amendments land here.
>
> Amendments extend the handoff's numbering with a sub-section suffix — e.g. the first Day-2 amendment to §2.2 is §2.2.1. Every amendment carries LOCKED/OPEN/PENDING status plus a Phase reference. Future sessions read this file only.

---

# Nexus Rebuild — Decisions Log

**Purpose:** Single source of truth for product and architectural decisions made during the Nexus → Codex rebuild planning. Both Claude (planning chat) and Claude Code (extraction sessions) read this file for context.

**Status key:**
- **LOCKED** — decision made, do not relitigate
- **OPEN** — identified as a decision Jeff needs to make; Claude should prompt him when relevant
- **PENDING INPUT** — Claude has a recommendation; awaiting Jeff's call
- **DEFERRED** — decision explicitly punted until later phase

**How to use this file:**
- Claude Code: read this at the start of every session after reading CLAUDE.md. When generating the critique (09) and rebuild plan (10), treat LOCKED decisions as constraints and PENDING items as Jeff's call to make. Surface OPEN items to Jeff before picking defaults.
- Jeff: update this file (or ask Claude to update it) whenever a new decision is made. Commit to `docs/handoff/DECISIONS.md` so Claude Code sees the latest version on every new session.

---

## Part 1 — Product Vision Decisions

### 1.1 Closed-Lost Analysis (LOCKED)

**Experience:**
- Sarah clicks "Close Lost" → loading state while AI analyzes in background
- AI reads every signal: oDeal gaps, MEDDPICC gaps, timeline, promises made/kept, stakeholder engagement, deal size, stage velocity, transcript content, email patterns
- AI produces a strategic-VP-of-Sales-grade hypothesis — an argument with depth, not a summary
- **Sarah sees the hypothesis first.** She reacts to the AI's argument, not a blank form.
- System asks pointed questions dynamically generated from the hypothesis
- Always-present open-ended question: "In your own words, why do you think we lost this?"
- Reconciliation between AI hypothesis and Sarah's response is stored as its own data — this is the learning signal
- Close-lost analysis page shows hypothesis, responses, reconciliation, and cross-deal comparisons

**Architecture:**
- Continuous pre-analysis on every transcript and email (lightweight Claude call updates a rolling "deal theory")
- Close Lost triggers a final deep pass that reads the deal theory + everything else
- Cost is not a constraint. Build the heavy version.
- **Current Nexus does NOT meet this spec.** v2 must implement the continuous pre-analysis path.

**Taxonomy (four overlapping dimensions):**
- Loss reason, Objection, Friction, Gap — each seeded at launch.
- Uncategorized reasons flagged as candidates; 3+ similar candidates prompt human promotion.
- Current Nexus has hardcoded taxonomy in `StageChangeModal`. v2 builds the promotion flow.

**Hypothesis validation:** Close-lost hypotheses verified against event stream before surfacing (see 2.21).

### 1.2 Research-Interview Pattern (LOCKED)

Every capture moment: AI reads full context → generates an argument → asks user to react to it. Not forms.

Applies to: close-lost, observation capture, call prep feedback, any future capture surface.

### 1.3 Experiments — What Exists vs. What's Missing (LOCKED)

**Preserve:** proposal UI, Marcus-approved lifecycle UI, rep assignment, surfacing in call prep.
**Build:** POST /api/experiments route, attribution on transcripts/emails, applicability gating (2.21).

### 1.4 Three Categories of Experiments (LOCKED)

1. In-conversation. Attribution at transcript processing time.
2. Out-of-conversation. Attribution at email/activity event time.
3. Implicit/approach. Rubric-based scoring with visible confidence.

All three carry structured applicability rules (2.21).

### 1.5 Experiment Lifecycle and Mode (LOCKED)

- Lifecycle: `proposed → active → graduated` or `killed`. Evidence thresholds.
- Soft mode only. Non-compliance logged, not enforced.

### 1.6 Experiment Proposal Paths (LOCKED)

- Leadership/Enablement → runs immediately
- AE proposes → Marcus approves → runs
- AI (intelligence coordinator) proposes → surfaces to Enablement

### 1.7 oDeal vs. Experiments (LOCKED)

Separate in UI, unified in data model and analysis pipeline.

### 1.8 Out of Scope for Rebuild (LOCKED)

Role-based surfacing, multi-tenancy, guided tour.

### 1.9 Features Preserved from Current Nexus (LOCKED)

Pipeline (HubSpot-backed), deal detail with MEDDPICC tabs, stakeholder maps, activity feeds, transcript analyzer, agent config, observation system, intelligence dashboard, playbook/experiments UI, call prep, follow-up email drafting, agent memory (event-sourced), agent interventions (data-driven), 14-person demo org, vertical-specific demo data, Framework 21 interaction patterns, three-act demo narrative.

### 1.10 Candidate Dead-Code Routes (LOCKED)

Cut from v2: `/api/activities`, `/api/team-members`, `/api/observation-routing`, `/api/observations/clusters`, `/api/demo/prep-deal`.

### 1.11 Future State Capabilities — Designed-For, Not Built-For (LOCKED)

1. Deal simulation
2. Rep coaching replay
3. Proactive outreach prioritization
4. Real-time competitive intelligence
5. Cross-account intelligence (via `people` table)
6. Automatic playbook generation
7. Defensible forecasting
8. Experiment evidence compounding

### 1.12 Dead Pages and Placeholder Routes (LOCKED)

Cut: `observations-client.tsx`, `/agent-admin`, `/team`.

### 1.13 Deal Creation as a First-Class Feature (LOCKED)

First-class UI surface. Adapter creates in HubSpot + initializes Nexus intelligence shell. MEDDPICC edit UI ships in v2.

### 1.14 AgentIntervention Must Be Data-Driven (LOCKED)

No name-based scaffolding. Structured applicability rules (2.21). Surfaced via `DealIntelligence.getApplicable*()`.

### 1.15 Surfacing UX — Ambient + Quiet Digest (LOCKED)

**Philosophy:** the rep's attention is the scarce resource. Nexus earns each surface by proving it's worth interrupting the thought. When Nexus doesn't have something worth saying, it says nothing.

**Surface modes:**
- **Ambient (primary):** intelligence is woven into surfaces reps already visit — call prep briefs, deal detail cards, intelligence dashboard. No notifications, no banners, no real-time alerts.
- **Daily digest (secondary):** once-per-day email or in-app summary of what changed across the rep's deals. 3-5 items max. Short enough to read in 2 minutes.
- **Critical inline card (rare):** the intelligence dashboard gets a prominent card when a coordinator pattern crosses a 7-figure ARR threshold or a deal's health score drops past a preset floor. Non-modal, non-paging. Still ambient.
- **No push notifications, no in-app banners that interrupt a workflow, no email blasts.** The product is not allowed to interrupt.

**Applies to every intelligence surface:** pattern detections, risk signals, experiment attribution updates, coordinator insights, intervention recommendations.

### 1.16 Surfacing Admission — Thresholds With Visible Scores (LOCKED)

**Admission to a surface is threshold-based.** Each surface type has hardcoded rules that decide whether a candidate insight qualifies. Examples:

- A coordinator pattern qualifies when 3+ deals share the signal AND the aggregate pipeline impact exceeds a configurable floor
- A risk flag qualifies when the deal's computed health score crosses a threshold (initial: 60)
- An experiment result qualifies when at least N attributed deals have both experiment behavior and deal outcome data
- A new-category candidate qualifies when 3+ deals have uncategorized reasons that cluster by prompt-generated signature

**Scoring for ordering, not admission.** Once a candidate qualifies, Claude assigns an importance score used for ordering within the surface (e.g., which pattern shows first on the dashboard). The score is visible in the UI so reps understand why one item ranks higher than another.

**Thresholds are configurable but default.** Codex ships v1 with the thresholds above. Admin UI to adjust is future work (deferred).

**Scores are transparent.** Every scored insight carries a short explanation: "Scored 87/100 — three deals affected, $420K pipeline, 12 days of silence on two of them." Reps can click through to the reasoning.

**Human curation is reserved for one case:** promoting new categories into the taxonomy (1.1). Not used for insight admission.

### 1.17 Surfacing Dismissal and Feedback (LOCKED)

**Default dismissal is soft: re-surface after 7 days if still applicable.**

- **Soft dismiss** (default action): insight hidden for 7 days. If still applicable per 2.21, it re-surfaces. If no longer applicable (e.g., the gap it flagged has been addressed), it stays dismissed.
- **Hard dismiss** ("never show this for this deal"): available but not the default. Used for insights that the rep confirms are genuinely not relevant to the specific deal context. Logged per-deal.
- **"This is wrong" feedback**: explicit button alongside dismissal. Opens a short inline form: "What's wrong about this?" Free text + optional tags (not applicable, inaccurate, unhelpful framing, wrong stakeholder). Feedback writes to a dedicated table that trains future surfacing.
- **No snooze.** 7-day soft dismiss covers the use case; adding snooze creates clutter.

**Feedback as learning signal.** The "this is wrong" events become a data stream the coordinator and applicability engine both read. Over time, patterns emerge (e.g., "Sarah consistently says our competitive signals are wrong" → potential sign the classifier is over-triggering on competitive signals in Healthcare). Feedback surfacing to leadership is out of scope for v1 but designed-for.

### 1.18 Surfacing Silence — Empty States Are A Feature (LOCKED)

The system is intentionally silent when silence is correct. Specific rules:

- **Low-confidence detections do not surface.** Every classifier, pattern detector, and coordinator synthesis prompt emits a confidence score. Below threshold → the detection is logged but not surfaced.
- **Applicability gate rejections are silent.** The rejection log is diagnostic only, not a user surface.
- **Daily digest has a "nothing new" state.** Days where no qualifying insight surfaced → digest says "Nothing new to tell you today" and nothing else. This is a feature — it builds trust that when Nexus DOES speak, it's worth listening.
- **First 48 hours of a new deal is observation-only.** The system ingests transcripts and events but surfaces nothing. No patterns on a single data point. No risk flags on a brand-new deal. Gives reps space to set context before intelligence starts opining.
- **Single-data-point patterns don't surface.** Coordinator requires 2+ deals minimum to even consider synthesis; some pattern types require 3+ (per 1.16 thresholds).

Codex enforces: every surface has a defined empty state UI that says "nothing to show" in a way that feels intentional, not broken.

---

## Part 2 — Architectural Decisions

### 2.1 Authentication Strategy (RESOLVED — Option A)

Real authentication from day one. Supabase Auth + RLS enforcement on every Nexus-owned table. User session binds to a row in `users`. Rep identity flows into Claude prompts. Admin role for dev bypass only. Persona-switching pattern removed. Day-1 implementation in Phase 1 Day 2.

### 2.2 Database Hygiene — Full Migration Scope (RESOLVED — Option A)

Full hygiene pass at v2 genesis:
- 20+ text-shaped enum columns → proper Postgres enums or lookup tables
- RLS on every Nexus-owned table
- Indexes on every FK
- Explicit ON DELETE per relationship's semantics
- Heterogeneous FKs split into discriminated nullable pairs
- uuid[] arrays → proper FK join tables
- Schema typos corrected
- Dropped tables from 07B findings: `agent_actions_log`, `deal_agent_states`, `deal_stage_history`
- All schema changes as numbered Drizzle migrations. No manual DB edits.

### 2.3 Observation → Deal Relationship (RESOLVED — Option A)

Many-to-many via `observation_deals` join table:

```sql
observation_deals (
  observation_id uuid NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  deal_id uuid NOT NULL REFERENCES deals_cache(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (observation_id, deal_id)
)
```

Eliminates `observations.linked_deal_ids uuid[]`. FK enforcement at DB level. Enables cross-deal coordinator patterns naturally.

### 2.4 Column Naming Conventions (LOCKED)

`observations.observer_id`, `raw_input`, `ai_classification`. Observation↔deal links via `observation_deals` join table (2.3). camelCase equivalents in API routes.

### 2.5 Surfacing Strategy (RESOLVED — Parts A + B)

**Part A (applicability):** resolved via 2.21.

**Part B (prioritization, frequency, dismissal, silence):** resolved via new sections 1.15, 1.16, 1.17, 1.18.

### 2.6 Infrastructure / Long-Running Workflows (RESOLVED)

Rivet REMOVED. Stack: Postgres `jobs` table + Next.js worker + `pg_cron` + Supabase Realtime.

### 2.7 Prompt Preservation (LOCKED)

Verbatim except rewrites in `04C-PROMPT-REWRITES.md`.

### 2.8 Context Assembly Audit (COMPLETED)

Prompt 7.5 ran. Output: `07A-CONTEXT-AUDIT.md`.

### 2.9 Timeout / maxDuration Policy (LOCKED)

Every route declares `maxDuration` explicitly.

### 2.10 Single Write-Path per Domain Concept (LOCKED)

2+ write sites → service function.

### 2.11 No Trust Flags on User Input (LOCKED)

No client-controlled trust flags.

### 2.12 Server-to-Server Work Uses Function Calls, Not HTTP (LOCKED)

Shared logic in `services/`.

### 2.13 Unified Claude Integration Layer (LOCKED)

One wrapper, tool-use structured outputs, explicit per-task temperatures, one formatter module, one signal-type enum, one transcript preprocessor, one email service, prompts as `.md` files.

### 2.14 Coordinator Synthesis Prompt Anomaly (RESOLVED in 4.7)

Fixed in rewrite #4 in 04C.

### 2.15 Prompt Analysis Phase (COMPLETED)

4.5a, 4.5b, 4.6, 4.7.

### 2.16 Intelligence Service Architecture (LOCKED)

Event-sourced `deal_events`. Snapshots. `DealIntelligence` service as sole interface. No actors, no daemons.

### 2.17 Coordinator Architecture (LOCKED)

Scheduled (pg_cron) + on-demand. Call prep MUST query the coordinator. `coordinator_patterns` is the authoritative table.

### 2.18 CRM Strategy — HubSpot Starter Customer Platform Hybrid (LOCKED)

HubSpot Starter tier. `CrmAdapter` pattern. All 38 custom properties ship as first-class HubSpot fields. Read-through cache for demo resilience.

### 2.19 Data Boundary (LOCKED)

**HubSpot:** deals, contacts, companies, native activities, stages, pipelines.
**Nexus:** `deal_events`, `deal_snapshots`, `observations`, `observation_deals`, `coordinator_patterns`, `experiments`, `transcripts`, `meddpicc_scores`, `people`, rep/user accounts, surfacing-related tables (dismissals, feedback — see 1.17).
**Split:** stakeholders (identity in HubSpot, engagement analysis in Nexus events).
**Sync:** HubSpot → Nexus webhooks + periodic. Nexus → HubSpot only for AI custom properties.

### 2.20 New Extraction Prompts for HubSpot Planning (COMPLETED)

07B, 07C, and 7.7 Addendum all complete.

### 2.21 Deal-Context Applicability Gating (LOCKED)

Every surface passes three gates: stage applicability, temporal applicability, precondition applicability.

Structured `applicability` JSONB on experiments, patterns, flags. `DealIntelligence.getApplicable*()` methods. Rejections logged. Close-lost hypotheses verified against event stream.

### 2.22 UI Architecture for v2 (LOCKED)

Design tokens, no inline styling. Client component files ≤400 LOC. Declarative route registry. One UI primitive library. Fonts actually load.

### 2.23 Dead Code Discipline (LOCKED)

No zero-importer components, redirect-only shells, "Coming Soon" placeholders.

### 2.24 Pipeline Simplification (LOCKED)

No backward-compat placeholders. Sequential job rows. Target ~6-8 steps.

### 2.25 Cross-Flow Debt to Eliminate in v2 (LOCKED)

All cross-flow debt items addressed by the decisions above.

### 2.26 Surfacing Implementation Requirements (LOCKED)

Derived from 1.15 through 1.18. Codex must build:

- **Surfaces registry.** A TypeScript module defining every surface (call prep, deal detail, intelligence dashboard, daily digest, etc.) with its admission thresholds, maximum item count, and empty-state UI.
- **Admission engine.** Reads candidate insights from `coordinator_patterns`, `deal_events` (for risk flags), `experiment_attributions` (for experiment results), etc. Filters through applicability gate (2.21). Applies threshold rules. Emits admitted set.
- **Scoring pass.** Admitted candidates scored by Claude (prompt: "score this insight 0-100 for importance given this deal's context"). Score + reasoning stored with the insight.
- **Dismissal table.** `surface_dismissals (user_id, insight_id, insight_type, deal_id, mode ('soft'|'hard'), dismissed_at, resurface_after)`. Queried before rendering.
- **Feedback table.** `surface_feedback (user_id, insight_id, insight_type, deal_id, reason_tags, free_text, created_at)`. Feeds learning signal.
- **Daily digest job.** pg_cron scheduled. Queries admitted-set per user over last 24h (minus dismissals). Emits 3-5 items. "Nothing new" state when empty.
- **Empty states by design.** Every surface has a defined empty-state UI. Not an afterthought.
- **Confidence and score visible.** Every surfaced insight carries score + explanation. Reps can expand for full reasoning.

### 2.2.1 Day-2 Implementation Clarifications (LOCKED — Phase 1 Day 2)

The following architectural decisions emerged during Phase 1 Day 2 execution and are locked for Phases 3–6. They are clarifications of 2.1 and 2.2, not new decisions.

**Admin role implementation (2.1):** `users.is_admin boolean NOT NULL DEFAULT false` + `public.is_admin()` SECURITY DEFINER STABLE helper function referenced in every RLS policy's `OR public.is_admin()` clause. No roles table, no Supabase custom JWT claims. If a true multi-role model is ever needed post-demo, it adds alongside the boolean without touching existing policies — the helper function is the migration seam. Demo personas all have `is_admin=false`; the flag is set manually when a developer needs to bypass RLS temporarily.

**Experiment structure (2.2 hygiene applied beyond §4.2):** experiments use four tables, not two. §4.2 lists `experiments` and `experiment_attributions`; two additional tables emerged from applying §2.2's "no uuid[] arrays" rule:
- `experiments` — definition, lifecycle, structured applicability JSONB
- `experiment_assignments` — rep assignment rows (replaces the v1 `test_group uuid[]` array on experiments)
- `experiment_attributions` — per-transcript/email attribution of experiment behavior
- `experiment_attribution_events` — evidence event links (replaces the v1 `evidence_event_ids uuid[]` array)

Phase 5's experiment lifecycle work reads all four tables. This four-table structure supersedes §4.2's two-table listing.

**RLS conservative defaults parked for Phase 5 (1.17, 2.21):** Two tables ship with read-all-authenticated policies pending a UI-driven refinement in Phase 5:
- `agent_config_proposals` — currently any authenticated user reads all; Phase 5 likely scopes by manager-of-team_member or team_member owning the config.
- `field_queries` — currently any authenticated user reads all; Phase 5 likely scopes by initiator (team_member or support_function_member) and audience.

Both are flagged in migration 0001. Phase 5 Day 1 tightens them when the consuming UI lands and the access pattern is observable.

**RLS policy patterns (2.1):** Four canonical patterns, applied consistently:
- Own-rows: `observations`, `agent_configs` (via team_members), `surface_dismissals`, `surface_feedback`, and user-authored content
- Team-scoped read-all, update-own: `team_members`, `support_function_members`
- Org-shared reference (read-all-authenticated, service-role-writes): `system_intelligence`, `knowledge_articles`, `manager_directives`
- Append-only events (read-all-authenticated, service-role-writes): `deal_events`, `deal_snapshots`, `coordinator_patterns`, `coordinator_pattern_deals`, `experiment_attributions`, `experiment_attribution_events`

Phase 3+ services writing to append-only tables use the service-role client; never the user-session client.

### 2.2.2 `deal_fitness_scores` Column Set — `readness` Typo Resolved by Elision (LOCKED — Phase 1 Day 2)

V1 `deal_fitness_scores` had three sibling count columns per oDeal category: `<cat>_fit_score`, `<cat>_fit_detected`, `<cat>_fit_total`. The `readiness_fit_detected` column was typo'd to `readnessFitDetected` in the TypeScript property name (SQL column was correct) — flagged in CRITIQUE §4.3 and the Day-2 prompt asked for correction.

**Resolution:** v2 elides the `<cat>_fit_detected` and `<cat>_fit_total` counter columns entirely. These are redundant in v2's event-stream design: `deal_fitness_events` has `detected boolean` per row, so detected/total counts are derived at read time via `COUNT(*) FILTER (WHERE detected)` and `COUNT(*)` grouped by `fit_category`. Storing the same information as both event rows AND score-table integers was the v1 double-state bug (same family as `coordinated_intel` in `deal_agent_states`).

**v2 keeps only the aggregated score column** — `readiness_fit_score` — correctly spelled. Phase 5 Day 1 reads detected/total counts from `deal_fitness_events` when rendering the "N/M detected · pct%" pill on the Deal Fitness page. Do not re-add the counter columns.

---

## Part 3 — Design System

### 3.1 Visual Rebrand — Anthropic → OpenAI Aesthetic (LOCKED)

Design in a separate Claude chat. "In the spirit of" OpenAI, not clone. Do NOT copy `#10A37F`.

Deliverable: `docs/handoff/DESIGN-SYSTEM.md`. Timing: between Codex Phase 1 and Phase 2.

### 3.2 Ongoing Design Collaboration During Build (LOCKED)

**Mode 1 (foundation):** `DESIGN-SYSTEM.md` with tokens, primitives, Framework 21 re-skinned.
**Mode 2 (per-feature sessions):** Claude designs hero pages as full artifacts. Pages: close-lost, intelligence dashboard, call prep brief, observation capture, deal detail. Plus per 1.15-1.18 additions: **daily digest UI**, **empty-state treatments**, **score/reasoning surfaces**.

Handoff: Mode 1 → `DESIGN-SYSTEM.md`. Mode 2 → `docs/design/<page-name>.md` + artifact.

---

## Part 4 — All Planning Conversations Complete

Every PENDING and OPEN item is now resolved. Ready for Prompt 9.

---

## Part 5 — Updated Claude Code Prompt Sequence

- ✅ Prompt 0 through Prompt 8 (all extraction + source copy + planning)
- ⏳ **Prompt 9 — Critique (next)**
- Prompt 10 — Rebuild Plan
- Prompt 11 — Final Packaging

---

## Part 6 — Guardrails for Codex

1. Prompts from 04-PROMPTS.md preserved verbatim except those rewritten in 04C-PROMPT-REWRITES.md.
2. Schema-first design. Migrate schema before code.
3. Every capture moment is a research interview, not a form.
4. No dual persistence except the explicit HubSpot/Nexus split (2.19).
5. Long-running operations are background jobs.
6. oDeal and experiments share a data pipeline but present separate UI narratives.
7. Soft-mode experiments only.
8. "Nexus Intelligence" is the voice. Never frame AI outputs as coming from a person.
9. Inline rendering for all AI responses. No toasts for meaningful content.
10. Cost is not a constraint in this phase.
11. `DESIGN-SYSTEM.md` authoritative for visual decisions. `docs/design/<page>.md` authoritative per-page.
12. Every route declares `maxDuration` explicitly.
13. Any domain concept with 2+ write sites goes through a service function.
14. No client-controlled trust flags.
15. Server-to-server work is a function call, not HTTP.
16. All Claude calls go through the unified client wrapper.
17. Structured outputs use tool use, not JSON-in-text regex parsing.
18. Temperature is set explicitly per call by task type.
19. Prompts live as `.md` files loaded at runtime.
20. One formatter module for currency/dates/names/stages.
21. One transcript preprocessing pass produces the canonical analyzed-transcript object.
22. Single source-of-truth enum for signal types.
23. All deal/contact/company data access goes through `CrmAdapter`.
24. Intelligence state is event-sourced. `deal_events` append-only.
25. `DealIntelligence` service is the only interface for intelligence data.
26. Coordinator runs in scheduled + on-demand modes; call prep must query it.
27. `people` table exists from day one.
28. Rivet is removed.
29. HubSpot cache read-through.
30. Architecture decisions must not preclude any Future State Capability in 1.11.
31. Nothing surfaces without passing the applicability gate (2.21).
32. Applicability rules are structured data (JSONB), never prose.
33. Close-lost hypothesis verified against event stream before surfacing.
34. No inline hex colors, fonts, or backgrounds.
35. Client component files hard-capped at ~400 LOC.
36. Nav is a declarative route registry.
37. UI primitives from ONE library.
38. Fonts referenced in code must load.
39. Zero-importer components, redirect-only shells, "Coming Soon" pages do not ship.
40. Deal creation + MEDDPICC edit UI are Day-1 features in v2.
41. No name-based demo scaffolding.
42. Pipeline steps do real work. No placeholders.
43. AI-driven config mutations are proposals, not direct writes.
44. HubSpot is on Starter Customer Platform tier. All 38 custom properties as first-class fields.
45. Real authentication from day one via Supabase Auth + RLS (2.1).
46. Full database hygiene at v2 genesis (2.2).
47. Observation↔deal via `observation_deals` join table (2.3).
48. Surfacing is ambient + daily digest. No push notifications, no banners, no real-time alerts (1.15).
49. Surface admission is threshold-based. Claude scores for ordering only. Scores and reasoning are visible in UI (1.16).
50. Dismissal defaults to 7-day soft-resurface. Hard-dismiss available. "This is wrong" feedback writes to learning table (1.17).
51. The system is allowed to say nothing. Empty states are intentional. Low-confidence insights don't surface. New deals get 48-hour observation periods. Daily digest has a "nothing new" state (1.18).
