/**
 * ObservationService — third Nexus-only service (Phase 2 Day 4 Session B).
 *
 * Reads and writes `public.observations` + `public.observation_deals` directly
 * via postgres.js. Mirrors the MeddpiccService + StakeholderService template.
 *
 * Pattern A note: `observations` is RLS Pattern A (observer_id = auth.uid()
 * per migration 0001) — different from the Pattern D tables Session A wrote
 * to. Since this service uses postgres.js via the pooler (service-role
 * connection that bypasses RLS), the caller MUST pass the authenticated
 * user's auth.uid() as `observerId` after SSR-authenticating at the route
 * boundary. RLS invariants are enforced at the application layer here; the
 * test-rls-observations.ts script verifies Pattern A semantics at the
 * Supabase user-session client layer.
 *
 * `signal_type` nullability (foundation-review A1, DECISIONS.md §2.13.1):
 * as of migration 0005, `observations.signal_type` is nullable. Rows
 * captured outside the signal-classifier path (e.g., the close-lost
 * preliminary note below) write `signal_type: null` and carry
 * `source_context.category` as the discriminator. Coordinator queries
 * that group by `signal_type` must filter `WHERE signal_type IS NOT NULL`
 * to avoid mixing rep-typed captures with classifier output. Phase 5's
 * formal close-lost flow per §1.1 migrates via
 *   `SELECT ... WHERE source_context->>'category' = 'close_lost_preliminary'`.
 *
 * Callers that receive a classifier output (Phase 3 Day 1+) pass an
 * explicit `signalType: SignalTaxonomy`. Category-driven callers pass
 * neither `signalType` nor let it derive implicitly — `category` alone
 * is sufficient and `signal_type` is stored null.
 *
 * See Session B + Session 0-A Reasoning stubs for the full rationale.
 */
import postgres from "postgres";

import {
  type SignalTaxonomy,
} from "../enums/signal-taxonomy";

/**
 * Valid category values today. Expand cautiously — every new value commits
 * the JSONB discriminator to a long-lived contract that Phase 5's formal
 * close-lost surfaces will migrate from.
 */
export type ObservationCategory = "close_lost_preliminary";

export interface ObservationRecord {
  id: string;
  observerId: string;
  rawInput: string;
  signalType: SignalTaxonomy | null;
  category: ObservationCategory | null;
  sourceContext: Record<string, unknown> | null;
  createdAt: Date;
}

export interface ObservationServiceOptions {
  databaseUrl: string;
  /** Inject a pre-built postgres client (tests, adapter reuse). */
  sql?: postgres.Sql;
}

type ObservationRow = {
  id: string;
  observer_id: string;
  raw_input: string;
  signal_type: string | null;
  source_context: Record<string, unknown> | null;
  created_at: string | Date;
};

export class ObservationService {
  private readonly sql: postgres.Sql;
  private readonly ownedSql: boolean;

  constructor(options: ObservationServiceOptions) {
    this.sql =
      options.sql ??
      postgres(options.databaseUrl, {
        max: 1,
        idle_timeout: 30,
        prepare: false,
      });
    this.ownedSql = !options.sql;
  }

  /**
   * Record a new observation with optional deal links.
   *
   * `observerId` MUST come from an SSR-authenticated session's
   * `auth.getUser()` — see the Pattern A note at the top of this file.
   *
   * Callers pass EITHER `category` (rep-typed capture, `signal_type`
   * stored null) OR `signalType` (classifier output, stored as-is).
   * Passing both is ambiguous and rejected.
   */
  async record(input: {
    observerId: string;
    rawInput: string;
    category?: ObservationCategory;
    signalType?: SignalTaxonomy;
    linkedDealIds?: string[];
    extraSourceContext?: Record<string, unknown>;
  }): Promise<ObservationRecord> {
    if (input.category && input.signalType) {
      throw new Error(
        "ObservationService.record: pass either `category` or `signalType`, not both",
      );
    }
    if (!input.category && !input.signalType) {
      throw new Error(
        "ObservationService.record: must pass either `category` or `signalType`",
      );
    }

    // Category-driven captures write signal_type: null per the §2.13.1
    // nullable invariant. Classifier-path captures write the provided
    // signalType as-is.
    const signalType = input.signalType ?? null;
    const sourceContext: Record<string, unknown> = {
      ...(input.category ? { category: input.category } : {}),
      ...(input.extraSourceContext ?? {}),
    };

    const rows = await this.sql<ObservationRow[]>`
      INSERT INTO observations (
        observer_id, raw_input, signal_type, source_context, created_at, updated_at
      )
      VALUES (
        ${input.observerId},
        ${input.rawInput},
        ${signalType},
        ${this.sql.json(sourceContext as unknown as postgres.JSONValue)},
        NOW(),
        NOW()
      )
      RETURNING id, observer_id, raw_input, signal_type, source_context, created_at
    `;
    if (!rows[0]) {
      throw new Error("ObservationService.record returned no row");
    }

    // Link to deals via the observation_deals join table per §2.3 (replaces
    // v1's uuid[] column). HubSpot deal ID is text, not uuid, since deals
    // live in HubSpot (§2.19).
    const linkedDealIds = input.linkedDealIds ?? [];
    if (linkedDealIds.length > 0) {
      const obsId = rows[0].id;
      await this.sql`
        INSERT INTO observation_deals (observation_id, hubspot_deal_id, created_at)
        SELECT ${obsId}, deal_id, NOW()
          FROM UNNEST(${linkedDealIds}::text[]) AS t(deal_id)
      `;
    }

    return this.rowToRecord(rows[0]);
  }

  async close(): Promise<void> {
    if (this.ownedSql) {
      await this.sql.end({ timeout: 5 });
    }
  }

  private rowToRecord(row: ObservationRow): ObservationRecord {
    const ctx = row.source_context;
    const rawCategory =
      ctx && typeof ctx === "object" && "category" in ctx
        ? (ctx as { category?: unknown }).category
        : null;
    const category =
      typeof rawCategory === "string" && rawCategory === "close_lost_preliminary"
        ? "close_lost_preliminary"
        : null;
    return {
      id: row.id,
      observerId: row.observer_id,
      rawInput: row.raw_input,
      signalType: row.signal_type as SignalTaxonomy | null,
      category,
      sourceContext: row.source_context,
      createdAt: new Date(row.created_at),
    };
  }
}
