/**
 * StakeholderService — second Nexus-only service (no HubSpot round-trip).
 *
 * Reads and writes `public.deal_contact_roles` directly via postgres.js.
 * Mirrors the MeddpiccService template: instance/close pattern, `{databaseUrl,
 * sql?}` options for test-injection, request-scoped factory in `apps/web/src/lib/`.
 *
 * Contact identity (firstname/lastname/email/title) lives in HubSpot;
 * `deal_contact_roles` persists ONLY the per-deal role + is_primary flag.
 * HubSpot Starter tier has no custom association labels, so Nexus owns the
 * richer taxonomy (DECISIONS.md §2.18 / 07C §4.3).
 *
 * RLS: `deal_contact_roles` is Pattern D per DECISIONS.md §2.2.1 (read-all
 * authenticated, writes via service role / Postgres-direct connection that
 * bypasses RLS). Callers must authenticate at the route boundary before
 * touching the service. Precedent: MeddpiccService, jobs enqueue.
 *
 * Event emission (`deal_events` stage_changed / stakeholder_added equivalents)
 * defers to Phase 3 Day 2 when the event_context column per §2.16.1 decision
 * 2 lands.
 */
import postgres from "postgres";

import type { ContactRole } from "../enums/contact-role";

export interface StakeholderRoleRow {
  hubspotDealId: string;
  hubspotContactId: string;
  role: ContactRole;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StakeholderServiceOptions {
  databaseUrl: string;
  /** Inject a pre-built postgres client (tests, adapter reuse, cross-call reuse). */
  sql?: postgres.Sql;
}

type StakeholderRow = {
  hubspot_deal_id: string;
  hubspot_contact_id: string;
  role: ContactRole;
  is_primary: boolean;
  created_at: string | Date;
  updated_at: string | Date;
};

export class StakeholderService {
  private readonly sql: postgres.Sql;
  private readonly ownedSql: boolean;

  constructor(options: StakeholderServiceOptions) {
    this.sql =
      options.sql ??
      postgres(options.databaseUrl, {
        max: 3,
        idle_timeout: 30,
        prepare: false,
      });
    this.ownedSql = !options.sql;
  }

  async listForDeal(dealId: string): Promise<StakeholderRoleRow[]> {
    const rows = await this.sql<StakeholderRow[]>`
      SELECT hubspot_deal_id, hubspot_contact_id, role, is_primary,
             created_at, updated_at
        FROM deal_contact_roles
       WHERE hubspot_deal_id = ${dealId}
    `;
    return rows.map(this.rowToRecord);
  }

  async add(input: {
    dealId: string;
    contactId: string;
    role: ContactRole;
    isPrimary?: boolean;
  }): Promise<StakeholderRoleRow> {
    const rows = await this.sql<StakeholderRow[]>`
      INSERT INTO deal_contact_roles (
        hubspot_deal_id, hubspot_contact_id, role, is_primary,
        created_at, updated_at
      )
      VALUES (
        ${input.dealId},
        ${input.contactId},
        ${input.role},
        ${input.isPrimary ?? false},
        NOW(),
        NOW()
      )
      RETURNING hubspot_deal_id, hubspot_contact_id, role, is_primary,
                created_at, updated_at
    `;
    if (!rows[0]) {
      throw new Error("StakeholderService.add returned no row");
    }
    return this.rowToRecord(rows[0]);
  }

  async updateRole(input: {
    dealId: string;
    contactId: string;
    role: ContactRole;
  }): Promise<StakeholderRoleRow> {
    const rows = await this.sql<StakeholderRow[]>`
      UPDATE deal_contact_roles
         SET role = ${input.role},
             updated_at = NOW()
       WHERE hubspot_deal_id = ${input.dealId}
         AND hubspot_contact_id = ${input.contactId}
      RETURNING hubspot_deal_id, hubspot_contact_id, role, is_primary,
                created_at, updated_at
    `;
    if (!rows[0]) {
      throw new Error(
        `StakeholderService.updateRole: no row for deal=${input.dealId} contact=${input.contactId}`,
      );
    }
    return this.rowToRecord(rows[0]);
  }

  async remove(input: { dealId: string; contactId: string }): Promise<void> {
    await this.sql`
      DELETE FROM deal_contact_roles
       WHERE hubspot_deal_id = ${input.dealId}
         AND hubspot_contact_id = ${input.contactId}
    `;
  }

  async close(): Promise<void> {
    if (this.ownedSql) {
      await this.sql.end({ timeout: 5 });
    }
  }

  private rowToRecord(row: StakeholderRow): StakeholderRoleRow {
    return {
      hubspotDealId: row.hubspot_deal_id,
      hubspotContactId: row.hubspot_contact_id,
      role: row.role,
      isPrimary: row.is_primary,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
