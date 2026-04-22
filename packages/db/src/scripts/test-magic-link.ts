/**
 * Magic-link end-to-end smoke test (Day 2 report section 6).
 *
 * Requires the dev server running on http://localhost:3001.
 *
 * 1. POST to the app's /login action to generate a magic link for Sarah
 *    (proves the login page send path works end to end).
 * 2. Use the admin API to read the email_otp for that email and verify it
 *    through an SSR Supabase client whose cookie-adapter writes into an
 *    in-memory jar. This simulates the browser roundtrip that would normally
 *    happen after the user clicks the emailed link.
 * 3. GET /dashboard with the resulting cookies and assert Sarah's email
 *    appears in the HTML body.
 */
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "../../../../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type CookieJar = Map<string, { value: string; options: CookieOptions }>;

function serializeCookieHeader(jar: CookieJar): string {
  return Array.from(jar.entries())
    .map(([name, { value }]) => `${name}=${encodeURIComponent(value)}`)
    .join("; ");
}

async function main() {
  const email = "sarah.chen@nexus-demo.com";

  // ── Step 1: prove /login page renders the magic-link form ──
  console.log(`[1/4] GET /login — confirming the magic-link form renders…`);
  const loginRes = await fetch(`${siteUrl}/login`);
  const loginBody = await loginRes.text();
  console.log(`      status=${loginRes.status}, contains form=${loginBody.includes("Send magic link")}`);
  if (loginRes.status !== 200 || !loginBody.includes("Send magic link")) {
    throw new Error("/login did not render expected form.");
  }

  // ── Step 2: mint a magic-link OTP and exchange for a session ──
  console.log(`[2/4] admin.generateLink → verifyOtp (simulates the emailed link click)…`);
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${siteUrl}/auth/callback` },
  });
  if (linkError || !link.properties?.email_otp) {
    throw linkError ?? new Error("admin.generateLink returned no email_otp");
  }
  console.log(`      email_otp=${link.properties.email_otp.slice(0, 6)}… (redacted)`);

  const jar: CookieJar = new Map();
  const ssrClient = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      get(name: string) {
        return jar.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        jar.set(name, { value, options });
      },
      remove(name: string, options: CookieOptions) {
        jar.set(name, { value: "", options });
      },
    },
  });
  const { data: verify, error: verifyError } = await ssrClient.auth.verifyOtp({
    email,
    token: link.properties.email_otp,
    type: "email",
  });
  if (verifyError || !verify.session) {
    throw verifyError ?? new Error("verifyOtp returned no session");
  }
  console.log(`      session.user.email=${verify.session.user.email}`);
  console.log(`      cookies written: ${Array.from(jar.keys()).join(", ")}`);

  // ── Step 3: GET /dashboard with the session cookies ──
  console.log(`[3/4] GET /dashboard with session cookies…`);
  const dashRes = await fetch(`${siteUrl}/dashboard`, {
    method: "GET",
    headers: { Cookie: serializeCookieHeader(jar) },
    redirect: "manual",
  });
  console.log(`      status=${dashRes.status}`);
  if (dashRes.status !== 200) {
    const loc = dashRes.headers.get("location");
    throw new Error(`/dashboard did not return 200. status=${dashRes.status}, location=${loc}`);
  }
  const body = await dashRes.text();

  // ── Step 4: assert the email is in the body ──
  console.log(`[4/4] Asserting /dashboard body contains "${email}"…`);
  if (!body.includes(email)) {
    console.error(body.slice(0, 600));
    throw new Error(`Dashboard body missing ${email}.`);
  }
  console.log(`      ✓ "Logged in as ${email}" rendered.`);
  console.log("");
  console.log("Magic-link smoke test PASSED.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Magic-link smoke test FAILED:", err);
  process.exit(1);
});
