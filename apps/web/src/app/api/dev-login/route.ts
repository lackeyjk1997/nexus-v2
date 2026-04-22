import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * Dev-only login helper for browser verification.
 *
 * Use case: fast local iteration that needs an authenticated session without
 * going through the magic-link 35s rate limit or a real email round-trip.
 * Replaces the OTP-consume flow (which invalidates on reuse) with a
 * throwaway-password grant via service-role admin:
 *   admin.listUsers → updateUserById({password: throwaway}) → signInWithPassword
 *
 * DOUBLE GUARD (DECISIONS.md §2.1.1 / BUILD-LOG operational notes):
 *   1. `Host: localhost|127.0.0.1` — off-localhost requests 404 instantly.
 *   2. `DEV_LOGIN_ENABLED=1` env flag — must be explicitly set, must NOT be
 *      set on Vercel (Production / Preview / Development all omit it).
 *
 * Either guard failing returns 404. Both must be satisfied together for the
 * route to mint a session. Changing the password on each call invalidates
 * any prior session for that user — intentional, so a stale preview tab
 * reflects the latest throwaway credential.
 *
 * Post-demo: remove once the Playwright+admin-cookie-injection post-deploy
 * smoke lands (parked Pre-Phase 3 Day 1). Until then, this is the fastest
 * path to a real authenticated browser session during a build day.
 */
export async function GET(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const isLocalhost = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  if (!isLocalhost) {
    return NextResponse.json({ error: "disabled off-localhost" }, { status: 404 });
  }
  if (process.env.DEV_LOGIN_ENABLED !== "1") {
    return NextResponse.json(
      { error: "DEV_LOGIN_ENABLED env flag not set" },
      { status: 404 },
    );
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceRoleKey || !supabaseUrl) {
    return NextResponse.json({ error: "missing service role config" }, { status: 500 });
  }
  const { searchParams, origin } = new URL(request.url);
  const email = searchParams.get("email");
  const next = searchParams.get("next") ?? "/dashboard";
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const listResp = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listResp.error) return NextResponse.json({ error: listResp.error.message }, { status: 500 });
  const user = listResp.data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) return NextResponse.json({ error: `user not found: ${email}` }, { status: 404 });
  const throwawayPassword = `dev-test-${user.id.slice(0, 8)}-${Date.now()}`;
  const updateResp = await admin.auth.admin.updateUserById(user.id, { password: throwawayPassword });
  if (updateResp.error) return NextResponse.json({ error: updateResp.error.message }, { status: 500 });
  const ssr = createSupabaseServerClient();
  const { error: signInError } = await ssr.auth.signInWithPassword({ email, password: throwawayPassword });
  if (signInError) return NextResponse.json({ error: signInError.message }, { status: 500 });
  return NextResponse.redirect(`${origin}${next}`);
}
