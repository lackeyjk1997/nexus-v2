/**
 * Pattern D RLS verification for `deal_contact_roles` (Phase 2 Day 4 Session A).
 *
 * Policy shape (from 0001_auth_fk_and_rls.sql line 273):
 *   - FOR SELECT TO authenticated USING (true) → read-all for authed users.
 *   - No INSERT/UPDATE/DELETE policies → default DENY for non-service-role.
 *
 * Mirrors test-rls-meddpicc.ts — permanent verification artifact, re-run when
 * RLS policies on `deal_contact_roles` change.
 *
 * Steps:
 *   1. Sarah (authed anon client) INSERT → DENIED
 *   2. Sarah (authed anon client) UPDATE on a row that doesn't exist → DENIED / 0 rows
 *   3. Service-role UPSERT → allowed (bypasses RLS)
 *   4. Sarah (authed anon client) SELECT → allowed (read-all)
 *   5. Marcus (different authed user) SELECT → allowed (read-all; not isolated by user)
 *   6. Cleanup via service-role
 */
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "../../../../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Throwaway deal + contact ids — obviously a test fixture.
const TEST_DEAL_ID = "rls-test-000000-dcr-deal";
const TEST_CONTACT_ID = "rls-test-000000-dcr-contact";

async function signInAs(email: string): Promise<SupabaseClient> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: "http://localhost:3001/auth/callback" },
  });
  if (error || !data.properties?.email_otp) {
    throw error ?? new Error(`generateLink returned no OTP for ${email}`);
  }
  const c = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error: verifyError } = await c.auth.verifyOtp({
    email,
    token: data.properties.email_otp,
    type: "email",
  });
  if (verifyError || !session.session) {
    throw verifyError ?? new Error("verifyOtp returned no session");
  }
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: { Authorization: `Bearer ${session.session.access_token}` },
    },
  });
}

async function main() {
  console.log(`[0/6] Cleanup any prior test row…`);
  await admin
    .from("deal_contact_roles")
    .delete()
    .eq("hubspot_deal_id", TEST_DEAL_ID);

  const sarahEmail = process.env.RLS_TEST_SARAH_EMAIL ?? "jeff.lackey97@gmail.com";
  const marcusEmail = process.env.RLS_TEST_MARCUS_EMAIL ?? "lackeyjk1997@gmail.com";

  console.log(`[1/6] Sarah sign-in + authed anon client INSERT (expect DENY)…`);
  const sarah = await signInAs(sarahEmail);
  const sarahInsert = await sarah.from("deal_contact_roles").insert({
    hubspot_deal_id: TEST_DEAL_ID,
    hubspot_contact_id: TEST_CONTACT_ID,
    role: "champion",
    is_primary: false,
  });
  if (!sarahInsert.error) {
    throw new Error(
      "FAIL — authed anon client INSERT succeeded; Pattern D broken",
    );
  }
  console.log(
    `      DENIED as expected (code=${sarahInsert.error.code ?? "?"})`,
  );

  console.log(
    `[2/6] Sarah authed anon UPDATE on a row that doesn't exist (expect DENY or 0 rows via policy filter)…`,
  );
  const sarahUpdate = await sarah
    .from("deal_contact_roles")
    .update({ role: "blocker" })
    .eq("hubspot_deal_id", TEST_DEAL_ID)
    .eq("hubspot_contact_id", TEST_CONTACT_ID);
  console.log(
    `      result: error=${sarahUpdate.error?.code ?? "none"} status=${sarahUpdate.status}`,
  );

  console.log(`[3/6] Service-role UPSERT (expect SUCCESS — bypasses RLS)…`);
  const adminInsert = await admin.from("deal_contact_roles").upsert(
    {
      hubspot_deal_id: TEST_DEAL_ID,
      hubspot_contact_id: TEST_CONTACT_ID,
      role: "champion",
      is_primary: true,
    },
    { onConflict: "hubspot_deal_id,hubspot_contact_id" },
  );
  if (adminInsert.error) {
    throw new Error(
      `FAIL — service-role upsert errored: ${adminInsert.error.message}`,
    );
  }
  console.log(`      OK`);

  console.log(`[4/6] Sarah authed anon SELECT (expect SUCCESS — read-all)…`);
  const sarahSelect = await sarah
    .from("deal_contact_roles")
    .select("hubspot_deal_id, hubspot_contact_id, role, is_primary")
    .eq("hubspot_deal_id", TEST_DEAL_ID);
  if (sarahSelect.error || !sarahSelect.data?.length) {
    throw new Error(
      `FAIL — authed SELECT returned no row: ${JSON.stringify(sarahSelect.error ?? sarahSelect.data)}`,
    );
  }
  console.log(`      OK — row returned: ${JSON.stringify(sarahSelect.data[0])}`);

  console.log(
    `[5/6] Marcus (different authed user) SELECT (expect SUCCESS — pattern D is read-all)…`,
  );
  const marcus = await signInAs(marcusEmail);
  const marcusSelect = await marcus
    .from("deal_contact_roles")
    .select("hubspot_deal_id, hubspot_contact_id, role")
    .eq("hubspot_deal_id", TEST_DEAL_ID);
  if (marcusSelect.error || !marcusSelect.data?.length) {
    throw new Error(
      `FAIL — Marcus SELECT blocked: ${JSON.stringify(marcusSelect.error ?? marcusSelect.data)}`,
    );
  }
  console.log(
    `      OK — Marcus can read the row Sarah/admin wrote (read-all semantics correct)`,
  );

  console.log(`[6/6] Cleanup via service-role…`);
  await admin
    .from("deal_contact_roles")
    .delete()
    .eq("hubspot_deal_id", TEST_DEAL_ID);
  console.log(`      OK`);

  console.log("");
  console.log("Pattern D RLS on deal_contact_roles: VERIFIED.");
  console.log("  - authed anon INSERT → denied");
  console.log("  - authed anon SELECT → allowed (read-all)");
  console.log("  - service-role write → allowed");
  console.log("  - cross-user SELECT visibility matches pattern D (not user-scoped)");
  process.exit(0);
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
