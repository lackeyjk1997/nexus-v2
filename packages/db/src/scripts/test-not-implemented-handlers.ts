/**
 * Confirms the six non-noop job_type handlers throw `not_implemented` loudly
 * rather than silently succeeding. For each type, enqueue → trigger worker →
 * assert status=failed with an error message naming the type and phase.
 *
 * Usage:
 *   pnpm --filter @nexus/db test:notimpl
 *
 * Defaults to http://localhost:3001. Override with WORKER_URL env.
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { createDb, jobs } from "../index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env.local") });

const baseUrl = process.env.WORKER_URL ?? "http://localhost:3001";
const workerUrl = `${baseUrl.replace(/\/$/, "")}/api/jobs/worker`;
const cronSecret = process.env.CRON_SECRET!;
const db = createDb(process.env.DIRECT_URL!);

const NOT_IMPLEMENTED_TYPES = [
  "transcript_pipeline",
  "coordinator_synthesis",
  "observation_cluster",
  "daily_digest",
  "deal_health_check",
  "hubspot_periodic_sync",
] as const;

async function main() {
  console.log(`Testing not_implemented handlers against ${workerUrl}\n`);
  const results: Record<string, { status: string; error: string | null }> = {};
  const headers = { Authorization: `Bearer ${cronSecret}` };

  for (const type of NOT_IMPLEMENTED_TYPES) {
    // Drain any other queued jobs that would get picked up first.
    // Simplest: insert, then immediately trigger worker; since the worker
    // claims by created_at ASC, the fresh job runs when no older queued work
    // exists. We assume the queue is empty at test time.
    const [inserted] = await db
      .insert(jobs)
      .values({ type, input: { tag: `notimpl-${type}` }, status: "queued" })
      .returning({ id: jobs.id });
    if (!inserted) throw new Error(`failed to insert ${type}`);

    const res = await fetch(workerUrl, { headers });
    await res.json();

    const row = (
      await db
        .select({
          status: jobs.status,
          error: jobs.error,
        })
        .from(jobs)
        .where(eq(jobs.id, inserted.id))
    )[0];

    const status = row?.status ?? "missing";
    const error = row?.error ?? null;
    results[type] = { status, error };
    console.log(
      `  ${type.padEnd(24)} → status=${status}  error=${(error ?? "").slice(0, 80)}`,
    );

    if (status !== "failed") {
      throw new Error(`${type}: expected status=failed, got ${status}`);
    }
    if (!error || !error.startsWith("not_implemented:")) {
      throw new Error(`${type}: expected error prefix "not_implemented:", got "${error}"`);
    }
    if (!error.includes(type)) {
      throw new Error(`${type}: expected error to name the type, got "${error}"`);
    }

    // Cleanup.
    await db.delete(jobs).where(eq(jobs.id, inserted.id));
  }

  console.log("\nAll six not_implemented handlers failed loudly, as expected.");
  process.exit(0);
}

main().catch((err) => {
  console.error("not_implemented handlers test FAILED:", err);
  process.exit(1);
});
