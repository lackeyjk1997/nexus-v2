/**
 * Live coordinator_synthesis exercise — Phase 4 Day 2 Session A verification.
 *
 * Invokes HANDLERS.coordinator_synthesis against prod Supabase scoped to
 * vertical=healthcare. Today MedVista is the only seeded deal carrying
 * signal_detected events; expected outcome per kickoff Item 3 silence
 * path:
 *
 *   - patterns_emitted = 0 (no group meets minDealsAffected=2 — every
 *     signal type belongs to a single deal)
 *   - Telemetry trail FULL:
 *       coordinator_synthesis_started → pattern_below_threshold (one
 *       per healthcare signal-type group MedVista carries) →
 *       coordinator_synthesis_completed with patterns_emitted=0
 *
 * The PASS criterion per Decision 10's spirit: a patterns_emitted=0
 * outcome with MISSING telemetry events is silent failure (system bailed
 * before evaluating threshold). This script parses stderr JSON and
 * asserts the expected event sequence is present, not just that no
 * patterns were written.
 *
 * If a future seed adds a second deal with overlapping healthcare
 * signals, the script auto-PASSes via the live-Claude path: ≥1
 * pattern row written + pattern_detected telemetry event present.
 *
 * Cost ceiling per kickoff Decision 7: up to 5 live Claude calls; ~$0.50
 * cap. Today's silence path costs $0 live Claude.
 *
 * Usage:
 *   pnpm --filter @nexus/db exec tsx src/scripts/test-coordinator-synthesis-medvista.ts
 *
 * Env: requires .env.local with DATABASE_URL + ANTHROPIC_API_KEY.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const here = fileURLToPath(import.meta.url);
loadEnv({
  path: resolve(here, "../../../../../.env.local"),
  override: true,
});

import postgres from "postgres";

import { HANDLERS } from "@nexus/shared";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERT: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `ASSERT ${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

// ── Telemetry capture ─────────────────────────────────────────────────

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
      // not JSON
    }
  }
  return originalStderrWrite(chunk as never, ...(rest as []));
}) as typeof process.stderr.write;

function eventsOfType(name: string): Array<Record<string, unknown>> {
  return telemetryEvents.filter((e) => e.event === name);
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set");
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }

  console.log(`Live coordinator_synthesis-medvista — Phase 4 Day 2 Session A\n`);

  const sql = postgres(dbUrl, { max: 1, prepare: false, idle_timeout: 30 });

  try {
    // ── Pre-state read: MedVista's healthcare signal_detected events
    //    grouped by signal_type → distinct deal count. Used to predict
    //    how many pattern_below_threshold events we expect.
    const groups = await sql<Array<{ signal_type: string; deal_count: number }>>`
      SELECT
        payload->'signal'->>'signal_type' AS signal_type,
        COUNT(DISTINCT hubspot_deal_id)::int AS deal_count
       FROM deal_events
       WHERE type = 'signal_detected'
         AND created_at > now() - interval '30 days'
         AND event_context->>'vertical' = 'healthcare'
         AND event_context->>'vertical' IS NOT NULL
         AND payload->'signal'->>'signal_type' IS NOT NULL
       GROUP BY 1
       ORDER BY 2 DESC, 1 ASC
    `;
    console.log(`Pre-state — healthcare signal-type groups in last 30 days:`);
    for (const g of groups) {
      console.log(`  ${g.signal_type}: ${g.deal_count} deal(s)`);
    }
    const groupsAtOrAboveThreshold = groups.filter((g) => g.deal_count >= 2);
    const groupsBelowThreshold = groups.filter((g) => g.deal_count < 2);
    console.log(
      `\nGroups at/above threshold (≥2 deals): ${groupsAtOrAboveThreshold.length}`,
    );
    console.log(`Groups below threshold (<2 deals): ${groupsBelowThreshold.length}`);

    const patternsBefore = await sql<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM coordinator_patterns
       WHERE vertical = 'healthcare'
    `;
    console.log(`coordinator_patterns rows for vertical=healthcare BEFORE: ${patternsBefore[0]!.count}`);

    // ── Invoke handler ────────────────────────────────────────────────
    console.log(`\n── Invoking coordinator_synthesis handler (scoped to healthcare) ──`);
    const result = (await HANDLERS.coordinator_synthesis(
      { vertical: "healthcare" },
      {
        jobId: "live-medvista-test",
        jobType: "coordinator_synthesis",
        hooks: { sql },
      },
    )) as {
      patternsEmitted: number;
      groupsEvaluated: number;
      groupsAboveThreshold: number;
      signalsRead: number;
      durationMs: number;
    };

    console.log(`\nHandler result:`);
    console.log(`  patternsEmitted: ${result.patternsEmitted}`);
    console.log(`  groupsEvaluated: ${result.groupsEvaluated}`);
    console.log(`  groupsAboveThreshold: ${result.groupsAboveThreshold}`);
    console.log(`  signalsRead: ${result.signalsRead}`);
    console.log(`  durationMs: ${result.durationMs}`);

    // ── Verification ──────────────────────────────────────────────────
    const startedEvents = eventsOfType("coordinator_synthesis_started");
    const completedEvents = eventsOfType("coordinator_synthesis_completed");
    const belowEvents = eventsOfType("pattern_below_threshold");
    const detectedEvents = eventsOfType("pattern_detected");

    console.log(`\nTelemetry trail observed:`);
    console.log(`  coordinator_synthesis_started: ${startedEvents.length}`);
    console.log(`  pattern_below_threshold:       ${belowEvents.length}`);
    console.log(`  pattern_detected:              ${detectedEvents.length}`);
    console.log(`  coordinator_synthesis_completed: ${completedEvents.length}`);

    // FULL telemetry trail discipline — Item 3 silence-path PASS criterion.
    assertEqual(startedEvents.length, 1, "exactly 1 coordinator_synthesis_started event");
    assertEqual(completedEvents.length, 1, "exactly 1 coordinator_synthesis_completed event");
    assertEqual(
      result.groupsEvaluated,
      groups.length,
      "groupsEvaluated matches pre-state group count",
    );

    if (result.patternsEmitted === 0) {
      // Silence path — every group must have emitted pattern_below_threshold.
      console.log(`\n→ Silence path verification (patterns_emitted=0)`);
      assertEqual(
        belowEvents.length,
        groupsBelowThreshold.length,
        "pattern_below_threshold fired for every sub-threshold group",
      );
      assertEqual(detectedEvents.length, 0, "no pattern_detected events");
      assertEqual(
        completedEvents[0]!.patterns_emitted,
        0,
        "completed.patterns_emitted=0",
      );
      console.log(`✓ FULL telemetry trail proven for silence path:`);
      console.log(`  started → ${belowEvents.length} pattern_below_threshold → completed{patterns_emitted=0}`);
    } else {
      // Live Claude path — at least 1 pattern_detected event + DB write.
      console.log(`\n→ Live Claude path verification (patterns_emitted=${result.patternsEmitted})`);
      assert(detectedEvents.length >= 1, "at least 1 pattern_detected event");
      assertEqual(
        detectedEvents.length,
        result.patternsEmitted,
        "pattern_detected count matches patternsEmitted",
      );
      const patternsAfter = await sql<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count FROM coordinator_patterns
         WHERE vertical = 'healthcare'
      `;
      const delta = patternsAfter[0]!.count - patternsBefore[0]!.count;
      console.log(`  coordinator_patterns delta (healthcare): +${delta}`);
      assert(delta >= 1, "at least 1 new pattern row written to coordinator_patterns");
      console.log(`✓ Live Claude path: ${result.patternsEmitted} pattern(s) written + telemetry trail complete`);
    }

    console.log(`\n── PHASE 4 DAY 2 SESSION A live exercise: PASS ──`);
  } finally {
    await sql.end({ timeout: 5 });
    process.stderr.write = originalStderrWrite;
  }
}

main().catch((err) => {
  process.stderr.write = originalStderrWrite;
  console.error("\ntest-coordinator-synthesis-medvista FAILED:", err);
  process.exit(1);
});
