import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env.local") });
const sql = postgres(process.env.DIRECT_URL!, { prepare: false, max: 1 });

async function main() {
  const extensions = await sql<{ extname: string }[]>`
    SELECT extname FROM pg_extension WHERE extname IN ('pg_cron','pg_net') ORDER BY 1`;
  const tables = await sql<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name IN ('jobs','job_results') ORDER BY 1`;
  const rls = await sql<{ tablename: string; rowsecurity: boolean }[]>`
    SELECT tablename, rowsecurity FROM pg_tables
    WHERE schemaname='public' AND tablename IN ('jobs','job_results') ORDER BY 1`;
  const policies = await sql<{ tablename: string; policyname: string }[]>`
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname='public' AND tablename IN ('jobs','job_results') ORDER BY 1,2`;
  const pub = await sql<{ tablename: string }[]>`
    SELECT tablename FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='jobs'`;
  const jobTypes = await sql<{ enumlabel: string }[]>`
    SELECT enumlabel FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname='job_type' ORDER BY e.enumsortorder`;
  const jobStatuses = await sql<{ enumlabel: string }[]>`
    SELECT enumlabel FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname='job_status' ORDER BY e.enumsortorder`;

  console.log(JSON.stringify({
    extensions: extensions.map(r => r.extname),
    tables: tables.map(r => r.table_name),
    rls: rls.map(r => ({ [r.tablename]: r.rowsecurity })),
    policies: policies.map(r => `${r.tablename}.${r.policyname}`),
    jobsInRealtimePublication: pub.length > 0,
    jobTypeEnum: jobTypes.map(r => r.enumlabel),
    jobStatusEnum: jobStatuses.map(r => r.enumlabel),
  }, null, 2));
  await sql.end();
}

main();
