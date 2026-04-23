/**
 * MEDDPICC prompt-formatter byte-identical gate — Phase 3 Day 3 Session A.
 *
 * Pure-function verification of `formatMeddpiccBlock` (the extracted formatter
 * that DealIntelligence.formatMeddpiccForPrompt delegates to). Proves the
 * refactor from handlers.ts:275-288 inline-block to the shared function is
 * byte-identical against frozen fixtures covering the four observable states:
 *
 *   Fixture A: null row (no MEDDPICC captured yet) → "(none)"
 *   Fixture B: all 8 dims null-scored (row exists, nothing scored yet)
 *              → 8 "- {dim}: not yet captured" lines
 *   Fixture C: mixed (2 dims with full evidence + confidence, 6 null)
 *              → 2 populated lines interleaved with 6 "not yet captured"
 *   Fixture D: populated dim missing evidence_text / last_updated / confidence
 *              → "(no evidence)" / "—" / "—" fallback tokens verified
 *
 * Any edit to `formatMeddpiccBlock` requires updating the frozen expected
 * strings in this script to match; the script is the drift canary that
 * catches accidental formatter divergence across future Day-3+ sessions.
 *
 * No DB, no env, no Anthropic API. Free to run.
 *
 * Usage:
 *   pnpm --filter @nexus/shared test:meddpicc-format
 */
import {
  formatMeddpiccBlock,
  type MeddpiccPromptRow,
} from "@nexus/shared";

let failures = 0;

function check(name: string, actual: string, expected: string): void {
  if (actual === expected) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}`);
    console.log("    EXPECTED:");
    console.log(expected.split("\n").map((l) => `      ${l}`).join("\n"));
    console.log("    ACTUAL:");
    console.log(actual.split("\n").map((l) => `      ${l}`).join("\n"));
  }
}

// ───── Fixture A: null row ─────────────────────────────────────────────
console.log("Fixture A — null row (no MEDDPICC captured yet)");
check(
  "null row → (none)",
  formatMeddpiccBlock(null),
  "(none)",
);

// ───── Fixture B: row exists, all 8 dims null-scored ───────────────────
const fixtureB: MeddpiccPromptRow = {
  metrics_score: null,
  economic_buyer_score: null,
  decision_criteria_score: null,
  decision_process_score: null,
  paper_process_score: null,
  identify_pain_score: null,
  champion_score: null,
  competition_score: null,
  overall_score: null,
  per_dimension_confidence: null,
  evidence: null,
};
const expectedB = [
  "- metrics: not yet captured",
  "- economic_buyer: not yet captured",
  "- decision_criteria: not yet captured",
  "- decision_process: not yet captured",
  "- paper_process: not yet captured",
  "- identify_pain: not yet captured",
  "- champion: not yet captured",
  "- competition: not yet captured",
].join("\n");
console.log("\nFixture B — row exists, 8 dims all null");
check("all 8 dims not-yet-captured", formatMeddpiccBlock(fixtureB), expectedB);

// ───── Fixture C: mixed (2 dims populated, 6 null) ─────────────────────
const fixtureC: MeddpiccPromptRow = {
  metrics_score: 80,
  economic_buyer_score: null,
  decision_criteria_score: null,
  decision_process_score: null,
  paper_process_score: 65,
  identify_pain_score: null,
  champion_score: null,
  competition_score: null,
  overall_score: 73,
  per_dimension_confidence: {
    metrics: 0.85,
    paper_process: 0.7,
  },
  evidence: {
    metrics: {
      evidence_text: "Saving $2M/year on claims processing",
      last_updated: "2026-04-20",
    },
    paper_process: {
      evidence_text: "Legal review pending until Friday",
      last_updated: "2026-04-21",
    },
  },
};
const expectedC = [
  "- metrics: Saving $2M/year on claims processing (score: 80, confidence: 85%, last_updated: 2026-04-20)",
  "- economic_buyer: not yet captured",
  "- decision_criteria: not yet captured",
  "- decision_process: not yet captured",
  "- paper_process: Legal review pending until Friday (score: 65, confidence: 70%, last_updated: 2026-04-21)",
  "- identify_pain: not yet captured",
  "- champion: not yet captured",
  "- competition: not yet captured",
].join("\n");
console.log("\nFixture C — 2 dims populated with full evidence+confidence, 6 null");
check("mixed populated + null", formatMeddpiccBlock(fixtureC), expectedC);

// ───── Fixture D: populated dim missing evidence_text / last_updated / confidence ─
const fixtureD: MeddpiccPromptRow = {
  metrics_score: 50,
  economic_buyer_score: null,
  decision_criteria_score: null,
  decision_process_score: null,
  paper_process_score: null,
  identify_pain_score: null,
  champion_score: null,
  competition_score: null,
  overall_score: 50,
  // No confidence jsonb for metrics → confStr falls back to "—"
  per_dimension_confidence: {},
  // Evidence present but missing both inner keys → both fallbacks fire
  evidence: {
    metrics: {},
  },
};
const expectedD = [
  "- metrics: (no evidence) (score: 50, confidence: —, last_updated: —)",
  "- economic_buyer: not yet captured",
  "- decision_criteria: not yet captured",
  "- decision_process: not yet captured",
  "- paper_process: not yet captured",
  "- identify_pain: not yet captured",
  "- champion: not yet captured",
  "- competition: not yet captured",
].join("\n");
console.log("\nFixture D — populated dim missing inner evidence / confidence fields");
check("fallback tokens for missing fields", formatMeddpiccBlock(fixtureD), expectedD);

// ───── Summary ──────────────────────────────────────────────────────────
console.log("");
if (failures === 0) {
  console.log("PASS: 4/4 fixtures byte-identical against frozen expectations.");
  process.exit(0);
} else {
  console.log(`FAIL: ${failures} fixture(s) diverged from frozen expectations.`);
  console.log(
    "If this is an intentional formatter edit, update the frozen strings in this file to match.",
  );
  process.exit(1);
}
