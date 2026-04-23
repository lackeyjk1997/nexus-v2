// Canonical enums — Guardrail 22 single-source-of-truth.
export * from "./enums/signal-taxonomy";
export * from "./enums/vertical";
export * from "./enums/meddpicc-dimension";
export * from "./enums/odeal-category";
export * from "./enums/contact-role";
export * from "./enums/deal-stage";

// Claude integration layer — Phase 1 Day 4.
export * from "./claude";

// CRM adapter + HubSpot implementation — Phase 1 Day 5.
export * from "./crm";

// Nexus-owned services (Postgres-direct) — Phase 2 Day 3.
export * from "./services";

// Process-wide shared postgres.js client — Pre-Phase 3 Session 0-B (A7).
export * from "./db/pool";

// Scripts-only dev-env helper — Phase 3 Day 1 Session A (§2.13.1 consolidation).
export * from "./env";

// Job-handler registry — Phase 3 Day 2 Session B. Consumed by the worker
// route at apps/web/src/app/api/jobs/worker/route.ts and by direct-invocation
// test scripts in packages/db/src/scripts/.
export * from "./jobs/handlers";
