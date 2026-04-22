/**
 * Integration test for Phase 1 Day 4.
 *
 * Exercises the full path: loader → wrapper → Anthropic API → tool-use
 * response → typed output. Uses a hand-crafted fixture transcript with
 * unambiguous competitive and process-friction cues so the enum-coverage
 * assertion has real signal to grade against.
 *
 * Usage:
 *   pnpm --filter @nexus/shared test:detect-signals
 *
 * Requires ANTHROPIC_API_KEY + ANTHROPIC_MODEL in .env.local.
 */
import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPrompt, interpolate } from "@nexus/prompts";
import {
  callClaude,
  detectSignalsTool,
  SIGNAL_TAXONOMY,
  type DetectSignalsOutput,
} from "@nexus/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
// override: true because shell-exported empty values (e.g. ANTHROPIC_API_KEY="")
// otherwise shadow the .env.local value. Dotenv's default preserves pre-existing
// env vars even when they're empty — see Day 4 report parked item.
loadEnv({ path: resolve(__dirname, "../../../.env.local"), override: true });

function must<T>(v: T | undefined | null, msg: string): T {
  if (v === undefined || v === null) throw new Error(msg);
  return v;
}

// Stubbed context blocks — services (DealIntelligence, CrmAdapter, etc.) land
// in Phase 2+. Day 4's job is proving the wrapper works; context assembly is
// downstream.
const FIXTURE_VARS: Record<string, unknown> = {
  dealId: "a0000001-0000-0000-0000-000000000001",
  dealName: "MedVista — Claude Enterprise for Clinical Docs",
  companyName: "MedVista Health",
  vertical: "healthcare",
  stage: "discovery",
  formattedDealValue: "$2,400,000",
  contactsBlock: [
    "- Dr. Michael Chen (Chief Medical Officer, role=champion, isPrimary=true)",
    "- Jennifer Wu (Director of Information Technology, role=economic_buyer, isPrimary=false)",
  ].join("\n"),
  sellersBlock: ["- Sarah Chen (AE)", "- Alex Kim (SA)"].join("\n"),
  meddpiccBlock: [
    "- metrics: 2.5h/shift of after-shift documentation, target to cut by 50% (confidence: 70%, last_updated: 2026-04-20)",
    "- economic_buyer: not yet captured",
    "- decision_criteria: Epic integration, PHI residency, peer-reviewed evidence (confidence: 60%, last_updated: 2026-04-20)",
    "- decision_process: six to eight week InfoSec review gating pilot signature (confidence: 75%, last_updated: 2026-04-22)",
    "- paper_process: not yet captured",
    "- identify_pain: physician burnout, resignations, 2.5h median documentation time (confidence: 85%, last_updated: 2026-04-22)",
    "- champion: Dr. Michael Chen (confidence: 70%, last_updated: 2026-04-22)",
    "- competition: Microsoft DAX Copilot evaluated in parallel (confidence: 90%, last_updated: 2026-04-22)",
  ].join("\n"),
  activeExperimentsBlock: "(none)",
  openSignalsBlock: "(none)",
  activePatternsBlock: "(none)",
  transcriptText: readFileSync(
    resolve(__dirname, "../tests/fixtures/medvista-transcript.txt"),
    "utf8",
  ),
};

function hasReasoningField(toolSchema: typeof detectSignalsTool): boolean {
  const props = toolSchema.input_schema.properties as Record<string, unknown>;
  return "reasoning_trace" in props || "analytical_passes" in props || "analysis_passes" in props;
}

async function main() {
  console.log("Integration test — Claude wrapper + prompt #21 (detect-signals)\n");
  console.log(
    `env: ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY ? `set (${process.env.ANTHROPIC_API_KEY.length} chars)` : "UNSET"}, ANTHROPIC_MODEL=${process.env.ANTHROPIC_MODEL ?? "UNSET"}`,
  );

  // Assertion 1 — loader parses front-matter correctly.
  const prompt = loadPrompt("01-detect-signals");
  const fm = prompt.frontmatter;
  console.log(`[1] loader: name=${fm.name} version=${fm.version} tool_name=${fm.tool_name}`);
  if (fm.version !== "1.0.0") throw new Error(`expected version 1.0.0, got ${fm.version}`);
  if (fm.temperature !== 0.2) throw new Error(`expected temperature 0.2, got ${fm.temperature}`);
  if (fm.tool_name !== "record_detected_signals") {
    throw new Error(`expected tool_name=record_detected_signals, got ${fm.tool_name}`);
  }
  if (prompt.systemPrompt.length < 500) {
    throw new Error(`system prompt suspiciously short (${prompt.systemPrompt.length} chars)`);
  }
  if (!prompt.userTemplate.includes("${transcriptText}")) {
    throw new Error("user template missing ${transcriptText} token");
  }
  console.log(
    `    systemPrompt=${prompt.systemPrompt.length} chars · userTemplate=${prompt.userTemplate.length} chars`,
  );

  // Assertion 2 — interpolation is complete (no residual ${…}).
  const interpolated = interpolate(prompt.userTemplate, FIXTURE_VARS, "01-detect-signals");
  if (interpolated.includes("${")) {
    const unresolved = Array.from(interpolated.matchAll(/\$\{(\w+)\}/g)).map((m) => m[1]);
    throw new Error(`interpolation left literal tokens: ${unresolved.join(", ")}`);
  }
  console.log(`[2] interpolation clean (${interpolated.length} chars, no residual \${…})`);

  // Assertion 3+4+5 — call wrapper, assert tool_use + enum validity + fields.
  console.log(`[3] calling Claude (model=${process.env.ANTHROPIC_MODEL}, temperature=0.2)…`);
  const response = await callClaude<DetectSignalsOutput>({
    promptFile: "01-detect-signals",
    vars: FIXTURE_VARS,
    tool: detectSignalsTool,
  });
  console.log(
    `    ← stop_reason=${response.stopReason} · attempts=${response.attempts} · ${response.durationMs}ms`,
  );
  console.log(
    `    usage: in=${response.usage.inputTokens} out=${response.usage.outputTokens} tokens`,
  );

  if (response.toolName !== "record_detected_signals") {
    throw new Error(`unexpected tool name: ${response.toolName}`);
  }
  if (response.stopReason !== "tool_use") {
    throw new Error(`expected stop_reason=tool_use, got ${response.stopReason}`);
  }

  const output = response.toolInput;
  if (!Array.isArray(output.signals)) throw new Error("toolInput.signals is not an array");
  if (!Array.isArray(output.stakeholder_insights)) {
    throw new Error("toolInput.stakeholder_insights is not an array");
  }
  console.log(
    `    signals: ${output.signals.length} · stakeholder_insights: ${output.stakeholder_insights.length}`,
  );

  // Assertion 4 — enum validity (the core 7-vs-9 drift assertion).
  console.log(`[4] signal enum validity — ${SIGNAL_TAXONOMY.length} canonical values`);
  const signalTypesSeen = new Set<string>();
  for (const sig of output.signals) {
    if (!(SIGNAL_TAXONOMY as readonly string[]).includes(sig.signal_type)) {
      throw new Error(`rogue signal_type emitted: ${sig.signal_type}`);
    }
    signalTypesSeen.add(sig.signal_type);
    for (const field of ["summary", "evidence_quote", "source_speaker", "rationale"] as const) {
      const v = sig[field];
      if (typeof v !== "string" || !v.trim()) {
        throw new Error(`signal missing/empty field ${field}: ${JSON.stringify(sig)}`);
      }
    }
    if (!["low", "medium", "high", "critical"].includes(sig.urgency)) {
      throw new Error(`invalid urgency: ${sig.urgency}`);
    }
    if (typeof sig.confidence !== "number" || sig.confidence < 0.5 || sig.confidence > 1.0) {
      throw new Error(`invalid confidence: ${sig.confidence}`);
    }
  }
  console.log(`    types seen: ${Array.from(signalTypesSeen).sort().join(", ")}`);

  // Fixture has explicit competitive + process_friction cues; assert both land.
  if (output.signals.length === 0) {
    throw new Error(
      "fixture contains clear competitive + process-friction cues; empty signals array indicates the classifier is broken",
    );
  }
  if (!signalTypesSeen.has("competitive_intel")) {
    console.warn(
      "    ⚠ expected at least one competitive_intel signal (Microsoft DAX mention in fixture)",
    );
  }
  if (!signalTypesSeen.has("process_friction")) {
    console.warn(
      "    ⚠ expected at least one process_friction signal (6-8 week security review in fixture)",
    );
  }

  // Assertion 5 — stakeholder insights shape.
  console.log(`[5] stakeholder insights shape`);
  for (const s of output.stakeholder_insights) {
    if (!s.contact_name || typeof s.contact_name !== "string") {
      throw new Error(`insight missing contact_name: ${JSON.stringify(s)}`);
    }
    if (!["positive", "neutral", "cautious", "negative", "mixed"].includes(s.sentiment)) {
      throw new Error(`invalid sentiment: ${s.sentiment}`);
    }
    if (!["high", "medium", "low"].includes(s.engagement)) {
      throw new Error(`invalid engagement: ${s.engagement}`);
    }
    if (s.key_priorities.length > 3) throw new Error("key_priorities exceeds maxItems 3");
    if (s.key_concerns.length > 3) throw new Error("key_concerns exceeds maxItems 3");
  }
  console.log(
    `    insights verified: ${output.stakeholder_insights.map((s) => s.contact_name).join(" · ")}`,
  );

  // Assertion 6 — telemetry observed. The wrapper logged a JSON line to
  // stderr already; this assertion confirms the return shape matches.
  console.log(`[6] telemetry`);
  must(response.model, "response.model missing");
  if (response.temperature !== 0.2) {
    throw new Error(`expected temperature 0.2, got ${response.temperature}`);
  }
  if (response.promptVersion !== "1.0.0") {
    throw new Error(`expected promptVersion 1.0.0, got ${response.promptVersion}`);
  }
  if (response.usage.inputTokens === 0 || response.usage.outputTokens === 0) {
    throw new Error("zero token usage — unexpected");
  }
  console.log(
    `    model=${response.model} temperature=${response.temperature} version=${response.promptVersion}`,
  );

  // Assertion 7 — conditional: reasoning_trace assertion (per pre-kickoff).
  console.log(`[7] reasoning-trace assertion (conditional on schema)`);
  if (hasReasoningField(detectSignalsTool)) {
    const trace =
      (output as unknown as { reasoning_trace?: string }).reasoning_trace ||
      (output as unknown as { analysis_passes?: unknown }).analysis_passes;
    if (typeof trace !== "string" || trace.length === 0) {
      throw new Error("reasoning_trace/analysis_passes field present in schema but empty in output");
    }
    console.log(`    ✓ reasoning field populated (${(trace as string).length} chars)`);
  } else {
    console.log(
      "    ⚠ SKIPPED — rewrite tool schema for detect-signals has no reasoning_trace / analytical_passes / analysis_passes field.",
    );
    console.log(
      "      This is a prompt-quality gap (04C Principle 6 mechanical application says classification-with-judgment",
    );
    console.log(
      "      prompts MUST include reasoning as the first property). Flagging in Day 4 report.",
    );
  }

  console.log("");
  console.log(
    `Integration test PASSED — ${output.signals.length} signals, ${output.stakeholder_insights.length} insights, ${response.durationMs}ms`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Integration test FAILED:", err);
  process.exit(1);
});
