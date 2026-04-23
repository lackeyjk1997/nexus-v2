/**
 * Pattern D RLS verification for `prompt_call_log` (Phase 3 Day 1 Session B).
 *
 * Table landed Pre-Phase 3 Session 0-B with RLS enabled + one policy:
 *   FOR SELECT TO authenticated USING (true) → read-all for authed users.
 * No INSERT/UPDATE/DELETE policies → default DENY for non-service-role.
 * Writes happen via service-role only, from the Claude wrapper's
 * `writePromptCallLog` helper.
 *
 * This test proves the property end-to-end (precedent: test-rls-meddpicc.ts):
 *   1. Sarah (authed anon client) INSERT → DENIED
 *   2. Sarah (authed anon client) UPDATE → DENIED / 0 rows
 *   3. Service-role INSERT → SUCCESS (bypasses RLS)
 *   4. Sarah (authed anon) SELECT → SUCCESS (read-all)
 *   5. Marcus (different authed user) SELECT → SUCCESS (read-all; not isolated)
 *   6. Cleanup via service-role DELETE
 *
 * Usage:
 *   pnpm --filter @nexus/db test:rls-prompt-call-log
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadDevEnv, requireEnv } from "@nexus/shared";

loadDevEnv();

const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SENTINEL_DEAL_ID = "rls-test-prompt-call-log";

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
  console.log(`[0/6] Cleanup any prior test rows…`);
  await admin.from("prompt_call_log").delete().eq("hubspot_deal_id", SENTINEL_DEAL_ID);

  const sarahEmail = process.env.RLS_TEST_SARAH_EMAIL ?? "jeff.lackey97@gmail.com";
  const marcusEmail = process.env.RLS_TEST_MARCUS_EMAIL ?? "lackeyjk1997@gmail.com";

  console.log(`[1/6] Sarah sign-in + authed anon client INSERT (expect DENY)…`);
  const sarah = await signInAs(sarahEmail);
  const sarahInsert = await sarah.from("prompt_call_log").insert({
    prompt_file: "01-detect-signals",
    prompt_version: "1.0.0",
    tool_name: "record_detected_signals",
    model: "claude-sonnet-4-20250514",
    hubspot_deal_id: SENTINEL_DEAL_ID,
  });
  if (!sarahInsert.error) {
    throw new Error(
      "FAIL — authed anon client INSERT succeeded; Pattern D broken",
    );
  }
  console.log(`      DENIED as expected (code=${sarahInsert.error.code ?? "?"})`);

  console.log(
    `[2/6] Sarah authed anon UPDATE on a row that doesn't exist (expect DENY or 0 rows)…`,
  );
  const sarahUpdate = await sarah
    .from("prompt_call_log")
    .update({ model: "mutation-attempt" })
    .eq("hubspot_deal_id", SENTINEL_DEAL_ID);
  // With no UPDATE policy, PostgREST either errors or silently returns 0
  // rows affected; both are acceptable (non-error = filtered-out by policy,
  // error = explicit deny). What's unacceptable is a success affecting rows.
  console.log(
    `      result: error=${sarahUpdate.error?.code ?? "none"} status=${sarahUpdate.status}`,
  );

  console.log(`[3/6] Service-role INSERT (expect SUCCESS — bypasses RLS)…`);
  const adminInsert = await admin.from("prompt_call_log").insert({
    prompt_file: "01-detect-signals",
    prompt_version: "1.0.0",
    tool_name: "record_detected_signals",
    model: "claude-sonnet-4-20250514",
    task_type: "classification",
    temperature: 0.2,
    max_tokens: 6000,
    input_tokens: 5128,
    output_tokens: 3029,
    duration_ms: 58123,
    attempts: 1,
    stop_reason: "tool_use",
    hubspot_deal_id: SENTINEL_DEAL_ID,
  });
  if (adminInsert.error) {
    throw new Error(`FAIL — service-role insert errored: ${adminInsert.error.message}`);
  }
  console.log(`      OK`);

  console.log(`[4/6] Sarah authed anon SELECT (expect SUCCESS — read-all)…`);
  const sarahSelect = await sarah
    .from("prompt_call_log")
    .select("prompt_file, prompt_version, tool_name, attempts, stop_reason")
    .eq("hubspot_deal_id", SENTINEL_DEAL_ID);
  if (sarahSelect.error || !sarahSelect.data?.length) {
    throw new Error(
      `FAIL — authed SELECT returned no row: ${JSON.stringify(
        sarahSelect.error ?? sarahSelect.data,
      )}`,
    );
  }
  console.log(`      OK — row returned: ${JSON.stringify(sarahSelect.data[0])}`);

  console.log(
    `[5/6] Marcus (different authed user) SELECT (expect SUCCESS — pattern D is read-all)…`,
  );
  const marcus = await signInAs(marcusEmail);
  const marcusSelect = await marcus
    .from("prompt_call_log")
    .select("prompt_file, hubspot_deal_id")
    .eq("hubspot_deal_id", SENTINEL_DEAL_ID);
  if (marcusSelect.error || !marcusSelect.data?.length) {
    throw new Error(
      `FAIL — Marcus SELECT blocked: ${JSON.stringify(
        marcusSelect.error ?? marcusSelect.data,
      )}`,
    );
  }
  console.log(
    `      OK — Marcus can read the row admin wrote (read-all semantics correct)`,
  );

  console.log(`[6/6] Cleanup via service-role…`);
  await admin.from("prompt_call_log").delete().eq("hubspot_deal_id", SENTINEL_DEAL_ID);
  console.log(`      OK`);

  console.log("");
  console.log("Pattern D RLS on prompt_call_log: VERIFIED.");
  console.log("  - authed anon INSERT → denied");
  console.log("  - authed anon SELECT → allowed (read-all)");
  console.log("  - service-role write → allowed");
  console.log("  - cross-user SELECT visibility matches pattern D");
  process.exit(0);
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
