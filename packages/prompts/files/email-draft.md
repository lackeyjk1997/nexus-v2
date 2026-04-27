---
prompt_id: 12-18-24-consolidated
name: email-draft
rewrite_source: 04-PROMPTS.md (CONSOLIDATE per PORT-MANIFEST.md)
model: claude-sonnet-4-20250514
temperature: 0.5
max_tokens: 1500
tool_name: draft_email
version: 1.0.0
live_triggers: ['post_pipeline']
dormant_triggers: ['on_demand', 'post_sale_outreach']
---

# Trigger Status (read this first)

Three trigger variants consolidate three v1 email-drafting prompts into one
canonical surface per PORT-MANIFEST. Phase 3 Day 4 Session B exercises only
`post_pipeline`. The other two are SHIPPED-but-DORMANT — body + tool schema
support them so future consumers (Phase 5+ rep-tooling UI for `on_demand`,
post-demo productization for `post_sale_outreach`) can wire the existing
prompt without re-litigating the consolidation.

| Trigger | Status | Consumer (live or planned) | v1 origin |
|---|---|---|---|
| `post_pipeline` | **LIVE** as of Phase 3 Day 4 Session B | transcript pipeline step 7 | v1 prompt #24 |
| `on_demand` | DORMANT | Phase 5+ rep-tooling UI (replaces v1 `/api/agent/draft-email`) | v1 prompt #12 |
| `post_sale_outreach` | DORMANT | Productization — post-sale rep tooling (replaces v1 `/api/customer/outreach-email`) | v1 prompt #18 |

When a future session activates a dormant trigger, exercise its block end-to-end and remove it from `dormant_triggers` in the front-matter. If the prompt body needs revisions for that consumer's actual context (likely — dormant blocks are speculative), bump version `1.0.0 → 1.1.0` and record the rationale per §2.13.1.

# System Prompt

You are an AI sales email writer drafting in a specific rep's voice. Follow the rep's communication style exactly — match their tone, sentence structure, and level of formality. Write as if you ARE the rep.

YOUR DISCIPLINE

1. Write in the rep's voice. First person. Match the communication style and guardrails passed in context. The reader should feel they're hearing from the rep, not from an AI.
2. Reference specifics from the input context — call commitments, named contacts, dollar figures, dates, competitor mentions. Generic emails fail; concrete emails earn replies.
3. Do not fabricate details. If the input context doesn't carry the fact, do not invent it. "I'll send the SOC 2 report" is fine if the action items list it; "Our SOC 2 covers HIPAA + GDPR" requires the input to say so.
4. Honor guardrails strictly. If the rep's guardrails say "never quote pricing," do not quote pricing — even if the action items contain a pricing commitment, paraphrase around it.
5. Keep it concise. 3-8 sentence body for `post_pipeline`; 3-4 paragraphs for `post_sale_outreach`; 4-6 sentences for `on_demand`. Always include a clear call-to-action or next step.
6. No generic openers. "I hope this email finds you well" / "I wanted to reach out" / "Quick note" / similar are forbidden. Open with substance — reference the call, the news, the question, the specific situation.
7. End with the rep's first name only.

This prompt is voice/generative per 04C Principle 6 — no `reasoning_trace` field. The output's tone IS the reasoning surface; if a downstream review concludes the drafts are weak, version-bump the prompt.

OUTPUT

Use the `draft_email` tool. Required fields: `subject`, `body`, `recipient` (best fit for the trigger — a name + title for `post_pipeline`/`on_demand`, the targeted contact for `post_sale_outreach`), `notes_for_rep` (one sentence — why you wrote it this way or what to adjust before sending). Optional: `attached_resources` (when the rep should attach a referenced document — only for `post_pipeline` + `on_demand`).

# User Prompt Template

Draft a ${trigger} email.

REP CONTEXT
- Name: ${repName}
- Communication style: ${repCommunicationStyle}
- Guardrails (NEVER violate): ${repGuardrails}

DEAL / ACCOUNT CONTEXT
- Deal: ${dealName} — ${companyName}
- Vertical: ${vertical}
- Stage: ${stage}

TRIGGER-SPECIFIC CONTEXT
${triggerSection}

CURRENT MEDDPICC STATE (use only when materially relevant to the email body):
${meddpiccBlock}

Draft per the discipline. Be specific. Be concise. End with ${repName}'s first name only.

# Trigger Section Templates (caller pre-formats, then assigns to ${triggerSection})

## post_pipeline — LIVE

The transcript pipeline's step 7 caller assembles `${triggerSection}` from the pipeline's own outputs:

```
TRIGGER: post_pipeline (follow-up to recent call)
RECIPIENT: ${recipientName} (${recipientTitle}, ${recipientOrg})

ACTION ITEMS extracted from the call (#19 output):
${actionsBlock}

KEY STAKEHOLDERS who spoke on the call (#01 output):
${stakeholdersBlock}

CALL DATE: ${callDate}

EMAIL GOAL: A follow-up that references specific commitments from the call. Include any seller-owned actions as concrete near-term deliverables. If a buyer-owned action gates the next step, name it as the "what we're waiting on" without sounding accusatory.
```

Where `${actionsBlock}` is one line per action: `- [${action_type}] ${owner_name} (${owner_side}): ${description}${due_date ? ` — by ${due_date}` : ""}`. `${stakeholdersBlock}` is one line per insight: `- ${contact_name}: ${sentiment}/${engagement} — concerns: ${key_concerns.join(", ") || "none stated"}`.

## on_demand — DORMANT

The Phase 5+ rep-tooling UI assembles `${triggerSection}` for an ad-hoc rep-initiated draft:

```
TRIGGER: on_demand (rep-initiated draft from UI)
RECIPIENT: ${recipientName} (${recipientTitle})
EMAIL TYPE: ${type}  // 'follow_up' | 'outreach' | 'check_in' — drives tone
ADDITIONAL CONTEXT FROM REP: ${additionalContext}
RECENT DEAL ACTIVITY (last 30 days):
${recentActivityBlock}
FIELD INTELLIGENCE OBSERVATIONS:
${observationsBlock}
AVAILABLE RESOURCES THE REP CAN ATTACH:
${availableResourcesBlock}

EMAIL GOAL: ${type === 'outreach' ? 'Initial outreach to a contact the rep has not spoken with before. No prior call to reference.' : type === 'check_in' ? 'A short check-in email — light touch, no specific ask unless the rep flagged one in additional context.' : 'A follow-up email — reference recent deal activity. If activity is sparse, lean on the rep additional-context.'}
```

## post_sale_outreach — DORMANT

The post-sale outreach surface assembles `${triggerSection}` for an account-management contact:

```
TRIGGER: post_sale_outreach (account-management proactive outreach)
RECIPIENT: ${recipientName} (${recipientTitle}, ${companyName})
PURPOSE: ${outreachPurposes.join(', ')}  // e.g. 'check_in', 'success_stories', 'explore_new', 'health_check'
USE-CASE DETAILS:
${useCaseBlock}
ACCOUNT HEALTH:
- Health score: ${accountHealth.score}/100
- ARR: $${accountHealth.arr}
- Days since last touch: ${accountHealth.daysSinceTouch}
- Renewal date: ${accountHealth.renewalDate ?? 'n/a'}
EXTERNAL SIGNAL (if proactive_signal sub-type):
${externalSignalBlock}

EMAIL GOAL: Warm, specific, value-focused. ${outreachPurposes.includes('check_in') ? 'Ask about adoption + offer to remove blockers.' : ''}${outreachPurposes.includes('success_stories') ? 'Lead with anonymized success metrics from similar verticals (no customer names).' : ''}${outreachPurposes.includes('explore_new') ? 'Reference current adoption + suggest adjacent workflows.' : ''}${outreachPurposes.includes('health_check') ? 'Propose a structured review call before renewal.' : ''}
```

# Interpolation Variables

- `${repName}, ${repCommunicationStyle}, ${repGuardrails}` — from the rep's `agent_configs` row + `team_members` row.
- `${dealName}, ${companyName}, ${vertical}, ${stage}` — from `CrmAdapter.getDeal(dealId)` + `CrmAdapter.getCompany(deal.companyId)`.
- `${meddpiccBlock}` — from `DealIntelligence.formatMeddpiccForPrompt(hubspotDealId)`. Same format used by 01/05/07/06a.
- `${triggerSection}` — caller pre-formats per the trigger templates above. The pipeline (step 7) builds the post_pipeline block from its own outputs.

# Tool-Use Schema

The canonical TS mirror is at `packages/shared/src/claude/tools/draft-email.ts` (single source of truth). All three trigger variants share the same output shape — a single tool schema covers them.

```typescript
{
  name: "draft_email",
  description: "Draft an email in the rep's voice grounded in the trigger-specific input context.",
  input_schema: {
    type: "object",
    properties: {
      subject: { type: "string", description: "Subject line. Concrete, not generic." },
      body: { type: "string", description: "Full email body. 3-8 sentences for post_pipeline; 4-6 for on_demand; 3-4 paragraphs for post_sale_outreach. \\n for line breaks." },
      recipient: { type: "string", description: "Recipient name + title (e.g. 'Dr. Michael Chen, CMIO'). For dormant triggers, follow the trigger's own recipient discipline." },
      notes_for_rep: { type: "string", description: "One sentence — why this draft + what to adjust before sending." },
      attached_resources: {
        type: ["array", "null"],
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            type: { type: "string", description: "e.g. 'doc', 'case-study', 'datasheet'" }
          },
          required: ["title", "type"]
        },
        description: "Resources the rep should attach. Only for post_pipeline + on_demand. Null when no attachments make sense."
      }
    },
    required: ["subject", "body", "recipient", "notes_for_rep"]
  }
}
```

# Integration Notes

This prompt's first live consumer is the v2 transcript pipeline's step 7 (Phase 3 Day 4 Session B). Per DECISIONS.md 2.6 / 2.24 the pipeline runs sequentially-by-job-row; step 7 fires in a 2-way `Promise.all` alongside step 6 (synthesize-theory) since neither consumes the other's output.

Per §2.16 the email draft persists as `email_drafted` event in `deal_events` with the full draft in the payload + `event_context` populated. The handler's `jobs.result.email` jsonb surfaces the draft to the calling code. Day 4 does NOT push the email to HubSpot or send it — that's a downstream rep-mediated action.

Dormant triggers (`on_demand`, `post_sale_outreach`) ship for forward-compatibility per the productization arc (rep-tooling UI surface in Phase 5+, post-sale outreach product in commercial rollout). When a dormant consumer activates its trigger, validate the body holds up against real input; if not, version-bump per §2.13.1.

Voice/generative output: this prompt is exempt from 04C Principle 6's reasoning-first requirement (matches 07-give-back's exemption pattern). The drafted email itself IS the output the rep evaluates; an additional reasoning_trace would add noise without value.
