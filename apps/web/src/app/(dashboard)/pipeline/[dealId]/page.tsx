import { notFound, redirect } from "next/navigation";

import {
  MEDDPICC_DIMENSION,
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
import { StakeholderPreview } from "@/components/deal/StakeholderPreview";
import { createHubSpotAdapter } from "@/lib/crm";
import { createMeddpiccService } from "@/lib/meddpicc";
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

async function upsertMeddpiccAction(
  _state: MeddpiccEditFormState,
  formData: FormData,
): Promise<MeddpiccEditFormState> {
  "use server";

  const dealId = String(formData.get("__dealId") ?? "").trim();
  if (!dealId) return { error: "Missing deal id on form submission." };

  // Auth check — Pattern D writes bypass RLS via service-role / Postgres-direct
  // connection, so we gate at the route boundary. Precedent: jobs enqueue.
  const supabase = createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { error: "Not signed in." };
  }

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

  // Guard: the forEach above uses dims from the canonical enum, so rogue form
  // keys can't land invalid dimension names in the service. Defensive recheck.
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

    const company = deal.companyId
      ? await adapter.getCompany(deal.companyId).catch(() => null)
      : null;

    return (
      <div className="flex flex-1 flex-col gap-8 p-8">
        <DealHeader deal={deal} company={company} />
        <DealSummarySection deal={deal} company={company} />
        <StakeholderPreview contacts={dealContacts} />
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
