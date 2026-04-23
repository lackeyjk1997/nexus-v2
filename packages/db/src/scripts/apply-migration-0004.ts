/**
 * One-off — apply migration 0004 (deal_stage 'prospect' → 'new_lead').
 *
 * Separate from drizzle-kit's migrate chain because this is a single
 * ALTER TYPE ... RENAME VALUE that drizzle-kit auto-generated as DROP+CREATE.
 * Migration file kept at drizzle/0004_shallow_kid_colt.sql for audit.
 */

import postgres from "postgres";

import { loadDevEnv, requireEnv } from "@nexus/shared";

async function main(): Promise<void> {
  loadDevEnv();
  const url = requireEnv("DATABASE_URL");
  const sql = postgres(url, { max: 1, prepare: false });

  try {
    const beforeRows = await sql<{ vals: string[] }[]>`
      SELECT enum_range(NULL::deal_stage) AS vals
    `;
    console.log("before:", beforeRows[0]?.vals);

    const first = beforeRows[0]?.vals[0];
    if (first === "new_lead") {
      console.log("already reconciled — no-op.");
      return;
    }
    if (first !== "prospect") {
      throw new Error(
        `unexpected first deal_stage value: ${JSON.stringify(first)}`,
      );
    }

    await sql`ALTER TYPE "public"."deal_stage" RENAME VALUE 'prospect' TO 'new_lead'`;

    const afterRows = await sql<{ vals: string[] }[]>`
      SELECT enum_range(NULL::deal_stage) AS vals
    `;
    console.log("after: ", afterRows[0]?.vals);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
