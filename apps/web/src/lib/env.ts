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
  /**
   * Canonical origin for this deployment. Server-side only.
   *
   * Fallback chain (matches the `/api/hubspot/webhook` handler so both flows
   * survive when only one env var is set):
   *   1. NEXT_PUBLIC_SITE_URL (explicit — preferred)
   *   2. VERCEL_PROJECT_PRODUCTION_URL (auto-set by Vercel; stable prod alias)
   *   3. VERCEL_URL (auto-set by Vercel; per-deployment URL)
   *   4. http://localhost:3001 (dev)
   *
   * Prior behavior silently returned localhost on production Vercel when
   * NEXT_PUBLIC_SITE_URL wasn't set, which broke magic-link emailRedirectTo
   * (Supabase rejects the HTTPS → HTTP downgrade and falls back to its
   * dashboard Site URL root, stranding users at / with a ?code= query param
   * that nothing handles). See DECISIONS.md 2.1.1.
   */
  get siteUrl() {
    const explicit = process.env.NEXT_PUBLIC_SITE_URL;
    if (explicit) return explicit.replace(/\/$/, "");
    const prodAlias = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    if (prodAlias) return `https://${prodAlias}`;
    const deployUrl = process.env.VERCEL_URL;
    if (deployUrl) return `https://${deployUrl}`;
    return "http://localhost:3001";
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
