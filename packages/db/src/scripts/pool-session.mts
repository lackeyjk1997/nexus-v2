/**
 * Phase 3 Day 4 Session B operational fallback (oversight-approved):
 * use Supabase session-mode pooler (port 5432) to pause/resume the
 * pg_cron `nexus-worker` job when the transaction-mode pooler (port
 * 6543) is at the 200-client EMAXCONN cap.
 *
 * Usage:
 *   pnpm --filter @nexus/db exec tsx src/scripts/pool-session.mts <pause|status>
 */
import postgres from "postgres";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "../../.env.local"), override: true });

const action = (process.argv[2] ?? "status") as "pause" | "resume" | "status";

async function main() {
  const baseUrl = process.env.DATABASE_URL!;
  const sessionUrl = baseUrl.replace(":6543/", ":5432/");
  console.log(`session pooler URL host: ${new URL(sessionUrl).host}`);
  const sql = postgres(sessionUrl, { max: 1, prepare: false });
  try {
    const ping = await sql`SELECT 1 as ok`;
    console.log(`SESSION_POOLER_OK ping=${ping[0]?.ok ?? "?"}`);
    const job = await sql<
      Array<{ jobid: number; jobname: string; schedule: string }>
    >`SELECT jobid, jobname, schedule FROM cron.job WHERE jobname = 'nexus-worker'`;
    if (job.length > 0) {
      console.log(
        `nexus-worker: scheduled (jobid=${job[0]!.jobid}, schedule="${job[0]!.schedule}")`,
      );
    } else {
      console.log("nexus-worker: NOT SCHEDULED");
    }
    if (action === "pause") {
      if (job.length === 0) return;
      await sql`SELECT cron.unschedule('nexus-worker')`;
      console.log("PAUSED via session pooler");
    } else if (action === "resume") {
      if (job.length > 0) {
        console.log("RESUME no-op — nexus-worker already scheduled");
        return;
      }
      const cronSecret = process.env.CRON_SECRET;
      if (!cronSecret) {
        console.log("FAIL: CRON_SECRET missing from env");
        return;
      }
      const workerUrl = "https://nexus-v2-five.vercel.app/api/jobs/worker";
      const escapedUrl = workerUrl.replace(/'/g, "''");
      const escapedSecret = cronSecret.replace(/'/g, "''");
      const body = `SELECT net.http_get(
    url := '${escapedUrl}',
    headers := jsonb_build_object('Authorization', 'Bearer ${escapedSecret}')
  )`;
      await sql`SELECT cron.schedule('nexus-worker', '10 seconds', ${body})`;
      const confirm = await sql<{ jobname: string; schedule: string; active: boolean }[]>`
        SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'nexus-worker'`;
      console.log(`RESUMED via session pooler: ${JSON.stringify(confirm[0])}`);
    }
  } catch (e) {
    console.log(
      "FAIL:",
      e instanceof Error ? e.message.slice(0, 160) : String(e).slice(0, 160),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
