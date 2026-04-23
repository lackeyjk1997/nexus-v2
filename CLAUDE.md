# Nexus v2 — Session Bootstrap

You are working on Nexus v2, a ground-up rebuild. This file tells you how to orient at the start of a new session.

## Read before acting

The active constitution lives in this repo. Read in this order at the start of every session:

- **[`./docs/DECISIONS.md`](docs/DECISIONS.md)** — 51 LOCKED architectural decisions plus v2-era amendments (2.2.1, 2.2.2, 2.6.1, 2.13.1 and on). Every v2 choice cites a section.
- **[`./docs/BUILD-LOG.md`](docs/BUILD-LOG.md)** — running narrative: what's shipped, current commit, day-by-day history, parked items by phase, operational notes, context for the next session.
- **[`./docs/FOUNDATION-REVIEW-2026-04-22.md`](docs/FOUNDATION-REVIEW-2026-04-22.md)** — pre-Phase-3 foundation pass (15 ratifications, 15 adjust-findings, 1 actively-wrong, 5 creative additions). Valid until the pre-Phase-3 fix work ships; superseded by its outcomes after. Paired with [`./docs/PRE-PHASE-3-FIX-PLAN.md`](docs/PRE-PHASE-3-FIX-PLAN.md) which sequences the fix work.
- **This file** (`CLAUDE.md`) — bootstrap rules + repo layout.

Frozen handoff reference (read-only, do not modify):

- `~/nexus/docs/handoff/DECISIONS.md` — baseline v1 of the constitution; superseded by `./docs/DECISIONS.md` above. Read only to confirm what changed.
- `~/nexus/docs/handoff/10-REBUILD-PLAN.md` — 6 phases, Section 8 has Day 1–5 detail.
- `~/nexus/docs/handoff/09-CRITIQUE.md` — why v1 is being rebuilt.
- `~/nexus/docs/handoff/04-PROMPTS.md` — full prompt inventory.
- `~/nexus/docs/handoff/04C-PROMPT-REWRITES.md` — rewrite guide.
- `~/nexus/docs/handoff/source/prompts/*.md` — v2-ready prompt rewrites, drop into `packages/prompts/files/` during Phase 3.
- `~/nexus/docs/handoff/design/DESIGN-SYSTEM.md` — tokens/primitives, read in Phase 2 Day 1.

`~/nexus` is read-only reference. Do not modify anything in it unless explicitly asked.

## Hard rules (all cite DECISIONS.md)

1. **Rivet is removed.** Do not install `rivetkit`, `@rivetkit/next-js`, or `@rivetkit/react`. Long work uses the `jobs` table + `pg_cron`. (2.6)
2. **Prompts live as `.md` files** in `packages/prompts/files/` with YAML front-matter. No inline prompt string literals anywhere. (2.13, Guardrail 19)
3. **All Claude calls go through the unified wrapper** in `packages/shared/src/claude/`. Tool-use schemas only. No regex JSON extraction. (2.13, Guardrails 16–18)
4. **Model ID is pinned via `ANTHROPIC_MODEL` env var**, never hardcoded in wrapper or prompt files. That way model upgrades don't require code changes.
5. **CRM access goes through `CrmAdapter`.** HubSpot is system of record. Never duplicate CRM data in Nexus tables. (2.18, 2.19, Guardrail 23)
6. **Schema changes are numbered Drizzle migrations.** No runtime `ALTER TABLE`. (2.2, Guardrail 2)
7. **Long operations run as `jobs` rows.** Never block UI on a synchronous Claude call. (2.6, 2.9, Guardrail 5)
8. **Every API route declares `maxDuration` explicitly.** (2.9, Guardrail 12)
9. **Domain concepts with ≥2 write sites go through a service function.** (2.10, Guardrail 13)
10. **Server-to-server work is a function call, not HTTP.** Shared logic lives in `services/`. (2.12, Guardrail 15)
11. **No client-controlled trust flags** (e.g. `preClassified: true`). (2.11, Guardrail 14)
12. **No name-based demo scaffolding.** Behaviors key off structured data, not seed string matches. (1.14, Guardrail 41)
13. **Client component files ≤400 LOC.** Split when approaching. (2.22, Guardrail 35)
14. **No inline hex colors, fonts, or backgrounds.** Design tokens only. (2.22, Guardrail 34)
15. **Event-sourced intelligence.** `deal_events` is append-only. `DealIntelligence` service is the only read/write interface. (2.16, Guardrails 24–25)
16. **Applicability gating.** Every surfaced insight passes stage + temporal + precondition checks. Rules are structured JSONB, never prose. (2.21, Guardrails 31–32)
17. **AI-driven config mutations are proposals, not direct writes.** (2.25 #3, Guardrail 43)
18. **Empty states are intentional.** Silence is a feature. Low-confidence insights don't surface. (1.18, Guardrail 51)

## Repo layout

```
apps/web/              Next.js 14 app (App Router, TS strict, Turbopack)
packages/db/           Drizzle schema, migrations, seeds
packages/shared/       Types, enums, Claude wrapper, CRM adapter, services
packages/prompts/      Markdown prompts + loader
```

## How to run

```
pnpm install
pnpm dev        # apps/web on http://localhost:3001
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

## Oversight / execution division of responsibility

Oversight adjudicates direction. Code-level judgment is yours.

When a divergence, ambiguity, or choice surfaces during session execution:

1. Default to reasoning it through against the documentation you have open — CLAUDE.md, DECISIONS.md (guardrails + v2-era amendments), BUILD-LOG.md (current state, operational notes, precedents), PRODUCTIZATION-NOTES.md (productization arc), and any session-specific reading from the current prompt.

2. Pick the option that best serves the build's trajectory: demo fidelity today, productization optionality tomorrow, corpus-intelligence preservation per §2.16.1.

3. Execute the decision and capture the reasoning in the end-of-day report's Reasoning stub section — options considered, tradeoffs weighed, option chosen, guardrail / preservation-decision / session-need citation.

4. Flag upward to oversight ONLY when:
   - A guardrail conflicts with another guardrail and the conflict can't be resolved from documentation
   - A choice materially changes product direction or forecloses a PRODUCTIZATION-NOTES.md arc
   - New-principle territory that no existing amendment addresses
   - Scope that exceeds the current session's split and would bleed into a future session

Do not flag upward for:
   - Small schema / taxonomy / pattern calls within an established framework
   - Reasonable MVP-vs-justified-expansion judgment covered by the Reasoning gate
   - Operational precedents already set by prior sessions

The Reasoning stub is the review artifact. Oversight reviews decisions at end-of-day sign-off, not per-decision during execution. This preserves your velocity and keeps oversight focused on the things oversight is actually better at than the code-in-view.
