import { createHubSpotAdapter } from "@/lib/crm";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const STAGE_LABELS: Record<string, string> = {
  new_lead: "New Lead",
  qualified: "Qualified",
  discovery: "Discovery",
  technical_validation: "Technical Validation",
  proposal: "Proposal",
  negotiation: "Negotiation",
  closing: "Closing",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
};

function formatAmount(amount: number | null, currency: string | null): string {
  if (amount === null) return "—";
  const code = currency ?? "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${code} ${amount.toLocaleString("en-US")}`;
  }
}

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return date.toISOString().slice(0, 10);
}

export default async function PipelinePage() {
  const adapter = createHubSpotAdapter();
  try {
    const deals = await adapter.listDeals({ limit: 50 });

    const companyIds = Array.from(
      new Set(deals.map((d) => d.companyId).filter((id): id is string => !!id)),
    );
    const companyLookup = new Map<string, string>();
    for (const id of companyIds) {
      try {
        const company = await adapter.getCompany(id);
        companyLookup.set(id, company.name);
      } catch {
        companyLookup.set(id, id);
      }
    }

    return (
      <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.5rem" }}>
          Pipeline
        </h1>
        <p style={{ color: "#666", marginBottom: "1.5rem" }}>
          {deals.length} deal{deals.length === 1 ? "" : "s"} from HubSpot — read
          via <code>CrmAdapter.listDeals()</code>. Styling lands Phase 2 Day 1.
        </p>
        {deals.length === 0 ? (
          <p style={{ color: "#666" }}>
            No deals yet. Seed HubSpot with{" "}
            <code>pnpm --filter @nexus/db seed:hubspot-minimal</code>, then
            pre-warm with{" "}
            <code>pnpm --filter @nexus/db prewarm:hubspot-cache</code>.
          </p>
        ) : (
          <table
            style={{
              borderCollapse: "collapse",
              width: "100%",
              fontSize: "0.875rem",
            }}
          >
            <thead>
              <tr style={{ textAlign: "left", background: "#f5f5f5" }}>
                <th style={{ padding: "0.5rem", borderBottom: "1px solid #ddd" }}>
                  Name
                </th>
                <th style={{ padding: "0.5rem", borderBottom: "1px solid #ddd" }}>
                  Company
                </th>
                <th style={{ padding: "0.5rem", borderBottom: "1px solid #ddd" }}>
                  Stage
                </th>
                <th
                  style={{
                    padding: "0.5rem",
                    borderBottom: "1px solid #ddd",
                    textAlign: "right",
                  }}
                >
                  Value
                </th>
                <th style={{ padding: "0.5rem", borderBottom: "1px solid #ddd" }}>
                  Close Date
                </th>
              </tr>
            </thead>
            <tbody>
              {deals.map((deal) => (
                <tr key={deal.hubspotId}>
                  <td style={{ padding: "0.5rem", borderBottom: "1px solid #eee" }}>
                    {deal.name}
                  </td>
                  <td style={{ padding: "0.5rem", borderBottom: "1px solid #eee" }}>
                    {deal.companyId ? companyLookup.get(deal.companyId) ?? "—" : "—"}
                  </td>
                  <td style={{ padding: "0.5rem", borderBottom: "1px solid #eee" }}>
                    {STAGE_LABELS[deal.stage] ?? deal.stage}
                  </td>
                  <td
                    style={{
                      padding: "0.5rem",
                      borderBottom: "1px solid #eee",
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatAmount(deal.amount, deal.currency)}
                  </td>
                  <td style={{ padding: "0.5rem", borderBottom: "1px solid #eee" }}>
                    {formatDate(deal.closeDate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    );
  } finally {
    await adapter.close();
  }
}
