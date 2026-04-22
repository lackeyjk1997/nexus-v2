# Nexus v2 — Session Bootstrap

You are working on Nexus v2, a ground-up rebuild. This file tells you how to orient at the start of a new session.

## Read before acting

The active constitution lives in this repo:

- **[`./docs/DECISIONS.md`](docs/DECISIONS.md)** — 51 LOCKED architectural decisions plus v2-era amendments (2.2.1 onward). Every v2 choice cites a section. **Read this first.**

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

## Build status

Update this section at the end of each Phase.

- **Phase 1 Day 1 — complete.** Monorepo scaffold (pnpm + Turborepo), Next.js 14 app, packages (db/shared/prompts), Tailwind with empty design-token placeholders, git remote set to `github.com/lackeyjk1997/nexus-v2`.
- **Next:** Phase 1 Day 2 — Drizzle schema + migrations, Supabase Auth + RLS, seed 14 demo users.
