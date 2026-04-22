/**
 * End-to-end browser-equivalent test for Day 3.
 *
 *   sign in as Sarah
 *   POST /api/jobs/enqueue { type: 'noop' }    ← as authenticated user
 *   subscribe to Supabase Realtime on jobs.id=eq.${jobId}
 *   wait for status=succeeded via Realtime events
 *   assert total elapsed < 20s
 *
 * Against localhost, pg_cron cannot reach our machine, so we curl
 * /api/jobs/worker once after enqueue to simulate what cron would do in prod.
 * Against a prod URL, we rely on the real pg_cron schedule (set by
 * configure-cron.ts).
 *
 * Usage:
 *   pnpm --filter @nexus/db test:e2e                           # localhost
 *   WORKER_URL=https://nexus-v2-five.vercel.app pnpm ... test:e2e   # prod
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env.local") });

const baseUrl = process.env.WORKER_URL ?? "http://localhost:3001";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const cronSecret = process.env.CRON_SECRET!;

const isLocalhost = baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");

async function signIn(email: string) {
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: link, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${baseUrl}/auth/callback` },
  });
  if (error || !link.properties?.email_otp) throw error ?? new Error("no otp");

  const jar = new Map<string, { value: string; options: CookieOptions }>();
  const client = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      get: (n: string) => jar.get(n)?.value,
      set: (n: string, v: string, o: CookieOptions) => jar.set(n, { value: v, options: o }),
      remove: (n: string, o: CookieOptions) => jar.set(n, { value: "", options: o }),
    },
  });
  const { data: verified, error: vErr } = await client.auth.verifyOtp({
    email,
    token: link.properties.email_otp,
    type: "email",
  });
  if (vErr || !verified.session) throw vErr ?? new Error("no session");

  const cookieHeader = Array.from(jar.entries())
    .map(([n, { value }]) => `${n}=${encodeURIComponent(value)}`)
    .join("; ");
  return { cookieHeader, accessToken: verified.session.access_token };
}

async function main() {
  console.log(`E2E job test against ${baseUrl}`);
  console.log(`  mode: ${isLocalhost ? "localhost (manual worker trigger)" : "prod (pg_cron-driven)"}`);

  const email = "sarah.chen@nexus-demo.com";
  const { cookieHeader, accessToken } = await signIn(email);
  console.log(`[1/5] signed in as ${email}`);

  const enqueueStart = Date.now();
  const enqRes = await fetch(`${baseUrl}/api/jobs/enqueue`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify({ type: "noop", input: { tag: "e2e" } }),
  });
  const enqBody = (await enqRes.json()) as { jobId?: string; error?: string };
  if (!enqRes.ok || !enqBody.jobId) {
    throw new Error(`enqueue failed: ${enqRes.status} ${JSON.stringify(enqBody)}`);
  }
  const jobId = enqBody.jobId;
  console.log(`[2/5] enqueued jobId=${jobId} in ${Date.now() - enqueueStart}ms`);

  // Subscribe to Realtime under Sarah's access token so RLS + Realtime policies
  // both see an authenticated user.
  const realtimeClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  realtimeClient.realtime.setAuth(accessToken);

  const transitions: Array<{ status: string; at: number }> = [];
  const t0 = Date.now();
  const channel = realtimeClient.channel(`job:${jobId}`);

  const subscribed = new Promise<void>((resolveSub) => {
    channel
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${jobId}` },
        (payload) => {
          const status = (payload.new as { status: string }).status;
          transitions.push({ status, at: Date.now() - t0 });
          console.log(`  ← realtime UPDATE status=${status} at t+${Date.now() - t0}ms`);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") resolveSub();
      });
  });
  await subscribed;
  console.log(`[3/5] Realtime subscribed`);

  if (isLocalhost) {
    console.log(`[4a/5] localhost — manually triggering worker…`);
    const r = await fetch(`${baseUrl}/api/jobs/worker`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    console.log(`       worker responded: ${r.status}`);
  } else {
    console.log(`[4b/5] prod — waiting for pg_cron (fires every 10s)…`);
  }

  const DEADLINE_MS = 25_000;
  const deadline = Date.now() + DEADLINE_MS;
  while (Date.now() < deadline) {
    const last = transitions[transitions.length - 1];
    if (last && (last.status === "succeeded" || last.status === "failed")) break;
    await new Promise((r) => setTimeout(r, 250));
  }

  await realtimeClient.removeChannel(channel);

  const terminal = transitions[transitions.length - 1];
  if (!terminal) {
    throw new Error(`no Realtime events received within ${DEADLINE_MS}ms`);
  }
  console.log(`[5/5] terminal status=${terminal.status} at t+${terminal.at}ms`);
  console.log(`      transition timeline: ${transitions.map((t) => `${t.status}@${t.at}ms`).join(" → ")}`);

  if (terminal.status !== "succeeded") {
    throw new Error(`job ended ${terminal.status}, expected succeeded`);
  }
  if (terminal.at > 20_000) {
    throw new Error(`terminal state took ${terminal.at}ms, exceeds 20s budget`);
  }
  console.log("");
  console.log(`E2E test PASSED (${terminal.at}ms total, ${isLocalhost ? "manual" : "pg_cron"} worker)`);
  process.exit(0);
}

main().catch((err) => {
  console.error("E2E test FAILED:", err);
  process.exit(1);
});
