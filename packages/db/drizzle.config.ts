import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";
import path from "node:path";

// Load the workspace-root .env.local. Supports running from either repo root
// or packages/db; resolveFirst returns the first path that sets the vars.
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
if (!process.env.DIRECT_URL) {
  dotenv.config({ path: path.resolve(process.cwd(), "../../.env.local") });
}

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error("DIRECT_URL (or DATABASE_URL) must be set. Check .env.local.");
}

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
  schemaFilter: ["public"],
});
