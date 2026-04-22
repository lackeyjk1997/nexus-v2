import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env.local") });
const sql = postgres(process.env.DIRECT_URL!, { prepare: false, max: 1 });

async function main() {
  const job = await sql<
    { jobname: string; schedule: string; active: boolean; command: string }[]
  >`SELECT jobname, schedule, active, command FROM cron.job WHERE jobname = 'nexus-worker'`;
  if (job.length === 0) {
    console.log("no nexus-worker cron registered");
    await sql.end();
    return;
  }
  console.log(`jobname=${job[0]!.jobname}`);
  console.log(`schedule=${job[0]!.schedule}`);
  console.log(`active=${job[0]!.active}`);
  const body = job[0]!.command.replace(/Bearer [A-Za-z0-9]+/, "Bearer <redacted>");
  console.log(`body=${body.replace(/\s+/g, " ").trim()}`);
  const runs = await sql<
    { n: number; ok: number; failed: number; latest: Date }[]
  >`SELECT count(*)::int AS n,
           count(*) FILTER (WHERE d.status='succeeded')::int AS ok,
           count(*) FILTER (WHERE d.status='failed')::int AS failed,
           max(d.end_time) AS latest
      FROM cron.job_run_details d
      JOIN cron.job j ON j.jobid = d.jobid
      WHERE j.jobname = 'nexus-worker'`;
  console.log(`runs total=${runs[0]!.n} ok=${runs[0]!.ok} failed=${runs[0]!.failed} latest=${runs[0]!.latest}`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
