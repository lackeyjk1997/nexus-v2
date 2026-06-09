import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * Token-gated demo login — Phase 4 Day 5 A (demo 2026-06-10 window).
 *
 * Why it exists: the demo runs from production, where the magic-link wall
 * would block (a) the automated Playwright verification of the demo path
 * and (b) a fast incognito rehearsal. This route mints a real Supabase
 * session — same mechanism as /api/dev-login's throwaway-password grant —
 * but gated by possession of a high-entropy server-held token instead of
 * the localhost+env double guard.
 *
 * GUARD: `?token=` must match DEMO_LOGIN_TOKEN (falls back to CRON_SECRET,
 * which is already set in all Vercel scopes — no new env provisioning
 * blocks the demo). Compared constant-time. Missing/wrong token → 404
 * indistinguishable from the route not existing. Without the token this
 * exposes nothing; the token lives only in env vars and is never logged.
 *
 * Reversibility (enterprise SSO is a productization-roadmap item — this
 * must not outlive the demo window): delete this file + optionally rotate
 * CRON_SECRET. Nothing else references it. Listed in the demo checkpoint
 * log's post-demo backlog as a removal item.
 *
 * Usage:
 *   /api/demo-login?token=<TOKEN>&next=/intelligence
 *   /api/demo-login?token=<TOKEN>&email=<seed-user>&next=/pipeline
 */
function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const DEFAULT_DEMO_EMAIL = "jeff.lackey97@gmail.com";

export async function GET(request: NextRequest) {
  const expectedToken =
    process.env.DEMO_LOGIN_TOKEN ?? process.env.CRON_SECRET ?? "";
  const { searchParams, origin } = new URL(request.url);
  const providedToken = searchParams.get("token") ?? "";
  if (expectedToken.length < 16 || !tokenMatches(providedToken, expectedToken)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceRoleKey || !supabaseUrl) {
    return NextResponse.json({ error: "missing service role config" }, { status: 500 });
  }

  const email = searchParams.get("email") ?? DEFAULT_DEMO_EMAIL;
  const next = searchParams.get("next") ?? "/intelligence";

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const listResp = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listResp.error) {
    return NextResponse.json({ error: listResp.error.message }, { status: 500 });
  }
  const user = listResp.data.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  if (!user) {
    return NextResponse.json({ error: `user not found: ${email}` }, { status: 404 });
  }
  const throwawayPassword = `demo-${user.id.slice(0, 8)}-${Date.now()}`;
  const updateResp = await admin.auth.admin.updateUserById(user.id, {
    password: throwawayPassword,
  });
  if (updateResp.error) {
    return NextResponse.json({ error: updateResp.error.message }, { status: 500 });
  }
  const ssr = createSupabaseServerClient();
  const { error: signInError } = await ssr.auth.signInWithPassword({
    email: user.email ?? email,
    password: throwawayPassword,
  });
  if (signInError) {
    return NextResponse.json({ error: signInError.message }, { status: 500 });
  }
  return NextResponse.redirect(`${origin}${next}`);
}
