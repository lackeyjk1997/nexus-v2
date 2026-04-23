"use server";

import { revalidatePath } from "next/cache";

import { isDealStage, type DealStage } from "@nexus/shared";

import { createHubSpotAdapter } from "@/lib/crm";
import { createObservationService } from "@/lib/observations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface StageChangeInput {
  dealId: string;
  newStage: DealStage;
  /** ISO-date string from a `<input type="date">` (YYYY-MM-DD). Required for closed_won. */
  closeDate?: string;
  /** Free-text preliminary note from the close-lost modal. Optional for other stages. */
  closeLostNote?: string;
}

export type StageChangeResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Shared server action for every stage-change surface in Session B (kanban
 * DnD, detail-header dropdown, PipelineTable row chevron, close-won/lost
 * modals). Module-scope `"use server"` so both `/pipeline/page.tsx` and
 * `/pipeline/[dealId]/page.tsx` can import it — session contract says
 * "Server actions inline on the page module," but three surfaces across
 * two pages cross that boundary; extracting to a shared action is the
 * cleanest MVP.
 *
 * Scope:
 *  - Authenticates via SSR client (audit + Pattern A observer_id source).
 *  - Writes dealstage to HubSpot via adapter.updateDealStage.
 *  - When closed_won + closeDate → bundled into the same HubSpot PATCH.
 *  - When closed_lost + closeLostNote → writes a preliminary observation
 *    row via ObservationService (category='close_lost_preliminary'; see
 *    the ObservationService file header for the signal_type mapping
 *    rationale).
 *  - No deal_events emission today — Phase 3 Day 2 per §2.16.1 decision 2.
 */
export async function stageChangeAction(
  input: StageChangeInput,
): Promise<StageChangeResult> {
  if (!input.dealId) return { success: false, error: "Missing deal id." };
  if (!isDealStage(input.newStage))
    return { success: false, error: `Invalid stage: ${input.newStage}` };

  const supabase = createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { success: false, error: "Not signed in." };
  }

  let closeDate: Date | undefined;
  if (input.closeDate) {
    const parsed = new Date(input.closeDate);
    if (Number.isNaN(parsed.getTime())) {
      return { success: false, error: "Invalid close date." };
    }
    closeDate = parsed;
  }

  const adapter = createHubSpotAdapter();
  try {
    await adapter.updateDealStage(input.dealId, input.newStage, { closeDate });

    if (
      input.newStage === "closed_lost" &&
      typeof input.closeLostNote === "string" &&
      input.closeLostNote.trim().length > 0
    ) {
      const observations = createObservationService();
      try {
        await observations.record({
          observerId: userData.user.id,
          rawInput: input.closeLostNote.trim(),
          category: "close_lost_preliminary",
          linkedDealIds: [input.dealId],
          extraSourceContext: { hubspotDealId: input.dealId },
        });
      } finally {
        await observations.close();
      }
    }

    revalidatePath("/pipeline");
    revalidatePath(`/pipeline/${input.dealId}`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Stage change failed.",
    };
  } finally {
    await adapter.close();
  }
}
