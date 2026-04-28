# Nexus — Productization Notes

## Purpose
Living document capturing the thinking about how Nexus moves from demo → POC → paying customer → enterprise. Not build scope. Updated as product-level ideas surface during the build. Read alongside DECISIONS.md and BUILD-LOG.md when thinking about future-state questions.

## Maintenance
Append new sections as ideas emerge. Move items into DECISIONS.md (as amendments) if and when they become locked build decisions. Items here are hypotheses and design thinking, not commitments.

## Commercial arc — the stages

### Stage 1: Demo (current)
Single org, HubSpot-native, seeded data, three-act narrative. Proves the three pillars work. Out of scope: multi-tenancy, role permissions, tour, Salesforce, historical ingestion, baseline dashboards, enterprise compliance.

### Stage 2: First paying customer (mid-market, HubSpot-native)
Estimated 2-3 months post-demo. Adds: real auth hardening beyond demo, second-org support (not full multi-tenancy), basic admin tooling, production monitoring, customer-facing billing.

### Stage 3: First enterprise POC (Salesforce-native)
Estimated 3-6 months after Stage 2. Adds: SalesforceAdapter, historical ingestion v1, baseline + attribution dashboards, SSO, data processing agreements.

### Stage 4: Enterprise-GA
Estimated 6-12 months after Stage 3. Adds: full multi-tenancy, SOC 2 Type II, pricing/billing systems, admin tooling, on-call rotation, regional data residency.

## Key productization gaps between v2 demo and commercial readiness

### Integration surface
v2 has CrmAdapter abstraction — a real architectural win. Productization extends the same adapter pattern to:
- SalesforceAdapter (80% of enterprise sales orgs run Salesforce; this is the first enterprise blocker)
- ConversationPlatformAdapter (Gong, Chorus, Fireflies, Otter, Fathom, Gemini, Fathom, Zoom IQ, internal tools — each with different transcript formats, speaker-ID quality, auth models)
- EmailProviderAdapter (Gmail API, Microsoft Graph, or via CRM engagement log)
- Auth: SSO via SAML/Okta/Azure AD (enterprise won't use per-user password login)

The adapter pattern means these are parallel implementations of existing interfaces, not architectural rewrites. But each is real work — SalesforceAdapter alone is 3-6 weeks for a production-grade implementation with SOQL, governor limits, OAuth, record types, profile-based field access.

**Stage 3 SalesforceAdapter — `/pipeline/:dealId` URL transition task.** v2 uses HubSpot numeric IDs directly in deal detail URLs (per foundation review 2026-04-22 R11). This was the right call for v2 — a HubSpot-only build gets no payoff from inserting a Nexus UUID indirection layer. When SalesforceAdapter lands in Stage 3, the transition is: either (a) add a thin `deal_identity` table mapping a Nexus UUID ↔ `{crm: 'hubspot'|'salesforce', crm_id: text}` and route every page/server-action via Nexus UUID, or (b) keep the CRM ID in URLs and branch per adapter at the route layer. Option (a) is the cleaner multi-adapter shape but touches every route handler, adapter call site, and cache key; option (b) keeps v2's code unchanged but complicates the adapter-factory boundary. Either path is a known cost budgeted into the SalesforceAdapter scope; do not slip it into v2 demo scope.

### HubSpot Smart Properties + Data Agent integration (Stage 2)

HubSpot's Smart Properties feature lets customers configure AI-populated CRM fields backed by HubSpot's Breeze AI. Every HubSpot customer will have a different set of configured Smart Properties; they auto-fill on schedule (daily/weekly/monthly or on record creation), not real-time; they consume HubSpot Credits as part of HubSpot's billing relationship with the customer (Nexus does not trigger fills).

v2 reads HubSpot custom fields by explicit name in `getDealState`, `buildEventContext`, and Claude prompt context blocks. Stage 2 productization needs a HubSpot-specific module **above** `CrmAdapter` (not inside it) that: (a) discovers customer-configured Smart Properties via the HubSpot Properties API; (b) reads their populated values from `hubspot_cache.payload.properties`; (c) feeds them into Nexus as ambient context for Claude prompts and applicability gating. `CrmAdapter`'s abstraction stays clean for data-layer operations; HubSpot-specific AI-layer integration lives in a separate module so the abstraction doesn't carry weight it can't bear.

`SalesforceAdapter` at Stage 3 will need its own equivalent module (Agentforce / Einstein / etc. integration) — different underlying concepts, different shape. Decision deferred to Stage 3 kickoff with actual Salesforce knowledge rather than v2-stage speculation.

**Schedule-lag implication.** Smart Properties auto-fill on daily/weekly/monthly cadence, not real-time. Surfaces that need real-time fact extraction should continue using Nexus's own Claude calls against transcripts, not Smart Property reads. The two surfaces are complementary: Smart Properties carry slow-moving CRM-managed facts; Nexus's pipeline carries fresh-from-the-call signals.

### Historical analysis — baseline + priming
This is likely the highest-leverage commercial wedge. Two sub-problems, different architectures:

**A. Baseline establishment.** Pre-Nexus numbers that justify the procurement decision: win rate by segment, average sales cycle length, stage-to-stage conversion, MEDDPICC coverage on won vs. lost, email engagement rates. Pure analytics layer on the customer's existing CRM + conversation data. Produces the "before" number in before/after ROI.

**B. Priming the intelligence.** One-time historical ingestion run. Pulls N months of historical transcripts + emails + activities, runs them through v2's transcript pipeline, writes deal_events + coordinator_patterns as if historical events were live. Day one of the POC, every active deal benefits from retroactive intelligence. Without this, POCs stall for weeks waiting for enough live data to produce insights — lethal for time-bounded enterprise evaluations.

Critical architecture note: v2's deal_events.created_at needs to accept backdated timestamps for historical events. If v2 defaults to now(), the historical timeline is corrupted. Small DECISIONS.md amendment when historical ingestion is actually built — not needed for demo.

The transcript pipeline itself doesn't change for historical ingestion. Idempotency at (transcript_id, signal_hash) means re-runs are safe. What's new is orchestration: staging area (S3 or equivalent), resumable chunked ingest, cost throttling on Claude spend, conversation-to-deal association pipeline with human-in-the-loop for ambiguous matches. Estimated 2-3 months for production-grade.

### The CRM/conversation disconnect
Conversations live in Gong/Chorus/Fireflies; CRM logs emails (incompletely); the two systems rarely marry cleanly. Productization needs:
- Conversation → deal association (fuzzy matching on participant identity against CRM contacts, then contacts against deals, with human-in-the-loop for ambiguous matches)
- Email → deal association (domain matching, subject-thread matching, prior-reply chain analysis for unlogged inbound)
- Temporal ordering (different sources, different timestamp formats, different timezones)
- Dedup across sources (one call event may appear in Gong, forwarded transcript email, and CRM engagement log)
- Scale (500-rep org × 3 years = 100K+ calls, millions of emails — can't run in primary Supabase)

### Dashboards — current state vs. baseline
The commercial artifact that closes enterprise. Three layers:
- Baseline snapshot (pre-Nexus numbers)
- Live current-state (POC-period numbers)
- Attribution to Nexus behaviors (which surfaces were seen, dismissed, acted on; statistical correlation with outcomes)

Third layer is a real data science problem. v2's deal_events + surface_dismissals + surface_feedback + coordinator_patterns tables are the correct primitives. What's missing is the reporting layer that reads them and produces the three-layer dashboard. Post-demo work.

### Multi-tenancy
DECISIONS.md 1.8 explicitly scopes v2 single-org. Productization requires tenant_id discriminator on every Nexus-owned table, tenant-scoped RLS policies, per-tenant Claude API key management, tenant provisioning flows. Mechanical migration, not architectural rewrite — schema shape is preserved. Estimated weeks, not months. Best deferred until there's a second real customer, because designing multi-tenancy in the abstract goes subtly wrong.

### Coaching surface (for the buyer, not the AE)
Nexus is positioned as an AE orchestration tool. The enterprise buyer is probably the VP of Sales, Sales Enablement lead, or RevOps director — not the AE. Their value prop is "show me how Nexus is coaching my team's behavior," not "help Sarah prep her call." A coaching-facing dashboard (patterns across reps, skill gaps by vertical, experiment results, MEDDPICC discipline by rep) is where enterprise ROI actually gets proven. Doesn't exist in v2. Probably Stage 3 or Stage 4 work.

### Audit trail and explainability
Enterprise legal + sales ops: "When Nexus told the rep to push close date 14 days, what was the reasoning and can I see the decision log?" DECISIONS.md 2.26 already requires visible scores and reasoning — good starting point. Enterprise-grade adds: exportable audit logs, per-insight deep links, per-rep coaching reports built from Nexus's own observations.

**Audit-trail durability under pool saturation — Stage 4 SOC 2 surface.** v2's `prompt_call_log` (DECISIONS.md §2.16.1 decision 3) is the audit-trail substrate that answers the "every AI decision that touched this customer's deals" compliance question. The Claude wrapper writes one row per call as a best-effort side effect — when the postgres pool is saturated, the audit row write fails silently while the user-facing Claude call succeeds. Phase 4 Day 1 Session B observed this live: the wrapper emitted `claude_call_log_write_failed` to stderr mid-EMAXCONN; the Claude call itself completed and returned tool output normally. For v2 demo this is acceptable (audit loss is observable on stderr; user operation unaffected). For Stage 4 SOC 2 Type II, it is not — auditors require guaranteed-delivery semantics for the audit-trail row, not best-effort. Productization shapes to evaluate: (a) durable write-ahead log — Claude wrapper writes the audit row to a local append-only file first, with a background drainer flushing to `prompt_call_log`; (b) retry-with-backoff on the DB write itself before giving up; (c) backpressure into the wrapper — when the audit-write queue exceeds a threshold, the wrapper deliberately fails the Claude call rather than succeeding with silent audit loss; (d) some combination. The architectural choice has SLA implications (a deliberate-fail-on-audit-loss model is auditor-friendly but degrades user experience under load) so it is worth deciding alongside the SOC 2 evidence-gathering work, not earlier. Tracking parked from v2 build to Stage 4 productization.

### Write-back configuration
Does writing MEDDPICC scores into Salesforce custom fields feel helpful or intrusive? Does drafting emails into Salesforce's draft queue feel like magic or pollution? Enterprise customers have strong opinions. Needs per-tenant configuration knobs controlling what Nexus writes back to the system of record and where.

### Compliance and security
SOC 2 Type II is 6+ months regardless of what's built. Architecture doesn't help or hurt — the work is the work. Subprocessor disclosures, data processing agreements, vendor security questionnaires, pen testing, GDPR. Start accumulating evidence (access logs, incident response docs, data flow diagrams) early so when a POC customer asks for SOC 2, you've been preparing for months.

### Pricing model
Per-seat? Per-deal? Per-transcript? Usage-based on Claude spend + margin? Shapes the product roadmap. Per-seat pushes "every rep gets Nexus"; usage-based pushes "concentrate intelligence where deal size justifies it." Worth an explicit decision before the first paying customer conversation.

## What v2 does well for productization
Worth naming — these are architectural wins that make future work feasible rather than a rewrite:
- CrmAdapter pattern (clean integration boundary)
- Event-sourced deal_events (foundation for historical ingestion without pipeline changes)
- Append-only event stream with service-role writes (audit trail primitive)
- Applicability gating as structured JSONB (scales to enterprise multi-rep without schema change)
- Surfaces registry + dismissal + feedback tables (audit + explainability primitives)
- Prompts-as-files + unified Claude wrapper (per-tenant model routing and billing isolation is a one-env-var change)
- Job infrastructure (historical ingestion is a new job_type, not a new orchestration layer)
- Single-source enums enforced at DB + tool-use schema (v1's signal-type drift structurally impossible)

## What v2 would NEED to rework for productization
Honest list:
- Multi-tenancy (tenant_id column + RLS rewrite across 36 tables; mechanical, weeks)
- Historical ingestion plane (new orchestration, staging area, chunked resumable processing; months)
- Reporting/attribution layer (reads existing primitives, new data pipeline; months)
- SalesforceAdapter (implement existing interface against a harder API; weeks)
- SSO + enterprise auth (replace magic-link with SAML/Okta flows; weeks)

Nothing above is an architectural rewrite. Each is additive work against v2's existing abstractions.

## Corpus Intelligence — the second product

Beyond operational rep tooling, Nexus's conversation/email corpus + structured analysis pipeline enables a second product category: corpus intelligence for product, marketing, enablement, and revenue leadership. Positioning implication worth naming: "AI call prep for reps" is a crowded category (Gong IQ, Salesloft Rhythm, Outreach AI). "Conversation intelligence across sales, product, and enablement with Claude-grade analysis" is not.

### Three analytical surfaces

**Narrative and messaging evolution.** How sales story shifts across deal segments (vertical × employee_count × deal_size_band), how messaging evolves over time, which linguistic clusters correlate with closed-won vs closed-lost. Enables questions like "how do reps describe our security posture in healthcare deals over $1M vs under $500K" and "how did our positioning on integration complexity evolve Q3 vs Q4."

Implementation pattern: embed every transcript segment (speaker-turn level) into pgvector. Tag each with deal metadata. Semantic clustering + outcome correlation. 2-3 months production-grade; 2-3 weeks demo-grade with off-the-shelf embeddings.

**Ground-truth vs documentation alignment.** What reps say the product does vs what Confluence/Notion says the product does vs what the product actually does. Flag mismatches with severity. Commercial wedge: separately saleable to product marketing, PM, and enablement leaders beyond the AE/sales buyer. Gap that every enterprise software company has and nobody solves well today.

Implementation pattern: assertion extraction from transcripts → RAG against documentation corpus → reconciliation prompt producing flagged discrepancies. 3-4 months production-grade. Requires three data sources: transcript corpus (v2 has this), documentation corpus (new integration per customer), product capability ground truth (hardest; usually lives in Jira + eng heads + release notes).

**Field awareness of product state.** Which capabilities reps are mentioning vs not mentioning, delta against a product capability registry. Surfaces training/enablement gaps ("capability X shipped 2 months ago, only 12% of appropriate-segment deals mention it") and brand liabilities ("capability Y was killed in roadmap but 40% of deals still mention it"). 4-6 weeks for credible v1.

### Data requirements at scale

Narrative analysis needs volume (at minimum 6 months of corpus, ideally cross-customer). Alignment analysis needs documentation corpus access per customer. Field awareness needs a product capability registry — either customer-maintained or extracted programmatically from their release notes + Jira.

### Commercial implication

Changes who Nexus sells to. AE tooling sells to VP Sales. Corpus intelligence sells to VP Sales + VP Product Marketing + VP Enablement + Chief Product Officer. Larger combined ACV, different competitive landscape, more defensible position. Worth testing the corpus-intelligence pitch with 3-5 prospects before committing to build — if the response is strong, sequence it into the roadmap with commercial validation; if not, focus on rep tooling.

### Sequencing

Current build: demo completion + architecture preservation (see DECISIONS.md §2.16.1 for the five preservation decisions made alongside this vision).
Months 1-3 post-demo: first paying customer on operational tooling. Validate corpus intelligence thesis with prospect conversations in parallel.
Months 3-6: if validated, build narrative analysis first (pgvector + clustering + outcome correlation) as the highest-leverage corpus surface.
Months 6-9: alignment analysis (assertion extraction + RAG against docs) as the cross-functional product.
Months 9-12: field awareness layer (capability registry + mention tracking) as the enablement surface.

## Open commercial questions (park as they surface)
(none currently captured — populate as they arise during build)

---

Initial content is seeded from the conversation with Jeff on 2026-04-22. Update whenever productization thinking surfaces during the build. Not a commitment doc; a thinking doc.
