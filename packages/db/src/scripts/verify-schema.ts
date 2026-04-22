/**
 * Schema verification — counts tables, enums, policies, indexes and confirms
 * the forbidden tables (deal_agent_states, agent_actions_log, deal_stage_history)
 * are absent. Used in the Day 2 report.
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env.local") });

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DIRECT_URL (or DATABASE_URL) must be set.");

const sql = postgres(url, { prepare: false, max: 1 });

async function main() {
  const tables = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;
  const enums = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typtype = 'e'
  `;
  const policies = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM pg_policies WHERE schemaname = 'public'
  `;
  const indexes = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM pg_indexes WHERE schemaname = 'public'
  `;
  const forbidden = await sql<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('deal_agent_states', 'agent_actions_log', 'deal_stage_history')
  `;
  const authFk = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM information_schema.referential_constraints rc
    JOIN information_schema.table_constraints tc
      ON rc.constraint_name = tc.constraint_name
     AND rc.constraint_schema = tc.constraint_schema
    WHERE tc.constraint_name = 'users_id_auth_fk'
  `;
  const rlsEnabled = await sql<{ enabled: number; disabled: number }[]>`
    SELECT
      count(*) FILTER (WHERE rowsecurity)::int AS enabled,
      count(*) FILTER (WHERE NOT rowsecurity)::int AS disabled
    FROM pg_tables
    WHERE schemaname = 'public'
  `;
  const isAdminFn = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_admin'
  `;

  console.log(JSON.stringify(
    {
      tables: tables[0]!.count,
      enums: enums[0]!.count,
      policies: policies[0]!.count,
      indexes: indexes[0]!.count,
      rlsEnabled: rlsEnabled[0]!.enabled,
      rlsDisabled: rlsEnabled[0]!.disabled,
      authFkExists: authFk[0]!.count === 1,
      isAdminFnExists: isAdminFn[0]!.count === 1,
      forbiddenTablesPresent: forbidden.map((r) => r.table_name),
    },
    null,
    2,
  ));

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
