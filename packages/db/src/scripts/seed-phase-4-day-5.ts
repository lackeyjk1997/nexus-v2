/**
 * Phase 4 Day 5 A — seed-substrate loader (executor runbook steps 1–3).
 *
 * Loads the authored content at `packages/db/src/seed-data/phase-4-day-5/`
 * per that directory's README (the governing executor contract):
 *
 *   step 1  Preflight: files present, JSON parses, every transcript
 *           front-matter `deal_hubspot_id` matches a deals.json row, every
 *           sidecar email resolves to a seeded team_members/users row.
 *   step 2  Structured rows: hubspot_cache (companies/deals/contacts),
 *           deal_contact_roles, manager_directives, system_intelligence,
 *           experiments, observations. Idempotent on hubspotId / natural
 *           keys. Sidecar emails (`authorEmail` / `originatorEmail` /
 *           `observerEmail`) resolve to ids and are dropped — they are not
 *           columns.
 *   step 3  Transcripts: one row per `transcripts/*.md`, front-matter parsed,
 *           `source='simulated'`, `pipeline_processed=false`, idempotent on
 *           the synthetic `hubspot_engagement_id = seed-p4d5-<file-stem>`
 *           (same sentinel pattern as seed-medvista-transcript.ts).
 *
 * Pipeline runs (runbook steps 4–8) are NOT triggered here — the executor
 * session enqueues `transcript_pipeline` jobs separately so the production
 * worker path is exercised and verified explicitly.
 *
 * Usage:
 *   pnpm --filter @nexus/db seed:phase-4-day-5
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import dns from "node:dns";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

dns.setDefaultResultOrder("ipv6first");

import postgres from "postgres";

import { loadDevEnv, requireEnv } from "@nexus/shared";

loadDevEnv();

const here = dirname(fileURLToPath(import.meta.url));
const SEED_DIR = resolve(here, "../seed-data/phase-4-day-5");

/* ----------------------------------------------------------------------- */
/* Types mirroring the authored JSON shapes                                  */
/* ----------------------------------------------------------------------- */

interface CacheRow {
  objectType: "deal" | "company" | "contact";
  hubspotId: string;
  payload: Record<string, unknown>;
}

interface DealContactRoleRow {
  hubspotDealId: string;
  hubspotContactId: string;
  role: string;
  isPrimary: boolean;
}

interface Participant {
  name: string;
  role: string;
  side: string;
  org: string;
  email: string;
}

interface TranscriptFrontMatter {
  deal_hubspot_id: string;
  title: string;
  participants: Participant[];
  source: string;
  duration_seconds: number;
  recorded_at: string;
}

/* ----------------------------------------------------------------------- */
/* Front-matter parser (strict, fails loudly)                                */
/*                                                                           */
/* The authored front-matter is regular: scalar `key: value` lines plus a    */
/* `participants:` block of inline-flow maps `- { k: v, k: v, ... }` whose   */
/* values never contain commas or braces (verified across all 9 files).      */
/* A 30-line strict parser beats adding a YAML dependency for one shape.     */
/* ----------------------------------------------------------------------- */

function parseFrontMatter(raw: string, file: string): { fm: TranscriptFrontMatter; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: no front-matter block`);
  const [, fmText, body] = m;

  const scalars: Record<string, string> = {};
  const participants: Participant[] = [];

  for (const line of fmText!.split("\n")) {
    if (!line.trim()) continue;
    const inline = line.match(/^\s*-\s*\{\s*(.*?)\s*\}\s*$/);
    if (inline) {
      const obj: Record<string, string> = {};
      for (const pair of inline[1]!.split(",")) {
        const kv = pair.match(/^\s*([\w]+):\s*(.*?)\s*$/);
        if (!kv) throw new Error(`${file}: unparseable participant pair "${pair}"`);
        obj[kv[1]!] = kv[2]!;
      }
      for (const k of ["name", "role", "side", "org", "email"]) {
        if (!obj[k]) throw new Error(`${file}: participant missing "${k}"`);
      }
      participants.push(obj as unknown as Participant);
      continue;
    }
    if (/^\s*participants:\s*$/.test(line)) continue;
    const kv = line.match(/^([\w]+):\s*(.*?)\s*$/);
    if (!kv) throw new Error(`${file}: unparseable front-matter line "${line}"`);
    scalars[kv[1]!] = kv[2]!;
  }

  for (const k of ["deal_hubspot_id", "title", "source", "duration_seconds", "recorded_at"]) {
    if (!scalars[k]) throw new Error(`${file}: front-matter missing "${k}"`);
  }
  if (participants.length === 0) throw new Error(`${file}: no participants parsed`);

  return {
    fm: {
      deal_hubspot_id: scalars.deal_hubspot_id!,
      title: scalars.title!,
      participants,
      source: scalars.source!,
      duration_seconds: Number(scalars.duration_seconds),
      recorded_at: scalars.recorded_at!,
    },
    body: body!,
  };
}

/* ----------------------------------------------------------------------- */

function readJson<T>(file: string): T {
  const p = resolve(SEED_DIR, file);
  if (!existsSync(p)) throw new Error(`missing seed file: ${file}`);
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? requireEnv("DIRECT_URL");
  const sql = postgres(url, { max: 1, prepare: false });

  try {
    console.log("Phase 4 Day 5 A seed loader\n");

    /* ---------------- step 1: preflight ---------------- */
    console.log("[1/3] Preflight…");

    const companies = readJson<CacheRow[]>("companies.json");
    const deals = readJson<CacheRow[]>("deals.json");
    const contactsFile = readJson<{ contacts: CacheRow[]; dealContactRoles: DealContactRoleRow[] }>(
      "contacts.json",
    );
    const directives = readJson<Array<Record<string, unknown>>>("manager-directives.json");
    const sysIntel = readJson<Array<Record<string, unknown>>>("system-intelligence.json");
    const experiments = readJson<Array<Record<string, unknown>>>("experiments.json");
    const observations = readJson<Array<Record<string, unknown>>>("observations.json");

    const transcriptDir = resolve(SEED_DIR, "transcripts");
    const transcriptFiles = readdirSync(transcriptDir)
      .filter((f) => f.endsWith(".md"))
      .sort();
    if (transcriptFiles.length === 0) throw new Error("no transcripts found");

    const dealIds = new Set(deals.map((d) => d.hubspotId));
    const parsedTranscripts = transcriptFiles.map((f) => {
      const raw = readFileSync(resolve(transcriptDir, f), "utf8");
      const parsed = parseFrontMatter(raw, f);
      if (!dealIds.has(parsed.fm.deal_hubspot_id)) {
        throw new Error(`${f}: deal_hubspot_id ${parsed.fm.deal_hubspot_id} not in deals.json`);
      }
      return { file: f, raw, ...parsed };
    });

    // Sidecar email resolution maps (fail fast if any email unseeded).
    const sidecarEmails = new Set<string>();
    for (const d of directives) sidecarEmails.add(String(d.authorEmail));
    for (const e of experiments) sidecarEmails.add(String(e.originatorEmail));
    for (const o of observations) sidecarEmails.add(String(o.observerEmail));
    const emails = [...sidecarEmails];

    const teamRows = await sql<Array<{ id: string; email: string; user_id: string }>>`
      SELECT id, email, user_id FROM team_members WHERE email = ANY(${emails})
    `;
    const userRows = await sql<Array<{ id: string; email: string }>>`
      SELECT id, email FROM users WHERE email = ANY(${emails})
    `;
    const teamByEmail = new Map(teamRows.map((r) => [r.email, r.id]));
    // Observer resolution: persona emails live on team_members; the linked
    // users row may carry a different (real login) email — e.g. Sarah Chen's
    // team_member points at the jeff.lackey97@gmail.com users row. Resolve
    // via team_members.user_id first, then direct users.email as fallback.
    const userByEmail = new Map<string, string>([
      ...userRows.map((r) => [r.email, r.id] as const),
      ...teamRows.map((r) => [r.email, r.user_id] as const),
    ]);

    for (const d of directives) {
      if (!teamByEmail.has(String(d.authorEmail)))
        throw new Error(`directive authorEmail unresolved: ${d.authorEmail}`);
    }
    for (const e of experiments) {
      if (!teamByEmail.has(String(e.originatorEmail)))
        throw new Error(`experiment originatorEmail unresolved: ${e.originatorEmail}`);
    }
    for (const o of observations) {
      if (!userByEmail.has(String(o.observerEmail)))
        throw new Error(`observation observerEmail unresolved: ${o.observerEmail}`);
    }

    console.log(
      `      companies=${companies.length} deals=${deals.length} contacts=${contactsFile.contacts.length}` +
        ` roles=${contactsFile.dealContactRoles.length} directives=${directives.length}` +
        ` sysIntel=${sysIntel.length} experiments=${experiments.length} observations=${observations.length}` +
        ` transcripts=${parsedTranscripts.length}`,
    );
    console.log(`      sidecar emails resolved: ${emails.join(", ")}`);

    /* ---------------- step 2: structured rows ---------------- */
    console.log("[2/3] Structured rows…");

    const counts: Record<string, { inserted: number; updated: number }> = {};
    const bump = (k: string, isNew: boolean) => {
      counts[k] ??= { inserted: 0, updated: 0 };
      counts[k]![isNew ? "inserted" : "updated"]++;
    };

    // hubspot_cache: companies + deals + contacts, upsert on (object_type, hubspot_id)
    for (const row of [...companies, ...deals, ...contactsFile.contacts]) {
      const res = await sql<Array<{ inserted: boolean }>>`
        INSERT INTO hubspot_cache (object_type, hubspot_id, payload, cached_at)
        VALUES (${row.objectType}, ${row.hubspotId}, ${sql.json(row.payload as never)}, NOW())
        ON CONFLICT ON CONSTRAINT hubspot_cache_object_key
        DO UPDATE SET payload = EXCLUDED.payload, cached_at = NOW()
        RETURNING (xmax = 0) AS inserted
      `;
      bump("hubspot_cache", res[0]!.inserted);
    }

    // deal_contact_roles: upsert on (hubspot_deal_id, hubspot_contact_id)
    for (const r of contactsFile.dealContactRoles) {
      const res = await sql<Array<{ inserted: boolean }>>`
        INSERT INTO deal_contact_roles (hubspot_deal_id, hubspot_contact_id, role, is_primary)
        VALUES (${r.hubspotDealId}, ${r.hubspotContactId}, ${r.role}, ${r.isPrimary})
        ON CONFLICT ON CONSTRAINT deal_contact_roles_unique
        DO UPDATE SET role = EXCLUDED.role, is_primary = EXCLUDED.is_primary, updated_at = NOW()
        RETURNING (xmax = 0) AS inserted
      `;
      bump("deal_contact_roles", res[0]!.inserted);
    }

    // manager_directives: natural key = directive_text (no schema unique; lookup-first)
    for (const d of directives) {
      const authorId = teamByEmail.get(String(d.authorEmail))!;
      const existing = await sql<Array<{ id: string }>>`
        SELECT id FROM manager_directives WHERE directive_text = ${String(d.directiveText)} LIMIT 1
      `;
      if (existing.length > 0) {
        await sql`
          UPDATE manager_directives SET
            author_id = ${authorId}, scope = ${sql.json(d.scope as never)},
            priority = ${String(d.priority)}, category = ${(d.category as string) ?? null},
            is_active = ${Boolean(d.isActive)}, updated_at = NOW()
          WHERE id = ${existing[0]!.id}
        `;
        bump("manager_directives", false);
      } else {
        await sql`
          INSERT INTO manager_directives
            (author_id, directive_text, scope, priority, category, is_active, created_at, updated_at)
          VALUES
            (${authorId}, ${String(d.directiveText)}, ${sql.json(d.scope as never)},
             ${String(d.priority)}, ${(d.category as string) ?? null}, ${Boolean(d.isActive)},
             ${String(d.createdAt)}, ${String(d.updatedAt)})
        `;
        bump("manager_directives", true);
      }
    }

    // system_intelligence: natural key = title
    for (const s of sysIntel) {
      const existing = await sql<Array<{ id: string }>>`
        SELECT id FROM system_intelligence WHERE title = ${String(s.title)} LIMIT 1
      `;
      if (existing.length > 0) {
        await sql`
          UPDATE system_intelligence SET
            vertical = ${(s.vertical as string) ?? null}, insight_type = ${String(s.insightType)},
            insight = ${String(s.insight)}, supporting_data = ${sql.json(s.supportingData as never)},
            confidence = ${(s.confidence as string) ?? null},
            relevance_score = ${(s.relevanceScore as string) ?? null},
            status = ${String(s.status)}, hubspot_company_id = ${(s.hubspotCompanyId as string) ?? null},
            updated_at = NOW()
          WHERE id = ${existing[0]!.id}
        `;
        bump("system_intelligence", false);
      } else {
        await sql`
          INSERT INTO system_intelligence
            (vertical, insight_type, title, insight, supporting_data, confidence,
             relevance_score, status, hubspot_company_id, created_at, updated_at)
          VALUES
            (${(s.vertical as string) ?? null}, ${String(s.insightType)}, ${String(s.title)},
             ${String(s.insight)}, ${sql.json(s.supportingData as never)},
             ${(s.confidence as string) ?? null}, ${(s.relevanceScore as string) ?? null},
             ${String(s.status)}, ${(s.hubspotCompanyId as string) ?? null},
             ${String(s.createdAt)}, ${String(s.updatedAt)})
        `;
        bump("system_intelligence", true);
      }
    }

    // experiments: natural key = title
    for (const e of experiments) {
      const originatorId = teamByEmail.get(String(e.originatorEmail))!;
      const existing = await sql<Array<{ id: string }>>`
        SELECT id FROM experiments WHERE title = ${String(e.title)} LIMIT 1
      `;
      if (existing.length > 0) {
        await sql`
          UPDATE experiments SET
            originator_id = ${originatorId}, hypothesis = ${String(e.hypothesis)},
            description = ${(e.description as string) ?? null}, category = ${String(e.category)},
            lifecycle = ${String(e.lifecycle)}, vertical = ${(e.vertical as string) ?? null},
            applicability = ${sql.json(e.applicability as never)},
            thresholds = ${sql.json(e.thresholds as never)}, updated_at = NOW()
          WHERE id = ${existing[0]!.id}
        `;
        bump("experiments", false);
      } else {
        await sql`
          INSERT INTO experiments
            (originator_id, title, hypothesis, description, category, lifecycle, vertical,
             applicability, thresholds, created_at, updated_at)
          VALUES
            (${originatorId}, ${String(e.title)}, ${String(e.hypothesis)},
             ${(e.description as string) ?? null}, ${String(e.category)}, ${String(e.lifecycle)},
             ${(e.vertical as string) ?? null}, ${sql.json(e.applicability as never)},
             ${sql.json(e.thresholds as never)}, ${String(e.createdAt)}, ${String(e.updatedAt)})
        `;
        bump("experiments", true);
      }
    }

    // observations: natural key = raw_input; signal_type stays NULL (§2.13.1)
    for (const o of observations) {
      const observerId = userByEmail.get(String(o.observerEmail))!;
      const existing = await sql<Array<{ id: string }>>`
        SELECT id FROM observations WHERE raw_input = ${String(o.rawInput)} LIMIT 1
      `;
      if (existing.length > 0) {
        await sql`
          UPDATE observations SET
            observer_id = ${observerId}, severity = ${String(o.severity)},
            status = ${String(o.status)}, source_context = ${sql.json(o.sourceContext as never)},
            updated_at = NOW()
          WHERE id = ${existing[0]!.id}
        `;
        bump("observations", false);
      } else {
        await sql`
          INSERT INTO observations
            (observer_id, raw_input, ai_classification, signal_type, severity, confidence,
             status, source_context, cluster_id, created_at, updated_at)
          VALUES
            (${observerId}, ${String(o.rawInput)}, NULL, NULL, ${String(o.severity)}, NULL,
             ${String(o.status)}, ${sql.json(o.sourceContext as never)}, NULL,
             ${String(o.createdAt)}, ${String(o.updatedAt)})
        `;
        bump("observations", true);
      }
    }

    for (const [table, c] of Object.entries(counts)) {
      console.log(`      ${table}: inserted=${c.inserted} updated=${c.updated}`);
    }

    /* ---------------- step 3: transcripts ---------------- */
    console.log("[3/3] Transcripts…");

    // hubspot_engagement_id carries only an index (not UNIQUE) — lookup-first
    // upsert, same pattern as seed-medvista-transcript.ts.
    for (const t of parsedTranscripts) {
      const sentinel = `seed-p4d5-${basename(t.file, ".md")}`;
      const existing = await sql<Array<{ id: string }>>`
        SELECT id FROM transcripts WHERE hubspot_engagement_id = ${sentinel} LIMIT 1
      `;
      if (existing.length > 0) {
        await sql`
          UPDATE transcripts SET
            hubspot_deal_id = ${t.fm.deal_hubspot_id}, title = ${t.fm.title},
            transcript_text = ${t.body.trim()}, participants = ${sql.json(t.fm.participants as never)},
            duration_seconds = ${t.fm.duration_seconds}, recorded_at = ${t.fm.recorded_at},
            pipeline_processed = false, updated_at = NOW()
          WHERE id = ${existing[0]!.id}
        `;
        bump("transcripts", false);
      } else {
        await sql`
          INSERT INTO transcripts
            (hubspot_deal_id, title, transcript_text, participants, source,
             duration_seconds, recorded_at, hubspot_engagement_id, pipeline_processed)
          VALUES
            (${t.fm.deal_hubspot_id}, ${t.fm.title}, ${t.body.trim()},
             ${sql.json(t.fm.participants as never)}, ${t.fm.source},
             ${t.fm.duration_seconds}, ${t.fm.recorded_at}, ${sentinel}, false)
        `;
        bump("transcripts", true);
      }
      console.log(
        `      ${existing.length === 0 ? "inserted" : "updated "} ${sentinel} (${t.fm.deal_hubspot_id}, ${t.body.trim().length} chars, ${t.fm.participants.length} participants)`,
      );
    }

    /* ---------------- verify ---------------- */
    const verify = await sql<Array<{ table_name: string; n: number }>>`
      SELECT 'hubspot_cache_seed' AS table_name, count(*)::int AS n
        FROM hubspot_cache WHERE hubspot_id LIKE 'seed\\_%'
      UNION ALL
      SELECT 'deal_contact_roles_seed', count(*)::int
        FROM deal_contact_roles WHERE hubspot_deal_id LIKE 'seed\\_%'
      UNION ALL
      SELECT 'transcripts_seed', count(*)::int
        FROM transcripts WHERE hubspot_engagement_id LIKE 'seed-p4d5-%'
      UNION ALL
      SELECT 'manager_directives', count(*)::int FROM manager_directives
      UNION ALL
      SELECT 'system_intelligence', count(*)::int FROM system_intelligence
      UNION ALL
      SELECT 'experiments', count(*)::int FROM experiments
      UNION ALL
      SELECT 'observations_pending', count(*)::int
        FROM observations WHERE status = 'pending_review' AND signal_type IS NULL
    `;
    console.log("\nVerification counts:");
    for (const v of verify) console.log(`      ${v.table_name} = ${v.n}`);

    console.log("\nSeed substrate loaded. Next: enqueue transcript_pipeline jobs (runbook step 4).");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
