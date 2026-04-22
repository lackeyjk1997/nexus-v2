import type { Config } from "drizzle-kit";

// Schema + migrations land in Phase 1 Day 2 per DECISIONS.md 2.2
// and 10-REBUILD-PLAN.md Section 4.2.
export default {
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
} satisfies Config;
