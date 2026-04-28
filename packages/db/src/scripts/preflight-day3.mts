import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
loadEnv({ path: resolve(process.cwd(), "../../.env.local"), override: true });

import postgres from "postgres";

const url = process.env.DATABASE_URL!;
const sql = postgres(url, { max: 1, idle_timeout: 5, prepare: false });

try {
  const obs = await sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE signal_type IS NULL)::int AS null_signal_type,
           count(*) FILTER (WHERE cluster_id IS NULL)::int AS null_cluster_id,
           count(*) FILTER (WHERE signal_type IS NULL AND cluster_id IS NULL)::int AS uncategorized_candidates
      FROM observations
  `;
  const clusters = await sql`SELECT count(*)::int AS total FROM observation_clusters`;
  const cluster_cols = await sql`
    SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'observation_clusters'
     ORDER BY ordinal_position
  `;
  const cron = await sql`SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobname`;
  const ec_audit = await sql`
    SELECT count(*) FILTER (WHERE event_context->>'vertical' IS NULL)::int AS vertical_null_rows
      FROM deal_events
  `;
  console.log("observations:", obs[0]);
  console.log("observation_clusters:", clusters[0]);
  console.log("observation_clusters columns:");
  for (const c of cluster_cols) console.log("  ", c);
  console.log("cron.job:");
  for (const r of cron) console.log("  ", r);
  console.log("audit_event_context_fields:", ec_audit[0]);
} finally {
  await sql.end({ timeout: 5 });
}
