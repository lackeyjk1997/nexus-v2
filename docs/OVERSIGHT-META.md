# Nexus v2 — Oversight Meta

## What this file is

This file captures the **meta** of how oversight operates on this build — the rhythm, Jeff's working style, the reading order for a fresh oversight session, accumulated meta-lessons. It deliberately does **not** carry current build state. Point-in-time state (latest commit, phase/day, open blockers) lives in `BUILD-LOG.md` under its "Current state" block, which is authoritative.

The file is read-once at the start of a fresh oversight session, then supplemented by BUILD-LOG + DECISIONS + FOUNDATION-REVIEW for the substance.

## Maintenance rule (contract)

Update this file **only when the oversight process itself changes** — the rhythm, meta-lessons, Jeff's working style, the handoff prompt template, the required-reading sequence. Do **not** update it for per-day/per-session state changes. BUILD-LOG owns current state. If you find yourself writing a commit hash or "Phase X Day Y complete" into this file, stop — that belongs in BUILD-LOG.

A stale `## Meta-lessons surfaced` section is the trigger for an update; a stale `## Current build state` section is a sign this file drifted into doing BUILD-LOG's job, which was the original failure mode that prompted the replacement of this file's predecessor (OVERSIGHT-HANDOFF.md, retired 2026-04-22 pre-Phase-3).

---

## Required reading order for a fresh oversight session

1. **This document** (`OVERSIGHT-META.md`) — orients you to how oversight operates.
2. **`CLAUDE.md`** — Claude Code's bootstrap rules + repo layout (so you know what Claude Code reads on his side).
3. **`docs/DECISIONS.md`** — 51 LOCKED guardrails + v2-era amendments (2.1.1, 2.2.1, 2.2.2, 2.6.1, 2.13.1, 2.16.1, 2.18.1, and any later).
4. **`docs/BUILD-LOG.md`** — current state (read the top block first), day-by-day history, parked items, operational notes.
5. **`docs/PRODUCTIZATION-NOTES.md`** — productization arc (demo → mid-market → enterprise POC → enterprise GA) + corpus-intelligence second-product thesis. Not build scope; strategic frame.
6. **`docs/FOUNDATION-REVIEW-2026-04-22.md`** — pre-Phase-3 foundation pass (15 ratifications, 15 adjust-findings, 1 actively-wrong, 5 creative additions). Valid until the pre-Phase-3 fix work is complete.
7. **`docs/PRE-PHASE-3-FIX-PLAN.md`** — execution plan derived from the foundation review. Valid until the pre-Phase-3 fix work ships.
8. **Optional deep-dives as needed:** `~/nexus/docs/handoff/10-REBUILD-PLAN.md` (Phase sequencing), `~/nexus/docs/handoff/09-CRITIQUE.md` (why v1 is being rebuilt), `~/nexus/docs/handoff/07B-CRM-BOUNDARY.md` (CRM data boundary), `~/nexus/docs/handoff/07C-HUBSPOT-SETUP.md` (HubSpot provisioning playbook), `~/nexus/docs/handoff/04C-PROMPT-REWRITES.md` (8 rewrite specs), `~/nexus/docs/handoff/source/prompts/*.md` (v2-ready prompt rewrites).

Do not start new work until Jeff explicitly kicks something off. Your first job as a fresh session is to confirm orientation — see the handoff prompt at the bottom.

---

## How oversight has been operating

The rhythm that's been working since Phase 1:

1. **Pre-kickoff thought** — oversight drafts a read of what the day/session produces per the rebuild plan or pre-Phase-3 fix plan: a concrete consumption strategy for any new artifacts, and an enumeration of ambiguities / open questions / scope drift the day will need answered before execution.
2. **Jeff reviews** and green-lights (or redirects).
3. **Execution** — Claude Code (Desktop session, separate from oversight) does the actual build work in `~/nexus-v2`.
4. **End-of-day / end-of-session report** — Claude Code reports back in the established format: deliverables, verification, parked items, reasoning stub, cost. The report is the primary artifact oversight reviews.
5. **Oversight sign-off** — oversight reads the report and either signs off or flags gaps.
6. **BUILD-LOG update** — appended under a new `## Phase X Day Y — [date]` heading in day-by-day history; "Current state" block at top refreshed; parked items reshuffled (resolved ones removed, new ones added); operational notes updated with any new gotchas.
7. **Commit + push** — either co-committed with the day's work or a follow-up commit `docs: update build log for Phase X Day Y`.

**Oversight / execution division of responsibility** is formalized in CLAUDE.md's "Oversight / execution division of responsibility" section at commit `a160d69`:

- Oversight adjudicates direction; code-level judgment is Claude Code's.
- Small schema / taxonomy / pattern calls within an established framework do not escalate upward — Claude Code reasons through against DECISIONS.md + BUILD-LOG precedent + PRODUCTIZATION-NOTES arcs and records the reasoning in the session's Reasoning stub.
- Four justification types are accepted in the Reasoning stub: (1) DECISIONS.md guardrail requires it, (2) §2.16.1 preservation decision, (3) PRODUCTIZATION-NOTES.md arc, (4) imminent next-session need.
- Escalate upward only for: guardrail-vs-guardrail conflicts, material product-direction changes, new-principle territory no amendment covers, or scope that bleeds into a future session.
- Oversight reviews reasoning at end-of-day sign-off, not per-decision during execution. Velocity is preserved; oversight focuses on the things oversight is actually better at than code-in-view.

**Jeff's working style:**

- **Non-technical.** Prompts to Claude Code include explicit step-by-step instructions for Vercel dashboard tasks, Supabase dashboard clicks, HubSpot private-app config, `.env` edits, etc.
- When an action is needed, Jeff prefers "simple instructions please" over verbose explanation.
- **Strategy / product / architecture questions welcome honest pushback** — Jeff asks probing questions and expects the oversight session to recalibrate openly when a better answer emerges.
- Hotfix cycles happen **out-of-band** when verification exposes bugs. A hotfix gets its own commit(s) between day-N and day-(N+1) pre-kickoff and is noted at the top of the next day's pre-kickoff review.
- **Side project, no deadline.** Optimizes for "get it right" over speed. It is OK — often correct — to slow down and resolve a drift or ambiguity before proceeding.

---

## Meta-lessons (accumulated across Phase 1 + Phase 2)

Cross-cutting lessons. Specific operational gotchas live in `BUILD-LOG.md` operational notes; the items here are the strategic patterns.

- **CLI smoke tests bypass the real SSR path.** Production UI paths must be verified in an actual incognito browser window (or via the `/api/dev-login` + Playwright pattern) with a real authenticated user before end-of-day sign-off. This bit the build three times during the Phase 2 Day 2 hotfix cycle (Sidebar icon RSC crash, kanban-toggle prefetch poisoning, `/pipeline/new` useActionState SSR crash). Pattern settled: **browser-verify or don't sign off.**
- **`pnpm build` warnings are load-bearing.** The Phase 2 Day 2 cycle shipped `Attempted import error: 'useActionState' is not exported from 'react'` as a build warning that silently crashed on real SSR. End-of-day verification now greps for `Attempted import error`, `Module not found`, `Type error`, `Failed to compile` — zero hits required.
- **RSC server→client boundary rules matter and will keep biting.** Function and component references do not serialize across the boundary. Use **string identifiers + client-side resolution maps** (the nav `iconName: "dashboard" | "pipeline"` → `Record<string, LucideIcon>` pattern). Server Actions must be marked `"use server"`. Everything else crossing the boundary must be JSON-serializable.
- **Client components must not import runtime values from `@nexus/shared`.** Type-only imports are erased before webpack sees them; runtime-value imports trace the barrel through services that import `postgres`, failing with `Module not found: Can't resolve 'net'`. Runtime values come in as props from the nearest server component. `"sideEffects": false` on `@nexus/shared` enables tree-shaking of types but does not fix value imports.
- **Next `<Link>` auto-prefetch can poison the client router** if the prefetched route SSR-crashes. A poisoned prefetch entry surfaces later as a detached client-side exception on a completely different route. When debugging a detached client error, check every `<Link>` visible on the crashing route for a sibling route that SSR-crashes.
- **Three-way drift pattern: canonical values live in 3 places.** When the schema holds a canonical enum, check THREE downstream vectors: (1) TypeScript types in `packages/shared/src/enums/`, (2) prompt rewrites in `~/nexus/docs/handoff/source/prompts/*.md` + `04C-PROMPT-REWRITES.md`, (3) HubSpot property options for any `nexus_*` property expressing the same taxonomy. ContactRole Phase 2 Day 2 + the MEDDPICC 7-vs-8 drift surfaced in the pre-Phase-3 foundation review both illustrate this class. The `pnpm enum:audit` script (pre-Phase-3 fix work) automates the grep.
- **Shared Supabase transaction pooler caps at ~200 concurrent clients.** Each `postgres.js` pool per service stays up for `idle_timeout: 30s`. At peak, request-scoped services per page load multiplied across concurrent users saturate the pooler fast. Pre-Phase-3 fix work lands the process-wide shared client; until then, per-service `max` trim from Session B is headroom.
- **Handoff files in `~/nexus/docs/handoff/` can be edited with explicit Jeff approval** when drift between the rewrites and the v2 canonical schema is discovered. Each edit bumps the prompt's front-matter version (e.g. `1.0.0 → 1.1.0`) and is recorded in `DECISIONS.md §2.13.1` with rationale. Phase 2 Day 2 ContactRole alignment is the precedent (nexus commit `533d3eb`).
- **HubSpot-specific quirks (surfaced through Phase 1 Day 5 + Phase 2):** private-app webhook subscriptions are UI-only (API returns 401); v3 Properties API rejects `single_line_text`/`datetime` — use `text`/`textarea`/`date`; custom-property labels must be globally unique across native + custom fields (prefix with "Nexus " for ambiguous ones); signature verification uses `VERCEL_PROJECT_PRODUCTION_URL`, not per-deployment `VERCEL_URL`; config artifacts must be ESM-imported (not `readFileSync`'d) to survive Vercel serverless bundling.
- **@dnd-kit uses a client-side counter for `aria-describedby` IDs** that mismatches across SSR and hydration. Fix: a `mounted` boolean that renders static DealCards during SSR + initial hydration, then swaps to `DraggableDealCard` after `useEffect`. Session B's `PipelineKanban.tsx` is the precedent.
- **Pattern A RLS (`observer_id = auth.uid()`) enforcement lives at the route boundary** when the writer is service-role — the service-role bypasses RLS, so the application layer enforces the own-rows invariant by (a) SSR `createSupabaseServerClient().auth.getUser()` validating the JWT, (b) passing `user.id` as `observerId` to the service, (c) the service writing that as `observer_id`. The `test-rls-observations.ts` script verifies Pattern A separately at the anon+JWT-client layer (where Postgres DOES enforce the policy) — that's the canary for schema/policy drift.
- **Shared server action modules** beat inlined body-scope `"use server"` actions when the same action serves multiple surfaces (kanban, table, detail header). Session B's `apps/web/src/app/actions/stage-change.ts` is the precedent; inline actions remain fine for single-surface cases.

---

## Productization context (not build scope, but worth knowing)

Jeff intends to productize Nexus v2 after the demo. Full vision in `PRODUCTIZATION-NOTES.md`. The arc is roughly: **single demo → paying mid-market customer → enterprise POC → enterprise GA**. Each stage adds known work; v2's architecture deliberately doesn't foreclose any of it.

Five architectural preservation decisions are locked in `DECISIONS.md §2.16.1` specifically to keep **corpus-intelligence optionality** alive after the demo — the build is not allowed to close those doors for short-term demo convenience.

Relevance for oversight: some "is this right?" questions are answered not by "does this ship the demo?" but by "does this preserve or close post-demo options?" When a proposed change sounds demo-convenient but risks foreclosing a corpus-intelligence path (transcript embeddings, event-context snapshots, prompt call logging, speaker-turn preservation, backward-compatible tool-schema additions), pause and reread §2.16.1 before green-lighting.

The pre-Phase-3 foundation review (`docs/FOUNDATION-REVIEW-2026-04-22.md`) pulls three §2.16.1 preservation decisions forward (event_context, prompt_call_log, transcript_embeddings shape locks) rather than deferring them. The pre-Phase-3 fix plan (`docs/PRE-PHASE-3-FIX-PLAN.md`) executes those pull-forwards in its session sequence.

---

## Handoff prompt for a fresh oversight chat

Paste this into a fresh oversight chat to start it cleanly:

> This is a continuing oversight session for the Nexus v2 rebuild. The previous chat ran long and we're migrating. Read these files in order before doing anything else:
>
> 1. `~/nexus-v2/docs/OVERSIGHT-META.md` — orients you to how oversight operates (meta, not current state)
> 2. `~/nexus-v2/CLAUDE.md` — Claude Code's bootstrap rules + Oversight/execution division of responsibility
> 3. `~/nexus-v2/docs/DECISIONS.md` — 51 guardrails + v2-era amendments
> 4. `~/nexus-v2/docs/BUILD-LOG.md` — read the "Current state" block at the top first, then the most recent day-by-day entries
> 5. `~/nexus-v2/docs/PRODUCTIZATION-NOTES.md` — productization arc + corpus-intelligence second-product thesis
> 6. `~/nexus-v2/docs/FOUNDATION-REVIEW-2026-04-22.md` — foundation review the current fix work operates on
> 7. `~/nexus-v2/docs/PRE-PHASE-3-FIX-PLAN.md` — execution plan derived from the review (read this last; it summarizes the sequence of fix sessions)
>
> Also reference frozen handoff docs at `~/nexus/docs/handoff/` as read-only when phase planning comes up: `10-REBUILD-PLAN.md`, `09-CRITIQUE.md`, `07B-CRM-BOUNDARY.md`, `07C-HUBSPOT-SETUP.md`, `04C-PROMPT-REWRITES.md`, `source/prompts/*.md`.
>
> When you've read these, confirm your orientation by telling me:
>
> 1. Current build state in 2–3 sentences
> 2. What the next kickoff is (per the pre-Phase-3 fix plan or — if fixes are complete — Phase 3 Day 1 proper)
> 3. What the reasoning gate looks like for that kickoff (which of the four justification types are most relevant)
>
> Claude Code (separate desktop session) is continuing in the same chat — no handoff needed on his side. You are the fresh oversight session. Don't start any new work until I explicitly kick something off.

---

*Last updated: 2026-04-22 — created to replace OVERSIGHT-HANDOFF.md as part of the pre-Phase-3 fix plan. See `docs/PRE-PHASE-3-FIX-PLAN.md` for the retirement rationale.*
