# Demo 2026-06-10 — Autonomous Run Checkpoint Log

Session start: 2026-06-09. Success criterion: demo path green end-to-end from
production (`https://nexus-v2-five.vercel.app`). This log is the running record:
JEFF ACTIONS queue at top, demo plan, then milestone entries (newest last).

---

## JEFF ACTIONS (things only Jeff can do)

| # | Status | Action | Exact steps |
|---|--------|--------|-------------|
| J2 | **OPEN — do tonight or tomorrow morning** | Final incognito rehearsal against production | Full script in **FINAL REPORT → Rehearsal script** below. ~5 minutes. If ANY step fails, the rollback is `git revert` of the offending commit + push (Vercel redeploys), or just demo from the previous deploy via Vercel dashboard → Deployments → Promote. |
| J1 | CLOSED (N/A) | ~~Set `GRANOLA_API_KEY` in Vercel~~ | Granola ingestion did not ship (see D10). Nothing to set for the demo. |
| J3 | OPEN (post-demo, optional) | Put `GRANOLA_API_KEY` in `.env.local` | The session directive said the key was already in `.env.local` — **it is not** (verified; no `GRANOLA_*` var exists there). Granola dashboard → Settings → API → create key → add `GRANOLA_API_KEY=<key>` to `~/nexus-v2/.env.local`. Needed before any Granola REST ingestion work. |
| J4 | OPEN (post-demo, optional) | Record a MedVista-roleplay call in Granola | No MedVista call exists in your Granola workspace (12 meetings checked via MCP — all personal). If you want the "real Granola call ingested live" beat in a future demo: record a 5-10 min roleplay call titled "MedVista — Epic integration check-in", then we wire the pre-ingest script to it. |

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

### CP-2 — Pipeline 9/9 green · two more compute-layer bugs found + fixed (2026-06-09 ~20:00)

**Signal map: PASS.** All 9 transcript_pipeline runs succeeded on the
production worker (5 prompt calls each). Verified after fixing the
executor's verification query (authoritative key is
`payload->'signal'->>'signal_type'`, not `payload->>'signal_type'`):
competitive_intel **4/4 deals PASS** · deal_blocker **4/3 PASS**. The
overlap math held — no hybrid fallback needed. New committed gate:
`verify:phase-4-day-5-intel` (runbook steps 6–8: pattern contract,
early-subset duplicates, cluster member counts, MedVista isolation).

**Reality vs. README contract:** the pipeline extracted MORE cross-deal
signal than the contract table predicted — field_intelligence/content_gap
on 5 deals, win_pattern/process_friction on 3+, not singletons. 6 patterns
synthesized, all of which would pass the admission gates. Handled under
D8 (below).

**Found-and-fixed #4 — synthesis truncation:** 04-coordinator-synthesis
hit `stop_reason=max_tokens` at 4000/4000 once Day 4 enrichment + 6 prior
patterns inflated output (earlier successes were at 3690–3962 — razor
margin). The handler's partial-output guard correctly skipped the group,
so the job "succeeded" while silently emitting nothing. Bumped to 8000
(v1.2.1, `7012472`). prompt_call_log's stop_reason column made this
diagnosable from the outside — telemetry discipline paying rent.

**Found-and-fixed #5 — signature divergence (architectural):** two
independent cluster runs over 5 well-aligned observations produced 5
unique signatures each (`api_throughput_capacity_anxiety` vs
`api_capacity_at_scale_anxiety` vs `capacity_at_scale_sla_requirement`) —
per-observation minting in an open slug space never converges lexically,
and exact-string grouping silently splits real clusters. Fix:
**match-before-mint** (`75a13d0`) — 10-cluster-observations v1.1.0 adds
discipline 3a + `${existingSignaturesBlock}`; the handler accumulates
minted signatures across its sequential loop, pre-seeded from persisted
candidate clusters. Verified locally in-process: 3 capacity observations
converged on one signature → 3-member cluster emitted. Also fixed
observer-vertical mislabeling (clusters inherited `healthcare` from
team_members.vertical_specialization; observations now carry
`sourceContext.vertical=technology`).

**Decisions:**
- D8 — **dashboard briefing curated to the 2 contract patterns.** The
  pipeline legitimately found 4 additional cross-deal patterns the README
  expected to be silent singletons. The demo narrative (2 ordered notes +
  silence beat) and the rehearsed script depend on a curated briefing;
  off-narrative patterns get `status='expired'` (admission excludes;
  single reversible UPDATE; rows + lineage retained for post-demo review).
  Logged honestly: this is editorial curation of real computed output,
  not a synthetic shortfall.
- D9 — **observation_cluster runs with `minObservationsPerCluster: 2`**
  for the demo substrate so the 2-member near-miss cluster B is
  *persisted* (handler default 3 never writes below-threshold groups).
  Dashboard admission still gates at minMemberCount 3 — B is withheld at
  the surface, which is the §1.18 silence demo, and the silence-ledger
  footnote (`member_count < 3`) now has a real row to count. Without this
  the footnote could only ever read 0.

**Next:** deploy `75a13d0` green → re-run competitive_intel synthesis +
observation_cluster via the production worker → curate patterns (D8) →
`verify:phase-4-day-5-intel` ALL PASS → production e2e.

### CP-3 — FREEZE. Demo path green end-to-end from production (2026-06-09 ~20:10)

**The success criterion is met.** Playwright e2e against
`https://nexus-v2-five.vercel.app`: **ALL CHECKS PASS** — demo-login →
/intelligence (2 pattern notes + 1 emerging candidate + silence footnote) →
pattern → deal detail (MEDDPICC present) → /pipeline (all 7 deals incl.
Northpeak Labs) → anonymous redirect holds → wrong token 404s, no cookie.
`verify:phase-4-day-5-intel`: ALL CHECKS PASS (competitive_intel 4 deals
$4.77M · deal_blocker 3 deals $4.15M · cluster A 3-member admits · cluster B
2-member withheld · MedVista isolated · no uncurated subsets).

**Shipped since CP-2:** synthesis max_tokens 8000 (`7012472`) ·
match-before-mint clustering (`75a13d0`) · cache-backed `/pipeline` list
(`3a4f2b9`, found by e2e: live `listDeals` hid cache-only deals from the
portfolio while deal detail worked — the kanban beat would have shown 2
deals instead of 7).

**Production-worker re-runs landed the full contract:** competitive_intel
pattern re-synthesized over all 4 deals (the max_tokens fix unblocked the
exact pattern the demo headline needs); observation_cluster with
`minObservationsPerCluster: 2` (D9) emitted cluster A
(`api_capacity_at_scale_anxiety`, 3 members, technology) + cluster B
(`customization_positioning_gap_vs_competitor`, 2 members, technology).
Match-before-mint converged on the first production run.

**Decisions:**
- D10 — **Granola P1 does NOT ship for this demo.** Two prompt-vs-reality
  conflicts (recorded per the operating rule): (a) `GRANOLA_API_KEY` is NOT
  in `.env.local` (directive said it was); (b) no MedVista-roleplay meeting
  exists in the Granola workspace — 12 meetings listed via the live MCP,
  all personal (interview prep, onboarding). With no key and no recordable
  artifact, the only paths were ingesting Jeff's private personal calls
  (privacy-hostile, no deal mapping) or faking provenance. Both rejected.
  The MCP connection itself is verified working; `transcripts.source` is
  the integration point; J3/J4 queue the missing artifacts. The demo
  narration keeps the architecture beat honest: "transcript-first — a
  Granola call takes the same path these nine did."

**Freeze state:** production `3a4f2b9` · jobs queue empty · 0 unclustered
observations (overnight crons no-op by construction) · patterns
synthesized=2 / expired=5 · clusters candidate(3) + candidate(2) · pool
snapshot healthy (6 idle / 1 active / 0 leaks). From here: fixes to the
rehearsed path only.

---

## FINAL REPORT (2026-06-09, session close)

### Demo script — clicks + narration (~6-8 min)

**Before the demo:** log in once from the demo machine (magic link to
jeff.lackey97@gmail.com → Sarah Chen persona), or use the demo-login URL
(see Rehearsal script). Stay logged in; the session persists.

1. **Open `https://nexus-v2-five.vercel.app/intelligence`.**
   - *"Five active deals selling Claude into tech scaleups. Nexus read all
     nine sales calls — transcripts, not summaries — and computed what you
     see here. This isn't a feed. It's a briefing."*
   - On screen: **Note 1 — security/procurement blockers** (3 deals,
     $4.15M) and **Note 2 — OpenAI/Gemini competitive pressure** (4 deals,
     $4.77M), each with affected-deal rows, a "what to do with it"
     recommendation, and a collapsible "why this surfaced".
   - *"Every number is computed: the pattern was found by the production
     pipeline grouping signals across deals, the ARR is summed from the
     CRM mirror, the recommendations are Claude's synthesis over the
     actual call evidence."*
2. **Scroll to "Emerging from the field".**
   - *"This one's different — it didn't come from calls. Three reps
     independently jotted field notes about API capacity anxiety. Claude
     clustered them. Three independent observations crosses our evidence
     threshold, so it surfaces as a candidate for a manager to promote
     into the taxonomy."*
3. **The silence beat — point at the footnote.**
   - *"And here's my favorite part: what Nexus did NOT show you. There's a
     second cluster — two reps unsure how to position fine-tuning against
     OpenAI. Two observations. Below threshold. Withheld. Most AI tools'
     failure mode is noise; Nexus ships silence as a feature."*
4. **Click an affected deal on the OpenAI pattern → Northpeak Labs detail.**
   - *"Pattern to ground truth in one click. MEDDPICC scored from the
     calls with verbatim evidence quotes, the working deal theory, and the
     AI-drafted follow-up — all from the same pipeline run."*
5. **Sidebar → Pipeline.** (Table or Kanban toggle — both work.)
   - *"The whole portfolio — five tech scaleups plus MedVista, a
     healthcare system. Notice MedVista is NOT in the OpenAI pattern.
     Cross-vertical isolation is structural: a healthcare signal can't
     contaminate a technology pattern. That's an architecture property,
     not a filter checkbox."*
6. **Back to `/intelligence` to close.**
   - *"Transcripts in → signals → patterns → admission gates → briefing.
     Everything you saw was computed by the live pipeline running in
     production — pg_cron worker, Claude, the same code path a Granola
     call takes when it lands."*

### What's real vs. seeded

| Layer | Status |
|---|---|
| Signal extraction, MEDDPICC scores + evidence quotes, deal theories, drafted emails, embeddings, coordinator patterns + synthesis text + recommendations, observation clusters + signatures, admission decisions, ARR aggregation | **Real — computed by the production pipeline** (9 transcript_pipeline + coordinator_synthesis + observation_cluster jobs on the prod worker; 5 prompt_call_log rows per transcript run) |
| The 5 prospect companies, deals, contacts, 9 call transcripts, 5 rep observations, manager directives, system intelligence, experiments | **Seeded** (authored, realism-disciplined; subject = Anthropic selling Claude is real, prospects fictional) |
| MedVista deal + HubSpot CRM objects | Real CRM rows in the live HubSpot portal |
| Pattern curation | 2 of 6 computed patterns shown (D8 — the pipeline found MORE patterns than scripted; extras `expired`, reversible) |
| Granola ingestion | Not shipped (D10; MCP verified, key + artifact missing → J3/J4) |

### Rehearsal script (J2 — run this in an incognito window)

1. Open an incognito/private window.
2. Go to `https://nexus-v2-five.vercel.app/intelligence` → must redirect
   to `/login`. (Auth wall holds.)
3. Build the demo-login URL: `https://nexus-v2-five.vercel.app/api/demo-login?token=<TOKEN>`
   where `<TOKEN>` is the value of `CRON_SECRET` in `~/nexus-v2/.env.local`
   (or `DEMO_LOGIN_TOKEN` if you've set one in Vercel). **Never paste the
   token anywhere public — the repo is public.**
4. You should land on `/intelligence` signed in as jeff.lackey97@gmail.com
   (Sarah Chen persona). Verify: 2 numbered pattern notes, "Emerging from
   the field" with the capacity-anxiety candidate, and the held-back
   footnote at the bottom.
5. Click an affected deal row on the OpenAI pattern → deal detail loads
   with MEDDPICC + theory + email.
6. Sidebar → Pipeline → 7 deals visible; toggle Kanban; find MedVista.
7. Walk the script above once with narration, timing it.
8. Leave the session logged in on the demo machine.

### Rough edges (known, demo-safe)

- "HubSpot - New Deal (Sample Deal)" ($1,000) sits at the bottom of
  /pipeline — real portal artifact. Harmless; delete it in HubSpot if it
  bothers you (it'll vanish from the mirror on the next 15-min sync).
- Pattern notes show no numeric score badge (score column not persisted;
  ordering uses the deterministic heuristic per D5). Visual ordering is
  correct: blockers above competitive.
- `/dashboard` (the original Day-1 page) is NOT on the demo path —
  unstyled relative to /intelligence. Don't click it during the demo.
- Demo-login bypasses magic-link for ONE known user behind a
  16+-char-token gate; exposure without the token is a 404. Remove
  post-demo (one file + optional secret rotation).
- The two "New note"-titled Granola meetings from Apr 20 are untouched —
  nothing in the system reads Granola yet.

### Post-demo backlog

1. Remove `/api/demo-login` + rotate `CRON_SECRET` (it doubled as the
   demo-login token).
2. Review the 4 expired patterns (D8) — they're real intelligence
   (field_intelligence "platform-volatility anxiety" across all 5 deals is
   genuinely good); decide surface or archive.
3. `pipeline_processed` flag semantics — preprocess flips it before
   analyze; a mid-pipeline failure strands transcripts as "processed"
   (bit us once this session).
4. Periodic re-scoring job for dashboard ordering (D5 deterministic
   scoreFn is a stand-in for 09-score-insight fanout).
5. Granola ingestion: J3 (API key) + J4 (recordable artifact) → pre-ingest
   script → production ingestion (then Vercel env var).
6. Persist cluster/synthesis prompt RESPONSES (prompt_call_log is
   telemetry-only; stderr-only signatures made diagnosis blind this
   session).
7. buildEventContext + remaining Phase-3-era parked items per BUILD-LOG.

**Session invariant held: production green at every push; demo path never
left broken. Stop condition: DONE.**

---

# RUN 2 — Granola click→score automation (2026-06-09 evening, freeze lifted by master directive)

## First deliverable — plan of record (posted before building)

**The story:** Jeff records a live interview with Ernesto Andaya → mid-call
presses Granola's native "sync to HubSpot" → note + transcript land on the
HubSpot record (native integration, not ours) → Nexus detects, ingests the
RAW Granola transcript, and Deal Fitness scores the deal with quoted
evidence → a second sync visibly moves the score. Zero-touch after the click.

### Trigger mechanism: HubSpot-side polling (pg_cron, ~15s) — webhooks rejected

New pg_cron entry → `net.http_get` to a new `/api/granola/watch` route
(Bearer CRON_SECRET — identical auth pattern to the worker). The route
reads the pinned demo deal's HubSpot notes, filters to Granola-authored,
and enqueues ingestion for unseen/changed notes. Why polling over webhook:
(a) private-app webhook subscriptions are UI-only (API 401) → would put a
Jeff-clicks dependency on the critical path the night before; (b) polling
needs no DECISIONS 2.19 exception at all — we never subscribe to
engagement creation, we READ, provenance-filtered, on one pinned deal;
(c) the 10s worker cron proves seconds-level pg_cron works here. Latency
cost of polling (≤15s) is noise against the Claude scoring call.

**2.19 disposition: SIDESTEPPED, not relaxed.** No engagement-creation
subscription exists. The feedback-loop risk 2.19 guards against
(Nexus-authored engagements re-triggering Nexus) is structurally absent:
the watcher reads only Granola-authored notes on one deal. Recorded in
DECISIONS.md as a disposition note under 2.19.

### Deal resolution: pinned config row (reliable) — attendee-match noted as product path

`granola_watch_config` DB row (deal id + enabled flag) — NOT an env var, so
no Vercel-dashboard JEFF ACTION and I can set it by SQL the moment Jeff
hands me the deal ID. The product-shaped answer (resolve deal via attendee
email → contact → deal association) is real and noted for productization;
reliability wins tonight. Privacy hard line implemented by construction:
the only HubSpot object ever read is the pinned deal's engagements, and the
only Granola meetings ever fetched are the ones Granola itself attached to
that deal. Broad recency scans don't exist in the code path.

### Scorer honesty check: prompt + schema EXIST, the runner does NOT

- **Exists:** `05-deal-fitness.md` v1.1.0 (25 canonical buyer events across
  business/emotional/technical/readiness fit, evidence-snippet contract,
  incremental PRIOR-EVENTS design — *exactly* built for the second-sync
  score-movement beat), `deal_fitness_events` + `deal_fitness_scores`
  tables (verified live in prod), odeal-category enum, MEDDPICC formatter,
  coordinator getActivePatterns.
- **Missing (built tonight):** `analyze_deal_fitness` TS tool definition,
  `getDealTimeline`, prior-events/prior-scores readers, the `deal_fitness`
  job handler (assemble → Claude → validate → persist), numeric score
  computation (tool returns events, not numbers — deterministic:
  per-category confidence-weighted detected ratio ×100), and the UI
  surface. The handler mirrors the proven coordinator_synthesis pattern.

### Ingestion chain (all server-side, zero-touch)

cron 15s → `/api/granola/watch` → unseen Granola note on pinned deal →
enqueue `granola_ingest` job → worker (≤10s): fetch RAW transcript +
summary_markdown from Granola REST (transcript = system of record; notes =
auxiliary, attached as the human-facing note) → upsert `transcripts` row
(engagement id = HubSpot note id → natural idempotency; content-hash
re-ingest on update; `source='granola'`; channel mapping mic=Jeff/seller,
speaker=Ernesto/buyer) → enqueue `deal_fitness` job → score lands in
`deal_fitness_scores` → deal page renders it (force-dynamic). Fitness path
does NOT run the transcript_pipeline — yesterday's frozen /intelligence
surface cannot be polluted (plan C intact).

### Latency estimate, click → rendered score

Poll ≤15s + worker claim ≤10s + Granola fetch ~3s + HubSpot reads ~2s +
fitness Claude call 60–150s (16k output budget, 25-event analysis) +
render on reload ≈ **~90s typical, 2.5–3min worst case.** The demo script
will cover it with narration; second-sync re-score has the same budget.

### Prompt-vs-reality (recorded per operating rule)

`GRANOLA_API_KEY` is **not** in `.env.local` (directive says it is; grep
shows no GRANOLA var). Per directive, NOT queueing a JEFF ACTION. Working
around: REST reachability gets verified FROM PRODUCTION (where the
directive says the key lives in Vercel env) via the watch route's
self-check, early. Local REST dry-runs are blocked until the key appears
locally; the synthetic dry-run doesn't need Granola at all.

### Unknown unknowns (each: mitigation or explicit punt)

1. **Click→score latency** — ~90-150s. Mitigated by narration script +
   trimmed timeline context for single-call deals.
2. **Mid-meeting sync = partial transcript?** Unknown whether Granola's
   API serves a transcript before recording stops. PUNT to tonight's real
   test recording (the true gate). Adjustment if it can't: demo restructures
   to two short recordings (stop → sync → resume) — same beats.
3. **Granola note shape on HubSpot** — does the note carry the meeting id /
   link? Does it associate to the DEAL or only the CONTACT? Mitigation:
   watcher polls engagements on both the deal and Ernesto's contact;
   meeting-id extraction written tolerantly; inspected against tonight's
   real note before freeze.
4. **Duplicate/updated notes on re-sync** — new note vs in-place update is
   unknown. Mitigation: dedupe on engagement id AND content hash; changed
   hash → re-ingest + re-score (which is the money beat anyway).
5. **Payload shape drift / Business-tier REST access** — verified from
   production as the first integration step; if REST is tier-blocked, the
   live beat dies and the pre-ingested fallback carries the demo (explicit
   risk, no workaround promised).
6. **HubSpot private-app scope for reading notes** — may be missing.
   Checked early via API; if missing → JEFF ACTIONS with exact clicks.
7. **Native Granola→HubSpot sync timing** — the note may land seconds to
   ~a minute after the click; tolerated by the poll loop; measured tonight.
8. **Single partial interview vs. timeline-hungry prompt** — risk of thin
   or hallucinated output. Mitigation: interview-mode prompt paragraph
   (minimal tweak, sales framing kept) + synthetic dry-run gate + "when in
   doubt surface less" instruction.

### JEFF ACTIONS (new queue for Run 2)

| # | Status | Action | Exact steps |
|---|--------|--------|-------------|
| J5 | OPEN — tonight | Create HubSpot fixtures + hand me the deal ID | Company (any name), deal named "granola" on it, contact **Ernesto Andaya** (Account Executive) with the SAME email as tomorrow's calendar invite; associate contact to the deal. Then paste me the deal ID (URL number on the deal page). |
| J6 | OPEN — tonight | Granola→HubSpot integration check + real test recording | In Granola: Settings → Integrations → HubSpot → connect to portal 245978261 if not already. Record a short (2-3 min) test call, press "sync to HubSpot" on it, tell me the meeting title + that you synced. This is the true gate for the whole chain. |
| J7 | CONDITIONAL | Private-app scope for notes read | Only if my scope check fails — I'll post exact clicks if needed. |
| J8 | LAST | Incognito rehearsal of the new demo | Queued at freeze with the minute-by-minute script. |

Proceeding to build immediately; checkpoints follow.

### CP-4 — Run 2 chain built, deployed, dry-run GREEN (2026-06-09 ~21:15)

**Shipped (`f646cb3` + ops scripts):** migration 0008 live (granola source +
job types + `granola_watch_config`) · GranolaClient · `granola_ingest` +
`deal_fitness` handlers · `analyze_deal_fitness` tool def ·
05-deal-fitness v1.2.0 (conversation-shapes-vary discipline) ·
`listDealNoteEngagements` (read-only) · `/api/granola/watch` ·
`nexus-granola-watch` pg_cron @15s (live, idling on no-config) · Deal
Fitness UI bones on `/pipeline/[dealId]` · `granola-demo`
activate/status/fallback/reset ops script · synthetic dry-run script.

**Production self-check PASS:** `GRANOLA_API_KEY` present in Vercel
(directive right about Vercel, wrong about `.env.local`); Granola REST
reachable from production — `{ok: true, status: 200, noteCount: 7}`.
Business-tier access CONFIRMED. Unknown-unknown #5 closed.

**Synthetic dry-run (real Claude, exact Granola payload shape): ALL CHECKS
PASS.** Sync 1 (partial interview): overall 22, 6 events detected,
business_fit 64, 8/8 evidence quotes verbatim-grounded. Sync 2 (full
interview, same engagement id — the mid-call re-sync): **22 → 51,
velocity accelerating**, 14 events, prior score correctly fed the
incremental run. Interview-honesty held: technical_fit was 0 on the
partial call because no technical content existed — no hallucinated sales
artifacts. THE MONEY BEAT WORKS.

**DECISIONS.md 2.19.1 recorded** (sidestep disposition, scope-widening
requires re-adjudication).

**Latency measured (dry-run):** fitness Claude call ≈ 75–95s. Click→score
estimate holds at ~2 min typical (15s poll + ≤10s worker + ~5s fetch +
~90s score + reload).

**Remaining to freeze:** J5 (deal ID → `granola-demo activate`) → J6 (real
test recording + sync click) → watch the chain run UNTOUCHED in production
→ verify partial-transcript behavior on mid-call sync (unknown-unknown #2,
the one real remaining risk) → freeze + minute-by-minute script + J8.

### CP-5 — REAL-RECORDING GATE PASSED · RUN 2 FREEZE (2026-06-10 ~01:50)

**The full click→score chain ran in production, untouched, on Jeff's real
test recording:** Granola sync click (01:15) → note landed on Ernesto's
CONTACT record → watcher (15s cron) found it → share-link uuid resolved
via list-match → raw transcript fetched from Granola → transcripts row
(right note, right channel mapping: mic=Jeff/seller) → deal_fitness
scored → score rendered on the deal page. **Zero human touches after the
click.**

**Score: an honest 0** — the test was Jeff speaking solo; the scorer
detected zero buyer behaviors and wrote: "Ernesto Andaya appears as a
listed participant but has zero recorded speech… The immediate priority
is to conduct a real discovery call with Ernesto." No hallucination on
degenerate input — §1.18 discipline holding on the worst-case real
artifact.

**Two real-world contract gaps the test caught (both fixed + deployed):**
1. Granola attaches its synced note to the CONTACT record, not the deal
   (`c31c1af`) — watcher now polls deal + contacts + company.
2. The note embeds a `notes.granola.ai/t/<uuid>` share link, NOT the
   `not_` API id, and the API rejects the uuid with **400** (not 404)
   (`38421c8`) — resolution now falls back on 400|404 to list-match
   (uuid-in-item → exact title → timestamp proximity).

**Plus the live experience (`fa6a745`):** auto-refreshing pages (8s/10s)
+ activity pulse ("Nexus is reading a new call from Granola…" →
"scoring the conversation…" with elapsed timer) — the compute is now a
visible beat, no manual reloads in the demo.

**Mid-call-sync question (unknown-unknown #2) — resolved by policy:** the
proven flow is stop-recording → sync. The demo runs TWO short recordings
(part 1: stop + sync + keep talking → score appears; part 2: stop + sync
→ score moves). Deterministic, uses only the proven path.

**RUN 2 FREEZE.** Production `fa6a745`. Fixes to the rehearsed path only.

## FINAL REPORT — RUN 2 (Granola click→score)

### Demo-day prep checklist (before Ernesto joins)

1. **Clean slate (recommended):** in HubSpot, delete the test note on
   Ernesto's contact (timeline → the "medvista notes" Granola note → ⋯ →
   Delete), then run `pnpm --filter @nexus/db granola-demo reset --yes`.
   The deal page then shows "No fitness analysis yet" — beat 1 lands from
   zero. (Skipping this is also fine: the arc becomes 0 → N accelerating,
   which reads as "yesterday's empty test, watch it move.")
2. Log in via the Desktop links file; open TWO tabs: the granola deal page
   + /deal-fitness. Both auto-refresh — never touch them again.
3. **THE ONE HARD REQUIREMENT: Ernesto must be on the SPEAKER channel.**
   Run the interview over Zoom/Meet/Teams with Granola capturing system
   audio. If he's in the room on your mic, every word lands seller-side
   and the scorer (correctly) finds zero buyer behaviors — tonight's test
   proved exactly that. Remote call = guaranteed channel split.
4. `granola-demo status` for a 10-second green check (config enabled,
   no stuck jobs).

### Minute-by-minute demo script

- **0:00** Start the Granola recording as the interview begins. Talk
  normally — the richer Ernesto's answers (numbers, his questions about
  comp/process/timeline, his next steps), the more behaviors land.
- **~6:00 — the click.** Natural pause: "let me show you something."
  **Stop the recording** in Granola, press **Sync to HubSpot → select the
  DEAL "Granola - New Deal"** (always the deal — see CP-5). Immediately
  **start a new recording** and keep the conversation going.
- **~6:15** Switch to the deal-page tab. Narrate the pulse as it appears:
  *"Nexus noticed the note land in the CRM. It's pulling the raw
  transcript from Granola right now — not the summary, the verbatim
  conversation."* Pulse flips to scoring: *"now Claude is reading it
  against 25 inspectable buyer behaviors — what YOU did, Ernesto, not
  what I did. Selling behavior doesn't count."*
- **~8:30** Score ring fills on its own. Click into the evidence:
  *"every detected behavior carries your verbatim words."* Ernesto sees
  his own sentences quoted with confidence scores. Show the not-yet
  coaching: *"and for what hasn't happened yet, it coaches me on how to
  earn it."*
- **~9:00** Flip to /deal-fitness: the interview sits IN the portfolio
  next to six scored deals. *"Same engine, every deal, every call,
  automatically."*
- **Continue the interview** (second recording running). Near the end:
  **stop + sync again (to the deal)**. Narrate over the pulse; **the
  score MOVES and velocity flips to accelerating** on screen. That's the
  close: *"the system saw 20 more minutes of you and changed its mind by
  exactly the amount the evidence justified."*
- Timing budget per sync: note lands ~5-15s after the click → pulse within
  15s → score ~2–2.5 min after the click. Keep talking; the auto-refresh
  does the reveal.

### If it hiccups (plan B/C)

- Chain stalls live → the deal already carries the previous sync's scored
  state (the auto-refresh just doesn't move): pivot to evidence
  walkthrough on what's there; the second sync usually lands late rather
  than never (retries at 1m/5m).
- Granola/HubSpot outage → `granola-demo fallback` pre-scores the
  synthetic interview on the deal (2 min), or pivot to Slate/Northpeak
  (rich 69-score examples).
- Plan C: yesterday's frozen /intelligence demo is intact and green.

### JEFF ACTIONS — final queue (Run 2)

| # | Status | Action |
|---|--------|--------|
| J5 | DONE | HubSpot fixtures (found + verified + activated automatically) |
| J6 | DONE | Test recording + sync — THE GATE PASSED on it |
| J7 | CLOSED N/A | Notes-read scope already present |
| J8 | **OPEN — final action** | Rehearse once tonight/tomorrow-morning: record 60s of yourself + any second voice on a Zoom test call, stop, sync to the DEAL, watch the pulse → score appear on the auto-refreshing deal page. Then (optional) clean slate per the prep checklist. |

### Post-demo backlog additions (Run 2)

- Remove `/api/demo-login` + rotate CRON_SECRET (carried from Run 1).
- Granola REST: petition/await a stable not_ id in the HubSpot note body
  (list-match resolution is demo-grade, not product-grade).
- Watcher: per-deal config table → multi-deal watch + attendee-email deal
  resolution (the product path; 2.19.1 requires re-adjudication).
- deal_fitness on a cadence (not just sync-triggered) + HubSpot
  nexus_fitness_* property writeback.
- Tighten fitness-page e2e into the standing demo-path harness.
- Delete `_tmp-*` scripts from packages/db/src/scripts.

**Both runs frozen green. Production `fa6a745`. Stop condition: DONE.**
