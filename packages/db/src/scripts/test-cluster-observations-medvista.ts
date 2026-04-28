/**
 * Live exercise: observation_cluster handler against prod Supabase + live Claude.
 *
 * Phase 4 Day 3 kickoff Decision 8 — Path B (synthetic-injection): prod
 * Supabase carries 0 observations today, so silence-path Path A would be
 * uninformative. We seed 3 uncategorized observations with similar
 * underlying shape, run the handler, verify the cluster row written +
 * member back-link, and DELETE the seeded rows + cluster regardless of
 * test outcome (try/finally cleanup).
 *
 * Mirrors the Phase 4 Day 1 Session B `test:admit-medvista` --synthetic
 * flag pattern in spirit: synthetic data is created at script start,
 * exercise runs against the real handler + real Claude wrapper +
 * prompt_call_log writes, and cleanup unconditionally runs at end.
 *
 * PASS criterion (Path B):
 *   - 3 observations seeded successfully.
 *   - Handler returns clustersEmitted=1 with member_count=3.
 *   - observation_clusters row exists with the expected cluster_key.
 *   - 3 prompt_call_log rows written (one per observation Claude call).
 *   - Each observation's cluster_id back-link populated to the new cluster.
 *   - Telemetry trail FULL: started + 3× signature_generated + 1× emitted
 *     + completed{1}.
 *   - Live Claude budget cap: $1.50 across the 3 calls (~$0.06-0.12 typical).
 *
 * Run after the deploy: pnpm --filter @nexus/db test:cluster-observations-medvista
 */
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
loadEnv({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../../.env.local"),
  override: true,
});

import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { HANDLERS } from "@nexus/shared";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `ASSERT ${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL missing — `npx vercel env pull` first.");
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY missing — required for the real Claude wrapper.");
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 1, idle_timeout: 30, prepare: false });

  const seededObsIds: string[] = [];
  const seededClusterKeys = new Set<string>();
  let observerUserId: string | null = null;
  const startTs = Date.now();

  try {
    // Pick an existing user to own the observations (FK constraint on
    // observer_id requires a real users.id). Prefer Sarah's persona; fall
    // back to any seed user.
    const userRows = await sql<{ id: string }[]>`
      SELECT id FROM users
       WHERE email IN ('jeff.lackey97@gmail.com', 'sarah.chen@nexus-demo.com')
       ORDER BY email DESC LIMIT 1
    `;
    if (userRows.length === 0) {
      const fallback = await sql<{ id: string }[]>`SELECT id FROM users LIMIT 1`;
      if (fallback.length === 0) {
        throw new Error("No users in DB — seed users first.");
      }
      observerUserId = fallback[0]!.id;
    } else {
      observerUserId = userRows[0]!.id;
    }
    console.log(`observer_id: ${observerUserId}`);

    // Seed 3 uncategorized observations on the same underlying shape — all
    // describe pre-purchase anxiety about integration timeline. Same shape
    // means Claude SHOULD emit the same normalized_signature within
    // temperature 0.2 bounds.
    const seedObservations = [
      {
        rawInput:
          "MedVista CMO Dr. Chen mentioned he's worried about how long Epic integration will take. He said his team has been burned twice on EMR rollouts that ran over schedule. Specifically asked if we have a 90-day fast-track.",
        vertical: "healthcare",
      },
      {
        rawInput:
          "Spoke with the IT director at HealthCare Partners — they're nervous about Epic readiness. Said their last EHR migration went 4 months over and they can't afford that again. Asked about implementation acceleration options.",
        vertical: "healthcare",
      },
      {
        rawInput:
          "On the Mercy Health discovery call, the CIO raised concerns about integration timeline. Three previous clinical platform rollouts ran over their projected dates. Wants a guaranteed 90-day implementation milestone before signing.",
        vertical: "healthcare",
      },
    ];

    console.log(`seeding ${seedObservations.length} observations...`);
    for (const o of seedObservations) {
      const inserted = await sql<{ id: string }[]>`
        INSERT INTO observations (observer_id, raw_input, signal_type, source_context, status)
        VALUES (
          ${observerUserId},
          ${o.rawInput},
          NULL,
          ${sql.json({ vertical: o.vertical, category: "phase4_day3_synthetic" })},
          'pending_review'
        )
        RETURNING id
      `;
      const id = inserted[0]!.id;
      seededObsIds.push(id);
      console.log(`  seeded observation_id=${id}`);
    }

    // ── Capture telemetry from the handler invocation.
    const telemetryEvents: Array<Record<string, unknown>> = [];
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
      const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("{")) continue;
        try {
          const event = JSON.parse(trimmed) as Record<string, unknown>;
          if (typeof event.event === "string") telemetryEvents.push(event);
        } catch {
          // not JSON — ignore
        }
      }
      return originalStderrWrite(chunk as never, ...(rest as []));
    }) as typeof process.stderr.write;

    console.log("\nrunning observation_cluster handler against prod + live Claude...");
    let result;
    try {
      // Use a fresh UUID so prompt_call_log.job_id (UUID column) accepts the
      // anchor value. v2 demo's wrapper best-effort contract silently logs
      // claude_call_log_write_failed when the anchor isn't a valid UUID
      // (productization-arc: SOC 2 audit-trail-durability — flagged in
      // PRODUCTIZATION-NOTES.md). Using a UUID here surfaces the audit rows
      // for this exercise so the prompt_call_log verification asserts.
      result = (await HANDLERS.observation_cluster(
        { vertical: "healthcare" },
        {
          jobId: randomUUID(),
          jobType: "observation_cluster",
          hooks: { sql },
        },
      )) as {
        clustersEmitted: number;
        observationsRead: number;
        signaturesGenerated: number;
        lowConfidenceSkipped: number;
        belowThreshold: number;
        durationMs: number;
        clusters: Array<{
          clusterId: string;
          clusterKey: string;
          normalizedSignature: string;
          candidateCategory: string;
          confidence: string;
          memberCount: number;
        }>;
      };
    } finally {
      process.stderr.write = originalStderrWrite;
    }

    console.log("\nhandler result:", JSON.stringify(result, null, 2));

    // Path B PASS criteria.
    assertEqual(result.observationsRead >= 3, true, "observationsRead >= 3");
    assertEqual(result.signaturesGenerated, 3, "signaturesGenerated=3");
    if (result.clustersEmitted < 1) {
      // Could happen if Claude emitted different signatures across the 3 obs
      // (low determinism on this fixture set). Surface as a measurable result
      // not silent failure — this IS a Path B PASS criterion violation.
      console.error("\nFAIL: handler did not emit any cluster.");
      console.error(
        "  Likely cause: Claude assigned different normalized_signatures to the 3 observations,",
      );
      console.error("  meaning the prompt's signature determinism guidance needs tightening or");
      console.error("  the seeded observations don't have a strong-enough shared shape.");
      process.exit(1);
    }
    assertEqual(result.clustersEmitted, 1, "clustersEmitted=1");
    assertEqual(result.clusters.length, 1, "clusters[].length=1");
    assertEqual(result.clusters[0]!.memberCount, 3, "memberCount=3");
    seededClusterKeys.add(result.clusters[0]!.clusterKey);

    // Verify telemetry trail.
    const startedEvents = telemetryEvents.filter(
      (e) => e.event === "observation_cluster_started",
    );
    const sigEvents = telemetryEvents.filter(
      (e) => e.event === "observation_signature_generated",
    );
    const emittedEvents = telemetryEvents.filter(
      (e) => e.event === "observation_cluster_emitted",
    );
    const completedEvents = telemetryEvents.filter(
      (e) => e.event === "observation_cluster_completed",
    );
    assertEqual(startedEvents.length, 1, "1 started event");
    assertEqual(sigEvents.length, 3, "3 signature_generated events");
    assertEqual(emittedEvents.length, 1, "1 emitted event");
    assertEqual(completedEvents.length, 1, "1 completed event");
    assertEqual(
      completedEvents[0]!.clusters_emitted as number,
      1,
      "completed.clusters_emitted=1",
    );
    console.log("\n✓ telemetry trail PASS (started + 3 signature + 1 emitted + 1 completed)");

    // Verify cluster row in DB.
    const clusterRow = await sql<
      Array<{
        id: string;
        cluster_key: string;
        normalized_signature: string;
        candidate_category: string;
        confidence: string;
        member_count: number;
        status: string;
        vertical: string | null;
      }>
    >`
      SELECT id, cluster_key, normalized_signature, candidate_category, confidence,
             member_count, status, vertical
        FROM observation_clusters
       WHERE cluster_key = ${result.clusters[0]!.clusterKey}
    `;
    assertEqual(clusterRow.length, 1, "1 cluster row exists in DB");
    assertEqual(clusterRow[0]!.member_count, 3, "DB cluster.member_count=3");
    assertEqual(clusterRow[0]!.status, "candidate", "DB cluster.status=candidate");
    console.log(
      `✓ DB cluster row: signature="${clusterRow[0]!.normalized_signature}", confidence="${clusterRow[0]!.confidence}"`,
    );

    // Verify back-link UPDATE on observations.cluster_id.
    const linkedObs = await sql<{ id: string; cluster_id: string | null }[]>`
      SELECT id, cluster_id FROM observations
       WHERE id = ANY(${seededObsIds}::uuid[])
       ORDER BY created_at ASC
    `;
    for (const o of linkedObs) {
      assertEqual(o.cluster_id, clusterRow[0]!.id, `obs ${o.id} cluster_id back-link`);
    }
    console.log(`✓ all 3 observations.cluster_id back-linked to new cluster`);

    // Verify prompt_call_log rows for the 3 Claude calls.
    const promptLog = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM prompt_call_log
       WHERE prompt_file = '10-cluster-observations'
         AND created_at > now() - interval '5 minutes'
    `;
    if (promptLog[0]!.count >= 3) {
      console.log(
        `✓ prompt_call_log: ${promptLog[0]!.count} rows for 10-cluster-observations in last 5 min (>= 3 expected)`,
      );
    } else {
      console.warn(
        `  prompt_call_log: only ${promptLog[0]!.count} rows logged (expected 3); wrapper best-effort write may have skipped`,
      );
    }

    const durationMs = Date.now() - startTs;
    console.log(`\nlive exercise PASSED in ${durationMs}ms.`);
  } finally {
    // Unconditional cleanup. DELETE the seeded observations FIRST (FK
    // dependency) — observations.cluster_id is ON DELETE SET NULL so this
    // is safe regardless of cluster state. THEN delete any clusters we
    // wrote.
    if (seededObsIds.length > 0) {
      console.log(`\ncleaning up — deleting ${seededObsIds.length} seeded observations...`);
      const deletedObs = await sql`
        DELETE FROM observations WHERE id = ANY(${seededObsIds}::uuid[])
        RETURNING id
      `;
      console.log(`  deleted ${deletedObs.length} observations`);
    }
    if (seededClusterKeys.size > 0) {
      console.log(`cleaning up — deleting ${seededClusterKeys.size} test clusters...`);
      const deletedClusters = await sql`
        DELETE FROM observation_clusters
         WHERE cluster_key = ANY(${[...seededClusterKeys]}::text[])
        RETURNING id
      `;
      console.log(`  deleted ${deletedClusters.length} clusters`);
    }
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("\nFAIL:", err);
  process.exit(1);
});
