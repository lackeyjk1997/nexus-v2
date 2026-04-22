# Nexus v2 — Oversight Handoff

## Purpose

This document captures the in-flight state and meta-observations that aren't in `DECISIONS.md` (too specific) or `BUILD-LOG.md` (too operational). It's for an incoming oversight Claude session to read alongside the permanent artifacts so they know not just where the build is but how oversight has been operating.

---

## Required reading order for a fresh oversight session

1. **This document** (`OVERSIGHT-HANDOFF.md`) — orients the incoming session.
2. **`BUILD-LOG.md`** — current state, day-by-day history, parked items, operational notes.
3. **`DECISIONS.md`** — constitutional guardrails + v2-era amendments (2.1.1, 2.2.1, 2.2.2, 2.6.1, 2.13.1, 2.16.1, 2.18.1).
4. **`~/nexus-v2/CLAUDE.md`** — Claude Code's required-reading pointer (so you know what Claude Code reads on his side).
5. **Optional deep dives as needed:** `PRODUCTIZATION-NOTES.md`, `~/nexus/docs/handoff/10-REBUILD-PLAN.md`, `~/nexus/docs/handoff/09-CRITIQUE.md`.

Do not start new work until Jeff explicitly kicks something off. Your first job as a fresh session is to confirm orientation — see the handoff prompt at the bottom.

---

## Current build state (point-in-time snapshot, 2026-04-22)

- **Latest commit on `main` (nexus-v2):** `2b41c4c fix(nav): resolve RSC icon-prop crash on /dashboard + /pipeline`
- **Phases complete:** Phase 1 Days 1–5 (all signed off). Phase 2 Days 1–2 (shipped but carrying two open browser-only hotfix bugs — see below).
- **Currently in:** Phase 2 Day 2 hotfix cycle. Two bugs surfaced by end-to-end verification in an incognito browser session on 2026-04-22.
- **Next scheduled:** Phase 2 Day 3 (deal detail at `/pipeline/:dealId`, MEDDPICC edit UI writing Nexus `meddpicc_scores`, kanban filter chips, revisit `DealCard` hover lift, promote `listContacts` / `getContact` / `updateContact*` / `listDealContacts` from stubs). **Blocked by the two hotfixes below.**
- **Vercel production URL:** `https://nexus-v2-five.vercel.app`
- **Test personas (real inboxes):**
  - Sarah Chen — `jeff.lackey97@gmail.com` (seeded as `sarah.chen@nexus-demo.com`, email swapped to Jeff's Gmail).
  - Marcus Thompson — `lackeyjk1997@gmail.com` (seeded as `marcus.thompson@nexus-demo.com`, email swapped to Jeff's second Gmail).
- **SMTP:** Resend via `onboarding@resend.dev`. Both persona addresses are verified receivers. Supabase-default SMTP was replaced because it caps at 2 emails/hour.
- **Supabase URL config:** Site URL = `https://nexus-v2-five.vercel.app`. Redirect URLs include both the Vercel production callback and `http://localhost:3001/auth/callback` for dev.

---

## Open hotfixes (blockers for Phase 2 Day 3)

1. **`/pipeline` Kanban view toggle → client-side exception.** No digest surfaced yet (client-only error). Triggered by clicking the kanban button in `PipelineViewToggle`.
2. **`/pipeline/new` "New deal" form → server-side exception, digest `4100064979`.** Triggered on load or submit of the deal-creation form.

**Working hypothesis:** both are likely RSC server→client boundary / serialization issues — same class of bug as commit `2b41c4c` (the Sidebar icon crash where a lucide `ComponentType` was passed as a prop from a server component into a client component). The fix pattern there: replace function/component references with string identifiers and a client-side resolver map.

Awaiting diagnosis + fix as of handoff. Claude Code (separate Desktop session) has not yet begun the hotfix; oversight will pre-kickoff when Jeff is ready.

---

## How oversight has been operating

The rhythm that's been working:

1. **Pre-kickoff thought** — oversight Claude drafts a read of what the day produces per the rebuild plan, a concrete consumption strategy for any new artifacts, and an enumeration of ambiguities / open questions / scope drift the day will need answered before execution.
2. **Jeff reviews** and green-lights (or redirects).
3. **Execution** — Claude Code (Desktop session, separate from oversight) does the actual build work in `~/nexus-v2`.
4. **End-of-day report** — Claude Code reports back in the Day 5 format (deliverables, verification, parked items, cost). The report is the primary artifact oversight reviews.
5. **Oversight sign-off** — oversight reads the report and either signs off or flags gaps.
6. **BUILD-LOG update** — appended under a new `## Phase X Day Y — [date]` heading in day-by-day history; "Current state" block at top refreshed; parked items reshuffled (resolved ones removed, new ones added); operational notes updated with any new gotchas.
7. **Commit + push** — either co-committed with the day's work or follow-up commit `docs: update build log for Phase X Day Y`.

**Jeff's working style:**

- **Non-technical.** Prompts to Claude Code include explicit step-by-step instructions for Vercel dashboard tasks, Supabase dashboard clicks, HubSpot private-app config, `.env` edits, etc.
- When an action is needed, Jeff prefers "simple instructions please" over verbose explanation.
- **Strategy / product / architecture questions welcome honest pushback** — Jeff asks probing questions and expects the oversight Claude to recalibrate openly when a better answer emerges.
- Hotfix cycles happen **out-of-band** when verification exposes bugs. A hotfix gets its own commit(s) between day-N and day-(N+1) pre-kickoff and is noted at the top of the next day's pre-kickoff review.

---

## Meta-lessons surfaced today worth preserving for future sessions

Cross-cutting lessons (not bug-specific — specific details go in `BUILD-LOG.md` operational notes):

- **CLI smoke tests bypass the real SSR path.** Production UI paths must be verified in an actual incognito browser window, with a real magic-link-authenticated user, before end-of-day sign-off. This has bitten the build **three times** in a row: Sidebar icon RSC crash (Phase 2 Day 1, fixed `2b41c4c`), Kanban toggle (Phase 2 Day 2, open), New deal form (Phase 2 Day 2, open). Pattern is settled: **browser-verify or don't sign off.**
- **RSC server→client boundary rules matter and will keep biting.** Function and component references do not serialize across the boundary. Use **string identifiers + client-side resolution maps** (the Day-1 `iconName: "dashboard" | "pipeline"` → `Record<string, LucideIcon>` pattern). Also: Server Actions must be marked `"use server"`. Anything else crossing the boundary has to be JSON-serializable.
- **`auth.users` ↔ `public.users` coupling is by `id`, never by email.** Email updates must touch both tables. Future features that need email-based lookups must query `auth.users.email` via the service-role client, not `public.users.email`, to avoid drift.
- **Supabase default SMTP caps at 2 emails/hour per sender.** Resend is configured as the production SMTP provider in Supabase dashboard → Auth → SMTP Settings and is working for both personas. During development, raise Supabase's internal rate limits if you hit the cap.
- **Supabase's 35-second per-email rate limit is real and surfaces quickly during debugging.** "For security purposes, you can only request this after 35 seconds." Either wait it out or rotate to the second persona.
- **Handoff files in `~/nexus/docs/handoff/` can be edited with explicit Jeff approval** when drift between the rewrites and the v2 canonical schema is discovered. Pattern established Phase 2 Day 2 with `ContactRole` + `DealStage` alignment. Each edit bumps the prompt's front-matter version (e.g. `1.0.0 → 1.1.0`) and is recorded in `DECISIONS.md §2.13.1` with rationale. Default constraint (no edits to `~/nexus` without approval) otherwise stands.
- **HubSpot private-app webhook subscriptions are UI-only.** 07C §5.3's `POST /webhooks/v3/{appId}/subscriptions` API approach returns 401 for private-app Bearer tokens; per HubSpot docs, private-app subscriptions can only be managed in the private-app settings UI. The `subscribe:hubspot-webhooks` script prints the canonical subscription list + deep link URL so an operator can paste/click through.
- **HubSpot v3 webhook signature verification uses `HUBSPOT_CLIENT_SECRET`**, not a separately-generated "webhook secret." 07C §5.5 was ambiguous; `.env.example`'s `HUBSPOT_WEBHOOK_SECRET` was retired on Phase 1 Day 5.

---

## Productization context (not build scope, but worth knowing)

Jeff intends to productize Nexus v2 after the demo. Full vision in `PRODUCTIZATION-NOTES.md`. The arc is roughly: **single demo → paying mid-market customer → enterprise POC → enterprise GA**.

Five architectural preservation decisions are locked in `DECISIONS.md §2.16.1` specifically to keep **corpus-intelligence optionality** alive after the demo — the build is not allowed to close those doors for short-term demo convenience.

Relevance for future oversight sessions: some "is this right?" questions are answered not by "does this ship the demo?" but by "does this preserve or close post-demo options?" When a proposed change sounds demo-convenient but risks foreclosing a corpus-intelligence path (transcript embeddings, event-context snapshots, prompt call logging, speaker-turn preservation, backward-compatible tool-schema additions), pause and reread §2.16.1 before green-lighting.

---

## What the incoming oversight Claude should know about Jeff

- **Non-technical.** Needs simple step-by-step instructions for terminal commands, dashboard clicks, env var setup. Don't assume familiarity with `git rebase`, `pnpm filter`, `vercel env pull`, or Supabase dashboard paths.
- **Prefers "simple instructions please"** over verbose explanation when an action is needed from him. Give him the minimum viable path, not the tutorial.
- **Welcomes probing questions** on strategy, product, architecture. He will push back and expects honest recalibration in return — no sycophancy, no defensive restatement. If a better answer emerges mid-conversation, say so cleanly.
- **Side project, no deadline.** Optimizes for "get it right" over speed. It is OK — often correct — to slow down and resolve a drift or ambiguity before proceeding.
- **Two personal emails in use for personas:** `jeff.lackey97@gmail.com` (Sarah) and `lackeyjk1997@gmail.com` (Marcus). Either works for receiving magic links during debugging.

---

## Handoff prompt for the new oversight chat

Paste this into the fresh oversight chat to start it cleanly:

> This is a continuing oversight session for the Nexus v2 rebuild. The previous chat ran long and we're migrating. Read these files in order before doing anything else:
>
> 1. `~/nexus-v2/docs/OVERSIGHT-HANDOFF.md` — orients you to current state and how oversight has been operating
> 2. `~/nexus-v2/docs/BUILD-LOG.md` — current state, day-by-day history, parked items, operational notes
> 3. `~/nexus-v2/docs/DECISIONS.md` — constitutional guardrails + v2-era amendments
> 4. `~/nexus-v2/CLAUDE.md` — Claude Code's required-reading pointer
>
> Also reference frozen handoff docs at `~/nexus/docs/handoff/` as read-only: `10-REBUILD-PLAN.md` and `09-CRITIQUE.md` when phase planning comes up.
>
> When you've read these, confirm your orientation by telling me:
>
> 1. Current build state in 2–3 sentences
> 2. What's blocking progress right now (the two open hotfixes)
> 3. What happens next once those hotfixes land
>
> Claude Code (separate desktop session) is continuing in the same chat — no handoff needed on his side. You are the fresh oversight session. Don't start any new work until I explicitly kick something off.

---

*Last updated: 2026-04-22 — end of Phase 2 Day 2 hotfix cycle, pre-Phase 2 Day 3.*
