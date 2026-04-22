import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env.local") });

const sql = postgres(process.env.DIRECT_URL!, { prepare: false, max: 1 });

async function main() {
  const enums = await sql<{ typname: string }[]>`
    SELECT t.typname
    FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typtype='e'
    ORDER BY 1`;
  const tables = await sql<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE'
    ORDER BY 1`;
  const policiesByTable = await sql<{ tablename: string; n: number }[]>`
    SELECT tablename, count(*)::int AS n
    FROM pg_policies WHERE schemaname='public'
    GROUP BY tablename ORDER BY tablename`;
  const forbidden = await sql<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public'
      AND table_name IN ('deal_agent_states','agent_actions_log','deal_stage_history','jobs','job_results')`;
  const indexes = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname='public'`;

  console.log(`ENUMS (${enums.length}):`);
  console.log("  " + enums.map((e) => e.typname).join(", "));
  console.log("");
  console.log(`TABLES (${tables.length}):`);
  console.log("  " + tables.map((t) => t.table_name).join(", "));
  console.log("");
  console.log(`POLICIES: ${policiesByTable.reduce((a, b) => a + b.n, 0)} across ${policiesByTable.length} tables`);
  console.log(`INDEXES: ${indexes[0]!.n}`);
  console.log(`FORBIDDEN/DEFERRED tables present: ${JSON.stringify(forbidden.map((r) => r.table_name))}`);
  await sql.end();
}

main();
