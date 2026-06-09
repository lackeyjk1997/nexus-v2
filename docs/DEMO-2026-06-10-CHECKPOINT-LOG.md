# Demo 2026-06-10 — Autonomous Run Checkpoint Log

Session start: 2026-06-09. Success criterion: demo path green end-to-end from
production (`https://nexus-v2-five.vercel.app`). This log is the running record:
JEFF ACTIONS queue at top, demo plan, then milestone entries (newest last).

---

## JEFF ACTIONS (things only Jeff can do)

| # | Status | Action | Exact steps |
|---|--------|--------|-------------|
| J1 | OPEN | Set `GRANOLA_API_KEY` in Vercel (only needed if live Granola ingestion ships — P1) | Vercel → nexus-v2 → Settings → Environment Variables → add `GRANOLA_API_KEY` (value from `.env.local`), Production scope → redeploy. Skip unless the log below says Granola ingestion landed. |
| J2 | OPEN | Final incognito rehearsal against production | Steps will be written out in the FINAL REPORT section when freeze engages. |

(Items get added here as discovered; none block parallel work.)

---

## Demo-path plan (first deliverable — posted 2026-06-09, session start)

### Assumed audience

Prospective customer / investor / design-partner exec: someone evaluating
"AI intelligence layer over your existing sales stack (HubSpot + call
transcripts)." Narration voice: Jeff as founder. The wedge: **the system reads
every call, computes portfolio-level intelligence, and — critically — knows
when to stay silent.**

### Demo script (exact click-path, ~6–8 min)

1. **Open production URL → `/intelligence`** (the Day 5 B dashboard, built
   today, Granola design language). Already logged in (see Auth below).
   - Beat: "Five active deals selling Claude into tech scaleups. Nexus read
     all nine calls. Here's what it computed — not a feed, a briefing."
   - On screen: **2 admitted patterns**, ordered by score:
     **Pattern: OpenAI competitive pressure** (4 deals, $4.77M) and
     **Pattern: security/procurement blockers** (3 deals, $4.15M), each with
     score + plain-language "why this is here" explanation.
   - Also on screen: **1 category candidate** — "rate-limit / capacity-at-scale
     anxiety" (3 independent rep observations clustered by Claude) awaiting
     manager promotion.
2. **The silence beat** (talk track over the same screen, optionally a small
   "what Nexus held back" affordance): a 2-member near-miss cluster
   (fine-tuning positioning uncertainty) was seen and *withheld* —
   below evidence threshold. "Most AI tools' failure mode is noise. Nexus
   ships silence as a feature."
3. **Click Pattern 1 → affected deals** → click **Northpeak Labs** →
   `/pipeline/[dealId]` deal detail.
   - Beat: pattern-to-ground-truth lineage. MEDDPICC scores with verbatim
     evidence quotes from the calls, stakeholder map, deal theory ("working
     hypothesis"), and the AI-drafted follow-up email.
4. **`/pipeline`** kanban — portfolio view, 5 seeded tech deals + MedVista.
   - Beat: MedVista (healthcare) deliberately does NOT join the OpenAI
     pattern — cross-vertical isolation is structural, not cosmetic.
5. **Close on `/intelligence`** — recap: transcripts in → signals → patterns →
   admission gates → briefing. Everything computed by the live pipeline
   running in production (pg_cron worker + Claude), not mocked.

### What's real vs. seeded

- **Real (computed live in production):** all signal extraction, MEDDPICC
  scoring, deal theory, drafted emails, embeddings, coordinator patterns,
  observation clusters, admission decisions, scores. Produced by the actual
  pipeline over the seed transcripts — same code path a real Granola
  transcript would take.
- **Seeded (authored):** the 5 fictional prospect companies/deals/contacts,
  9 call transcripts (realism-disciplined), 5 rep observations, manager
  directives, system intelligence, experiments. Subject (Anthropic/Claude)
  real; prospects fictional by design.
- **Real-real (stretch, P1):** one genuine Granola transcript (MedVista call)
  pre-ingested via script if P0 goes green with time left.

### P0 gap list (session start)

| # | Gap | State |
|---|-----|-------|
| G1 | Seed loader doesn't exist | Write it (runbook steps 1–3) |
| G2 | Pipeline not run over substrate; admission contract unverified | Runbook steps 4–8; hybrid fallback documented |
| G3 | `/intelligence` dashboard doesn't exist (Day 5 B greenfield) | Build in Granola design language |
| G4 | Magic-link wall blocks demo + automated verification | Token-gated demo session (reversible), Jeff stays logged in as belt-and-braces |
| G5 | No automated browser e2e of the demo path | Playwright against production at the end |
| G6 | Seed substrate uncommitted | Commit first (rollback safety) |

### Freeze state I'm driving toward

- Production `/intelligence` renders 2 patterns + 1 category candidate from
  live-computed rows; deal detail renders MEDDPICC/theory/email for seeded
  deals; pipeline kanban shows the portfolio.
- Headless-browser e2e of the exact click-path passes against production.
- Last-green commit on `main` = deployed commit. BUILD-LOG + this log updated.
- JEFF ACTIONS queue final: rehearsal steps + any env items.

### Key decisions so far (decision rule: reversible, demo-first)

- **D1 — Seeding writes to the production Supabase directly** (local scripts
  share `DATABASE_URL`); pipeline jobs enqueue to the `jobs` table and are
  executed by the *production* worker via pg_cron — so the demo's compute
  provenance is genuinely production.
- **D2 — Day 5 A.5 (Anthropic company-knowledge file): OFF the demo path.**
  README §8.4 parks it as not gating Day 5 A; nothing on the click-path reads
  it. → post-demo backlog.
- **D3 — Telemetry dashboard `/admin/claude-telemetry` (re-deferred from Day 2
  Session B): OFF the demo path.** → post-demo backlog.
- **D4 — Auth (G4):** plan is (a) Jeff stays logged in for the demo, (b) a
  `DEMO_ACCESS_TOKEN`-gated login route in production for automated e2e +
  incognito fallback — possession of the token is the wall, so nothing is
  exposed publicly; removing the route + env var fully reverts. Exposure
  analysis to be recorded when it lands.

---

## Checkpoint entries

### CP-0 — Session start (2026-06-09)

- Oriented: BUILD-LOG current-state predates seed authoring (as warned).
  Substrate authored + uncommitted at `packages/db/src/seed-data/phase-4-day-5/`;
  README there governs. Loader + dashboard don't exist. Production on `0d992b7`.
- Plan posted (above). Proceeding: commit substrate → loader → pipeline run →
  dashboard build in parallel with pipeline jobs.

### CP-1 — Substrate loaded · two latent production bugs surfaced + fixed (2026-06-09 ~19:45)

**Shipped:** substrate committed (`94f18e0`) · loader (`f5b7e56`, idempotent,
verified twice) · CRM-writeback made non-fatal (`ca3df7c`) · `/intelligence`
dashboard + `/api/demo-login` (`5dc6aef`) · `arr_impact.aggregate_arr` at
pattern-write (`fb85b20`) · prompt inline-mirror fallback (`5faa8f3`+`8b9ac0f`).

**Substrate live in prod DB:** 21 cache rows, 11 roles, 8 directives, 5
system-intel, 3 experiments, 5 observations, 9 transcripts. Loader re-run =
updates only (idempotency PASS).

**Found-and-fixed (all were silent demo-killers):**
1. **MEDDPICC HubSpot PATCH was fatal** — seed deals exist only in cache; 404
   would fail every pipeline run. Now graceful-degradation + telemetry
   (`meddpicc_hubspot_writeback_failed`), mirroring Day 4's helper discipline.
2. **Production had never loaded a prompt file.** First real prompt-load (this
   seed run) hit "Could not locate packages/prompts/files/" — all 9 jobs
   failed 3 attempts. Phase 3's `outputFileTracingIncludes` parked item was
   never actually closed: prior "worker-dispatched" verifications ran against
   localhost. Attempt 1: `outputFileTracingIncludes` (locally verified in the
   route's .nft.json — still dropped on Vercel, suspected root-directory
   bundling setting). Attempt 2 (landed): generated inline mirror
   `inline-files.generated.ts` inside @nexus/prompts — prompt availability is
   now a bundle property, immune to tracing/dashboard settings. Disk stays
   canonical; `test:inline-sync` enforces byte-identity; loader prefers disk.
3. **Patterns could never admit:** Day 2A wrote `arr_impact` without
   `aggregate_arr`; Day 1B admission gates on it (minAggregateArr $500K) —
   every pattern would have been silently rejected, dashboard permanently
   empty. Handler now merges a deterministic cache-sum at write time.
   First-ever integration exercise of those two components.

**Decisions:**
- D5 — dashboard ordering uses a deterministic scoreFn over stored Claude
  judgment (synthesis reasoning / cluster confidence) instead of per-render
  09-score-insight fanout: Guardrail 5 (no sync Claude in UI), demo stability,
  zero render cost. Periodic re-scoring job → post-demo backlog.
- D6 — demo auth = `/api/demo-login?token=` gated constant-time by
  `DEMO_LOGIN_TOKEN ?? CRON_SECRET` (already in Vercel scopes — no env
  provisioning needed, nothing blocks on dashboard access). 404 without the
  token; exposure without token = nothing. Repo is public → the token never
  appears in this log or any commit. Removal = delete one file (+ optional
  secret rotation), queued in post-demo backlog.
- D7 — process: a `build | grep` chain matched "Failed to compile" and pushed
  a red build (`5faa8f3`, repaired in `8b9ac0f` minutes later; Vercel kept
  serving the prior deploy, prod never down). Rule for the rest of the run:
  verify exit codes, not grep matches, before push.

**Next:** re-enqueue 9 pipeline jobs on the `8b9ac0f` build → verify signal
map → coordinator_synthesis → observation_cluster → admission contract →
production e2e.
