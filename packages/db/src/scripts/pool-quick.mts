/**
 * Phase 3 Day 4 Session B operational fallback (oversight-approved):
 * pause pg_cron's nexus-worker job + wait for the pooler 200-client cap
 * to drain. Used when prod cron is racing localhost worker on PHASE 3.
 *
 * Retries the initial connection up to 60 times (1s sleep between) since
 * the pool may be saturated when this runs.
 *
 * Usage:
 *   pnpm --filter @nexus/db exec tsx src/scripts/pool-quick.mts <pause|resume|status>
 */
import postgres from "postgres";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "../../.env.local"), override: true });

async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 600,
  delayMs = 2000,
): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (i === attempts - 1) throw e;
      if (msg.includes("EMAXCONN")) {
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw e;
    }
  }
  throw new Error("withRetry exhausted");
}

const action = (process.argv[2] ?? "status") as "pause" | "resume" | "status";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  try {
    if (action === "pause") {
      const job = await withRetry(
        () =>
          sql<Array<{ jobid: number; jobname: string }>>`
            SELECT jobid, jobname FROM cron.job WHERE jobname = 'nexus-worker'
          `,
      );
      if (job.length === 0) {
        console.log("nexus-worker not scheduled — nothing to pause");
        return;
      }
      await sql`SELECT cron.unschedule('nexus-worker')`;
      console.log(`paused: cron.unschedule('nexus-worker') jobid=${job[0]!.jobid}`);
    } else if (action === "resume") {
      console.log(
        "RESUME via configure-cron: pnpm --filter @nexus/db configure-cron https://nexus-v2-five.vercel.app",
      );
    } else {
      // Status: ONE shot, no retry. Used by Monitor polling loops.
      try {
        const ping = await sql<Array<{ ok: number }>>`SELECT 1 as ok`;
        console.log(`pool=DRAINED ping=${ping[0]?.ok ?? "?"}`);
        const job = await sql<
          Array<{ jobid: number; jobname: string; schedule: string }>
        >`SELECT jobid, jobname, schedule FROM cron.job WHERE jobname = 'nexus-worker'`;
        if (job.length === 0) {
          console.log("nexus-worker: NOT SCHEDULED");
        } else {
          console.log(
            `nexus-worker: scheduled (jobid=${job[0]!.jobid}, schedule="${job[0]!.schedule}")`,
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(
          msg.includes("EMAXCONN") ? "pool=SATURATED" : `pool=ERROR: ${msg.slice(0, 80)}`,
        );
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
