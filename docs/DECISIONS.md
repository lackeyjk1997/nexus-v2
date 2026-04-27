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

### 2.1.1 Supabase Auth URL Configuration + Magic-Link Redirect Discipline (LOCKED — Phase 2 Day 2 hotfix)

Background: Phase 2 Day 2 ended with a production auth loop. Users clicked the magic link and landed at `https://nexus-v2-five.vercel.app/?code=<code>` (Site URL root) instead of `/auth/callback?code=<code>`. The landing page had no code-exchange logic; session never established; login looped. Diagnosis: `NEXT_PUBLIC_SITE_URL` was not set on Vercel, so `env.siteUrl` on the server fell back to `"http://localhost:3001"`. The resulting `emailRedirectTo: "http://localhost:3001/auth/callback"` is an HTTPS → HTTP downgrade that Supabase silently rejects; Supabase's documented fallback is to use the dashboard-configured Site URL **root** for the redirect, with no path. The user lands at `/` with a live `?code=` param and no handler.

Three rules now locked as the build contract:

1. **Supabase Auth → URL Configuration must be set to production** for production logins. Dashboard state:
   - **Site URL:** `https://nexus-v2-five.vercel.app` (the stable production alias).
   - **Redirect URLs list:** includes `https://nexus-v2-five.vercel.app/auth/callback` AND `http://localhost:3001/auth/callback` (retained for dev).
   Changing the production URL requires the dashboard update before any code change, or loading breaks.

2. **Magic-link `emailRedirectTo` is always passed explicitly.** The server action computes `${env.siteUrl}/auth/callback`. `env.siteUrl` resolves through a four-step chain: `NEXT_PUBLIC_SITE_URL` → `VERCEL_PROJECT_PRODUCTION_URL` → `VERCEL_URL` → `http://localhost:3001`. Preferred: set `NEXT_PUBLIC_SITE_URL` on Vercel (all three scopes) so the first tier resolves and the fallback chain is never exercised.

3. **Landing page `/` forwards stray `?code=` params to `/auth/callback`** as defense-in-depth. Any future drift (allowlist typo, dashboard misconfig, Supabase downgrade behavior change) that strands a user at Site URL root with a valid code is caught by this forward, not a loop. The forward is narrow: only `?code=` triggers it; the page renders normally otherwise.

Rules apply to any future auth surface (password reset links, invite flows, SSO callbacks) — pass an explicit `redirectTo` / `emailRedirectTo` that matches an allowlist entry exactly, never rely on the Site URL default.

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

### 2.6.1 pg_cron Secret Handling (LOCKED — Phase 1 Day 3)

Background: Day 3 attempted to source the worker URL and CRON_SECRET from ALTER DATABASE ... SET custom GUCs. Supabase denies these for the project's postgres role (permission denied on custom GUCs). Fallback: embed URL + Bearer secret as SQL literals inside the cron.job.command body.

Decision: Acceptable. cron.job is visible only to the service role, which can already read every project secret and bypass RLS — the trust boundary does not expand. Rotation remains simple: update CRON_SECRET in Vercel (all 3 scopes) → `npx vercel env pull` → `pnpm configure-cron <prod-url>`.

If this project ever has compliance surface (SOC 2, HIPAA, PCI), revisit: cron.job literals appear in pg_dump output and schema backups; a proper secrets manager would be required then.

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

### 2.13.1 Day-4 Implementation Clarifications (LOCKED — Phase 1 Day 4)

Three decisions emerged during Day 4 integration of the Claude wrapper. They
extend 2.13's "unified Claude layer" without superseding it.

**max_tokens for `01-detect-signals` locked at 6000** (was 3000 in 04C Rewrite
1). The rewrite's annotation "raised from 2048 to accommodate per-signal
confidence + rationale field" was empirically insufficient: the first real
integration run against a 1448-word fixture hit `stop_reason: max_tokens` mid
`tool_use` block at 2999 output tokens. At 10 signals (schema `maxItems` cap)
plus 2–4 stakeholder insights, realistic ceiling is 4500–5000; 6000 gives
headroom for denser transcripts and richer context blocks. The `.md` front
matter in `packages/prompts/files/01-detect-signals.md` is the source of
truth — do not re-sync back to 04C Rewrite 1's 3000 on future rewrite-doc
reviews.

**reasoning_trace / analysis_passes across the 9 rewrites — calendared
resolution per prompt.** 04C Principle 6 requires a reasoning-first field as
the first property for classification-with-judgment, synthesis, and
hypothesis-generation prompts. Day-4 audit across all 9 rewrite files found
the pattern inconsistently applied. Present: 02, 04, 05, 06b. Per-prompt
resolution:

- **01-detect-signals (clear gap).** Update 04C Rewrite 1 to add
  `reasoning_trace: string` as the first property of the `record_detected_signals`
  tool schema. Bump prompt version `1.0.0 → 1.1.0` in
  `packages/prompts/files/01-detect-signals.md`. **MUST land before Phase 3
  Day 2** (transcript pipeline wires this prompt). The Phase 3 Day 1 kickoff
  prompt includes this as a pre-execution step so it cannot be missed.
- **03-agent-config-proposal (clear gap).** Update 04C Rewrite 3 so
  `reasoning_trace` is the first property. The existing `decision_rationale`
  field (2nd property today) either renames to `reasoning_trace` and moves to
  first position, or a new `reasoning_trace` is added with `decision_rationale`
  evaluated for redundancy — Phase 5 makes the call when wiring. Bump prompt
  version `1.0.0 → 1.1.0`. **MUST land before Phase 5 Day 1** (agent config
  proposal queue).
- **06a-close-analysis-continuous (judgment call).** Per-section
  `triggered_by_quote` serves as micro-reasoning; reasoning-first as a
  top-level field is defensible as absent. **Review at Phase 5 Day 1 kickoff**;
  revisit only if continuous-theory updates produce weak reasoning in practice.
  Default: leave as-is.
- **07-give-back (exempt).** Voice/generative task; Principle 6 explicitly
  exempts. No action.
- **08-call-prep-orchestrator (arguable gap).** The `integration_notes` field
  is post-hoc coherence flagging, which is weaker than reasoning-first for
  integrative synthesis at temperature 0.3. **Review at Phase 5 Day 1
  kickoff**; if the first production call-prep runs show incoherent section
  integration, add `reasoning_trace` before more phase work depends on it.

Any production run where `stopReason === "max_tokens"` is a separate signal
(see telemetry pattern below) and triggers a per-prompt budget bump, not an
architectural change.

**Dotenv `override: true` convention for Claude-calling scripts.** Claude
Code's shell exports `ANTHROPIC_API_KEY=""` (empty string) to prevent subagents
from calling Claude with the parent's credentials. Dotenv's default
`override: false` preserves the empty value even when `.env.local` has a real
one, silently breaking the wrapper's `!process.env.ANTHROPIC_API_KEY` guard.
Every Phase 3+ script that calls the Claude wrapper (transcript pipeline
tests, coordinator synthesis triggers, intervention probes, give-back
dry-runs, close-analysis one-offs) loads env with:

```ts
import { config as loadEnv } from "dotenv";
loadEnv({ path: resolve(__dirname, "../../../.env.local"), override: true });
```

Phase 3 Day 1 should consolidate this into a shared helper
(`packages/shared/src/env.ts` exposing `loadDevEnv()`) so every Claude-calling
script invokes the same function. Until then, copy-paste the pattern. Scripts
that don't call Claude (seeds, migrations, verification utilities) don't need
override because no shell-exported env var shadows their config.

**Telemetry as a prompt-quality early-warning.** The Claude wrapper emits one
JSON line per call to stderr with `stopReason`, `inputTokens`, `outputTokens`,
`attempts`. Any production run where `stopReason === "max_tokens"` is an
empirical signal the prompt's token budget is insufficient. Phase 3+ is
expected to watch for this pattern in transcript-pipeline logs and bump
per-prompt budgets reactively rather than speculatively pre-bumping in 04C.

**ContactRole canonical taxonomy locked at the 9-value schema-side set
(LOCKED — Phase 2 Day 2).** Values: `champion, economic_buyer,
decision_maker, technical_evaluator, end_user, procurement, influencer,
blocker, coach`. Canonical tuple in
`packages/shared/src/enums/contact-role.ts`; schema pgEnum imports it;
HubSpot `nexus_role_in_deal` contact property options aligned to the same
9 via `scripts/hubspot-align-role-options.ts`; prompt rewrites
`08-call-prep-orchestrator.md` (line 260) and `05-deal-fitness.md` (line
291) updated to match (front-matter versions bumped 1.0.0 → 1.1.0); 04C
rewrite source (lines 1450 + 2483) updated to mirror. The previously-
used `ciso` and `other` values are retired — `ciso` was a title-encoded
specialization of `technical_evaluator` that conflated role (function)
with title (position); `other` was a code smell in a closed taxonomy.
Phase 5 Day 1 port of 08-call-prep-orchestrator consumes the 9-value
canonical unchanged (no further rewrite work).

**`observations.signal_type` nullable invariant (LOCKED — Pre-Phase 3
Session 0-A).** As of migration 0005 (Session 0-B), `observations
.signal_type` is nullable. Semantics: `signal_type IS NULL` iff the row
was captured outside the signal-classifier path; `source_context
.category` identifies the alternate path (e.g., `close_lost_preliminary`
from Session B's `ObservationService.record` path). Coordinator and
pattern-detection queries that group by `signal_type` MUST filter
`WHERE signal_type IS NOT NULL` — treating null rows as classified
signals would pollute Phase 3 Day 2 coordinator synthesis with
rep-typed captures that Claude never classified. Existing Session B
rows carrying `signal_type = 'field_intelligence'` +
`source_context.category = 'close_lost_preliminary'` remain valid; the
discriminator column unambiguously identifies them. Phase 5 Day 1's
formal close-lost capture flow per §1.1 migrates these via
`WHERE source_context->>'category' = 'close_lost_preliminary'`.
`ObservationService.record` signature is updated to accept optional
`signalType?: SignalTaxonomy` — category-driven captures pass null.
Foundation-review anchor: Output 2 A1.

**MEDDPICC canonical dimensionality locked at 8 values (LOCKED —
Pre-Phase 3 Session 0-A).** The canonical set is `metrics,
economic_buyer, decision_criteria, decision_process, identify_pain,
champion, competition, paper_process` per
`packages/shared/src/enums/meddpicc-dimension.ts`. All four drift
vectors now track the same 8: (1) schema.ts `meddpicc_scores` carries
8 score columns; (2) the TS `MeddpiccDimension` union enumerates 8;
(3) prompt rewrites `06a-close-analysis-continuous.md` +
`05-deal-fitness.md` + `08-call-prep-orchestrator.md` reference 8;
(4) HubSpot `packages/shared/src/crm/hubspot/properties.ts`
provisions 8 `nexus_meddpicc_*_score` properties (39th property
`nexus_meddpicc_paper_process_score` added Session 0-C). `paper_process`
is canonical MEDDPICC (Miller Heiman) and not optional. v1's 7-dim
HubSpot provisioning was a drift this amendment closes via the
three-way drift pattern §2.13.1 protects against per the ContactRole
precedent. The canonical count also corrects 07C §3.1's stale
"average across 7" description — overall score is the rounded mean
of all present non-null dimension scores across 8. Foundation-review
anchor: Output 3 W1.

### 2.14 Coordinator Synthesis Prompt Anomaly (RESOLVED in 4.7)

Fixed in rewrite #4 in 04C.

### 2.15 Prompt Analysis Phase (COMPLETED)

4.5a, 4.5b, 4.6, 4.7.

### 2.16 Intelligence Service Architecture (LOCKED)

Event-sourced `deal_events`. Snapshots. `DealIntelligence` service as sole interface. No actors, no daemons.

### 2.16.1 Corpus Intelligence Preservation Decisions (LOCKED)

Background: Future-state capability (post-demo, months 3-12+) includes corpus intelligence — narrative analysis across deal segments, ground-truth vs documentation alignment, and field awareness of product state. Detailed vision lives in PRODUCTIZATION-NOTES.md under "Corpus Intelligence — the second product." Five architectural decisions below preserve optionality for this future work. Each is inexpensive to implement in the phases below; each is significantly harder to retrofit at scale.

**1. Persist embeddings alongside analyzed_transcripts (shape locked Pre-Phase 3 Session 0-A; table skeleton Session 0-B; HNSW index Phase 3 Day 2).**

Every transcript processed by the pipeline produces a vector embedding (per transcript and per speaker turn, both). Stored via pgvector in a new sibling table `transcript_embeddings` keyed to `transcripts.id`. Recommendation: voyage-large-2 via Voyage AI (Anthropic partner) for consistent embedding-space alignment with the Claude-processed transcripts; fallback to OpenAI `text-embedding-3-small` if licensing becomes an issue. Marginal cost: ~$0.01 per transcript. Without this, historical transcripts require re-ingestion to produce embeddings later, which is operationally expensive at customer scale.

**Locked shape (amendment Pre-Phase 3 Session 0-A, foundation-review anchor: Output 2 A4):**

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE transcript_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id uuid NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('transcript','speaker_turn')),
  speaker_turn_index int,
  embedding vector(1536) NOT NULL,
  embedding_model text NOT NULL,
  embedded_at timestamptz NOT NULL DEFAULT now()
);
```

**Dimensionality:** `vector(1536)`. Default model: voyage-large-2. 1536 matches OpenAI `text-embedding-3-small` exactly, so the documented fallback swap is mechanical (re-encode queries only, no re-embed). The `embedding_model` text column records which provider produced each row so future provider migrations are per-row traceable.

**Index strategy (Phase 3 Day 2 — not Session 0-B):** HNSW (`USING hnsw (embedding vector_cosine_ops) WITH (ef_construction = 64, m = 16)`) added after the first real rows exist. HNSW build is cheaper against populated data than empty; landing the index pre-data would be wasted work. Session 0-B lands the table skeleton only.

**RLS:** Pattern D (read-all authenticated, service-role-writes). The embedding step in the transcript pipeline writes via service-role.

Without the shape lock: a later-phase dimensionality change would require a batch re-embed against historical rows — at productization scale (1M transcripts × 10 speaker-turn embeddings each) this is operationally expensive. At $0.12/1M tokens × millions of transcripts, a provider swap mid-scale is real budget.

**2. Freeze segmentation metadata on every deal_events row (column added Pre-Phase 3 Session 0-B nullable; flips to NOT NULL Phase 4 Day 1 once all writers populate it).**

`deal_events` carries a column `event_context jsonb` capturing a snapshot of segmentation metadata at event time: `{vertical, deal_size_band, employee_count_band, stage_at_event, active_experiment_assignments}`. `hubspot_cache` reflects current state; `event_context` preserves historical state. Cost: ~20% bigger event payloads, one migration to add the column.

**Pull-forward amendment (Pre-Phase 3 Session 0-A, foundation-review anchor: Output 2 A2).** The column lands in migration 0005 (Session 0-B) as nullable because Phase 3 Day 2 begins writing `signal_detected`, `meddpicc_scored`, `transcript_ingested` events. Without the column present at Phase 3 Day 2, those events would carry no context, and a Phase 4 Day 1 backfill cannot correctly reconstruct per-event context — the deal has moved stages since the event fired, and `hubspot_cache` preserves current state, not historical. By landing the column Phase 3 Day 1, every event writer from Phase 3 Day 2 onward populates it from the outset; Phase 4 Day 1 reduces to `ALTER COLUMN event_context SET NOT NULL` once all Phase 3-era writers are in place.

**Phase 3 Day 1 helper.** `DealIntelligence.buildEventContext(dealId, activeExperimentIds)` is added to the new `packages/shared/src/services/deal-intelligence.ts` skeleton in Session 0-B. Every event-writing surface calls this helper to produce the `event_context` payload. The DealIntelligence service proper (per §2.16) expands in Phase 4; Session 0-B lands only the event-context builder so event writes populate from day one.

Without the pull-forward: Phase 3-era signal rows are permanently less analytically useful. Phase 4 Day 2 coordinator synthesis queries `deal_events` filtered by segmentation; Phase 3-era events would carry null (or approximate current-state), Phase 4+ rows carry correct context; the "same mechanism across multiple deals" signal quietly skews. PRODUCTIZATION-NOTES.md's corpus-intelligence arc depends on accurate per-event segmentation.

**3. Persist Claude call telemetry to a prompt_call_log table (table lands Pre-Phase 3 Session 0-B; wrapper writes to it Phase 3 Day 1).**

The Claude wrapper's stderr JSON telemetry becomes persistent data. Append-only table `prompt_call_log` with one row per Claude call. Enables A/B testing prompt quality over time, regression debugging, the enterprise compliance surface "every Claude call that touched this customer's deal data" (PRODUCTIZATION-NOTES.md Stage 4 GA), and the §2.13.1 calendared `stopReason === "max_tokens"` watch.

**Locked 19-column shape (amendment Pre-Phase 3 Session 0-A, foundation-review anchor: Output 2 A3):**

```sql
CREATE TABLE prompt_call_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_file text NOT NULL,
  prompt_version text NOT NULL,
  tool_name text NOT NULL,
  model text NOT NULL,
  task_type text,
  temperature decimal(3,2),
  max_tokens int,
  input_tokens int,
  output_tokens int,
  duration_ms int,
  attempts int NOT NULL DEFAULT 1,
  stop_reason text,
  error_class text,
  hubspot_deal_id text,
  observation_id uuid,
  transcript_id uuid,
  job_id uuid,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX prompt_call_log_deal_idx ON prompt_call_log (hubspot_deal_id, created_at DESC);
CREATE INDEX prompt_call_log_job_idx ON prompt_call_log (job_id);
CREATE INDEX prompt_call_log_version_idx ON prompt_call_log (prompt_file, prompt_version, created_at DESC);
```

**RLS:** Pattern D (read-all authenticated, service-role-writes). The Claude wrapper writes via service-role.

**Column rationale:**

- `prompt_file` + `prompt_version` + `tool_name` — a single prompt may carry multiple tool variants in future; the triple uniquely identifies the call-site for per-version regression telemetry.
- `task_type` (`classification | synthesis | voice | voice_creative`) — needed for enterprise compliance filtering and the temperature-class heatmap surface.
- `attempts` — already emitted to stderr telemetry; carries retry cost signal for the wrapper's exponential-backoff path.
- `error_class` — null on success, `PromptResponseError | APIError | …` on failure; lets the telemetry dashboard distinguish transport failures from protocol violations.
- `hubspot_deal_id | observation_id | transcript_id | job_id | actor_user_id` — foreign anchors without FK constraints for now, same pattern as `deal_events.hubspot_deal_id`. Cross-object audit survives child deletion (demo-reset, test scripts). The enterprise compliance query "every AI decision about deal X" is a JOIN across these anchors.

**Phase 3 Day 1 wiring:** `packages/shared/src/claude/client.ts` gains a `writePromptCallLog` side effect after each call (success + failure). Session 0-B lands the table; Phase 3 Day 1 lands the wiring + the `C4` optional telemetry-reader dashboard follows on Phase 3 Day 2 / Day 3.

Without the shape lock: every added column on a populated table loses retrospective fidelity. Rather than a Phase 4 Day 2 `ALTER TABLE ADD COLUMN ...`, the full shape lands from first row.

**4. Preserve raw speaker turns in analyzed_transcripts (Phase 3 Day 2 verification).**

The canonical `analyzed_transcripts` row must preserve speaker-turn granularity, not reduce to synthesized summaries. Speaker-turn is the atomic unit of corpus analysis. Verify during Phase 3 Day 2 preprocessor implementation; likely already done this way for speaker-attribution during signal detection. Principle rather than new code — do not throw away turn-level structure during preprocessing.

**5. Keep the signal detection tool schema extensible for future assertions (Phase 3 Day 2 awareness).**

Signal detection prompt schema versions cleanly so that a future minor version can add an `assertions_made` field alongside signals without breaking downstream consumers. Reps make factual claims ("we support HIPAA," "integration takes 2 weeks") that future alignment analysis will verify against documentation. No code required today; principle is "versioned prompt schemas, backward-compatible additions only." Worth calling out at Phase 3 Day 2 prompt wiring to prevent a schema shape that precludes extension.

---

Summary of preservation cost (updated Pre-Phase 3 Session 0-A):

- **Pre-Phase 3 Session 0-A** (shape locks, doc-only): locked decisions 1, 2, 3 full shapes in this file.
- **Pre-Phase 3 Session 0-B** (tables + skeleton): migration 0005 lands `prompt_call_log` (19 cols, RLS Pattern D, 3 indexes), `transcript_embeddings` skeleton (no index), `deal_events.event_context jsonb` nullable. `DealIntelligence.buildEventContext` helper stub lands in `packages/shared/src/services/deal-intelligence.ts`.
- **Phase 3 Day 1** (wrapper wiring): Claude wrapper writes `prompt_call_log` rows post-call (success + failure); every event-writing surface calls `DealIntelligence.buildEventContext` to populate `event_context`. 7 prompt rewrites (02-08) move into `packages/prompts/files/` as canonical (see §2.13.1 amendment on prompt file location).
- **Phase 3 Day 2** (first real data): embedding step in transcript pipeline populates `transcript_embeddings`; HNSW index created after first rows land (`USING hnsw (embedding vector_cosine_ops) WITH (ef_construction = 64, m = 16)`); verify speaker-turn preservation in preprocessor; note schema extensibility on tool-use schemas (no code).
- **Phase 4 Day 1** (flip invariant): `ALTER COLUMN event_context SET NOT NULL` once all Phase 3-era writers have populated it.

These preservation decisions are LOCKED at §2.16.1. Any future amendment to §2.16.1 requires explicit replacement of the locked decision, not silent divergence.

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

### 2.24.1 Phase 2 Day 4 Sessions C + D Fold into Phase 6 Polish (LOCKED — Pre-Phase 4 Session A adjudication)

Phase 2 Day 4 split into four sessions (A/B/C/D) per the rebuild plan structure. Sessions A + B shipped Phase 2 Day 4. Sessions C (deal summary edit UI — inline edit for vertical/product/lead source/competitor + company attributes; promote `updateDeal`/`updateCompany` adapter stubs) and D (kanban filter chips, `DealCard` hover-lift revisit, `prefetch={false}` on PipelineTable row links, remaining adapter CRUD stubs as needed: `upsertCompany`, `updateCompany`, `deleteContact`, `deleteCompany`, `deleteDeal`) deferred per `docs/PRE-PHASE-3-FIX-PLAN.md` §7 to keep Phase 3 unblocked.

**Decision:** Sessions C + D fold into Phase 6 polish. They do NOT pull forward before Phase 4 or interleave with Phase 4-5 Code work.

**Rationale:**

1. **Phase 6 IS the polish phase.** Sessions C+D are exactly the kind of UI completion work Phase 6 covers (Mode 2 design integration + loading states + empty-state treatments + responsive + accessibility + demo reset + 3-act demo rehearsal). Bundling polish-class work in one window matches the rebuild plan's phase shape.
2. **Phase 4-5 don't depend on Sessions C+D.** Phase 4 reads/writes through `DealIntelligence` + `IntelligenceCoordinator` services; Phase 5 close-lost reads the event stream. Neither needs the deal-edit UI promoted from read-only.
3. **Pulling forward adds risk.** Session C touches `updateDeal` / `updateCompany` adapter stub promotion — same code surface Phase 4 exercises heavily through `DealIntelligence` reads. Leaving the surface stable through Phase 4's verification reduces interaction risk.
4. **Eliminates re-litigation.** Without this lock, every future kickoff potentially asks "should we do C+D now?" — the question keeps consuming oversight cycles. Lock answers it once.

**Precedent:** §2.18.1 (HubSpot config path) was structurally a sequencing call locked during execution. Same pattern. Sequencing decisions that don't change architecturally and are durable across sessions belong in DECISIONS.md, not just BUILD-LOG operational guidance.

This amendment supersedes any reading of BUILD-LOG's scattered "Phase 2 Day 4 Session C/D (expected)" placeholders that suggested they could land independently. The `## Forward map` section in `docs/BUILD-LOG.md` reflects this lock.

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

### 2.18.1 HubSpot Config Path Convention (LOCKED — Phase 1 Day 5)

Background: the rebuild plan's Day-5 brief and 07C's Step 4 / Step 5 disagreed on where HubSpot-specific config artifacts should live. The Day-5 brief placed `hubspot-pipeline-ids.json` at `apps/web/src/config/` and `HUBSPOT_CUSTOM_PROPERTIES` at `packages/shared/src/crm/hubspot/properties.ts`. 07C placed them at `packages/db/src/seed-data/hubspot-pipeline-ids.json` and `packages/seed-data/hubspot-properties.ts` (the latter a workspace that doesn't exist).

**Resolution — one root for every HubSpot-specific config artifact.** All HubSpot-specific configuration, id-mapping, property definitions, association-type IDs, and other portal-shaped static data live under `packages/shared/src/crm/hubspot/`. Canonical paths for v2:

- `packages/shared/src/crm/hubspot/pipeline-ids.json` — pipeline + 9 stage IDs captured from 07C Step 4, committed so the team can see the internal-name → HubSpot-ID mapping.
- `packages/shared/src/crm/hubspot/properties.ts` — the canonical `HUBSPOT_CUSTOM_PROPERTIES` array consumed by 07C Step 5 provisioning.
- `packages/shared/src/crm/hubspot/association-ids.json` (future) — Primary-association typeId captured on first seed per 07C Section 4.4.
- `packages/shared/src/crm/hubspot/adapter.ts`, `client.ts`, `webhook-verify.ts`, etc. — the `HubSpotAdapter` implementation and supporting modules.

**Why this location.**
1. The `CrmAdapter` interface (07B Section 2) lives in `@nexus/shared`. The HubSpot-specific implementation is a peer to that interface, so colocating the implementation + its config in the same package keeps the boundary clean.
2. Scripts that need the mapping — provisioners, seeders, pre-warm — already depend on `@nexus/shared` for enums, types, and the Claude wrapper; they will depend on the adapter too. One import boundary, one workspace.
3. `apps/web` is a consumer, not an owner, of this config. Placing mapping files under `apps/web/src/config/` would force non-Next workspaces (scripts, future agents package) to reach across the app-package boundary.
4. `packages/db/src/seed-data/` is reserved for Nexus-native seed content (observation clusters, knowledge articles, manager directives). HubSpot IDs are portal-shaped adapter config, not Nexus seed data — mixing them obscures the boundary that 07B established.
5. The 07C-referenced `packages/seed-data/` workspace does not exist in v2 and is not going to be created; unifying into `packages/shared/src/crm/hubspot/` eliminates the dangling reference.

**Portal-specificity note.** `pipeline-ids.json` contains IDs tied to Jeff's HubSpot Portal `245978261`. It is still committed to the repo (not gitignored) per the same rationale as 07C Step 4: the team needs to read the mapping, and leaking portal IDs carries no auth value on its own (access requires the private app token stored in Vercel env). A future multi-portal deployment would shift this to per-env config, but v2 is single-portal by scope (1.8).

This amendment supersedes the Day-5 rebuild-plan brief and 07C Steps 4–5 wherever they specify a different path. Phase 2+ reads from these paths and does not re-litigate.

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
