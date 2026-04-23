/**
 * Pattern A RLS verification for `observations` (Phase 2 Day 4 Session B).
 *
 * Policy shape (from 0001_auth_fk_and_rls.sql lines 88-100):
 *   - SELECT/UPDATE/DELETE TO authenticated USING (observer_id = auth.uid() OR public.is_admin())
 *   - INSERT TO authenticated WITH CHECK (observer_id = auth.uid())
 *
 * This is Pattern A, NOT Pattern D — observer writes their own rows directly
 * through the user-session (anon + JWT) client, not via service-role. Unlike
 * the meddpicc_scores and deal_contact_roles tests from Day 3 / Session A,
 * this test exercises the anon-client INSERT path (allowed) AND verifies
 * cross-user isolation (Sarah cannot read Marcus's row).
 *
 * Steps:
 *   1. Sarah INSERT own row (observer_id = sarah.id) → ALLOWED
 *   2. Sarah INSERT row with OTHER observer_id → DENIED
 *   3. Sarah SELECT her own row → returns 1 row
 *   4. Marcus SELECT Sarah's row → returns 0 rows (cross-user isolation)
 *   5. Service-role SELECT both rows → bypass works
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

const RLS_TEST_MARKER = "rls-test-000000-observations";

async function signInAs(
  email: string,
): Promise<{ client: SupabaseClient; userId: string }> {
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
  if (verifyError || !session.session || !session.user) {
    throw verifyError ?? new Error("verifyOtp returned no session/user");
  }
  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: { Authorization: `Bearer ${session.session.access_token}` },
    },
  });
  return { client, userId: session.user.id };
}

async function main() {
  console.log(`[0/6] Cleanup any prior test rows…`);
  await admin.from("observations").delete().like("raw_input", `%${RLS_TEST_MARKER}%`);

  const sarahEmail = process.env.RLS_TEST_SARAH_EMAIL ?? "jeff.lackey97@gmail.com";
  const marcusEmail = process.env.RLS_TEST_MARCUS_EMAIL ?? "lackeyjk1997@gmail.com";

  const { client: sarah, userId: sarahId } = await signInAs(sarahEmail);
  const { client: marcus, userId: marcusId } = await signInAs(marcusEmail);

  console.log(`[1/6] Sarah INSERT own row (observer_id = sarah.id)…`);
  const sarahOwnRow = await sarah
    .from("observations")
    .insert({
      observer_id: sarahId,
      raw_input: `sarah-own ${RLS_TEST_MARKER}`,
      signal_type: "field_intelligence",
      source_context: { category: "close_lost_preliminary", test: true },
    })
    .select()
    .single();
  if (sarahOwnRow.error || !sarahOwnRow.data) {
    throw new Error(
      `FAIL — Sarah's own-row INSERT rejected: ${sarahOwnRow.error?.message}`,
    );
  }
  console.log(`      OK — inserted row id=${sarahOwnRow.data.id}`);

  console.log(`[2/6] Sarah INSERT row with OTHER observer_id (Marcus) → expect DENY…`);
  const sarahImpersonate = await sarah.from("observations").insert({
    observer_id: marcusId,
    raw_input: `sarah-impersonate-marcus ${RLS_TEST_MARKER}`,
    signal_type: "field_intelligence",
    source_context: { test: true },
  });
  if (!sarahImpersonate.error) {
    throw new Error(
      "FAIL — impersonation INSERT succeeded; Pattern A check broken",
    );
  }
  console.log(
    `      DENIED as expected (code=${sarahImpersonate.error.code ?? "?"})`,
  );

  console.log(`[3/6] Sarah SELECT her own row → expect 1 row…`);
  const sarahSelect = await sarah
    .from("observations")
    .select("id, observer_id, raw_input")
    .like("raw_input", `%${RLS_TEST_MARKER}%`);
  if (sarahSelect.error) {
    throw new Error(`FAIL — Sarah SELECT errored: ${sarahSelect.error.message}`);
  }
  if ((sarahSelect.data?.length ?? 0) !== 1) {
    throw new Error(
      `FAIL — Sarah SELECT returned ${sarahSelect.data?.length ?? 0} rows, expected 1`,
    );
  }
  console.log(`      OK — 1 row returned`);

  console.log(`[4/6] Marcus SELECT Sarah's row → expect 0 rows (cross-user isolation)…`);
  const marcusSelect = await marcus
    .from("observations")
    .select("id, observer_id, raw_input")
    .like("raw_input", `%${RLS_TEST_MARKER}%`);
  if (marcusSelect.error) {
    throw new Error(
      `FAIL — Marcus SELECT errored: ${marcusSelect.error.message}`,
    );
  }
  if ((marcusSelect.data?.length ?? 0) !== 0) {
    throw new Error(
      `FAIL — Marcus SELECT returned ${marcusSelect.data?.length ?? 0} rows — cross-user isolation broken`,
    );
  }
  console.log(`      OK — 0 rows returned (isolation verified)`);

  console.log(`[5/6] Service-role SELECT → expect to see Sarah's row (bypass)…`);
  const adminSelect = await admin
    .from("observations")
    .select("id, observer_id, raw_input")
    .like("raw_input", `%${RLS_TEST_MARKER}%`);
  if (adminSelect.error || (adminSelect.data?.length ?? 0) !== 1) {
    throw new Error(
      `FAIL — service-role SELECT did not return the row: ${JSON.stringify(adminSelect.error ?? adminSelect.data)}`,
    );
  }
  console.log(`      OK — service-role sees all rows`);

  console.log(`[6/6] Cleanup via service-role…`);
  await admin.from("observations").delete().like("raw_input", `%${RLS_TEST_MARKER}%`);
  console.log(`      OK`);

  console.log("");
  console.log("Pattern A RLS on observations: VERIFIED.");
  console.log("  - authed user INSERT own row → allowed");
  console.log("  - authed user INSERT impersonating another observer_id → denied");
  console.log("  - cross-user SELECT returns 0 rows (Pattern A isolation)");
  console.log("  - service-role bypass works (for admin + server-action paths)");
  process.exit(0);
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
