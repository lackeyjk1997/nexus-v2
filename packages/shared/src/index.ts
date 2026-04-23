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
