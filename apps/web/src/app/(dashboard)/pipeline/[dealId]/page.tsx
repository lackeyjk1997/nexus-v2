import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";

import {
  CONTACT_ROLE,
  DEAL_STAGES,
  MEDDPICC_DIMENSION,
  isContactRole,
  isMeddpiccDimension,
  type MeddpiccEvidence,
  type MeddpiccScores,
} from "@nexus/shared";

import { DealHeader } from "@/components/deal/DealHeader";
import { DealSummarySection } from "@/components/deal/DealSummarySection";
import {
  MeddpiccEditCard,
  type MeddpiccEditFormState,
} from "@/components/deal/MeddpiccEditCard";
import {
  StakeholderManageCard,
  type StakeholderActionState,
  type StakeholderRow,
} from "@/components/deal/StakeholderManageCard";
import { createHubSpotAdapter } from "@/lib/crm";
import { createMeddpiccService } from "@/lib/meddpicc";
import { createStakeholderService } from "@/lib/stakeholders";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  MEDDPICC_SCORE_MAX,
  MEDDPICC_SCORE_MIN,
} from "@/components/deal/meddpicc-display";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface DealDetailPageProps {
  params: Promise<{ dealId: string }>;
  searchParams: Promise<{ saved?: string | string[] }>;
}

async function requireAuth(): Promise<{ error: string } | { ok: true }> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { error: "Not signed in." };
  return { ok: true };
}

async function upsertMeddpiccAction(
  _state: MeddpiccEditFormState,
  formData: FormData,
): Promise<MeddpiccEditFormState> {
  "use server";

  const dealId = String(formData.get("__dealId") ?? "").trim();
  if (!dealId) return { error: "Missing deal id on form submission." };

  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };

  const scores: MeddpiccScores = {};
  const evidence: MeddpiccEvidence = {};

  for (const dim of MEDDPICC_DIMENSION) {
    const scoreRaw = String(formData.get(`score_${dim}`) ?? "").trim();
    if (scoreRaw.length > 0) {
      const n = Number(scoreRaw);
      if (!Number.isInteger(n) || n < MEDDPICC_SCORE_MIN || n > MEDDPICC_SCORE_MAX) {
        return {
          error: `Score for ${dim} must be an integer ${MEDDPICC_SCORE_MIN}–${MEDDPICC_SCORE_MAX}.`,
        };
      }
      scores[dim] = n;
    } else {
      scores[dim] = null;
    }
    const evidenceRaw = String(formData.get(`evidence_${dim}`) ?? "");
    if (evidenceRaw.trim().length > 0) evidence[dim] = evidenceRaw;
  }

  for (const key of Object.keys(scores)) {
    if (!isMeddpiccDimension(key)) {
      return { error: `Unknown dimension: ${key}` };
    }
  }

  const service = createMeddpiccService();
  try {
    await service.upsert({ dealId, scores, evidence });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to save MEDDPICC.";
    return { error: message };
  } finally {
    await service.close();
  }

  redirect(`/pipeline/${dealId}?saved=1`);
}

async function addExistingStakeholderAction(
  _state: StakeholderActionState,
  formData: FormData,
): Promise<StakeholderActionState> {
  "use server";

  const dealId = String(formData.get("__dealId") ?? "").trim();
  const contactId = String(formData.get("contactId") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  if (!dealId) return { error: "Missing deal id on form submission." };
  if (!contactId) return { error: "Pick a contact." };
  if (!isContactRole(role)) return { error: "Pick a role." };

  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };

  // Identity/association live in HubSpot (§2.19); role metadata lives in
  // Nexus. Adding a stakeholder requires BOTH sides.
  const adapter = createHubSpotAdapter();
  const service = createStakeholderService();
  try {
    await adapter.associateDealContact(dealId, contactId);
    await service.add({ dealId, contactId, role });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to add stakeholder.";
    return { error: message };
  } finally {
    await adapter.close();
    await service.close();
  }

  revalidatePath(`/pipeline/${dealId}`);
  return { success: true };
}

async function createAndAddStakeholderAction(
  _state: StakeholderActionState,
  formData: FormData,
): Promise<StakeholderActionState> {
  "use server";

  const dealId = String(formData.get("__dealId") ?? "").trim();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const titleRaw = String(formData.get("title") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();

  if (!dealId) return { error: "Missing deal id on form submission." };
  if (!firstName || !lastName)
    return { error: "First and last name are required." };
  if (!email) return { error: "Email is required." };
  if (!isContactRole(role)) return { error: "Pick a role." };

  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };

  const adapter = createHubSpotAdapter();
  const service = createStakeholderService();
  try {
    const contact = await adapter.upsertContact({
      email,
      firstName,
      lastName,
      title: titleRaw || undefined,
    });
    await adapter.associateDealContact(dealId, contact.hubspotId);
    // Service.add fails on re-creation (unique(deal_id,contact_id)); branch
    // so re-adding a previously-removed contact works.
    const existing = await service.listForDeal(dealId);
    const match = existing.find(
      (s) => s.hubspotContactId === contact.hubspotId,
    );
    if (match) {
      await service.updateRole({
        dealId,
        contactId: contact.hubspotId,
        role,
      });
    } else {
      await service.add({ dealId, contactId: contact.hubspotId, role });
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create and add stakeholder.";
    return { error: message };
  } finally {
    await adapter.close();
    await service.close();
  }

  revalidatePath(`/pipeline/${dealId}`);
  return { success: true };
}

async function updateStakeholderRoleAction(formData: FormData): Promise<void> {
  "use server";

  const dealId = String(formData.get("__dealId") ?? "").trim();
  const contactId = String(formData.get("__contactId") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  if (!dealId || !contactId) throw new Error("Missing dealId/contactId.");
  if (!isContactRole(role)) throw new Error(`Invalid role: ${role}`);

  const auth = await requireAuth();
  if ("error" in auth) throw new Error(auth.error);

  // A stakeholder row may not yet exist — e.g. a HubSpot contact associated
  // with the deal pre-Session-A shows up with role=null. Branch: add on first
  // assignment, update thereafter. Same shape as adapter.setContactRoleOnDeal.
  const service = createStakeholderService();
  try {
    const existing = await service.listForDeal(dealId);
    const match = existing.find((s) => s.hubspotContactId === contactId);
    if (match) {
      await service.updateRole({ dealId, contactId, role });
    } else {
      await service.add({ dealId, contactId, role });
    }
  } finally {
    await service.close();
  }

  revalidatePath(`/pipeline/${dealId}`);
}

async function removeStakeholderAction(formData: FormData): Promise<void> {
  "use server";

  const dealId = String(formData.get("__dealId") ?? "").trim();
  const contactId = String(formData.get("__contactId") ?? "").trim();
  if (!dealId || !contactId) throw new Error("Missing dealId/contactId.");

  const auth = await requireAuth();
  if ("error" in auth) throw new Error(auth.error);

  // "Remove from deal" severs the HubSpot Deal↔Contact association AND
  // deletes the Nexus role row. The HubSpot contact itself stays untouched
  // (Session A resolution #3 / §2.19 data boundary).
  const adapter = createHubSpotAdapter();
  const service = createStakeholderService();
  try {
    await adapter.dissociateDealContact(dealId, contactId);
    await service.remove({ dealId, contactId });
  } finally {
    await adapter.close();
    await service.close();
  }

  revalidatePath(`/pipeline/${dealId}`);
}

export default async function DealDetailPage({
  params,
  searchParams,
}: DealDetailPageProps) {
  const { dealId } = await params;
  const sp = await searchParams;
  const savedJustNow = sp.saved === "1" || sp.saved?.[0] === "1";

  const adapter = createHubSpotAdapter();
  const service = createMeddpiccService();
  try {
    const [deal, dealContacts, meddpicc] = await Promise.all([
      adapter.getDeal(dealId).catch(() => null),
      adapter.listDealContacts(dealId).catch(() => []),
      service.getByDealId(dealId),
    ]);
    if (!deal) notFound();

    const [company, companyContacts] = await Promise.all([
      deal.companyId
        ? adapter.getCompany(deal.companyId).catch(() => null)
        : Promise.resolve(null),
      deal.companyId
        ? adapter
            .listContacts({ companyId: deal.companyId, limit: 200 })
            .catch(() => [])
        : Promise.resolve([]),
    ]);

    const onDealIds = new Set(dealContacts.map((c) => c.hubspotId));
    const candidateContacts = companyContacts.filter(
      (c) => !onDealIds.has(c.hubspotId),
    );
    const stakeholders: StakeholderRow[] = dealContacts.map((c) => {
      const { role, isPrimary, ...rest } = c;
      return { ...rest, role, isPrimary };
    });

    return (
      <div className="flex flex-1 flex-col gap-8 p-8">
        <DealHeader deal={deal} company={company} stages={DEAL_STAGES} />
        <DealSummarySection deal={deal} company={company} />
        <StakeholderManageCard
          dealId={deal.hubspotId}
          stakeholders={stakeholders}
          candidateContacts={candidateContacts}
          roles={CONTACT_ROLE}
          addExistingAction={addExistingStakeholderAction}
          createAndAddAction={createAndAddStakeholderAction}
          updateRoleAction={updateStakeholderRoleAction}
          removeAction={removeStakeholderAction}
        />
        <MeddpiccEditCard
          dealId={deal.hubspotId}
          dimensions={MEDDPICC_DIMENSION}
          current={meddpicc}
          action={upsertMeddpiccAction}
          savedJustNow={savedJustNow}
        />
      </div>
    );
  } finally {
    await adapter.close();
    await service.close();
  }
}
