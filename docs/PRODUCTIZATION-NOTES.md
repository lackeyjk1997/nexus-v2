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

## Open commercial questions (park as they surface)
(none currently captured — populate as they arise during build)

---

Initial content is seeded from the conversation with Jeff on 2026-04-22. Update whenever productization thinking surfaces during the build. Not a commitment doc; a thinking doc.
