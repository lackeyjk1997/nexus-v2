/**
 * Demo-reset seed manifest — foundation-review C5.
 *
 * Enumerates every Nexus-owned table + the disposition demo reset should
 * take on it. Discipline: **every migration that adds a Nexus-owned table
 * adds an entry here in the same commit**. By Phase 6 polish the manifest
 * is exhaustive and the demo-reset script walks it automatically — no
 * more `ILIKE '%MedVista%'` brittle name matching (09-CRITIQUE §4.5, §4.17).
 *
 * Dispositions:
 *   - `truncate`       — clear all rows; regenerated from live HubSpot
 *     activity (hubspot_cache, deal_events, etc.) or per-demo seeding
 *     (transcripts, observations). Default.
 *   - `preserve:seed`  — keep the seed content placed by
 *     `packages/db/src/seed/*.ts`. Reset re-runs the seeder to restore
 *     expected state.
 *   - `preserve:always` — DO NOT TRUNCATE. Reset never touches. Rows that
 *     are auth-adjacent (public.users FK to auth.users) or otherwise
 *     structurally required.
 *
 * Ordering: children before parents so even a non-CASCADE truncate is
 * safe. The Phase 6 demo-reset script uses TRUNCATE ... RESTART IDENTITY
 * CASCADE in practice; the order here is belt-and-suspenders + documents
 * the dependency graph for humans.
 *
 * NOT yet wired: the `packages/db/src/scripts/demo-reset.ts` script that
 * walks this manifest lands in Phase 6 Polish per the rebuild plan. This
 * file is the skeleton + ongoing discipline artifact.
 */

interface TableBase {
  /** Postgres table name in public schema. */
  name: string;
  /** Comment on what this table holds + why the disposition is right. */
  note: string;
}

export type ManifestEntry =
  | (TableBase & { truncate: true; preserve?: undefined })
  | (TableBase & { truncate?: false; preserve: "seed" | "always" });

export const TABLES_IN_FK_ORDER: readonly ManifestEntry[] = [
  // Leaf-most first (most dependencies on them).

  // Event-log and intelligence-output tables — always truncated.
  { name: "prompt_call_log", truncate: true, note: "Claude call telemetry (§2.16.1 decision 3); accumulates per invocation." },
  { name: "transcript_embeddings", truncate: true, note: "pgvector embeddings (§2.16.1 decision 1); cascades from transcripts." },
  { name: "coordinator_pattern_deals", truncate: true, note: "FK join, cascades from coordinator_patterns." },
  { name: "coordinator_patterns", truncate: true, note: "Cross-deal pattern synthesis output." },
  { name: "experiment_attribution_events", truncate: true, note: "Attribution-evidence join (§2.3 hygiene)." },
  { name: "experiment_attributions", truncate: true, note: "Per-transcript experiment attribution." },
  { name: "experiment_assignments", truncate: true, note: "Rep-to-experiment assignments." },
  { name: "agent_config_proposals", truncate: true, note: "Pending proposals from classifier/feedback (§2.25 #3)." },
  { name: "agent_config_versions", truncate: true, note: "Version history; accumulates on each config change." },
  { name: "field_query_questions", truncate: true, note: "Per-rep questions within field queries (cascades)." },
  { name: "field_queries", truncate: true, note: "Manager/support field queries." },
  { name: "deal_snapshots", truncate: true, note: "Rebuilt from deal_events by snapshot job." },
  { name: "deal_events", truncate: true, note: "Append-only event stream; regenerated from HubSpot replay + pipeline." },
  { name: "deal_contact_roles", truncate: true, note: "Per-deal stakeholder roles (§2.18, 07C §4.3); rebuilt on seed." },
  { name: "deal_fitness_events", truncate: true, note: "Per-event oDeal detections; rebuilt by pipeline." },
  { name: "deal_fitness_scores", truncate: true, note: "Per-deal aggregate; rebuilt by pipeline." },
  { name: "meddpicc_scores", truncate: true, note: "Per-deal MEDDPICC 8-dim scores; rebuilt by pipeline." },
  { name: "analyzed_transcripts", truncate: true, note: "Canonical preprocessed transcript; rebuilt." },
  { name: "transcripts", truncate: true, note: "Raw transcripts; per-demo seeded." },
  { name: "observation_deals", truncate: true, note: "FK join, cascades from observations (§2.3)." },
  { name: "observations", truncate: true, note: "Field observations; rebuilt per demo run." },
  { name: "observation_clusters", truncate: true, note: "Semantic clusters; rebuilt by clustering job." },
  { name: "customer_messages", truncate: true, note: "Inbound customer comms; per-demo seeded." },
  { name: "account_health", truncate: true, note: "Post-close account state; per-demo seeded." },
  { name: "surface_dismissals", truncate: true, note: "Per-user dismissal log (§1.17); rebuilt." },
  { name: "surface_feedback", truncate: true, note: "Per-user 'this is wrong' feedback; rebuilt." },
  { name: "notifications", truncate: true, note: "In-app notifications; rebuilt." },
  { name: "job_results", truncate: true, note: "Per-step outputs; cascades from jobs." },
  { name: "jobs", truncate: true, note: "Background job queue; clears between demo runs." },
  { name: "people_contacts", truncate: true, note: "Person↔HubSpot contact join; rebuilt." },
  { name: "people", truncate: true, note: "Canonical person identity; rebuilt from HubSpot + seed." },
  { name: "hubspot_cache", truncate: true, note: "Read-through cache; refills on first read or via bulkSync." },
  { name: "sync_state", truncate: true, note: "Periodic-sync watermarks (A8); re-initializes on next tick." },

  // Experiments — preserve:seed because DECISIONS.md 1.3 preserves proposal
  // UI from v1 and Phase 5 seeds initial experiments.
  { name: "experiments", preserve: "seed", note: "Definition rows seeded for the demo narrative; reset via seeder." },

  // Agent configs — preserve:seed. Per-rep configs ship as seed data.
  { name: "agent_configs", preserve: "seed", note: "Per-rep agent configs (§1.6); seeded." },

  // Reference / intelligence seed content — preserve:seed.
  { name: "manager_directives", preserve: "seed", note: "Leadership directives; seeded by manager-directives.ts." },
  { name: "system_intelligence", preserve: "seed", note: "Pre-computed vertical patterns; seeded." },
  { name: "knowledge_articles", preserve: "seed", note: "Internal KB articles; seeded." },

  // Org structure — preserve:seed. Reset re-runs user/team seeder.
  { name: "support_function_members", preserve: "seed", note: "Enablement/PM/DealDesk rows; seeded (§2.1)." },
  { name: "team_members", preserve: "seed", note: "AE/BDR/SA/CSM/MANAGER rows; seeded (§2.1)." },

  // Auth-adjacent — preserve:always. Reset never touches.
  { name: "users", preserve: "always", note: "FK to auth.users; demo reset never touches (auth.users is out of scope for reset)." },
] as const;

/**
 * Quick sanity check: throw if the manifest is missing any table that
 * exists in schema.ts. Intended for CI — a schema migration that adds a
 * table without updating this manifest fails the check.
 *
 * Kept internal to this module; not yet wired. Phase 6 demo-reset script
 * (or a Pre-landing discipline check) invokes this on every CI run.
 */
export function assertManifestCoversKnownTables(
  knownTables: readonly string[],
): void {
  const manifestNames = new Set(TABLES_IN_FK_ORDER.map((t) => t.name));
  const missing = knownTables.filter((t) => !manifestNames.has(t));
  if (missing.length > 0) {
    throw new Error(
      `demo-reset-manifest is missing ${missing.length} table(s): ${missing.join(", ")}. ` +
        `Add entries to TABLES_IN_FK_ORDER in the same commit that added the tables.`,
    );
  }
  const extra = [...manifestNames].filter((t) => !knownTables.includes(t));
  if (extra.length > 0) {
    throw new Error(
      `demo-reset-manifest references ${extra.length} nonexistent table(s): ${extra.join(", ")}. ` +
        `Remove entries from TABLES_IN_FK_ORDER or add the tables to the schema.`,
    );
  }
}
