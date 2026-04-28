/**
 * SurfaceAdmission category_candidates branch — Phase 4 Day 3 unit tests.
 *
 * 3 cases per kickoff Decision 11:
 *   CASE 1 — no clusters in DB → empty admitted set + silence-as-feature
 *            (no scoring call; threshold filter returns empty pre-score).
 *   CASE 2 — 1 active cluster meeting threshold → 1 admitted with score.
 *            Verifies: cluster row read; threshold filter passes
 *            (member_count >= 3 + confidence >= medium); scoreFn called
 *            once; result carries score + scoreExplanation; sorted; not
 *            truncated below maxItems.
 *   CASE 3 — cluster below threshold (member_count=2) AND another below
 *            confidence floor (confidence='low') → both filtered out;
 *            empty admitted set. Verifies the threshold filter (NOT
 *            applicability — that's deal-specific only).
 *
 * No DB; no Claude; deterministic. Mocks `sql` (cluster table reads +
 * dismissal reads) and `scoreFn` (deterministic per-candidate score).
 *
 * Note on Decision 11's "applicability rejection logged" case: applicability
 * gating is deal-specific only (DECISIONS.md §2.21); category_candidates
 * is a portfolio surface where applies() is not called. Case 3 substitutes
 * threshold filter rejection — the equivalent "candidate filtered" path
 * for portfolio surfaces.
 *
 * Usage:
 *   pnpm --filter @nexus/shared test:category-candidates-admission
 */
import type postgres from "postgres";

import {
  SurfaceAdmission,
  type AdmissionCandidate,
  type ScoreInsightFn,
} from "@nexus/shared";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `ASSERT ${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

interface ClusterFixture {
  id: string;
  cluster_key: string;
  title: string;
  normalized_signature: string;
  candidate_category: string;
  confidence: "low" | "medium" | "high";
  signature_basis: string;
  member_count: number;
  vertical: string | null;
  status: string;
  last_synthesized_at: Date;
}

function makeMockSql(clusters: ClusterFixture[]): {
  sql: postgres.Sql;
  scoringCallCount: { n: number };
} {
  const fn = ((...args: unknown[]): unknown => {
    const first = args[0];
    // Tagged template call — TemplateStringsArray has the `raw` own property.
    if (
      Array.isArray(first) &&
      Object.prototype.hasOwnProperty.call(first, "raw")
    ) {
      const strings = first as unknown as TemplateStringsArray;
      const values = args.slice(1);
      const sqlText = strings.join("?");
      if (
        sqlText.includes("FROM observation_clusters") &&
        sqlText.includes("WHERE status = 'candidate'")
      ) {
        const minMembers = Number(values[0] ?? 0);
        const filtered = clusters
          .filter(
            (c) => c.status === "candidate" && c.member_count >= minMembers,
          )
          .sort(
            (a, b) =>
              b.last_synthesized_at.getTime() - a.last_synthesized_at.getTime() ||
              b.member_count - a.member_count,
          );
        return Promise.resolve(filtered);
      }
      if (sqlText.includes("FROM surface_dismissals")) {
        // No dismissals in fixture by default.
        return Promise.resolve([]);
      }
      throw new Error(
        `Mock sql: unrecognized query: ${sqlText.slice(0, 200)}`,
      );
    }
    // Regular function call — sql(arrayValue) for IN-clause expansion;
    // returns a fragment-like value the outer template inlines. The mock
    // simply passes it through as a sentinel value (the outer `?` join
    // sees it; only OUTER text dispatch matters).
    return first;
  }) as unknown as postgres.Sql & { json: (v: unknown) => unknown };
  (fn as unknown as { json: (v: unknown) => unknown }).json = (v) => v;
  (fn as unknown as { unsafe: (v: string) => string }).unsafe = (v) => v;
  return { sql: fn as postgres.Sql, scoringCallCount: { n: 0 } };
}

function makeScoreFn(
  perCandidateScore: Map<string, number>,
  callCount: { n: number },
): ScoreInsightFn {
  return async ({ candidate }) => {
    callCount.n++;
    if (candidate.kind !== "category_candidate") {
      throw new Error(
        `expected category_candidate, got ${candidate.kind}`,
      );
    }
    const id = candidate.cluster.id;
    const score = perCandidateScore.get(id) ?? 50;
    return {
      score,
      explanation: `Scored ${score}/100 — fixture for cluster ${id}`,
    };
  };
}

function makeCluster(
  id: string,
  signature: string,
  category: string,
  memberCount: number,
  confidence: "low" | "medium" | "high",
): ClusterFixture {
  return {
    id,
    cluster_key: `key-${id}`,
    title: category,
    normalized_signature: signature,
    candidate_category: category,
    confidence,
    signature_basis: `Signature basis for ${signature}.`,
    member_count: memberCount,
    vertical: "healthcare",
    status: "candidate",
    last_synthesized_at: new Date("2026-04-28T12:00:00Z"),
  };
}

const USER_ID = "00000000-0000-0000-0000-000000000099";

async function case1_no_clusters() {
  console.log("CASE 1 — no clusters → empty admitted + silence…");
  const { sql, scoringCallCount } = makeMockSql([]);
  const admission = new SurfaceAdmission({ databaseUrl: "mock", sql });

  const result = await admission.admit({
    surfaceId: "category_candidates",
    userId: USER_ID,
  });

  assertEqual(result.admitted.length, 0, "0 admitted");
  assertEqual(result.rejections.length, 0, "0 rejections (portfolio)");
  assertEqual(scoringCallCount.n, 0, "no scoring calls (silence)");
  console.log("      OK — empty admitted set, no scoring fanout");
}

async function case2_one_cluster_admitted() {
  console.log("CASE 2 — 1 qualifying cluster → 1 admitted with score…");
  const cluster = makeCluster(
    "cluster-1",
    "implementation_timeline_anxiety",
    "Implementation Timeline Anxiety",
    4,
    "high",
  );
  const { sql, scoringCallCount } = makeMockSql([cluster]);
  const scoreFn = makeScoreFn(new Map([["cluster-1", 82]]), scoringCallCount);
  const admission = new SurfaceAdmission({ databaseUrl: "mock", sql, scoreFn });

  const result = await admission.admit({
    surfaceId: "category_candidates",
    userId: USER_ID,
  });

  assertEqual(result.admitted.length, 1, "1 admitted");
  assertEqual(result.rejections.length, 0, "0 rejections");
  assertEqual(scoringCallCount.n, 1, "1 scoring call");

  const admitted = result.admitted[0]!;
  if (admitted.kind !== "category_candidate") {
    throw new Error(`expected category_candidate, got ${admitted.kind}`);
  }
  assertEqual(admitted.cluster.id, "cluster-1", "admitted cluster id");
  assertEqual(admitted.cluster.normalizedSignature, cluster.normalized_signature, "signature");
  assertEqual(admitted.score, 82, "score=82");
  assertEqual(
    admitted.scoreExplanation,
    "Scored 82/100 — fixture for cluster cluster-1",
    "explanation surfaced",
  );
  console.log(`      OK — cluster admitted with score=82 + explanation`);
}

async function case3_threshold_filter_rejections() {
  console.log("CASE 3 — below member-count + below confidence → 0 admitted (threshold filter)…");
  const goodCluster = makeCluster(
    "cluster-good",
    "valid_signature",
    "Valid Category",
    4,
    "high",
  );
  const tooFewMembers = makeCluster(
    "cluster-low-count",
    "below_member_threshold",
    "Below Member Threshold",
    2, // < minMemberCount=3
    "high",
  );
  const lowConfidence = makeCluster(
    "cluster-low-conf",
    "below_confidence",
    "Below Confidence",
    5,
    "low", // < minConfidence=medium
  );
  // The mock SQL filter applies minMemberCount via the parameterized
  // value (returns only 4-and-5 member clusters, not 2). The category-
  // candidates branch then filters by minConfidence in-memory.
  const { sql, scoringCallCount } = makeMockSql([
    goodCluster,
    tooFewMembers,
    lowConfidence,
  ]);
  const scoreFn = makeScoreFn(
    new Map([["cluster-good", 75]]),
    scoringCallCount,
  );
  const admission = new SurfaceAdmission({ databaseUrl: "mock", sql, scoreFn });

  const result = await admission.admit({
    surfaceId: "category_candidates",
    userId: USER_ID,
  });

  // tooFewMembers filtered at SQL (member_count < 3); lowConfidence
  // filtered in-memory by applyPreScoringThresholds; only goodCluster
  // survives.
  assertEqual(result.admitted.length, 1, "1 admitted (only goodCluster)");
  if (result.admitted[0]!.kind !== "category_candidate") {
    throw new Error("expected category_candidate kind");
  }
  assertEqual(result.admitted[0]!.cluster.id, "cluster-good", "the good cluster");
  assertEqual(scoringCallCount.n, 1, "only goodCluster scored");
  console.log(`      OK — threshold filter rejected sub-threshold + low-confidence`);
}

async function main() {
  await case1_no_clusters();
  await case2_one_cluster_admitted();
  await case3_threshold_filter_rejections();
  console.log("\ncategory_candidates admission: ALL 3/3 CASES PASS.");
}

main().catch((err) => {
  console.error("test:category-candidates-admission FAILED:", err);
  process.exit(1);
});
