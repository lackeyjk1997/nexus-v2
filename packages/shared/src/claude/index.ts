// Claude integration layer — unified wrapper per DECISIONS.md 2.13 and
// Guardrails 16-20. Every Claude call in v2 flows through callClaude; no
// direct Anthropic SDK usage anywhere else.
export * from "./errors";
export * from "./client";
export * from "./telemetry";
export * from "./mock";
export * from "./tools/detect-signals";
export * from "./tools/extract-actions";
export * from "./tools/score-meddpicc";
