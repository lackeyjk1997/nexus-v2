function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}. Copy .env.example → .env.local and fill in.`);
  }
  return value;
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get siteUrl() {
    return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";
  },
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get hubspotToken() {
    return required("NEXUS_HUBSPOT_TOKEN");
  },
  get hubspotPortalId() {
    return required("HUBSPOT_PORTAL_ID");
  },
  /**
   * HubSpot webhook signatures (v3) are HMAC-SHA256 over the private app's
   * client secret — see 07C Section 5.5. Stored as HUBSPOT_CLIENT_SECRET to
   * match the private-app nomenclature on HubSpot's own admin UI.
   */
  get hubspotClientSecret() {
    return required("HUBSPOT_CLIENT_SECRET");
  },
};
