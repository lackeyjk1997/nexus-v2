# Phase 4 Day 5 A — Seed Content Schema Spec

> **⚠️ Framing superseded (2026-06-09 oversight decision).** This spec's *generic-healthcare-placeholder* framing (Cascade Health et al., competitor Microsoft DAX, EMR/PHI) is **stale**. Per the BUILD-LOG "Seed data realism" note (commit `2937155`), the seed subject is a **real, identifiable company the operator knows**: **Anthropic, selling Claude, to fictional high-growth software/AI-native scaleups (vertical `technology`), competitor OpenAI.** MedVista stays as the healthcare cross-vertical isolation outlier (no reskin). The authored content + the governing decisions live in **`packages/db/src/seed-data/phase-4-day-5/README.md`** — read that first; where it and this spec disagree, the README governs. This spec's **table shapes, admission math, and §8 question framing remain valid and useful**; only the company/vertical/competitor *content* is reframed.

**Purpose.** Author-time reference for the seed content Day 5 A's executor consumes. Captures: what tables need rows, what shapes, what realism discipline, what file paths. This is NOT the Day 5 A kickoff (that follows once content lands). This IS the working artifact you author against.

**Inheriting context.** Phase 4 Day 4 (`0d992b7`) closed the coordinator_synthesis enrichment arc: 6 helpers populate the 04-coordinator-synthesis prompt's previously-placeholder context blocks with real CRM context, prior-pattern lineage, at-risk comparators, related experiments, manager directives, and system intelligence. Day 4's live exercise empirically demonstrated that seeded-data renderings WILL be demo-quality once the upstream tables are populated (synthesis cited 3 deal names + 4 stakeholder names). **Today: production carries 0 rows in `manager_directives`, 0 in `system_intelligence`, 0 in `experiments`, and 0 prior `coordinator_patterns`.** Dashboard rendered against prod alone surfaces mostly empty fallbacks per §1.18. Day 5 A populates the substrate; Day 5 A.5 adds the v2-demo-lightweight company-knowledge layer; Day 5 B's dashboard reads against the enriched state.

**Path locked at orientation:** Day 5 split γ = **A → A.5 → B** (mirrors Day 1 A/A.5/B precedent). Seed strategy: 3-5 healthcare deals overlapping MedVista's vertical, generic-but-plausible companies. You author seed content out-of-session; executor consumes it.

---

## 1. Sequence and downstream consumers

Every seeded artifact has a downstream consumer. Names what your authored content feeds:

| What you seed | Where it lands | Consumed by | Demo-quality criterion |
|---|---|---|---|
| 3-5 healthcare deals + companies + contacts | `hubspot_cache` (deal/company/contact rows) + `deal_contact_roles` | `enrichAffectedDeals` (Day 4 helper); dashboard's per-pattern affected-deals render | Real names ground synthesis (Day 4 verified pattern) |
| `signal_detected` events with overlapping signal_types across 2+ deals | `deal_events` (append-only, `event_context` JSONB populated) | `coordinator_synthesis` handler groups by (vertical, signal_type); admits when `dealsAffected >= 2` per §1.16 | Produces 1-2 healthcare `coordinator_patterns` rows that the dashboard renders |
| 5-10 active manager_directives, healthcare-scoped | `manager_directives` (active rows with priority + scope JSONB) | `DealIntelligence.getActiveManagerDirectives` (Day 4 helper) → `${activeDirectivesBlock}` in synthesis prompt | Synthesis recommendations cite real directives, not "(no active directives)" fallback |
| 3-5 active system_intelligence entries, healthcare-vertical | `system_intelligence` (active rows with vertical + relevance_score) | `DealIntelligence.getSystemIntelligence` (Day 4 helper) → `${systemIntelligenceBlock}` | Synthesis grounded in real market/competitive insights |
| 2-3 active experiments, healthcare-vertical with applicability JSONB | `experiments` (lifecycle=`active` per §2.13.1 Decision 8(i)) | `DealIntelligence.getExperimentsForVertical` (Day 4 helper) → `${relatedExperimentsBlock}` | Synthesis surfaces real experiment lineage in recommendations |
| 3+ uncategorized observations sharing a signature | `observations` (signal_type IS NULL per §2.13.1 nullable invariant + sourceContext.category set) | `observation_cluster` handler (Day 3) clusters by Claude-generated signature → `category_candidates` admission surface (Day 3) | `category_candidates` surface renders 1+ qualifying cluster on Day 5 B dashboard |
| Per-deal transcripts (1-3 per new deal) | `transcripts` table + `analyzed_transcripts` (joined) | Pre-existing transcript pipeline (Phase 3) writes `signal_detected` events on ingest | OPTIONAL — if signal_detected events are seeded directly, transcripts are nice-to-have for traceability; if seeded as raw transcripts, executor runs pipeline to produce signals (live Claude spend; longer session) |
| Per-deal MEDDPICC scores (1 row per new deal) | `meddpicc_scores` | `enrichAffectedDeals` batch read → `${affectedDealsBlock}` | Per-deal MEDDPICC gaps cited in synthesis (Day 4 verified shape) |

**Strategic call on transcripts.** If you author transcripts directly, executor runs the existing transcript pipeline against them — this exercises the full Phase 3 pipeline against new seed data + produces signal_detected events naturally + spends live Claude budget (~$0.30-0.50 per transcript). If you author signal_detected events directly (skipping transcripts), the session is faster + cheaper + the synthesis substrate is still demo-quality, BUT the per-deal signal evidence quotes in synthesis would lack the natural-language-quote shape that the prompt grounds on. **Recommendation: seed at least 1 transcript per deal so signal_detected events carry real evidence quotes; can be one short transcript (~500 words) for cost containment.** Open question 8.1 captures the trade-off if cost matters.

---

## 2. Counts and admission floors

The math that drives seed counts (admission thresholds are LOCKED per `packages/shared/src/surfaces/registry.ts`):

### `intelligence_dashboard_patterns` surface (Day 5 B's main render)

```
minDealsAffected: 2
minAggregateArr: $500,000 (sum of affected deals' amount)
maxItems: 20
```

- **2+ deals must share a (vertical, signal_type) pair.** Aggregate deal amounts sum ≥ $500K.
- **Recommended count for demo punch: 2-3 patterns surface.** Math: 5 healthcare deals × 2 overlapping signal types = 2 patterns. 4 deals × 2 overlapping signal types = 2 patterns. Below 4 deals, only 1 pattern is reliable.
- **Reasoning anchor:** Day 4's live exercise used 3 deals × 1 signal_type → 1 pattern. A demo with 2 patterns shows the dashboard handles multiple-pattern rendering + ordering by score per §1.16.

### `category_candidates` surface

```
minMemberCount: 3
minConfidence: "medium" (or "high")
maxItems: 10
```

- **3+ uncategorized observations sharing a Claude-generated signature.** Day 3's `observation_cluster` handler runs the clustering Claude call per observation; same-shape observations produce same signature deterministically.
- **Recommended count: 4-6 observations producing 1-2 clusters.** Day 3's live exercise had 3 obs → 1 cluster. To clear floor + show the surface has discrimination (rejects below-floor candidates), seed 6 obs: 3 sharing one shape + 3 sharing another OR 3 sharing one shape + 3 singletons (sub-threshold).

### `manager_directives` (no admission floor — populates prompt block directly)

- **5-10 active rows, healthcare-scoped.** `DealIntelligence.getActiveManagerDirectives({vertical: "healthcare", limit: 10})` reads `WHERE is_active = true AND (scope->>'vertical' IS NULL OR scope->>'vertical' = 'healthcare')`. At least 3-5 must have `scope->>'vertical' = 'healthcare'` for the block to feel directive-driven rather than generic.

### `system_intelligence` (no admission floor — populates prompt block directly)

- **3-5 active rows, vertical=healthcare.** `DealIntelligence.getSystemIntelligence({vertical: "healthcare", limit: 5})` reads `WHERE status = 'active' AND (vertical IS NULL OR vertical = 'healthcare')` ordered by `relevance_score DESC NULLS LAST`. Mix relevance scores so ordering is meaningful (e.g., one at 0.95, two at 0.85, two at 0.70).

### `experiments` (no admission floor — populates prompt block directly)

- **2-3 active rows, vertical=healthcare, lifecycle='active' with non-empty applicability JSONB.** `DealIntelligence.getExperimentsForVertical({vertical: "healthcare", limit: 10})` reads `WHERE lifecycle IN ('active', 'graduated') AND (vertical IS NULL OR vertical = 'healthcare')`. The applicability JSONB must validate against `ApplicabilityRuleSchema` (Zod schema at `packages/shared/src/applicability/dsl.ts`).

---

## 3. Per-table schemas (column-by-column)

### 3.1 `hubspot_cache` — deal/company/contact rows

```typescript
{
  id: uuid,                              // executor generates
  objectType: "deal" | "company" | "contact",
  hubspotId: string,                     // text — make these plausible numeric strings (~12 digits) so they look HubSpot-shaped but don't collide with real portal IDs; OR use a `seed_` prefix convention to mark them as seed
  payload: jsonb,                        // RAW HubSpot v3 shape — see below per object type
  cachedAt: timestamp,                   // executor sets now()
  ttlExpiresAt: timestamp | null,        // null is fine (no expiry)
}
```

**Critical: `payload` is the RAW HubSpot v3 response shape.** Per the §2.16.1 decision 2 bug fix (Phase 4 Day 1 Session A.5), `buildEventContext` and `getDealState` both read `payload.properties.{dealstage, nexus_vertical, amount, ...}` + `payload.associations.companies.results[0].id`. Mapper translates to typed `Deal`/`Company`/`Contact` at adapter read-time.

**Deal payload shape** (one row per seeded deal):

```json
{
  "id": "seed_deal_001",
  "properties": {
    "dealname": "Cascade Health Systems EMR Phase 2",
    "dealstage": "3544580808",
    "amount": "1850000",
    "closedate": "2026-08-15",
    "createdate": "2026-04-01T12:00:00Z",
    "hs_object_id": "seed_deal_001",
    "hubspot_owner_id": "seed_user_sarah",
    "pipeline": "2215843570",
    "nexus_vertical": "healthcare",
    "nexus_product": "claude_enterprise",
    "nexus_primary_competitor": "Microsoft DAX",
    "nexus_lead_source": "outbound",
    "nexus_employee_count": "2400",
    "nexus_domain": "cascadehealth.example.com"
  },
  "associations": {
    "companies": {
      "results": [
        { "id": "seed_company_001", "type": "deal_to_company" }
      ]
    },
    "contacts": {
      "results": [
        { "id": "seed_contact_001", "type": "deal_to_contact" },
        { "id": "seed_contact_002", "type": "deal_to_contact" }
      ]
    }
  },
  "createdAt": "2026-04-01T12:00:00Z",
  "updatedAt": "2026-04-15T08:30:00Z"
}
```

**Notes on deal payload:**
- `dealstage` is a HubSpot stage ID (numeric string). Use values from `packages/shared/src/crm/hubspot/pipeline-ids.json` — the 9 stage IDs for Jeff's HubSpot pipeline `2215843570`. **Recommended stages for seed deals: `discovery`, `technical_validation`, `proposal`, `negotiation`** (the 4 stages `call_prep_brief.appliesWhenStageIn` admits; gives variety). Map: open the JSON file, paste in stage ID matching desired internal name.
- `amount` is a numeric string. Mix sizes: e.g., $850K, $1.85M, $2.4M (MedVista's existing), $3.2M, $620K. Aggregate ≥ $500K for the 2 patterns to clear.
- `nexus_vertical` MUST be `"healthcare"` for all new deals (overlap-with-MedVista strategy).
- `nexus_primary_competitor` — recommend mixing: 3 deals against "Microsoft DAX" (overlap with MedVista's arc + supports Day 4-verified `competitive_intel` pattern); 2 deals against another credible healthcare competitor (e.g., "Epic Systems", "Nuance DAX", "Suki AI") for cross-competitor variance.
- `closedate` — mix forward-dated dates 2-6 months out so deals are open and `getAtRiskComparableDeals` picks them up (filters `stage !== 'closed_won' && stage !== 'closed_lost'`).
- `createdate` — at least 3+ days old so the §1.18 "first 48h observation-only" rule doesn't shield them.
- `hubspot_owner_id` — can reference `seed_user_sarah` for AE attribution; Day 4 surfaced AE-name-resolution as a parked productization item (real `getUser` lookup is Phase 5+), so the owner ID just needs to be a stable string.

**Company payload shape:**

```json
{
  "id": "seed_company_001",
  "properties": {
    "name": "Cascade Health Systems",
    "domain": "cascadehealth.example.com",
    "industry": "Hospitals and Health Care",
    "numberofemployees": "2400",
    "hs_object_id": "seed_company_001"
  },
  "createdAt": "2026-03-15T00:00:00Z",
  "updatedAt": "2026-03-15T00:00:00Z"
}
```

**Contact payload shape:**

```json
{
  "id": "seed_contact_001",
  "properties": {
    "firstname": "David",
    "lastname": "Park",
    "email": "david.park@cascadehealth.example.com",
    "jobtitle": "Chief Medical Information Officer",
    "phone": "+15555551001",
    "hs_object_id": "seed_contact_001"
  },
  "associations": {
    "companies": {
      "results": [{ "id": "seed_company_001", "type": "contact_to_company" }]
    }
  },
  "createdAt": "2026-03-15T00:00:00Z",
  "updatedAt": "2026-03-15T00:00:00Z"
}
```

**Counts:** 1-3 contacts per deal; 1 of them flagged as `isPrimary=true` in `deal_contact_roles`.

### 3.2 `deal_contact_roles` — stakeholder roles

```typescript
{
  hubspotDealId: text,                   // e.g., "seed_deal_001"
  hubspotContactId: text,                // e.g., "seed_contact_001"
  role: ContactRole,                     // see 9-value canonical (see below)
  isPrimary: boolean,                    // exactly one per deal
}
```

**9-value ContactRole canonical** (`packages/shared/src/enums/contact-role.ts`):
`champion, economic_buyer, decision_maker, technical_evaluator, end_user, procurement, influencer, blocker, coach`

**Recommended per-deal mix:** 1 `economic_buyer` or `decision_maker` (primary) + 1 `champion` or `technical_evaluator` (secondary). Realistic healthcare org: CMO/CMIO (economic_buyer), IT director (technical_evaluator), nurse manager (end_user), procurement (procurement).

### 3.3 `signal_detected` events — `deal_events` rows

```typescript
{
  id: uuid,
  hubspotDealId: text,                   // matches a seeded deal's hubspotId
  type: "signal_detected",
  payload: jsonb,                        // see shape below
  eventContext: jsonb,                   // NOT NULL per §2.16.1 — populate via DealIntelligence.buildEventContext OR author manually matching the shape
  sourceKind: "service",                 // events authored by seed loader, not by a prompt or webhook
  sourceRef: text | null,                // e.g., "seed:phase-4-day-5:deal_001:signal_001" for traceability
  actorUserId: uuid | null,              // null is fine for seeded events
  createdAt: timestamp,                  // back-date to N days ago for realism (1-15 days; coordinator_synthesis reads 30-day window)
}
```

**Payload shape** (matches `01-detect-signals` tool output):

```json
{
  "signal_type": "competitive_intel",
  "severity": "high",
  "confidence": 0.87,
  "summary": "Buyer expressed concern about Microsoft DAX's 4-week implementation timeline vs our 8-week",
  "quotes": [
    "Honestly, the DAX folks said they could have us live in four weeks. That's tempting because our InfoSec review is going to take us at least six.",
    "What's your real implementation timeline? Not the optimistic one — the one with the InfoSec review priced in."
  ],
  "speaker": "David Park",
  "stakeholder_role": "decision_maker",
  "transcript_id": "seed_transcript_001"
}
```

**Event context shape** (§2.16.1 decision 2 — populated at event time, frozen):

```json
{
  "vertical": "healthcare",
  "deal_size_band": "1m-5m",
  "employee_count_band": "1k-5k",
  "stage_at_event": "technical_validation",
  "active_experiment_assignments": []
}
```

**Counts + signal-type overlap pattern.** Each seeded deal gets 3-6 `signal_detected` events. Across 5 deals:

| Deal | competitive_intel | deal_blocker | content_gap | win_pattern | TOTAL |
|---|---|---|---|---|---|
| Deal A (Cascade Health) | 2 | 1 | 0 | 0 | 3 |
| Deal B (Northstar Medical) | 2 | 1 | 1 | 0 | 4 |
| Deal C (BlueRidge Healthcare) | 1 | 2 | 0 | 1 | 4 |
| Deal D (Aspen Health Partners) | 1 | 2 | 0 | 0 | 3 |
| Deal E (Summit Medical Group) | 0 | 1 | 1 | 1 | 3 |
| **Sums** | **6** (4 deals) | **7** (5 deals) | **2** (2 deals) | **2** (2 deals) | 17 |

This produces 2 healthcare patterns (`competitive_intel` across 4 deals + `deal_blocker` across 5 deals) + 2 sub-threshold groups (`content_gap` × 2 deals at $X aggregate, `win_pattern` × 2 deals — both above the `minDealsAffected: 2` threshold but may fall below the `minAggregateArr: $500K` floor depending on which deals carry them). **Suggestion: distribute so the 2 main patterns clear with comfortable headroom + 1 sub-threshold group exists to demonstrate the §1.18 silence-as-feature gate (rejected at admission, not visible in dashboard).**

### 3.4 `manager_directives` — author-active manager guidance

```typescript
{
  id: uuid,
  authorId: uuid,                        // FK to teamMembers (use Marcus's team_member ID — seed user)
  directiveText: text,
  scope: jsonb,                          // e.g., {"vertical": "healthcare"} or {} for org-wide
  priority: "low" | "medium" | "high" | "urgent",
  category: text | null,                 // free-form, e.g., "competitive_response", "discovery_quality"
  isActive: true,
  createdAt: timestamp,                  // back-date 2-30 days
  updatedAt: timestamp,
}
```

**Counts: 5-10 active directives.** Mix scopes: ~5 scoped to `healthcare`, ~3 scoped to org-wide (`scope: {}`), ~2 scoped to specific stages or sizes.

**Example shape:**

```json
{
  "directiveText": "When Microsoft DAX surfaces in healthcare deals, surface the InfoSec/PHI compliance scorecard within 48 hours and lead with our 30-day SOC 2 Type II audit window.",
  "scope": { "vertical": "healthcare" },
  "priority": "high",
  "category": "competitive_response",
  "isActive": true
}
```

### 3.5 `system_intelligence` — market/competitive insights

```typescript
{
  id: uuid,
  vertical: Vertical | null,             // "healthcare" for the demo arc
  insightType: text,                     // free-form, e.g., "competitor_intelligence", "market_trend", "regulatory"
  title: text,
  insight: text,                         // 2-5 sentences
  supportingData: jsonb,                 // {} is fine, or {sources: ["..."]}
  confidence: decimal(4,3),              // 0.000-1.000
  relevanceScore: decimal(5,2),          // 0.00-100.00 (higher = more relevant; orders the prompt block)
  status: "active",
  hubspotCompanyId: text | null,         // null for org-wide; can reference seed_company_NNN if competitor-on-account-specific
  createdAt: timestamp,
  updatedAt: timestamp,
}
```

**Counts: 3-5 active healthcare rows.** Mix relevance scores so ordering is meaningful.

**Example shape:**

```json
{
  "vertical": "healthcare",
  "insightType": "competitor_intelligence",
  "title": "Microsoft DAX implementation timeline claims are aggressive",
  "insight": "DAX's marketed 4-week go-live timeline excludes InfoSec/PHI review windows that healthcare systems consistently require 6-8 weeks for. Three out of four healthcare deals we've lost to DAX in the last 6 months cited 'faster implementation' as a primary reason, but two of those reversed within 5 months and re-engaged after their DAX deployment stalled in InfoSec.",
  "supportingData": {},
  "confidence": "0.840",
  "relevanceScore": "92.50",
  "status": "active"
}
```

### 3.6 `experiments` — active healthcare-vertical with applicability

```typescript
{
  id: uuid,
  originatorId: uuid,                    // FK to teamMembers (Marcus for leadership-initiated, Sarah for AE-initiated per §1.6)
  title: text,
  hypothesis: text,
  description: text | null,
  category: "in_conversation" | "out_of_conversation" | "implicit_approach",
  lifecycle: "active",
  vertical: "healthcare" | null,
  applicability: jsonb,                  // MUST validate against ApplicabilityRuleSchema (see below)
  thresholds: jsonb,                     // {} for v2 demo (Phase 5+ adds attribution thresholds)
  createdAt: timestamp,
  updatedAt: timestamp,
}
```

**Applicability JSONB structure** (`packages/shared/src/applicability/dsl.ts`):

```json
{
  "description": "Healthcare deals in technical_validation or proposal stage where competitive_intel signals are present",
  "stages": ["technical_validation", "proposal"],
  "verticals": ["healthcare"],
  "minDaysSinceCreated": 2,
  "requires": "not_closed",
  "signalTypePresent": ["competitive_intel"]
}
```

All fields optional; undefined = "no gate on that dimension". Multiple set fields AND-compose.

**Counts: 2-3 active healthcare experiments.** Mix categories (1 `in_conversation`, 1 `out_of_conversation`, optionally 1 `implicit_approach`).

**Example shape:**

```json
{
  "title": "InfoSec-window framing",
  "hypothesis": "Healthcare deals with active competitive_intel signals where we frame our 6-8 week InfoSec window as 'comprehensive' rather than 'long' show 18% higher technical_validation → proposal conversion.",
  "description": "Reps trained on a script that recasts the InfoSec timeline as a quality signal vs. an obstacle.",
  "category": "in_conversation",
  "lifecycle": "active",
  "vertical": "healthcare",
  "applicability": {
    "description": "Healthcare deals in technical_validation or proposal with competitive_intel signals present",
    "stages": ["technical_validation", "proposal"],
    "verticals": ["healthcare"],
    "minDaysSinceCreated": 2,
    "requires": "not_closed",
    "signalTypePresent": ["competitive_intel"]
  },
  "thresholds": {}
}
```

### 3.7 `observations` — uncategorized observations for `category_candidates`

```typescript
{
  id: uuid,
  observerId: uuid,                      // FK to users (use Sarah's user ID — seed)
  rawInput: text,                        // the rep-typed observation text
  aiClassification: jsonb | null,        // null (these are pre-classification)
  signalType: null,                      // NULL per §2.13.1 nullable invariant — these are uncategorized
  severity: "medium",                    // default
  confidence: decimal | null,
  status: "pending_review",              // default
  sourceContext: jsonb,                  // {category: "rep_captured", ...}
  clusterId: null,                       // will populate after observation_cluster handler runs
  createdAt: timestamp,
  updatedAt: timestamp,
}
```

**Counts: 4-6 observations.** Aim for 1-2 clusters:
- **Cluster A (qualifying):** 3 observations describing the SAME underlying shape (e.g., all three describe pre-purchase anxiety about EMR integration timeline — Day 3's verified `integration_timeline_anxiety` signature).
- **Cluster B (sub-threshold OR qualifying):** 3 more observations describing a DIFFERENT shape (e.g., all three describe rep uncertainty about how to position competitive features against a specific competitor). If 3+, becomes a second cluster; if 2 or fewer, demonstrates the §1.18 silence-at-admission boundary.

**Example shape (single observation):**

```json
{
  "rawInput": "Third call with David Park from Cascade — they keep coming back to the question of how long the Epic integration will actually take. I've given them our standard 6-8 week timeline but I can tell they're comparing it to something they're hearing from DAX. Not sure if I should escalate this to solutions architecture or keep deflecting until the technical_validation gate.",
  "sourceContext": {
    "category": "rep_captured",
    "deal_id": "seed_deal_001",
    "channel": "post_call_note"
  }
}
```

### 3.8 OPTIONAL — `transcripts` per deal

If you author transcripts directly (recommended per §1 strategic call):

```typescript
{
  id: uuid,
  hubspotDealId: text,                   // matches a seeded deal
  title: text,                           // e.g., "Cascade Health — Technical validation call"
  transcriptText: text,                  // full transcript with speaker turns + transcription artifacts
  participants: jsonb,                   // [{"name": "Sarah Chen", "role": "AE"}, {"name": "David Park", "role": "CMIO"}]
  source: "simulated",                   // pgEnum: "fireflies" | "otter" | "manual" | "simulated"; use "simulated" for seed
  durationSeconds: integer | null,
  recordedAt: timestamp,                 // back-date matching the deal's stage history
  hubspotEngagementId: text | null,
  pipelineProcessed: false,              // executor flips to true after pipeline run
}
```

**Realism discipline (per BUILD-LOG operational notes "Seed data realism"):**
- **Transcription artifacts:** "iCIMS" → "I sims"; "MEDDPICC" → "med pick"; acronym mangling for healthcare terms (HIPAA → "HIPPA" occasionally, "EMR" → "E M R" with pauses).
- **Conversational artifacts:** `[crosstalk]`, half-finished sentences ("So I think we — well, what I mean is —"), filler words ("um", "you know", "right?"), interruptions.
- **Speaker overlap:** Two `[crosstalk]` instances per 1000-word transcript is realistic.
- **Length:** 800-1500 words is the sweet spot for cost containment + demo realism. Day 4's MedVista discovery fixture was 1448 words and proved sufficient.
- **Domain-specific terminology:** Real healthcare-IT vocabulary (HL7, FHIR, Epic, Cerner, Meditech, Allscripts, EMR, EHR, CDS, CPOE, BPA, RPA in clinical context, HIPAA, BAA, PHI, SOC 2, HITRUST). Mix some transcription mangling.

### 3.9 OPTIONAL — `meddpicc_scores` per deal

If you author MEDDPICC scores directly (otherwise executor runs Phase 3 pipeline which produces them):

```typescript
{
  hubspotDealId: text,                   // matches a seeded deal
  metricsScore: 0-10,
  economicBuyerScore: 0-10,
  decisionCriteriaScore: 0-10,
  decisionProcessScore: 0-10,
  identifyPainScore: 0-10,
  championScore: 0-10,
  competitionScore: 0-10,
  paperProcessScore: 0-10,
  overallScore: 0-10,                    // rounded mean of present non-null dims
  evidence: jsonb,                       // {[dimension]: "evidence quote"}
}
```

**Recommended pattern:** Healthcare deals at `technical_validation` stage typically have stronger metrics/identify_pain but weaker decision_process/paper_process. Mix scores 4-8 across deals so the dashboard's "MEDDPICC gaps" section in synthesis shows real per-deal gaps.

---

## 4. Realism discipline (cross-cutting)

Captures BUILD-LOG operational notes "Seed data realism — input distribution discipline":

1. **Names plausibly fictional, never real.** No "Cleveland Clinic" or "Mayo Clinic". Generic-but-credible: "Cascade Health Systems", "Northstar Medical Group", "BlueRidge Healthcare", "Aspen Health Partners", "Summit Medical Group".
2. **Email domains** end in `.example.com` (RFC 2606 reserved domain — never resolves) or `nexus-demo.com` (matches the seed user convention).
3. **No real PII.** Generic person names (David Park, Maria Hernandez, James Liu, Priya Patel — first names common, last names generic). No phone numbers that match real area codes for healthcare orgs.
4. **Stable, traceable IDs.** Use `seed_` prefix on all hubspotId strings so the demo-reset endpoint (Phase 6) can wipe seed data via prefix match. Numeric-only IDs collide with HubSpot's space; the `seed_` prefix is the explicit-discriminator pattern.
5. **No `closed_won` / `closed_lost` seeded deals.** `intelligence_dashboard_patterns` admission filters them per `getActivePatterns.status IN ('detected', 'synthesized')`. Closed-stage seed deals corrupt the at-risk comparable lookup (`getAtRiskComparableDeals` filters `stage !== 'closed_won' && stage !== 'closed_lost'`).
6. **Cross-channel quality variance.** If you author seeded emails: emails are cleaner than transcripts (edited before sending). Transcripts carry the conversational artifacts; emails carry structured arguments. Signal-extraction logic respects the asymmetry naturally — seed both with appropriate quality differential.
7. **Realistic backdating.** `signal_detected.created_at` should span 1-15 days back from now so coordinator_synthesis's 30-day window covers them; `manager_directives.created_at` 2-30 days back so they feel "lived in"; `system_intelligence.created_at` similar.
8. **Microsoft DAX as the recurring competitor anchor.** MedVista already cites DAX in `competitive_intel` signals. Continuing DAX as the primary competitor across 3-4 of the 5 new deals strengthens the cross-deal `competitive_intel` pattern's coherence. Vary the angle: timeline pressure (DAX claims faster); regulatory pressure (DAX HIPAA story); price (DAX undercuts). Mix 1-2 deals with a different competitor (Epic, Suki, Nuance) for variance.

---

## 5. File layout (committed to repo)

Per §2.18.1's reservation of `packages/db/src/seed-data/` for Nexus-native seed content:

```
packages/db/src/seed-data/phase-4-day-5/
├── README.md                            # Your author notes: choices made, rationale, refresh discipline
├── companies.json                       # Array of hubspot_cache company rows
├── deals.json                           # Array of hubspot_cache deal rows
├── contacts.json                        # Array of hubspot_cache contact rows + their deal_contact_roles
├── manager-directives.json              # Array of manager_directives rows
├── system-intelligence.json             # Array of system_intelligence rows
├── experiments.json                     # Array of experiments rows
├── observations.json                    # Array of uncategorized observations
├── signal-events.json                   # OPTIONAL — array of signal_detected events (skip if transcripts are seeded)
├── meddpicc-scores.json                 # OPTIONAL — array of meddpicc_scores rows (skip if pipeline runs)
└── transcripts/
    ├── seed_deal_001-call-1-discovery.md      # Markdown with front-matter
    ├── seed_deal_001-call-2-tech-val.md
    ├── seed_deal_002-call-1-discovery.md
    └── ... (1-3 per deal)
```

**Markdown transcript front-matter shape:**

```yaml
---
deal_hubspot_id: seed_deal_001
title: Cascade Health Systems — Technical validation call (Week 6)
participants:
  - { name: Sarah Chen, role: AE, email: sarah.chen@nexus-demo.com }
  - { name: David Park, role: CMIO, email: david.park@cascadehealth.example.com }
  - { name: Janet Wu, role: IT Director, email: janet.wu@cascadehealth.example.com }
source: simulated
duration_seconds: 2700
recorded_at: 2026-04-22T14:00:00Z
---

[Transcript body — speaker-tagged turns with realistic artifacts. Example:]

Sarah Chen: So thanks for making the time today, David. I know it's been a busy week with the new EMR rollout —

David Park: Yeah, I — sorry, before we get started, can I just — Janet, are you on?

Janet Wu: I'm here, hi Sarah.

Sarah Chen: Great. So I wanted to walk through where we are on the technical validation — I have the InfoSec...

[crosstalk]

David Park: — actually let me jump in there because that's what I wanted to ask about. We had the DAX folks in last week, and they're telling us they can have us live in four weeks. Which honestly, that —

[...]
```

---

## 6. Reference templates

### 6.1 Sample `manager_directive`

```json
{
  "id": "00000000-0000-0000-0000-000000000001",
  "authorId": "<Marcus's team_member UUID — look up at author time via SELECT FROM users WHERE email='marcus.rodriguez@nexus-demo.com'>",
  "directiveText": "When Microsoft DAX surfaces in healthcare deals, surface the InfoSec/PHI compliance scorecard within 48 hours and lead with our 30-day SOC 2 Type II audit window.",
  "scope": { "vertical": "healthcare" },
  "priority": "high",
  "category": "competitive_response",
  "isActive": true,
  "createdAt": "2026-04-12T09:00:00Z",
  "updatedAt": "2026-04-12T09:00:00Z"
}
```

### 6.2 Sample `system_intelligence`

```json
{
  "id": "00000000-0000-0000-0000-000000000010",
  "vertical": "healthcare",
  "insightType": "competitor_intelligence",
  "title": "Microsoft DAX 4-week implementation claim excludes InfoSec window",
  "insight": "DAX's marketed 4-week go-live timeline routinely excludes InfoSec/PHI review windows that healthcare systems require 6-8 weeks for. 3 of 4 healthcare deals lost to DAX in the last 6 months cited 'faster implementation' as primary reason — 2 of those reversed within 5 months when their DAX deployment stalled in InfoSec review.",
  "supportingData": {},
  "confidence": "0.840",
  "relevanceScore": "92.50",
  "status": "active",
  "hubspotCompanyId": null,
  "createdAt": "2026-03-28T10:00:00Z",
  "updatedAt": "2026-03-28T10:00:00Z"
}
```

### 6.3 Sample `experiment` with applicability JSONB

```json
{
  "id": "00000000-0000-0000-0000-000000000020",
  "originatorId": "<Marcus's team_member UUID>",
  "title": "InfoSec-window framing in technical_validation",
  "hypothesis": "Healthcare deals in technical_validation or proposal stage with competitive_intel signals present, where reps recast the 6-8 week InfoSec window as 'comprehensive review' rather than 'long timeline', show 18% higher technical_validation → proposal conversion.",
  "description": "Reps trained on a single-slide repositioning script. Soft mode per §1.5; rep can choose whether to use it; usage attributed at transcript processing time.",
  "category": "in_conversation",
  "lifecycle": "active",
  "vertical": "healthcare",
  "applicability": {
    "description": "Healthcare deals in technical_validation or proposal with active competitive_intel signals, open for 2+ days",
    "stages": ["technical_validation", "proposal"],
    "verticals": ["healthcare"],
    "minDaysSinceCreated": 2,
    "requires": "not_closed",
    "signalTypePresent": ["competitive_intel"]
  },
  "thresholds": {},
  "createdAt": "2026-04-08T11:00:00Z",
  "updatedAt": "2026-04-08T11:00:00Z"
}
```

### 6.4 Sample `signal_detected` deal_event

```json
{
  "id": "00000000-0000-0000-0000-000000000100",
  "hubspotDealId": "seed_deal_001",
  "type": "signal_detected",
  "payload": {
    "signal_type": "competitive_intel",
    "severity": "high",
    "confidence": 0.87,
    "summary": "David Park (CMIO) explicitly compared our 6-8 week InfoSec timeline against Microsoft DAX's claimed 4-week implementation",
    "quotes": [
      "Honestly, the DAX folks said they could have us live in four weeks. That's tempting because our InfoSec review is going to take us at least six.",
      "What's your real implementation timeline? Not the optimistic one — the one with the InfoSec review priced in."
    ],
    "speaker": "David Park",
    "stakeholder_role": "decision_maker",
    "transcript_id": "<transcript UUID if seeded>"
  },
  "eventContext": {
    "vertical": "healthcare",
    "deal_size_band": "1m-5m",
    "employee_count_band": "1k-5k",
    "stage_at_event": "technical_validation",
    "active_experiment_assignments": []
  },
  "sourceKind": "service",
  "sourceRef": "seed:phase-4-day-5:deal_001:signal_001",
  "actorUserId": null,
  "createdAt": "2026-04-22T15:30:00Z"
}
```

### 6.5 Sample observation (uncategorized for category_candidates substrate)

```json
{
  "id": "00000000-0000-0000-0000-000000000200",
  "observerId": "<Sarah's user UUID — SELECT FROM users WHERE email='sarah.chen@nexus-demo.com'>",
  "rawInput": "Third call with David Park from Cascade — they keep coming back to the question of how long the Epic integration will actually take. I've given them our standard 6-8 week timeline but I can tell they're comparing it to something they're hearing from DAX. Not sure if I should escalate this to solutions architecture or keep deflecting until the technical_validation gate.",
  "aiClassification": null,
  "signalType": null,
  "severity": "medium",
  "confidence": null,
  "status": "pending_review",
  "sourceContext": {
    "category": "rep_captured",
    "deal_id": "seed_deal_001",
    "channel": "post_call_note"
  },
  "clusterId": null,
  "createdAt": "2026-04-23T16:00:00Z",
  "updatedAt": "2026-04-23T16:00:00Z"
}
```

---

## 7. What NOT to author

- ❌ **closed_won / closed_lost deals.** Pattern admission excludes them; AT-risk comparable lookup excludes them; seeding closed deals as the substrate is incorrect.
- ❌ **MedVista variants.** MedVista is the canonical anchor at `321972856545`; new deals are NEW healthcare companies. Don't duplicate MedVista.
- ❌ **Real PII.** Generic names, `.example.com` domains, no real phone numbers from real area codes.
- ❌ **Direct `coordinator_patterns` rows.** Patterns are PRODUCED by the synthesis handler from upstream `signal_detected` events. Seeding patterns directly bypasses the substrate the demo is supposed to exercise.
- ❌ **`pipeline_processed: true` on seeded transcripts UNLESS you also seed the downstream signal_detected events + analyzed_transcripts.** Executor's preflight verifies the substrate is self-consistent.

---

## 8. Open questions / your call during authoring

These are the calls that benefit from your judgment as you author. Surface decisions in `packages/db/src/seed-data/phase-4-day-5/README.md` for the Day 5 A executor to read.

### 8.1 Transcripts: seed directly OR have executor run pipeline?

- **(a) Seed transcripts directly + executor runs Phase 3 pipeline against them.** Pros: exercises full pipeline end-to-end on seed data; produces signal_detected events naturally with grounded quotes; tests substrate self-consistency. Cons: live Claude spend ~$0.30-0.50 per transcript × 5-8 transcripts = ~$2-4 in Day 5 A; longer session (~5-15 min per pipeline run); pipeline non-determinism may produce signal events slightly different than your authored intent.
- **(b) Seed signal_detected events directly + transcripts as optional traceability.** Pros: faster session, lower cost, your authored signal events surface verbatim in synthesis. Cons: signal quotes are author-written, not pipeline-extracted; transcripts in repo become reference-only.
- **(c) Hybrid: seed 2-3 transcripts that executor runs (validates pipeline on seed data); seed the rest as signal events directly.** Pros: balances coverage + cost. Cons: subtle inconsistency in signal-quote provenance across deals.

**Default if you don't specify:** Day 5 A kickoff specifies (b) — fastest path to a populated dashboard; the §2.13 unified Claude wrapper + Phase 3 pipeline are independently verified.

### 8.2 Microsoft DAX angle consistency

The recurring competitor anchor is a load-bearing demo element. Which angle do you want to drive across the 3-4 DAX-competitor deals?

- **(a) Timeline pressure** ("DAX claims 4 weeks; we're 6-8 weeks") — Day 4 verified this pattern; most demo-ready.
- **(b) Regulatory/security pressure** ("DAX HIPAA/SOC 2 story doesn't match enterprise reality") — surfaces InfoSec story.
- **(c) Price pressure** ("DAX undercuts our pricing by N%") — surfaces commercial pattern.
- **(d) Mix** — different DAX angle per deal so the cross-deal pattern reads as "DAX is winning on multiple flanks simultaneously" rather than "DAX has one consistent angle".

**Default if you don't specify:** (a) timeline pressure as the primary angle for 3 deals, with 1 deal carrying angle (b) regulatory for cross-angle variance.

### 8.3 Cross-vertical isolation demonstration

Day 5 A's strategy is healthcare overlap — 5 new healthcare deals + 2 patterns. The dashboard surfaces those 2 patterns. To ALSO demonstrate that the system correctly ISOLATES cross-vertical patterns (i.e., a `competitive_intel` signal on a healthcare deal doesn't pattern-link to a `competitive_intel` signal on a fintech deal), one option is to seed 1 deal in a different vertical (e.g., `financial_services`) with a single `competitive_intel` signal that DOESN'T cluster with the healthcare ones (because vertical is the grouping key).

- **(a) Yes, seed 1 cross-vertical deal** to demonstrate the isolation gate on the dashboard.
- **(b) No, keep Day 5 A to healthcare only** — cross-vertical isolation is structurally enforced by the coordinator_synthesis grouping logic; not seeing it in the dashboard is fine because the system isn't producing a wrong pattern.

**Default if you don't specify:** (b) — silence-as-feature per §1.18; the system correctly producing no cross-vertical pattern is a demo positive, not a gap.

### 8.4 Company-knowledge file scope (Day 5 A.5, not Day 5 A — but worth previewing)

Day 5 A.5 lands the v2-demo-lightweight company-knowledge file per PRODUCTIZATION-NOTES.md "Customer company-knowledge layer (Stage 2)". The file feeds `${companyKnowledgeBlock}` into prompts. **Questions for Day 5 A.5's author phase (you can park here for now; they don't gate Day 5 A):**

- Which seed company's perspective does the file reflect — Nexus-the-vendor's, or a specific seeded healthcare customer (e.g., Cascade Health)?
- Per BUILD-LOG seed-data realism note, the file should be authored as if for a real identifiable company (e.g., Paradox in conversational AI for TA) for ground-truth detectability. Does the same logic apply to the v2 demo's seeded company arc, or does the v2-demo treat this as a Nexus-side-customer-knowledge file rather than a per-deal-customer file?

These are PRODUCTIZATION-NOTES Stage 2 questions; v2 demo's lightweight pattern can stub them simply. Park for Day 5 A.5 kickoff drafting.

### 8.5 Observation count + sub-threshold demo

`category_candidates` surface requires `minMemberCount: 3` + `minConfidence: "medium"`. Recommended seed: 4-6 observations producing 1-2 clusters. Two paths:

- **(a) All observations cluster into one signature (3-6 obs, 1 cluster).** Simplest; surface renders 1 candidate.
- **(b) Mixed shapes: 3 obs share signature A + 3 obs share signature B = 2 clusters.** Surface renders 2 candidates; ordering by score per §1.16 visible.
- **(c) 3 obs share signature A + 3 singleton obs = 1 cluster + 3 sub-threshold groups.** Surface renders 1 candidate; sub-threshold groups demonstrate the §1.18 silence-at-admission boundary (visible only in `applicability_rejections` diagnostic log, not in dashboard).

**Default if you don't specify:** (b) — 6 observations, 2 clusters, surface renders 2 ordered candidates.

---

## 9. After authoring — handoff to Day 5 A kickoff

Once you've authored the content + committed it to `packages/db/src/seed-data/phase-4-day-5/`:

1. **Commit** with message `feat(seed-data): Phase 4 Day 5 A seed content` or similar.
2. **Notify drafter** with the actual counts (e.g., "5 deals + 7 contacts + 4 companies + 8 manager_directives + 4 system_intelligence + 3 experiments + 6 observations + 8 transcripts").
3. **Drafter authors Day 5 A kickoff** that references the actual files + counts + Preflight 0 gate verifying the seed-data files exist at the canonical paths.
4. **Day 5 A executor session runs:** loader script ingests the JSON + transcripts; verifies admission floors clear; if 8.1(a) chosen, runs Phase 3 pipeline per seeded transcript; produces `coordinator_patterns` rows; verifies via test:coordinator-synthesis-medvista-multi or new `test:coordinator-synthesis-seeded` gate; commits + deploys.

---

**Maintenance.** This file is one-time scope for Day 5 A's seeding event. Refresh discipline: if Phase 6 demo-reset endpoint changes the seed data, this doc is the authoring reference. Edits land alongside content edits to `packages/db/src/seed-data/phase-4-day-5/`.

**Anchored decisions cited above:** §1.16 (admission thresholds), §1.18 (silence-as-feature), §2.13.1 (signal_type nullable invariant + reactive max_tokens bump + ContactRole 9-value), §2.16.1 (event_context jsonb, prompt_call_log, transcript_embeddings preservation), §2.18 (CrmAdapter), §2.18.1 (HubSpot config path convention; `packages/shared/src/crm/hubspot/pipeline-ids.json`), §2.21 (applicability JSONB DSL), §2.26 (surfaces registry); Guardrails 22, 32, 41; PRODUCTIZATION-NOTES.md "Customer company-knowledge layer (Stage 2)" + "Seed data realism" cross-reference + Stage 3 SalesforceAdapter readiness.
