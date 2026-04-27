/**
 * Applicability DSL + evaluator unit tests — Phase 4 Day 1 Session A.
 *
 * Verifies the locked Zod schema + the evaluator's clause-by-clause
 * semantics against fixture rules + fixture deal states. No DB; no
 * Claude; deterministic.
 *
 * Per Phase 4 Day 1 Session A kickoff Item 4 + Decision 4 (undefined
 * field = no gate). Each case asserts both the `pass` boolean AND the
 * `reasons[]` shape (rejection reasons cite the specific clause that
 * rejected; undefined clauses don't appear in reasons).
 *
 * Usage:
 *   pnpm --filter @nexus/shared test:applicability-dsl
 */
import {
  applies,
  ApplicabilityRuleSchema,
  parseApplicabilityRule,
  type ApplicabilityRule,
  type DealState,
  type EvaluatorEvent,
} from "@nexus/shared";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`ASSERT: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`ASSERT ${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────

const baseDealState: DealState = {
  hubspotDealId: "fixture-deal-001",
  vertical: "healthcare",
  stage: "discovery",
  amount: 250_000,
  dealSizeBand: "100k-500k",
  employeeCountBand: "200-1k",
  daysInStage: 14,
  daysSinceCreated: 30,
  closeStatus: "not_closed",
  meddpiccScores: {
    metrics: 60,
    economic_buyer: 70,
    decision_criteria: 50,
    decision_process: 45,
    paper_process: 30,
    identify_pain: 80,
    champion: 65,
    competition: 55,
  },
  openSignals: [
    {
      signalType: "competitive_intel",
      detectedAt: new Date("2026-04-26T00:00:00Z"),
      sourceRef: "fixture:sig:001",
    },
    {
      signalType: "process_friction",
      detectedAt: new Date("2026-04-26T01:00:00Z"),
      sourceRef: "fixture:sig:002",
    },
  ],
  activeExperimentAssignments: [],
};

const competitiveSignalEvent: EvaluatorEvent = {
  type: "signal_detected",
  signalType: "competitive_intel",
  createdAt: new Date("2026-04-26T00:00:00Z"),
};

const processFrictionSignalEvent: EvaluatorEvent = {
  type: "signal_detected",
  signalType: "process_friction",
  createdAt: new Date("2026-04-26T01:00:00Z"),
};

const baseEventStream: EvaluatorEvent[] = [
  competitiveSignalEvent,
  processFrictionSignalEvent,
];

// ── Cases ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("Applicability DSL + evaluator — Phase 4 Day 1 Session A\n");
  let caseNum = 0;

  // [1] Empty rule → passes any deal state.
  caseNum++;
  console.log(`[${caseNum}] Empty rule passes (Decision 4: undefined = no gate)…`);
  {
    const rule: ApplicabilityRule = {};
    const result = applies({ rule, dealState: baseDealState, eventStream: baseEventStream });
    assertEqual(result.pass, true, "empty rule passes");
    assertEqual(result.reasons.length, 0, "empty rule has no reasons");
    console.log(`      OK — pass=true, reasons=[]`);
  }

  // [2] stages clause: discovery deal passes, proposal-only rule rejects.
  caseNum++;
  console.log(`[${caseNum}] stages clause…`);
  {
    const passRule: ApplicabilityRule = { stages: ["discovery", "technical_validation"] };
    const passResult = applies({
      rule: passRule,
      dealState: baseDealState,
      eventStream: baseEventStream,
    });
    assertEqual(passResult.pass, true, "discovery deal passes discovery+tech_val rule");

    const failRule: ApplicabilityRule = { stages: ["proposal", "negotiation"] };
    const failResult = applies({
      rule: failRule,
      dealState: baseDealState,
      eventStream: baseEventStream,
    });
    assertEqual(failResult.pass, false, "discovery deal rejects proposal+negotiation rule");
    assert(
      failResult.reasons.some((r) => r.includes("stage=discovery") && r.includes("requires stages")),
      "rejection reason cites stages clause",
    );
    console.log(`      OK — discovery deal: passes [disc,tv], rejects [prop,neg]`);
  }

  // [3] verticals clause: healthcare deal passes, manufacturing-only rule rejects.
  caseNum++;
  console.log(`[${caseNum}] verticals clause…`);
  {
    const passRule: ApplicabilityRule = { verticals: ["healthcare"] };
    const passResult = applies({
      rule: passRule,
      dealState: baseDealState,
      eventStream: baseEventStream,
    });
    assertEqual(passResult.pass, true, "healthcare deal passes healthcare rule");

    const failRule: ApplicabilityRule = { verticals: ["manufacturing", "retail"] };
    const failResult = applies({
      rule: failRule,
      dealState: baseDealState,
      eventStream: baseEventStream,
    });
    assertEqual(failResult.pass, false, "healthcare deal rejects manufacturing+retail rule");
    assert(
      failResult.reasons.some((r) => r.includes("vertical=healthcare")),
      "rejection reason cites verticals clause",
    );
    console.log(`      OK — healthcare deal: passes [healthcare], rejects [mfg,retail]`);
  }

  // [4] minDaysInStage / maxDaysInStage temporal clauses.
  caseNum++;
  console.log(`[${caseNum}] temporal clauses (min/maxDaysInStage)…`);
  {
    const passRule: ApplicabilityRule = { minDaysInStage: 7, maxDaysInStage: 30 };
    const passResult = applies({
      rule: passRule,
      dealState: baseDealState,
      eventStream: baseEventStream,
    });
    assertEqual(passResult.pass, true, "14d in stage passes [7..30]");

    const tooEarly: ApplicabilityRule = { minDaysInStage: 30 };
    const tooEarlyResult = applies({
      rule: tooEarly,
      dealState: baseDealState,
      eventStream: baseEventStream,
    });
    assertEqual(tooEarlyResult.pass, false, "14d in stage rejects min=30");
    assert(
      tooEarlyResult.reasons.some((r) => r.includes("daysInStage=14") && r.includes(">= 30")),
      "rejection cites minDaysInStage clause",
    );

    const tooLate: ApplicabilityRule = { maxDaysInStage: 7 };
    const tooLateResult = applies({
      rule: tooLate,
      dealState: baseDealState,
      eventStream: baseEventStream,
    });
    assertEqual(tooLateResult.pass, false, "14d in stage rejects max=7");
    assert(
      tooLateResult.reasons.some((r) => r.includes("daysInStage=14") && r.includes("<= 7")),
      "rejection cites maxDaysInStage clause",
    );
    console.log(`      OK — 14d in stage: passes [7..30], rejects min=30 + max=7`);
  }

  // [5] minDaysSinceCreated — implements §1.18 "48-hour observation window".
  caseNum++;
  console.log(`[${caseNum}] minDaysSinceCreated (§1.18 observation window)…`);
  {
    const tooNew: DealState = { ...baseDealState, daysSinceCreated: 1 };
    const rule: ApplicabilityRule = { minDaysSinceCreated: 2 };
    const result = applies({ rule, dealState: tooNew, eventStream: baseEventStream });
    assertEqual(result.pass, false, "1d-old deal rejects minDaysSinceCreated=2");
    assert(
      result.reasons.some((r) => r.includes("daysSinceCreated=1") && r.includes(">= 2")),
      "rejection cites minDaysSinceCreated clause",
    );
    console.log(`      OK — 1d-old deal rejects [minDaysSinceCreated=2]`);
  }

  // [6] requires (closeStatus): not_closed deal rejects closed_won-required rule.
  caseNum++;
  console.log(`[${caseNum}] requires (closeStatus) clause…`);
  {
    const rule: ApplicabilityRule = { requires: "closed_won" };
    const result = applies({ rule, dealState: baseDealState, eventStream: baseEventStream });
    assertEqual(result.pass, false, "not_closed deal rejects requires=closed_won");
    assert(
      result.reasons.some((r) => r.includes("closeStatus=not_closed")),
      "rejection cites requires clause",
    );
    console.log(`      OK — not_closed deal rejects [requires=closed_won]`);
  }

  // [7] meddpiccGuards clause: passes when score meets op/value, rejects otherwise.
  caseNum++;
  console.log(`[${caseNum}] meddpiccGuards clause…`);
  {
    const passRule: ApplicabilityRule = {
      meddpiccGuards: [{ dimension: "champion", op: "gte", value: 60 }],
    };
    const passResult = applies({
      rule: passRule,
      dealState: baseDealState,
      eventStream: baseEventStream,
    });
    assertEqual(passResult.pass, true, "champion=65 passes gte=60");

    const failRule: ApplicabilityRule = {
      meddpiccGuards: [{ dimension: "champion", op: "gte", value: 80 }],
    };
    const failResult = applies({
      rule: failRule,
      dealState: baseDealState,
      eventStream: baseEventStream,
    });
    assertEqual(failResult.pass, false, "champion=65 rejects gte=80");
    assert(
      failResult.reasons.some(
        (r) => r.includes("meddpicc.champion=65") && r.includes("gte 80"),
      ),
      "rejection cites meddpiccGuards clause",
    );

    // Unscored dim: should reject (conservative default per dsl.ts comment).
    const noScoreState: DealState = { ...baseDealState, meddpiccScores: {} };
    const unscoredResult = applies({
      rule: passRule,
      dealState: noScoreState,
      eventStream: baseEventStream,
    });
    assertEqual(unscoredResult.pass, false, "unscored champion rejects guard");
    assert(
      unscoredResult.reasons.some((r) =>
        r.includes("meddpicc.champion not yet captured"),
      ),
      "rejection cites unscored-dim path",
    );
    console.log(`      OK — champion=65: passes gte=60, rejects gte=80; unscored rejects`);
  }

  // [8] signalTypePresent / signalTypeAbsent.
  caseNum++;
  console.log(`[${caseNum}] signalTypePresent + signalTypeAbsent clauses…`);
  {
    const presentPass: ApplicabilityRule = { signalTypePresent: ["competitive_intel"] };
    const presentPassResult = applies({
      rule: presentPass,
      dealState: baseDealState,
      eventStream: baseEventStream,
    });
    assertEqual(presentPassResult.pass, true, "competitive_intel present in stream → passes");

    const presentFail: ApplicabilityRule = { signalTypePresent: ["deal_blocker"] };
    const presentFailResult = applies({
      rule: presentFail,
      dealState: baseDealState,
      eventStream: baseEventStream,
    });
    assertEqual(presentFailResult.pass, false, "deal_blocker absent → rejects presence rule");
    assert(
      presentFailResult.reasons.some((r) =>
        r.includes("type=deal_blocker") && r.includes("requires presence"),
      ),
      "rejection cites signalTypePresent clause",
    );

    const absentFail: ApplicabilityRule = { signalTypeAbsent: ["competitive_intel"] };
    const absentFailResult = applies({
      rule: absentFail,
      dealState: baseDealState,
      eventStream: baseEventStream,
    });
    assertEqual(absentFailResult.pass, false, "competitive_intel present → rejects absence rule");
    assert(
      absentFailResult.reasons.some((r) =>
        r.includes("type=competitive_intel") && r.includes("requires absence"),
      ),
      "rejection cites signalTypeAbsent clause",
    );
    console.log(
      `      OK — present[competitive_intel] passes; present[deal_blocker] rejects; absent[competitive_intel] rejects`,
    );
  }

  // [9] Multiple clauses AND-compose; multiple rejections produce multiple reasons.
  caseNum++;
  console.log(`[${caseNum}] multi-clause AND-composition + multi-reason rejection…`);
  {
    const rule: ApplicabilityRule = {
      stages: ["proposal"],
      verticals: ["manufacturing"],
      minDaysSinceCreated: 60,
    };
    const result = applies({ rule, dealState: baseDealState, eventStream: baseEventStream });
    assertEqual(result.pass, false, "multi-clause rule rejects on multiple clauses");
    assertEqual(
      result.reasons.length,
      3,
      "rejection reasons array has one entry per rejecting clause",
    );
    console.log(
      `      OK — rejected with ${result.reasons.length} reasons:\n        ` +
        result.reasons.join("\n        "),
    );
  }

  // [10] Zod parse: invalid rule throws on parseApplicabilityRule.
  caseNum++;
  console.log(`[${caseNum}] parseApplicabilityRule rejects invalid shape…`);
  {
    let caught: Error | null = null;
    try {
      parseApplicabilityRule({
        stages: ["not_a_real_stage"],
      });
    } catch (e) {
      caught = e instanceof Error ? e : new Error(String(e));
    }
    assert(caught !== null, "invalid stage value throws");

    const validRaw = {
      description: "demo rule",
      stages: ["discovery"],
      meddpiccGuards: [{ dimension: "champion", op: "gte", value: 60 }],
    };
    const validParsed = parseApplicabilityRule(validRaw);
    assertEqual(validParsed.description, "demo rule", "valid parse preserves description");
    assert(
      Array.isArray(validParsed.stages) && validParsed.stages[0] === "discovery",
      "valid parse preserves stages",
    );
    console.log(`      OK — invalid throws; valid round-trips`);
  }

  // [11] Schema-side: ApplicabilityRuleSchema is a Zod object (sanity check).
  caseNum++;
  console.log(`[${caseNum}] Zod schema sanity check…`);
  {
    const result = ApplicabilityRuleSchema.safeParse({});
    assertEqual(result.success, true, "empty object is a valid rule");
    console.log(`      OK — schema validates {}`);
  }

  // [12] Edge: stage=null deal — rule with stages clause rejects it (can't pass).
  caseNum++;
  console.log(`[${caseNum}] null-stage deal handling…`);
  {
    const nullStageState: DealState = { ...baseDealState, stage: null };
    const rule: ApplicabilityRule = { stages: ["discovery"] };
    const result = applies({ rule, dealState: nullStageState, eventStream: baseEventStream });
    assertEqual(result.pass, false, "null-stage deal rejects any stages clause");
    assert(
      result.reasons.some((r) => r.includes("stage=unknown")),
      "rejection cites unknown-stage path",
    );
    console.log(`      OK — null-stage deal rejects [stages: discovery]`);
  }

  console.log("");
  console.log(`Applicability DSL + evaluator: ALL ${caseNum}/${caseNum} CASES PASS.`);
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
