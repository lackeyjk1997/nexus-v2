/**
 * 07C Step 7 (Day-5 minimal slice) — seed ONE company, ONE contact, ONE deal.
 *
 * MedVista Health · Dr. Michael Chen, Chief of Surgery · MedVista Epic
 * Integration ($2.4M, Discovery, close+55d).
 *
 * Idempotent by name match: if a company with the same name already exists in
 * HubSpot, reuses it. Same for the contact (by email) and deal (by name).
 *
 * Usage:
 *   pnpm --filter @nexus/db seed:hubspot-minimal
 */

import {
  HubSpotAdapter,
  HubSpotClient,
  loadPipelineIds,
  type Company,
  type Contact,
  type Deal,
  type HubSpotObject,
} from "@nexus/shared";

import { loadDevEnv, requireEnv } from "@nexus/shared";

const MEDVISTA = {
  company: {
    name: "MedVista Health",
    domain: "medvista-demo.example.com",
    vertical: "healthcare" as const,
    employeeCount: 3200,
    annualRevenue: 480_000_000,
    techStack: ["Epic", "Dragon Medical", "PACS"],
  },
  contact: {
    firstName: "Michael",
    lastName: "Chen",
    email: "michael.chen@medvista-demo.example.com",
    title: "Chief of Surgery",
  },
  deal: {
    name: "MedVista Epic Integration",
    amount: 2_400_000,
    stage: "discovery" as const,
    closeDaysAhead: 55,
  },
};

async function findExistingCompanyByName(
  http: HubSpotClient,
  name: string,
): Promise<string | null> {
  const { body } = await http.request<{
    results: Array<{ id: string }>;
  }>({
    method: "POST",
    path: "/crm/v3/objects/companies/search",
    body: {
      limit: 1,
      properties: ["name"],
      filterGroups: [
        {
          filters: [
            { propertyName: "name", operator: "EQ", value: name },
          ],
        },
      ],
    },
  });
  return body.results[0]?.id ?? null;
}

async function findExistingContactByEmail(
  http: HubSpotClient,
  email: string,
): Promise<string | null> {
  const { body } = await http.request<{
    results: Array<{ id: string }>;
  }>({
    method: "POST",
    path: "/crm/v3/objects/contacts/search",
    body: {
      limit: 1,
      properties: ["email"],
      filterGroups: [
        {
          filters: [
            { propertyName: "email", operator: "EQ", value: email },
          ],
        },
      ],
    },
  });
  return body.results[0]?.id ?? null;
}

async function findExistingDealByName(
  http: HubSpotClient,
  name: string,
): Promise<string | null> {
  const { body } = await http.request<{
    results: Array<{ id: string }>;
  }>({
    method: "POST",
    path: "/crm/v3/objects/deals/search",
    body: {
      limit: 1,
      properties: ["dealname"],
      filterGroups: [
        {
          filters: [
            { propertyName: "dealname", operator: "EQ", value: name },
          ],
        },
      ],
    },
  });
  return body.results[0]?.id ?? null;
}

async function main(): Promise<void> {
  loadDevEnv();
  const token = requireEnv("NEXUS_HUBSPOT_TOKEN");
  const portalId = requireEnv("HUBSPOT_PORTAL_ID");
  const clientSecret = requireEnv("HUBSPOT_CLIENT_SECRET");
  const databaseUrl = requireEnv("DATABASE_URL");

  const pipelineIds = loadPipelineIds();
  if (!pipelineIds.pipelineId) {
    throw new Error(
      "pipeline-ids.json is empty — run provision:hubspot-pipeline first.",
    );
  }

  const http = new HubSpotClient({ token });
  const adapter = new HubSpotAdapter({
    token,
    portalId,
    clientSecret,
    databaseUrl,
    pipelineIds,
    httpClient: http,
  });

  try {
    console.log(`Seed target: portal ${portalId}`);

    // Company
    let company: Company;
    const existingCompanyId = await findExistingCompanyByName(
      http,
      MEDVISTA.company.name,
    );
    if (existingCompanyId) {
      console.log(
        `  [=] Company "${MEDVISTA.company.name}" exists (${existingCompanyId})`,
      );
      company = await adapter.getCompany(existingCompanyId);
    } else {
      company = await adapter.createCompany({
        name: MEDVISTA.company.name,
        domain: MEDVISTA.company.domain,
        vertical: MEDVISTA.company.vertical,
        employeeCount: MEDVISTA.company.employeeCount,
        annualRevenue: MEDVISTA.company.annualRevenue,
        customProperties: {
          nexus_tech_stack: MEDVISTA.company.techStack.join(", "),
          nexus_enrichment_source: "simulated",
        },
      });
      console.log(
        `  [+] Created company "${company.name}" (${company.hubspotId})`,
      );
    }

    // Contact
    let contact: Contact;
    const existingContactId = await findExistingContactByEmail(
      http,
      MEDVISTA.contact.email,
    );
    if (existingContactId) {
      console.log(
        `  [=] Contact ${MEDVISTA.contact.email} exists (${existingContactId})`,
      );
      // Fetch minimally from HubSpot to populate cache.
      const { body: raw } = await http.request<HubSpotObject>({
        method: "GET",
        path: `/crm/v3/objects/contacts/${existingContactId}`,
        query:
          "properties=firstname,lastname,email,jobtitle,phone&associations=companies",
      });
      contact = {
        hubspotId: raw.id,
        firstName: raw.properties.firstname ?? "",
        lastName: raw.properties.lastname ?? "",
        email: raw.properties.email ?? null,
        phone: raw.properties.phone ?? null,
        title: raw.properties.jobtitle ?? null,
        linkedinUrl: null,
        companyId: raw.associations?.companies?.results[0]?.id ?? null,
        createdAt: new Date(raw.createdAt),
        updatedAt: new Date(raw.updatedAt),
        customProperties: {},
      };
    } else {
      contact = await adapter.createContact({
        firstName: MEDVISTA.contact.firstName,
        lastName: MEDVISTA.contact.lastName,
        email: MEDVISTA.contact.email,
        title: MEDVISTA.contact.title,
        companyId: company.hubspotId,
      });
      console.log(
        `  [+] Created contact "${contact.firstName} ${contact.lastName}" (${contact.hubspotId})`,
      );
    }

    // Deal
    let deal: Deal;
    const existingDealId = await findExistingDealByName(
      http,
      MEDVISTA.deal.name,
    );
    if (existingDealId) {
      console.log(
        `  [=] Deal "${MEDVISTA.deal.name}" exists (${existingDealId})`,
      );
      deal = await adapter.getDeal(existingDealId);
    } else {
      const closeDate = new Date(
        Date.now() + MEDVISTA.deal.closeDaysAhead * 24 * 60 * 60 * 1000,
      );
      deal = await adapter.createDeal({
        name: MEDVISTA.deal.name,
        companyId: company.hubspotId,
        primaryContactId: contact.hubspotId,
        stage: MEDVISTA.deal.stage,
        amount: MEDVISTA.deal.amount,
        closeDate,
        vertical: MEDVISTA.company.vertical,
        customProperties: {
          nexus_product: "claude_enterprise",
          nexus_lead_source: "outbound",
        },
      });
      console.log(`  [+] Created deal "${deal.name}" (${deal.hubspotId})`);
    }

    console.log("Seed complete:");
    console.log(`  Company ID: ${company.hubspotId}`);
    console.log(`  Contact ID: ${contact.hubspotId}`);
    console.log(`  Deal ID:    ${deal.hubspotId}`);
    console.log(`  Deal stage: ${deal.stage} (${deal.amount})`);
  } finally {
    await adapter.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
