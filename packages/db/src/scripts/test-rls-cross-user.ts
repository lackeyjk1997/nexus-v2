/**
 * Cross-user RLS test (Day 2 report section 5).
 *
 * 1. Insert an observation as Sarah via the service role (bypasses RLS).
 * 2. Sign in as Marcus via admin.generateLink, exchange the token for a session.
 * 3. Query observations WHERE observer_id=sarah.id with Marcus's anon-client session.
 * 4. Assert zero rows.
 * 5. Repeat as Sarah; assert one row.
 */
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import { createDb, observations, users } from "../index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "../../../../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const directUrl = process.env.DIRECT_URL!;

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const db = createDb(directUrl);

async function signInAs(email: string) {
  // generateLink returns the magic-link URL *and* the token we need to exchange.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: "http://localhost:3001/auth/callback" },
  });
  if (error || !data.properties?.email_otp) {
    throw error ?? new Error(`generateLink returned no OTP for ${email}`);
  }

  // Exchange the email_otp for a session (no browser round-trip needed).
  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: sessionData, error: verifyError } = await client.auth.verifyOtp({
    email,
    token: data.properties.email_otp,
    type: "email",
  });
  if (verifyError || !sessionData.session) {
    throw verifyError ?? new Error("verifyOtp returned no session");
  }
  // Return a fresh client with the session applied — this is what the app
  // would use for RLS-respecting queries on behalf of the user.
  const authed = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${sessionData.session.access_token}` } },
  });
  return { client: authed, userId: sessionData.session.user.id };
}

async function main() {
  const sarahEmail = "sarah.chen@nexus-demo.com";
  const marcusEmail = "marcus.thompson@nexus-demo.com";

  const sarahRow = (await db.select().from(users).where(eq(users.email, sarahEmail)))[0];
  const marcusRow = (await db.select().from(users).where(eq(users.email, marcusEmail)))[0];
  if (!sarahRow || !marcusRow) {
    throw new Error("Sarah or Marcus not seeded. Run `pnpm seed:users` first.");
  }

  // 1. Insert observation as Sarah via service role (bypasses RLS).
  await db.delete(observations).where(eq(observations.observerId, sarahRow.id));
  const [inserted] = await db
    .insert(observations)
    .values({
      observerId: sarahRow.id,
      rawInput: "RLS test observation — only Sarah should see this.",
      signalType: "field_intelligence",
      severity: "medium",
      status: "pending_review",
    })
    .returning();
  if (!inserted) throw new Error("Failed to insert test observation.");
  console.log(`[setup] Inserted observation ${inserted.id} with observer_id=${sarahRow.id}`);

  // 2. Sign in as Marcus, query Sarah's observations.
  const marcus = await signInAs(marcusEmail);
  const marcusQuery = await marcus.client
    .from("observations")
    .select("id, observer_id, raw_input")
    .eq("observer_id", sarahRow.id);
  console.log("");
  console.log("=== Query run as Marcus ===");
  console.log(`  client.from("observations").select("id, observer_id, raw_input").eq("observer_id", "${sarahRow.id}")`);
  console.log(`  → rows returned: ${marcusQuery.data?.length ?? 0}`);
  console.log(`  → raw response: ${JSON.stringify({ data: marcusQuery.data, error: marcusQuery.error })}`);
  if ((marcusQuery.data?.length ?? 0) !== 0) {
    throw new Error(`RLS VIOLATION: Marcus saw ${marcusQuery.data?.length} rows. Expected 0.`);
  }
  console.log("  ✓ Marcus sees 0 rows — RLS is enforcing.");

  // 3. Positive control: Sarah CAN see her own observation.
  const sarah = await signInAs(sarahEmail);
  const sarahQuery = await sarah.client
    .from("observations")
    .select("id, observer_id, raw_input")
    .eq("observer_id", sarahRow.id);
  console.log("");
  console.log("=== Query run as Sarah (positive control) ===");
  console.log(`  → rows returned: ${sarahQuery.data?.length ?? 0}`);
  if ((sarahQuery.data?.length ?? 0) !== 1) {
    throw new Error(`Positive control failed: Sarah saw ${sarahQuery.data?.length} rows. Expected 1.`);
  }
  console.log(`  ✓ Sarah sees her own row: ${sarahQuery.data?.[0]?.raw_input}`);

  // 4. Cleanup.
  await db.delete(observations).where(eq(observations.observerId, sarahRow.id));
  console.log("");
  console.log("[teardown] Cleaned up test observation.");
  console.log("");
  console.log("RLS cross-user test PASSED.");
  process.exit(0);
}

main().catch((err) => {
  console.error("RLS cross-user test FAILED:", err);
  process.exit(1);
});
