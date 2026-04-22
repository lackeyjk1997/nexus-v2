import { redirect } from "next/navigation";

import { DEAL_STAGES, type DealStage, isDealStage } from "@nexus/shared";

import { DealCreateForm } from "@/components/pipeline/DealCreateForm";
import type { DealCreateFormState } from "@/components/pipeline/DealCreateForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createHubSpotAdapter } from "@/lib/crm";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DEFAULT_STAGE: DealStage = "discovery";

async function createDealAction(
  _state: DealCreateFormState,
  formData: FormData,
): Promise<DealCreateFormState> {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  const companyId = String(formData.get("companyId") ?? "").trim();
  const stageRaw = String(formData.get("stage") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const closeDateRaw = String(formData.get("closeDate") ?? "").trim();

  if (!name) return { error: "Deal name is required." };
  if (!companyId) return { error: "Company is required." };
  const stage: DealStage = isDealStage(stageRaw) ? stageRaw : DEFAULT_STAGE;

  let amount: number | undefined;
  if (amountRaw.length > 0) {
    const parsed = Number(amountRaw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { error: "Amount must be a non-negative number." };
    }
    amount = parsed;
  }

  let closeDate: Date | undefined;
  if (closeDateRaw.length > 0) {
    const parsed = new Date(`${closeDateRaw}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
      return { error: "Close date could not be parsed." };
    }
    closeDate = parsed;
  }

  const adapter = createHubSpotAdapter();
  try {
    const deal = await adapter.createDeal({
      name,
      companyId,
      stage,
      amount,
      closeDate,
    });
    redirect(`/pipeline?created=${encodeURIComponent(deal.name)}`);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") {
      throw err;
    }
    const message =
      err instanceof Error ? err.message : "Unknown error creating deal.";
    return { error: message };
  } finally {
    await adapter.close();
  }
}

export default async function NewDealPage() {
  const adapter = createHubSpotAdapter();
  try {
    const companies = await adapter.listCompanies({ limit: 100 });
    const options = companies
      .map((company) => ({ hubspotId: company.hubspotId, name: company.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return (
      <div className="flex flex-1 flex-col gap-6 p-8">
        <header>
          <h1 className="text-primary text-3xl font-semibold tracking-tight">
            New deal
          </h1>
          <p className="text-secondary mt-1 text-sm">
            Writes directly to HubSpot via{" "}
            <code className="text-primary font-mono text-xs">
              CrmAdapter.createDeal
            </code>
            ; cache refreshes on the subsequent webhook.
          </p>
        </header>

        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Deal details</CardTitle>
            <CardDescription>
              {options.length === 0
                ? "No companies in HubSpot yet. Add one first."
                : `${options.length} compan${options.length === 1 ? "y" : "ies"} available.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DealCreateForm
              companies={options}
              stages={DEAL_STAGES}
              defaultStage={DEFAULT_STAGE}
              action={createDealAction}
            />
          </CardContent>
        </Card>
      </div>
    );
  } finally {
    await adapter.close();
  }
}
