import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/**
 * Landing page. Also handles the fallback case where a Supabase magic link
 * strands the user at Site URL root with a ?code= query param — Supabase does
 * this when it can't validate `emailRedirectTo` against its Redirect URLs
 * allowlist (e.g., HTTPS → HTTP downgrade, or allowlist drift). Forward any
 * `?code=` we receive here into /auth/callback so the session establishes.
 * See DECISIONS.md 2.1.1.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; next?: string }>;
}) {
  const params = await searchParams;
  if (params.code) {
    const qs = new URLSearchParams({ code: params.code });
    if (params.next) qs.set("next", params.next);
    redirect(`/auth/callback?${qs.toString()}`);
  }

  return (
    <main className="bg-base flex min-h-screen items-center justify-center px-6">
      <div className="max-w-xl space-y-6 text-center">
        <h1 className="text-primary font-display text-5xl font-regular leading-tight tracking-tight">
          Nexus
        </h1>
        <p className="text-secondary text-lg leading-relaxed">
          AI sales orchestration. Intelligence that compounds across deals — and
          knows when to stay quiet.
        </p>
        <div className="flex justify-center">
          <Button asChild size="lg">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
