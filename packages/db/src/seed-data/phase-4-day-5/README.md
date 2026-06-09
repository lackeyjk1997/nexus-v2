# Phase 4 Day 5 A — Seed Content (author notes + executor contract)

**What this is.** The authored seed substrate for Phase 4 Day 5 A. Day 5 A populates
the upstream tables so `coordinator_synthesis` produces real pattern lineage and the
Day 5 B intelligence dashboard renders demo-quality instead of mostly-empty (§1.18).
This directory is the content; the Day 5 A executor session runs the loader + pipeline
against it (see "Executor runbook" below).

Authored out-of-session per the spec `docs/PHASE-4-DAY-5-A-SEED-CONTENT.md`. Where this
README and that spec disagree, **this README governs** — the spec was authored against a
healthcare/MedVista framing that has since been superseded (see "Seed framing" below).

---

## Seed framing (the decision that supersedes the May-27 spec)

**Seed subject = Anthropic. Product = Claude** (API + Claude for Enterprise + Claude Code).
**Prospects = fictional high-growth software / AI-native scaleups.** **Vertical = `technology`.**
**Primary competitor = OpenAI** (one deal also evaluates Google Gemini/Vertex for variance).

**Why this, not the spec's generic-healthcare placeholders.** The BUILD-LOG "Seed data
realism" operational note (committed `2937155`, marked *urgent before Phase 4 Day 5*) is the
governing guidance:

> Use a real, identifiable company … as the seed-data subject **rather than generic
> placeholder companies** … (b) lets the operator evaluate output sensibility against known
> ground truth … The seeded company should be one Jeff knows well enough to detect when the
> system is producing nonsense vs. valid analysis.

The May-27 spec (`docs/PHASE-4-DAY-5-A-SEED-CONTENT.md`) inverted this — its §4 mandates
"Names plausibly fictional, never real" and builds a clinical-AI-into-healthcare story
(competitor Microsoft DAX, EMR/Epic/PHI). That contradicts the realism note it claims to
capture. Oversight resolved the conflict (2026-06-09): **the *subject* is a real company the
operator knows cold (Anthropic); the *prospects* stay fictional** so "no real PII" still holds.
This satisfies both the realism note (real, ground-truth-checkable subject) and the spec's
prospect-anonymity rule.

This framing is also the *least* disruptive to what's already committed: the existing
MedVista fixture already sells **Claude** against **Microsoft Copilot/DAX**
(`packages/shared/tests/fixtures/medvista-transcript.txt`), and seller participants are
already tagged `org: "Nexus/Anthropic"`. The pivot changes the *prospect vertical* (healthcare
→ technology) and the *competitor anchor* (Microsoft → OpenAI); it does not invent a new
vendor.

### MedVista (live anchor `321972856545`) — kept as-is, no reskin

MedVista stays the **healthcare cross-vertical isolation outlier** (resolves spec §8.3). It is
already coherent under this framing (Anthropic sells Claude, competitor Microsoft/DAX, vertical
healthcare). Its `competitive_intel` signals are **healthcare**-vertical, so they correctly do
NOT pattern-link to the **technology**-vertical OpenAI signals the seed deals produce — the
coordinator groups by `(vertical, signal_type)`. The isolation is structural, not seeded. **Do
not author MedVista variants** (spec §7 still holds for that reason). No edits to its committed
fixture or live rows in Day 5 A.

---

## §8 open questions — resolved

| # | Question | Resolution | Rationale |
|---|----------|-----------|-----------|
| 8.1 | Seed signal events directly, or seed transcripts + run pipeline? | **(a) Seed transcripts; executor runs the Phase 3 pipeline.** No `signal-events.json`, no `meddpicc-scores.json` authored. | The architecture is transcript-first (§1.1, §1.2, §2.16.1 decisions 1+4 — speaker-turn embeddings + raw-turn preservation). Hand-written signal events leave `transcript_embeddings` empty and skip the prompts the realism note exists to *exercise* ("verify prompts handle the input-distribution variance gracefully"). Cost (~$2-4 Claude) is not a constraint (Guardrail 10). Hybrid (c) is the fallback if pipeline non-determinism breaks the overlap math (see "If the overlap math misses"). |
| 8.2 | Microsoft DAX angle consistency | **Moot under this framing.** Competitor is **OpenAI** for the tech deals (Microsoft/DAX stays only on the MedVista healthcare outlier). | DAX is a clinical-documentation product; irrelevant to Anthropic-vs-OpenAI tech deals. |
| 8.3 | Cross-vertical isolation demo | **Yes — MedVista is the outlier** (above). No new cross-vertical deal needed; isolation is demonstrated by the existing healthcare anchor not grouping with the seeded technology deals. | Silence-as-feature (§1.18): the system correctly producing no cross-vertical pattern is a positive. |
| 8.4 | Company-knowledge file scope | **Parked for Day 5 A.5.** That file = Anthropic's profile (what Claude is, ICP, competitors OpenAI/Gemini/open-weight, glossary, common objections). Does not gate Day 5 A. | PRODUCTIZATION-NOTES "Customer company-knowledge layer (Stage 2)" lightweight pattern. |
| 8.5 | Observation count + sub-threshold demo | **One above, one below** (refined (c)): a 3-member cluster (admitted) + a 2-member near-miss (silently rejected, just under `minMemberCount: 3`). | Distributes the surfacing philosophy across two surfaces: the patterns surface demonstrates §1.16 scoring/ordering; `category_candidates` demonstrates §1.18 *silence*. A coherent 2-member near-miss is a more legible "Nexus saw it and held back" story than 3 unrelated singletons. The rejection is visible only in `applicability_rejections`. |

---

## Deal roster

All `nexus_vertical = "technology"`, `nexus_product = "claude_enterprise"`, pipeline
`2215843570`. `hubspot_owner_id` = seeded persona email (owner-name resolution is a Phase 5+
item; a stable string is sufficient today). All `hubspotId`s carry the `seed_` prefix so the
Phase 6 demo-reset endpoint can wipe seed rows by prefix (spec §4.4).

| hubspotId | Company | Stage (id) | Amount | Competitor | Owner | Employees | Calls |
|-----------|---------|-----------|--------|-----------|-------|-----------|-------|
| `seed_deal_001` | Northpeak Labs | technical_validation (`3544580806`) | $1,200,000 | OpenAI | sarah.chen | 600 | 3 |
| `seed_deal_002` | Slate Data | technical_validation (`3544580806`) | $850,000 | OpenAI | sarah.chen | 1,200 | 2 |
| `seed_deal_003` | Cedarline Systems | negotiation (`3544580808`) | $2,100,000 | OpenAI (+Gemini) | ryan.foster | 2,800 | 2 |
| `seed_deal_004` | Brightwall | technical_validation (`3544580806`) | $620,000 | OpenAI | ryan.foster | 900 | 1 |
| `seed_deal_005` | Sundial AI | discovery (`3544580805`) | $380,000 | — (none named) | sarah.chen | 140 | 1 |

`createdate` set 30–75 days back so none are shielded by the §1.18 first-48h observation
window. `closedate` 2–5 months forward so all are open and `getAtRiskComparableDeals` picks
them up.

**Cosmetic note (not a blocker):** the 14-person demo org (`packages/db/src/seed/users.ts`)
has no `technology`-specialized AE — AEs are healthcare/finserv/manufacturing/retail. Deals are
owned by Sarah Chen (healthcare AE, demo protagonist per §1.1) and Ryan Foster (healthcare AE),
giving cross-rep portfolio breadth for Marcus's dashboard. The technology **SA** Maya Johnson
joins the technical calls (correct specialization). A future polish pass could add a technology
AE or retag; owner-name resolution doesn't surface in Day 5 A.

## Contacts & roles (`deal_contact_roles`)

ContactRole canonical (9): champion, economic_buyer, decision_maker, technical_evaluator,
end_user, procurement, influencer, blocker, coach. Exactly one `isPrimary` per deal.

| Deal | Contact | Title | Role | Primary |
|------|---------|-------|------|---------|
| 001 Northpeak | Diane Okonkwo | VP Engineering | economic_buyer | ✓ |
| 001 Northpeak | Raj Mehta | Staff ML Engineer | champion | |
| 001 Northpeak | Tom Bradley | Director, Procurement | procurement | |
| 002 Slate Data | Kevin Liu | CTO | decision_maker | ✓ |
| 002 Slate Data | Sofia Reyes | Eng Manager, Platform | champion | |
| 003 Cedarline | Mark Feldman | SVP Engineering | economic_buyer | ✓ |
| 003 Cedarline | Anika Shah | Principal Engineer | technical_evaluator | |
| 003 Cedarline | Wei Zhang | Procurement Lead | procurement | |
| 004 Brightwall | Jen Alvarez | Director of Engineering | decision_maker | ✓ |
| 004 Brightwall | Paul Nguyen | Senior Software Engineer | technical_evaluator | |
| 005 Sundial AI | Chris Donovan | Co-founder & CTO | decision_maker | ✓ |

---

## Signal map → admission contract (executor verifies against this)

§8.1(a): these are the signals the **pipeline is expected to extract** from the authored
transcripts (engineered so the load-bearing moments are unambiguous through the transcription
noise). The executor verifies the produced `signal_detected` events match this shape closely
enough that admission clears as below. Exact confidences/counts will vary (temp 0.2); the
**overlap structure** is what must hold.

| Deal | Call → stage | Expected signal types |
|------|-------------|----------------------|
| 001 Northpeak | C1 discovery | identify_pain (metrics), field_intelligence |
| 001 Northpeak | C2 technical_validation | **competitive_intel (OpenAI)**, win_pattern |
| 001 Northpeak | C3 security/proposal | **deal_blocker (security / zero-retention)** |
| 002 Slate Data | C1 discovery | identify_pain, field_intelligence |
| 002 Slate Data | C2 technical_validation | **competitive_intel (OpenAI)**, **deal_blocker (legal/procurement queue)** |
| 003 Cedarline | C1 technical_validation | **competitive_intel (OpenAI primary, Gemini secondary)** |
| 003 Cedarline | C2 negotiation | **deal_blocker (CFO budget hold)**, competitive_intel |
| 004 Brightwall | C1 technical_validation | **competitive_intel (OpenAI)**, field_intelligence |
| 005 Sundial AI | C1 discovery | content_gap, field_intelligence |

**Resulting `(technology, signal_type)` groups and admission (`intelligence_dashboard_patterns`:
minDealsAffected 2, minAggregateArr $500K):**

| Group | Deals | Aggregate ARR | Admission |
|-------|-------|---------------|-----------|
| competitive_intel | 001, 002, 003, 004 | $4.77M | **ADMITTED → Pattern 1 (OpenAI headline)** |
| deal_blocker | 001, 002, 003 | $4.15M | **ADMITTED → Pattern 2 (security/procurement)** |
| win_pattern | 001 | $1.2M | silent — 1 deal < minDealsAffected:2 |
| content_gap | 005 | $0.38M | silent — 1 deal, and < $500K |
| field_intelligence | 001, 002, 004, 005 | n/a | portfolio-relevant; not deal-pattern material |

So the dashboard renders **2 ordered patterns** (§1.16 scoring decides order; deal_blocker is
higher operational priority per the taxonomy, competitive_intel has more deals + ARR — the
score explanation makes the ranking legible), and the admission engine **silently** rejects the
singleton groups (§1.18). Two surfaces, two demonstrations: ordering here, silence on
`category_candidates`.

## Observations → `category_candidates` (§8.5: one above, one below)

5 observations, `signal_type = NULL` (§2.13.1 nullable invariant), `status = pending_review`,
`sourceContext.category = "rep_captured"`. Executor runs the Day-3 `observation_cluster`
handler; Claude assigns each a normalized signature.

- **Cluster A — ADMITTED (3 members):** rate-limit / capacity-at-scale anxiety. Three reps
  capture prospects worrying about production throughput / rate limits at scale — real concern,
  not yet a hard blocker. 3 ≥ `minMemberCount:3`, confidence ≥ medium → renders as a category
  candidate for Marcus to promote.
- **Cluster B — NEAR-MISS, withheld (2 members):** fine-tuning / customization-roadmap
  positioning uncertainty. Two reps unsure how to position Claude's customization story vs. a
  competitor's. 2 < `minMemberCount:3` → silently rejected at admission; visible only in
  `applicability_rejections`. This is the §1.18 silence demo.

(Authored shapes are deliberately distinct so Claude assigns two different signatures. If the
clusterer merges or splits differently, see "If the cluster shapes drift" below.)

## Other tables

- **`manager-directives.json` — 8 active rows.** Author = Marcus Thompson (MANAGER). Mix:
  ~5 `{scope:{vertical:"technology"}}`, ~2 org-wide (`scope:{}`), 1 size-scoped. Feed
  `getActiveManagerDirectives` → `${activeDirectivesBlock}`.
- **`system-intelligence.json` — 5 active rows**, `vertical:"technology"`, relevance
  0.68–0.95 (mixed so ordering is meaningful). Anthropic-vs-OpenAI/Gemini/open-weight market
  intelligence. Feed `getSystemIntelligence` → `${systemIntelligenceBlock}`.
- **`experiments.json` — 3 active rows**, `lifecycle:"active"`, `vertical:"technology"`,
  `applicability` JSONB validating against `ApplicabilityRuleSchema`. Feed
  `getExperimentsForVertical` → `${relatedExperimentsBlock}`.

---

## File manifest

```
companies.json            5 hubspot_cache company rows
deals.json                5 hubspot_cache deal rows
contacts.json             { contacts: [11 hubspot_cache contact rows], dealContactRoles: [11] }
manager-directives.json   8 manager_directives rows
system-intelligence.json  5 system_intelligence rows
experiments.json          3 experiments rows
observations.json         5 uncategorized observations (3 + 2)
transcripts/              9 markdown transcripts with front-matter (1-3 per deal)
```

`companies.json` / `deals.json` are plain arrays of `{ objectType, hubspotId, payload }`
(executor generates `id` + `cachedAt`). `contacts.json` is an object because it spans two
tables (`hubspot_cache` contact rows + `deal_contact_roles`). No `signal-events.json` /
`meddpicc-scores.json` — §8.1(a), the pipeline produces both.

---

## Executor runbook (Day 5 A session)

1. **Preflight 0:** assert all files present + JSON parses + every `transcripts/*.md`
   front-matter `deal_hubspot_id` matches a row in `deals.json`.
2. **Load structured rows** into `hubspot_cache` (deals/companies/contacts), `deal_contact_roles`,
   `manager_directives`, `system_intelligence`, `experiments`, `observations`. Idempotent on
   `hubspotId` / natural keys. **ID resolution:** directives/experiments/observations carry an
   `authorEmail` / `originatorEmail` / `observerEmail` sidecar (not a column) — the loader
   resolves it to the seeded `team_members.id` (directives author, experiment originator) or
   `users.id` (observation observer) via `WHERE email = …` and drops the sidecar. All resolve to
   `marcus.thompson@`, `sarah.chen@`, or `ryan.foster@nexus-demo.com` from `seed/users.ts`.
3. **Load transcripts** into `transcripts` (one row per `.md`, `source:"simulated"`,
   `pipeline_processed:false`, `participants` from front-matter incl. `side`).
4. **Run the Phase 3 transcript pipeline** per transcript (`transcript_pipeline` job). Produces
   `signal_detected` + `meddpicc_scored` events, theory, embeddings, flips `pipeline_processed`.
   Verify each run emits its `prompt_call_log` rows.
5. **Verify the signal map:** query `deal_events` for `signal_detected` grouped by
   `(event_context->>'vertical', payload->>'signal_type')`. Confirm competitive_intel ≥ 4 deals,
   deal_blocker ≥ 3 deals (per the contract table).
6. **Trigger `coordinator_synthesis`** (vertical=technology). Confirm **2** `coordinator_patterns`
   rows (competitive_intel + deal_blocker) with their `coordinator_pattern_deals` joins; confirm
   no pattern for the singleton groups. Existing `test:coordinator-synthesis-*` gates as model.
7. **Run `observation_cluster`** over the 5 observations. Confirm 1 admitted candidate (cluster A,
   3 members) on `category_candidates` + cluster B (2 members) present but rejected in
   `applicability_rejections`.
8. **Verify MedVista isolation:** confirm no pattern groups MedVista's healthcare signals with
   the technology competitive_intel pattern.
9. Commit + deploy; pool-snapshot 5-min/30-min gate per the established Phase 4 discipline.

**If the overlap math misses** (pipeline extracted competitive_intel on < 2 deals, or a
load-bearing signal didn't fire): the transcripts mark the load-bearing moments clearly, so this
is unlikely — but the §8.1 fallback is hybrid (c): seed the missing `signal_detected` event(s)
directly for the affected deal(s) to restore the overlap, keeping the rest pipeline-produced.
Log which deals were patched.

**If the cluster shapes drift** (clusterer merges A+B or splits A): adjust observation wording so
the two shapes are more distinct / the three A-members are more uniform, and re-run step 7. The
member counts (3 vs 2), not the exact signature string, are what the demo depends on.

## Realism discipline applied (transcripts)

Per the BUILD-LOG "Seed data realism" note + the user's authoring direction:
- **Transcription artifacts:** acronym mangling ("SOC 2" → "sock two"/"soc two", "RAG" → "rag"/
  "rague", "SSO" → "single sign on"/"s s o", "MSA" → "M-S-A"), brand mangling ("OpenAI" →
  "Open AI"/"open eye" occasionally), number garbles.
- **Conversational artifacts:** `[crosstalk]`, half-finished sentences, self-corrections, filler,
  interruptions, side-channel ("can you hear me now?").
- **Speaker-attribution failures:** occasional `[inaudible]` / `UNKNOWN SPEAKER:` /
  `[overlapping]` so the detector must attribute to "unidentified speaker" per its discipline.
- **Load-bearing clarity:** the *signal* moments (the OpenAI comparison, the security blocker)
  are stated plainly even amid the mess — real calls do this; the important objection is rarely
  the mumbled one. This keeps the transcripts realistic AND reliably detectable.
- **MEDDPICC spread across calls**, never one MEDDPICC-complete fixture: discovery surfaces
  pain/metrics; technical_validation surfaces competition/decision-criteria; security/negotiation
  surfaces decision_process/paper_process/economic_buyer.
- Length 800–1500 words/call; `.example.com` domains; no real PII; `seed_` IDs.

## Refresh discipline

One-time scope for Day 5 A's seeding event. If the Phase 6 demo-reset endpoint changes the seed,
this directory + `docs/PHASE-4-DAY-5-A-SEED-CONTENT.md` are the authoring references; edit them
alongside the content. Seed framing (Anthropic / Claude / technology / OpenAI) is the durable
decision — do not silently revert to the spec's healthcare placeholders.
