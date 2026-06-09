# The Customer Discovery Engine — Stage 1 of 5

**Prepared for:** Wispr Flow founding AE interview with Tanay
**Purpose:** Strategic-pitch input for a high-fidelity vision slide. Phase A is the verbose workflow narrative; Phase B distills it for the slide; the handoff section scaffolds the design pass without making the design decisions.
**Not a product pitch.** This is an extension of Tanay's own framing — "your engine, five stages out" — not a sale.

---

## The argument in one sentence

The customer discovery engine Tanay built surfaces who's already inside the product — that's Stage 1 of a five-stage customer graph; Wispr is the only company in the category positioned to extend the same engine across engagement, account, deal, and post-sale, and the resulting compounding feedback loop is the moat.

---

## What Tanay has said about the engine today

Anchored to his LinkedIn framing so the slide echoes his vocabulary, not new vocabulary:

> "We had to build one thing first: a customer discovery engine. It connects every piece of information we have on a user… You can ask it: who's our most influential user inside NVIDIA, what features are they using, where are they getting stuck? And the answer comes back in a minute. Most companies won't build anything like this. So they hire 50 people to brute-force the same problem instead. But your next 1,000 customers are already using your product."

Today's engine: ingests product usage per user (words dictated, features used, drop-off points), joins it to identity and firmographics (anonymous user 47281 → Sarah Chen, VP of Engineering at NVIDIA), and answers natural-language questions in under a minute. The Founding AE's day starts with a query ("top 20 power users this week across F500 accounts where we have no commercial contract"), runs warm-intro discovery calls into already-converted users, and feeds learnings back manually.

The engine is doing Stage 1 work. The slide argues there are four more stages, and they all run on the same engine.

---

# Phase A — The 5-stage workflow (verbose)

## Stage 1 — DISCOVERY (today)

**What the engine does.** Identifies who to talk to from product usage. Answers Tanay's stated query type: who's most influential, what features are they using, where are they stuck.

**Data sources.** Dictation-specific product telemetry: time-to-first-dictation after signup, dictation volume per session and per week, Command Mode adoption rate, multi-language usage, time-from-speaking-to-submit (a trust-in-the-product signal — the closer to zero, the more the user has stopped second-guessing the model), session frequency and stickiness, friction events (re-recordings, abandoned dictations, accuracy corrections). Joined to identity + firmographics (email → name → company → title → department → headcount band).

**Output to the AE.** A ranked list with one-line warm-intro reasons keyed to the signal that surfaced them — "Sarah dictated 23K words last month with Command Mode in 89% of sessions" reads differently than "Sarah's team has 8 active dictation users in one BU." The list answers "who" not "whether."

**Sarah Chen at NVIDIA, Stage 1.** Engine surfaces Sarah: 4-minute time-to-first-dictation after signup, 23,000 words across 47 sessions in the last 30 days, Command Mode in 89% of sessions, zero abandoned dictations in the last two weeks (trust signal — she's stopped editing for the model), switched to Cantonese twice last week (multi-language → likely managing a global team). VP of Engineering, NVIDIA Datacenter Infrastructure. The founding AE pings her on LinkedIn for a 15-minute discovery call.

**Nexus architecture parallel.** Nexus has the join-and-query primitive in the form of `hubspot_cache` + `people` table + the `CrmAdapter` interface (DECISIONS §2.18/§2.19) — a unified read surface across identity, firmographics, and engagement signals queryable by adapter calls.

**What changes for Wispr from today's state.** Nothing yet. This stage is what's already shipped.

---

## Stage 2 — ENGAGEMENT (the natural next build)

**What the engine does.** Absorbs sales conversations. Every email the AE sends, every meeting transcript, every call recording becomes structured signal on the same user object the engine already knows about. The engine no longer just knows Sarah dictated 23,000 words — it knows what she said when the AE called her, what objections came up, what features her team cared about, what she promised to send to her boss, what was left unresolved.

**Data sources.** Meeting recordings (Gong / Zoom / native), AE email threads (Gmail / Outlook), calendar context. Crucially: Wispr's own AE team is generating this corpus today, in real time. No customer-side integration needed for the first version.

**Output to the AE.** Pre-call brief that already knows the person ("Sarah uses Command Mode daily, raised SSO + Cantonese support last call, said her boss Naveen owns the budget, asked for SOC 2 docs and you sent them 6 days ago — no reply yet"). Post-call signal: structured extraction of objections, commitments, asks, stakeholder mentions.

**Sarah Chen at NVIDIA, Stage 2.** Discovery call ran. The engine has now ingested the 38-minute transcript. It captured: SSO requirement (Okta), multi-language asks (Cantonese + Mandarin for the NVIDIA Shanghai team), boss is "Naveen, VP of Eng Infrastructure, owns the security budget," concern about whether dictation accuracy holds for technical jargon ("CUDA," "TensorRT," "Hopper architecture"), promised a 30-minute follow-up with two of her direct reports. None of this was in the product usage data alone.

**Nexus architecture parallel.** This is the transcript pipeline. Phase 3 Days 2-4 shipped: an 8-step pipeline running 5 Claude calls per transcript, producing structured `signal_detected` events with reasoning traces and evidence quotes; speaker-turn-granular embeddings via Voyage `voyage-large-2` (1536-dim) on an HNSW index; MEDDPICC scoring across 8 dimensions written back to the system of record; a continuous deal theory updated per transcript via `06a-close-analysis-continuous`; coordinator-grade pattern detection across deals via `04-coordinator-synthesis` with stakeholder-name grounding verified live (Phase 4 Day 4 synthesis cited real names from the CRM warm cache). Every Claude call writes to `prompt_call_log` for audit.

**What changes for Wispr from today's state.** This is the new build. The data is already being generated; the structured-extraction layer is new. Stage 2 is what makes the engine answer "what does Sarah actually say in calls" — not just "what does Sarah do in the product."

---

## Stage 3 — ACCOUNT

**What the engine does.** Rolls up from user to organization. The engine that knows Sarah individually now knows NVIDIA collectively. It answers: how many active users do we have across the org, in which business units, who reports to whom, who's a power user, who's procurement, who's gone silent.

**Data sources.** Stage 1 + Stage 2 data joined on company. Org chart enrichment (Clay / Clearbit / LinkedIn). Identity resolution (matching "Sarah" the dictation user, "schen@nvidia.com" the email recipient, and "Sarah Chen" the meeting participant as the same person).

**Output to the AE.** Account view: 47 active users across 4 NVIDIA business units (Datacenter, Gaming, Auto, Pro Viz), 6 are heavy power users, 2 report to Naveen (the VP we're talking to), 1 procurement contact (Priya in IT Procurement) logged in twice three weeks ago and disappeared. The AE moves from selling-to-Sarah to selling-to-NVIDIA.

**Sarah Chen at NVIDIA, Stage 3.** Engine rolls up: 47 active users across NVIDIA, 6 power users (Sarah + 5 of her direct/indirect reports in Datacenter Infrastructure — all averaging 15K+ words per month and Command Mode in 70%+ of sessions), 2 procurement signals (Priya signed up, used it twice, then went silent — that's a contracting/security review signal, not a churn signal), Naveen has never logged in himself but is named in 3 separate conversations as the approver. The Datacenter BU is hot; the Gaming BU has 12 dormant signups (expansion target after the Datacenter deal closes).

**Nexus architecture parallel.** Nexus has the primitives: `people` table per §2.19, `observation_deals` many-to-many join, applicability gating that already supports vertical + segment filtering. What it does NOT yet have is account-level rollup as a first-class surface — Nexus today is deal-scoped, not account-scoped. The rollup is additive: same data, new query patterns, new surface in the surfaces registry. The `CrmAdapter` boundary makes the future Salesforce port viable (PRODUCTIZATION-NOTES Stage 3).

**What changes for Wispr from today's state.** Identity resolution becomes a first-class system. The engine moves from per-user to per-org views. The AE stops working a contact list and starts working an account map.

---

## Stage 4 — DEAL

**What the engine does.** Tracks the apparatus of buying. Procurement timeline, security review status, SSO requirements, buying committee, who's gone silent, what's been promised, what's stuck. Answers "why is the NVIDIA deal stuck" with specifics.

**Data sources.** Stage 2 + Stage 3 data plus contract artifacts (DocuSign / Ironclad), security questionnaire status, calendar drift (rescheduled meetings, ghost-cycles), procurement system signals where available.

**Output to the AE.** Deal health view: stage, days in stage, MEDDPICC coverage, last-touched-by-whom, what's blocking, what's promised that hasn't shipped. A risk flag the moment the deal is genuinely at risk — not before, not after.

**Sarah Chen at NVIDIA, Stage 4.** Deal moved to procurement 14 days ago. Security questionnaire returned 6 days ago — 3 open items (data residency, model training opt-out, custom DPA language). Naveen went quiet 8 days ago after a Slack-introduced threat: NVIDIA InfoSec mentioned Granola in a comparison email. SSO is unblocked (Okta confirmed). Two of Sarah's reports have continued daily dictation throughout — strong signal the user-side champion is holding. Risk flag: deal slips 21+ days if data residency isn't answered by Friday.

**Nexus architecture parallel.** This is what Phase 3 Day 3 + Phase 4 Days 1-4 built for deals like MedVista's Epic Integration: MEDDPICC scoring per dimension with evidence quotes, `meddpicc_scored` events with `event_context` snapshots, `SurfaceAdmission.admit` filtering risk signals through stage + temporal + precondition gates, scored insights with visible reasoning, `coordinator_synthesis` producing cross-deal patterns. The `06a-close-analysis-continuous` running deal theory is the substrate for "why is this deal stuck" — already live, already updating per transcript.

**What changes for Wispr from today's state.** Deal apparatus becomes first-class. The engine moves from "Sarah is a power user" to "the deal she's the champion of is stuck on data residency and Naveen has been silent 8 days." Same brain, same user object — now with deal-shaped context layered on top.

---

## Stage 5 — CUSTOMER

**What the engine does.** Watches post-sale. The same engine that ran discovery now runs customer health. Active users by department, power users whose dictation volume has dropped or weekly session count has fallen toward zero (churn risk), executive sponsors changing jobs (relationship risk), expansion signals (adjacent BU starting to sign up and accumulating weekly word counts), product usage shifts (a department abandoning Command Mode → enablement gap), accuracy-correction friction spikes (a domain Wispr hasn't tuned for yet).

**Data sources.** Continuous product usage (Stage 1's data, post-contract). CSM conversations (eventually — Wispr will hire CSMs). Support tickets. Renewal calendar. Stakeholder LinkedIn changes (the "executive sponsor changed jobs" signal).

**Output to the CSM / account team.** Customer health view that's the mirror image of the deal view. The same engine. No handoff. The CSM inherits everything the AE knew, and the engine continues to learn.

**Sarah Chen at NVIDIA, Stage 5.** Six months post-contract. NVIDIA Datacenter BU: 89 active users, 12 power users, healthy. NVIDIA Gaming BU: jumped from 12 dormant to 47 active in the last 3 weeks (a Sarah-introduced expansion path — flag for upsell). Risk: Naveen left NVIDIA two weeks ago for an OpenAI infrastructure role. New VP of Eng Infra is named Daniel; he's never used Wispr. Engine surfaces this immediately as a sponsor-transition risk — flag for the CSM to engage Daniel inside the first 30 days.

**Nexus architecture parallel.** Out of v2 scope per DECISIONS §1.8. But the primitives generalize cleanly — `deal_events` is just `customer_events` with a different event_type taxonomy; `coordinator_patterns` already runs across deals and would run across customers the same way; `SurfaceAdmission` already routes per-surface admission rules. PRODUCTIZATION-NOTES Stages 3-4 anticipate this expansion via the same `CrmAdapter` + event-stream architecture.

**What changes for Wispr from today's state.** Post-sale is a new product surface entirely. But it runs on the same engine, the same user object, the same identity resolution Stage 3 introduced. There is no separate "customer success tool" to integrate — there is one customer object, and the engine watches it for life.

---

## The engine follows the person, not the account

The user object is durable across employers. When a power user leaves their company, the engine doesn't lose them — it carries the history forward to whichever Wispr account next sees their email or voice fingerprint. A churn event at one account becomes a discovery event somewhere else.

**Example.** A Fortune 1000 power user — two years of heavy dictation, Command Mode in 80%+ of sessions, zero accuracy-correction friction — deactivates because they left the company. At the deactivating account that's a single-user attrition signal. Across the engine it's a Stage 1 entry at whatever company they show up at next. The day their new corporate email starts dictating, the engine surfaces them to the AE covering that new account: "24 months of heavy Wispr usage at a previous F1000 employer; this user isn't learning the product — they brought it with them."

**Sarah Chen applied.** When Naveen leaves NVIDIA for OpenAI in Stage 5, the engine simultaneously logs (a) sponsor-transition risk at NVIDIA → engage new VP Daniel within 30 days, AND (b) cross-account discovery at OpenAI → an 18-month Wispr power user just walked in with political capital and a Cantonese-multilingual habit. The AE covering OpenAI didn't have to find Naveen; the engine handed him over the moment his @openai.com email signed in. The same event drives a defensive play at NVIDIA and an offensive play at OpenAI.

**Why this compounds.** Two compounding dynamics on the same engine. The deal-level loop (described next) trains the engine on outcomes. The person-level loop turns every power user into a multi-decade book of potential warm intros — every job change is a discovery event at the receiving company. A 10K-power-user product over 10 years is also a 10K-strong implicit referral network the moment any of them changes employers. PLS tools reset on email-domain change; conversation-intelligence tools don't track product behavior across employers; CRMs close the record when the contract closes. None of them carries the person forward.

---

## The compounding feedback loop (the moat)

**Every outcome trains the engine.** Closed-won, closed-lost, expanded, churned, ghosted, displaced-by-competitor — each is a label. The engine retroactively asks: what product behaviors preceded this outcome? What conversation patterns? What stakeholder shapes? What procurement signals?

Over time the engine learns: "VP of Eng + 6-month power-user history + 5+ heavy users in the same BU + SSO mention in discovery + data-residency question in security review" predicts close-won at 73% with median 11-month cycle. "Procurement contact appears in week 1 and disappears, never replaced" predicts close-lost at 81%. "Adjacent BU starts signing up within 90 days of contract" predicts 2.4× ARR expansion in year 2.

These aren't insights a human PM could write down — they're emergent patterns the engine surfaces because it has all five stages of data on one user object across thousands of customer journeys.

**The compounding part:** every new deal makes every future deal smarter. Every closed-lost makes every active deal's risk model sharper. The engine that started as "who do I cold-call" becomes "what's the highest-leverage action across every account, ranked by the predicted outcome of every available next move." This is what Tanay's anti-headcount frame ("hire 50 people to brute-force") points at: it's not just that the engine replaces 50 SDRs — it's that it gets monotonically better while 50 SDRs don't.

**Nexus architecture parallel.** The primitives exist: `prompt_call_log` for per-call audit (every Claude decision is replayable), `surface_feedback` + `surface_dismissals` for explicit rep feedback, close-lost analysis design (DECISIONS §1.1) for outcome capture, `coordinator_patterns` for cross-deal pattern emergence, `experiments` + `experiment_attributions` for treatment-effect measurement. The closed-loop "outcomes write training signal back to the engine" is the natural next layer above all of this — not built today, but every required primitive is.

---

## What makes this defensible (Wispr-only positioning)

Every adjacent category started in a specific lane. The fragments aren't fixed today — everyone has expanded — but the lineage shows in the seams between layers:

- **PLS lineage** — Pocus (acquired by Apollo.io in 2026), Common Room, HeadsUp, Endgame, MadKudu. Started in product signal; today they layer outbound, AI agents, and account workflows on top. Conversation data is acquired, integrated, or bolted on — not native.
- **Conversation-intelligence lineage** — Gong, Chorus, Fireflies, Salesloft Rhythm. Started in the call; Gong positions as a "Revenue AI Operating System" now and runs deal management + forecasting. Product behavior is something the platform integrates with, not owns.
- **CRM lineage** — Salesforce, HubSpot. Started in the operational record; built and bought their way into AI (Agentforce, Breeze) and conversation analytics. The seam between record-of-truth and the dynamic engagement layer above it is the integration question.
- **Customer-success lineage** — Gainsight (with Gainsight PX for product analytics and Staircase AI for conversational signals), Catalyst, ChurnZero. Started post-sale and is expanding upstream; the pre-sale story that produced the deal is something they inherit, not generate.

**The honest argument isn't single-purpose.** None of these players is single-purpose anymore — they've all expanded. The argument is lineage and seams: the layers in their stacks were built or acquired separately and stitched together through identity reconciliations. A user is one row in product, a different ID in the call transcripts, a third in the CRM, a fourth in the post-sale ledger; the joins are best-effort and the seams are where retrofitting shows.

Wispr is positioned to start greenfield with the product, the AE motion, and (in time) the post-sale motion on the same user object from the first event — and that user object follows the person across employers, not just the account across deals. That's not a moat against capability — every adjacent player is capable — it's a moat against integration and time-in-relationship. A competitor catching up has to reconcile what Wispr never has to separate, and they have to wait for the multi-year usage history Wispr's users are already accumulating. And per Tanay's own framing, "most companies won't build anything like this — they hire 50 people instead." Wispr already chose to build.

---

# Phase B — Slide-ready content

## Five workflow stage cards

**Stage 1 — Discovery (today)**
*The engine surfaces who to talk to from dictation behavior.*
- Input: time-to-first-dictation, weekly volume, Command Mode adoption, multi-language usage, friction events
- Output: ranked warm-intro list keyed to the signal that surfaced them
- Sarah Chen at NVIDIA: 23K words/month, Command Mode 89%, switched to Cantonese twice — VP Eng.

**Stage 2 — Engagement**
*The engine absorbs every AE conversation.*
- Input: meeting transcripts + AE email
- Output: structured asks, objections, commitments per user
- Sarah at NVIDIA: SSO via Okta, Cantonese for Shanghai team, boss is Naveen, asked for SOC 2 — sent 6 days ago, no reply.

**Stage 3 — Account**
*The engine rolls up from user to organization.*
- Input: org chart + identity resolution across Stage 1 + 2 data
- Output: account view — power users, procurement contacts, dormant signups, silence patterns
- NVIDIA: 47 active users across 4 BUs, 6 power users, 1 procurement contact gone silent.

**Stage 4 — Deal**
*The engine tracks the apparatus of buying.*
- Input: contract status + security review + stakeholder silence + competitive mentions
- Output: deal-stuck-because-X with specifics
- NVIDIA: data residency blocking, Naveen silent 8 days, Granola surfaced in InfoSec email.

**Stage 5 — Customer**
*The same engine watches post-sale — and follows people across employers.*
- Input: continuing product usage + CSM conversations + sponsor changes + cross-account moves
- Output: churn risk, expansion signals, sponsor-transition flags, cross-account discovery leads
- NVIDIA six months in: Gaming BU expansion; Naveen → OpenAI is flagged simultaneously as NVIDIA risk and OpenAI day-one lead.

## Today / tomorrow framing line

> Today the engine surfaces who to call. Tomorrow the same engine follows them through procurement, contract, and expansion — without a handoff.

## Anchor claims (screenshot-worthy)

> "Your next 1,000 customers are already using your product. Your next 1,000 *expansions* are using it right now too."

> "One brain, every stage. No handoff between sales and CS, because there's nothing to hand off — it's the same engine, the same user object."

> "The category was built in fragments — Pocus from product signal, Gong from the call, Salesforce from the deal, Gainsight from the renewal. Everyone's expanding now, but the seams are where they meet, not where they started."

> "Account deactivation isn't churn. It's discovery at a different company. Power users leave employers, not the product."

## The feedback loop in one sentence

> Every outcome — won, lost, expanded, churned — labels the data the engine has already collected, so the engine gets sharper with every deal while a 50-person SDR team gets older.

---

# Phase C — Claude Design handoff

> A designer should be able to build the workflow diagram from this section alone in under 5 minutes of reading. Phase A and Phase B above are background.

**Argument in one sentence.** Tanay built Stage 1 of a five-stage customer graph; the slide visualizes the four-stage extension on a single engine with a compounding feedback loop, and the moat is composition + lineage, not impossibility.

## Five stage cards

Each card carries: title, one-line description, one Wispr-native signal or moment, one Sarah-Chen-at-NVIDIA fragment (≤15 words).

1. **Discovery (today).** Surfaces who to talk to from dictation behavior.
   *Signal:* time-to-first-dictation, weekly word count, Command Mode adoption, multi-language usage.
   *Sarah:* 23K words/month, Command Mode 89% of sessions, switched to Cantonese twice — VP Eng, NVIDIA.

2. **Engagement.** Absorbs every AE conversation as structured signal on the same user.
   *Signal:* meeting transcripts, AE emails, commitments and objections per stakeholder.
   *Sarah:* Discovery call surfaced SSO via Okta, Cantonese for Shanghai team, boss is Naveen.

3. **Account.** Rolls up from individual user to organization.
   *Signal:* org chart, identity resolution, dictation density by BU, procurement contact patterns.
   *Sarah:* 47 NVIDIA users across 4 BUs, 6 power users, procurement contact gone silent.

4. **Deal.** Tracks the apparatus of buying.
   *Signal:* contract status, security review, stakeholder silence, competitive mentions.
   *Sarah:* Data residency blocking, Naveen silent 8 days, Granola surfaced in InfoSec email.

5. **Customer.** Same engine watches post-sale and follows people across employers.
   *Signal:* ongoing dictation volume by BU, sponsor changes, expansion patterns, cross-account moves.
   *Sarah:* Gaming BU expansion; Naveen → OpenAI flagged as NVIDIA risk and OpenAI lead.

## Today / tomorrow framing line

> Today the engine surfaces who to call. Tomorrow the same engine follows them through procurement, contract, and expansion — without a handoff.

## Anchor claim (version-stamped)

> The category was built in fragments — Pocus from product signal, Gong from the call, Salesforce from the deal, Gainsight from the renewal. Everyone's expanding now, but the seams are where they meet, not where they started.

## Feedback loop in one sentence

> Every outcome — won, lost, expanded, churned — labels the data the engine has already collected, so the engine gets sharper with every deal while a 50-person SDR team gets older.

## Structural shape

- Horizontal 5-stage flow, left to right.
- Persistent engine layer above all five cards — the "one brain" visual.
- Subtle arc from Stage 5 (or an "outcomes" element) back to the engine layer — the feedback loop.
- Today vs. tomorrow gradient: Stage 1 fully saturated as "shipped," Stages 2-5 in a lighter treatment as "the extension." Continuous, not bar-separated.
- **Optional cross-account beat:** a subtle arrow from a Stage 5 figure (the sponsor leaving) to a Stage 1 entry point at a different account — the person-follows-the-product dynamic made visual. Drop if it adds clutter; the Sarah fragment carries the message regardless.

## Visual metaphors to preserve

- **One brain, every stage** — the engine layer is the constant; the cards beneath are surfaces.
- **One user object, five views** — the Sarah Chen thread across the cards reads as the same person seen with progressively more context, not five separate systems looking at five separate Sarahs.
- **Temporal continuity** — no handoff arrows, no separator bars between stages. Same engine, same user, time advancing.
- **The user object outlasts the employer** — power users leave companies, not the product. The engine that knew Naveen at NVIDIA knows him again at OpenAI. A churn event at one account becomes a discovery event at another.

## What NOT to include

- No Nexus branding or vocabulary (no "applicability gating," "admission engine," "event-sourced," "MEDDPICC," "embeddings," "coordinator synthesis").
- No competitor names on the slide. Pocus / Gong / Salesforce / Gainsight appear in the anchor claim only; everything else (Endgame, Common Room, Catalyst, ChurnZero, Granola) stays off.
- No engineering jargon (embeddings, schemas, pipelines, event streams).
- No "no one else can ever build this" claim. The honest framing is "Wispr starts from a position no one else does."
- No Nexus screenshots or UI references.

## Acceptance checks before sending to design

1. **Tanay vocabulary check** — every word should trace back to his post or generic sales-org language. Anything that smells like internal Nexus architecture wording is a flag.
2. **"Would Tanay forward this to his team" check** — reads like a candidate memo, not a vendor pitch.
3. **Sarah Chen check** — the five fragments alone should carry the full arc with no other context.

---

*Source material: Tanay LinkedIn post on the customer discovery engine; Nexus v2 architecture as of Phase 4 Day 4 closeout (2026-05-06) — see [BUILD-LOG.md](BUILD-LOG.md), [DECISIONS.md](DECISIONS.md), [PRODUCTIZATION-NOTES.md](PRODUCTIZATION-NOTES.md) for the architectural claims behind Phase A.*
