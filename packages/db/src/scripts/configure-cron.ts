/**
 * Configures Supabase pg_cron to poll /api/jobs/worker every 10 seconds.
 *
 * Usage:
 *   pnpm --filter @nexus/db configure-cron https://nexus-v2-five.vercel.app
 *
 * The URL must be the STABLE production alias (or a Vercel protected alias)
 * — preview URLs rotate per commit/branch and would break the schedule on
 * every push. Idempotent: re-running with a different URL unschedules the
 * existing cron and reschedules at the new URL.
 *
 * URL and CRON_SECRET are embedded as SQL literals in the cron body. Supabase
 * restricts `ALTER DATABASE postgres SET ...` even for the project's postgres
 * role (permission denied on custom GUCs), so storing them in database-level
 * GUCs is not available. The cron body lives in cron.job (visible only to
 * service role / cron admin), which is the same trust boundary as the
 * service-role key. Re-run this script after rotating CRON_SECRET.
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env.local") });

async function main() {
  const baseUrl = process.argv[2];
  if (!baseUrl) {
    console.error("Usage: pnpm configure-cron <stable_https_url>");
    console.error("Example: pnpm configure-cron https://nexus-v2-five.vercel.app");
    process.exit(1);
  }
  if (!baseUrl.startsWith("https://")) {
    console.error("URL must start with https:// — pg_net requires TLS.");
    process.exit(1);
  }
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("CRON_SECRET missing from .env.local. `npx vercel env pull` first.");
    process.exit(1);
  }
  const directUrl = process.env.DIRECT_URL;
  if (!directUrl) {
    console.error("DIRECT_URL missing from .env.local.");
    process.exit(1);
  }

  const workerUrl = `${baseUrl.replace(/\/$/, "")}/api/jobs/worker`;
  console.log(`Configuring pg_cron:`);
  console.log(`  worker_url  = ${workerUrl}`);
  console.log(`  cron_secret = ${cronSecret.slice(0, 6)}… (redacted)`);

  const sql = postgres(directUrl, { prepare: false, max: 1 });

  // Reschedule. pg_cron jobnames are unique; unschedule existing if present.
  const existing = await sql<{ jobid: number }[]>`
    SELECT jobid FROM cron.job WHERE jobname = 'nexus-worker'`;
  if (existing.length > 0) {
    await sql`SELECT cron.unschedule('nexus-worker')`;
    console.log("  ✓ unscheduled prior nexus-worker");
  }

  const escapedUrl = workerUrl.replace(/'/g, "''");
  const escapedSecret = cronSecret.replace(/'/g, "''");
  const body = `SELECT net.http_get(
    url := '${escapedUrl}',
    headers := jsonb_build_object('Authorization', 'Bearer ${escapedSecret}')
  )`;
  await sql`SELECT cron.schedule('nexus-worker', '10 seconds', ${body})`;
  console.log("  ✓ scheduled nexus-worker every 10 seconds");

  // 3. Confirm.
  const confirm = await sql<{ jobname: string; schedule: string; active: boolean }[]>`
    SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'nexus-worker'`;
  console.log("  confirm:", confirm[0]);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
