/**
 * Concurrent-claim test — proves FOR UPDATE SKIP LOCKED works.
 *
 * Inserts two queued noop jobs, then fires two worker HTTP requests in
 * parallel. Asserts each worker claimed a different job (no double-claim,
 * no lost job) and both jobs ended succeeded.
 *
 * Usage:
 *   pnpm --filter @nexus/db test:concurrent
 *
 * Defaults to http://localhost:3001. Override with WORKER_URL env.
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { inArray } from "drizzle-orm";
import { createDb, jobs } from "../index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env.local") });

const baseUrl = process.env.WORKER_URL ?? "http://localhost:3001";
const workerUrl = `${baseUrl.replace(/\/$/, "")}/api/jobs/worker`;
const cronSecret = process.env.CRON_SECRET!;
const db = createDb(process.env.DIRECT_URL!);

async function main() {
  console.log(`Testing concurrent claim against ${workerUrl}`);

  // 1. Insert two queued noop jobs.
  const inserted = await db
    .insert(jobs)
    .values([
      { type: "noop", input: { tag: "concurrent-1" }, status: "queued" },
      { type: "noop", input: { tag: "concurrent-2" }, status: "queued" },
    ])
    .returning({ id: jobs.id });
  const ids = inserted.map((j) => j.id);
  console.log(`[setup] inserted two queued jobs: ${ids.join(", ")}`);

  // 2. Fire two worker requests in parallel.
  const headers = { Authorization: `Bearer ${cronSecret}` };
  const start = Date.now();
  const responses = await Promise.all([
    fetch(workerUrl, { headers }),
    fetch(workerUrl, { headers }),
  ]);
  const bodies = await Promise.all(responses.map((r) => r.json()));
  console.log(`[parallel] both workers returned in ${Date.now() - start}ms`);
  console.log("  worker 1 →", bodies[0]);
  console.log("  worker 2 →", bodies[1]);

  // 3. Assertions.
  const [b1, b2] = bodies as Array<{ jobId?: string; status?: string } | undefined>;
  if (!b1?.jobId || !b2?.jobId) {
    throw new Error(`one or both workers didn't claim a job: ${JSON.stringify(bodies)}`);
  }
  if (b1.jobId === b2.jobId) {
    throw new Error(`DOUBLE-CLAIM: both workers claimed the same job ${b1.jobId}`);
  }
  const claimedSet = new Set([b1.jobId, b2.jobId]);
  for (const id of ids) {
    if (!claimedSet.has(id)) {
      throw new Error(`job ${id} was inserted but neither worker claimed it`);
    }
  }
  console.log("  ✓ each worker claimed a different pre-inserted job");
  if (b1.status !== "succeeded" || b2.status !== "succeeded") {
    throw new Error(`both workers should have succeeded; got ${b1.status}, ${b2.status}`);
  }

  // 4. Final DB state.
  const finals = await db
    .select({ id: jobs.id, status: jobs.status, attempts: jobs.attempts })
    .from(jobs)
    .where(inArray(jobs.id, ids));
  for (const f of finals) {
    if (f.status !== "succeeded") {
      throw new Error(`job ${f.id} ended with status=${f.status}, attempts=${f.attempts}`);
    }
  }
  console.log("  ✓ both jobs in DB have status=succeeded");

  // 5. Cleanup.
  await db.delete(jobs).where(inArray(jobs.id, ids));
  console.log("[teardown] deleted test jobs");
  console.log("");
  console.log("Concurrent-claim test PASSED.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Concurrent-claim test FAILED:", err);
  process.exit(1);
});
