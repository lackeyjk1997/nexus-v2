/**
 * Pre-migration sanity check for 0005.
 *
 * Reports row counts on tables the migration touches with non-trivial casts:
 *   - deal_fitness_scores.velocity_trend (text → fitness_velocity enum cast)
 *   - observations.signal_type (DROP NOT NULL — should be safe; no-op on data)
 *   - experiment_attributions.transcript_id (adding FK — any pointer to
 *     deleted transcript would fail the FK add)
 *
 * Exits 0 if the migration looks safe to apply. Exits 1 if investigation
 * is needed (e.g., existing velocity_trend values outside the enum set).
 */

import postgres from "postgres";

import { loadDevEnv, requireEnv } from "@nexus/shared";

async function main(): Promise<void> {
  loadDevEnv();
  const url = requireEnv("DATABASE_URL");
  const sql = postgres(url, { max: 1, prepare: false });

  let ok = true;

  try {
    // deal_fitness_scores — check velocity_trend values are all in
    // the target enum set {accelerating, stable, decelerating, stalled}.
    const fitnessRows = await sql<{ count: number; vals: string[] | null }[]>`
      SELECT COUNT(*)::int AS count, array_agg(DISTINCT velocity_trend) AS vals
        FROM deal_fitness_scores
    `;
    const fitnessCount = fitnessRows[0]?.count ?? 0;
    const fitnessVals = fitnessRows[0]?.vals ?? [];
    console.log(`deal_fitness_scores rows: ${fitnessCount}`);
    console.log(`deal_fitness_scores velocity_trend distinct: ${JSON.stringify(fitnessVals)}`);
    const VALID = new Set(["accelerating", "stable", "decelerating", "stalled"]);
    const invalidVals = (fitnessVals ?? [])
      .filter((v): v is string => typeof v === "string")
      .filter((v) => !VALID.has(v));
    if (invalidVals.length > 0) {
      console.error(
        `  FAIL: non-enum velocity_trend values present: ${JSON.stringify(invalidVals)}`,
      );
      console.error(
        `        would fail ALTER COLUMN ... USING velocity_trend::fitness_velocity`,
      );
      ok = false;
    } else {
      console.log(`  OK: all velocity_trend values fit the target enum.`);
    }

    // observations — row count sanity.
    const obsRows = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM observations
    `;
    console.log(`observations rows: ${obsRows[0]?.count ?? 0}`);

    // experiment_attributions — any transcript_id pointing at a missing row?
    const orphanRows = await sql<{ orphans: number }[]>`
      SELECT COUNT(*)::int AS orphans
        FROM experiment_attributions ea
       WHERE ea.transcript_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM transcripts t WHERE t.id = ea.transcript_id
         )
    `;
    const orphans = orphanRows[0]?.orphans ?? 0;
    console.log(`experiment_attributions orphan transcript_id: ${orphans}`);
    if (orphans > 0) {
      console.error(
        `  FAIL: ${orphans} experiment_attributions row(s) reference missing transcripts.`,
      );
      console.error(`        would fail ADD CONSTRAINT ... FOREIGN KEY ... (no validation override).`);
      ok = false;
    } else {
      console.log(`  OK: no orphan transcript_id references.`);
    }

    // deal_events — row count for composite-index sanity (index creation is
    // safe regardless of row count, just FYI).
    const eventsRows = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM deal_events
    `;
    console.log(`deal_events rows: ${eventsRows[0]?.count ?? 0} (composite index build cost)`);

    // experiments — row count.
    const expRows = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM experiments
    `;
    console.log(`experiments rows: ${expRows[0]?.count ?? 0}`);

    if (!ok) {
      process.exit(1);
    }
    console.log("PRE-MIGRATION CHECK PASSED — safe to apply 0005");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
