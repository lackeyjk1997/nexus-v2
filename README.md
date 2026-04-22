# Nexus v2

Ground-up rebuild of Nexus. AI sales orchestration platform with HubSpot as CRM system of record and Nexus as the intelligence overlay.

Spec lives in the v1 repo at `~/nexus/docs/handoff/`. Start with `DECISIONS.md`.

## Stack

- **Next.js 14** (App Router, TypeScript strict) on **Vercel Pro**
- **Supabase Postgres** + **Drizzle ORM** + **Supabase Auth** with RLS on every Nexus-owned table + **Supabase Realtime**
- **Postgres `jobs` table** + Next.js worker + **`pg_cron`** for background work (Rivet removed)
- **HubSpot Starter Customer Platform** via `CrmAdapter` interface
- **Anthropic SDK** (Claude Sonnet 4.x, pinned via `ANTHROPIC_MODEL` env) behind a unified wrapper
- **Turborepo** + **pnpm** monorepo

## Quick start

```bash
pnpm install
cp .env.example .env.local   # then fill in real values
pnpm dev                     # apps/web on http://localhost:3001
```

### `DATABASE_URL` vs `DIRECT_URL`

- **`DATABASE_URL`** — Supabase **Transaction pooler** (port `6543`, host
  `aws-0-<region>.pooler.supabase.com`). Used by the app at runtime. Works from
  Vercel's IPv4-only Node runtime. Must use `prepare: false` (handled by the
  `createDb` factory).
- **`DIRECT_URL`** — Supabase **Direct connection** (port `5432`, host
  `db.<ref>.supabase.co`). Used only by `drizzle-kit` migrations from developer
  machines (which typically have IPv6). Do **not** point the app at this URL;
  Vercel can't resolve it.

## Repo layout

```
apps/web/              Next.js 14 app
packages/db/           Drizzle schema, migrations, seeds
packages/shared/       Types, enums, Claude wrapper, CRM adapter, services
packages/prompts/      Markdown prompts (.md) + runtime loader
```

## Authoritative docs

The constitution for this rebuild lives in the v1 repo at `~/nexus/docs/handoff/`:

| File | Purpose |
|---|---|
| `DECISIONS.md` | 51 locked architectural decisions — every v2 choice cites a section |
| `10-REBUILD-PLAN.md` | 6 phases, Section 8 has Phase 1 Day 1–5 |
| `09-CRITIQUE.md` | Why v1 is being rebuilt |
| `04-PROMPTS.md` | Full inventory of v1's 25 prompts |
| `04C-PROMPT-REWRITES.md` | Rewrite guide for 8 prompts (producing 9 files) |
| `source/prompts/*.md` | v2-ready prompt rewrites, dropped into `packages/prompts/files/` in Phase 3 |
| `design/DESIGN-SYSTEM.md` | Tokens and primitives, consumed in Phase 2 Day 1 |

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Run all apps in dev (Turbopack) |
| `pnpm build` | Build all apps and packages |
| `pnpm typecheck` | Typecheck all workspaces |
| `pnpm lint` | Lint all workspaces |
| `pnpm test` | Run all tests |
| `pnpm clean` | Remove build artifacts and node_modules |

## Deploy

Vercel auto-deploys from `main` (production) and every branch (preview).
Live preview URL is set in the Vercel project after first push.
