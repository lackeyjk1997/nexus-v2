import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

async function sendMagicLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    redirect(`/login?error=${encodeURIComponent("Email required")}`);
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${env.siteUrl}/auth/callback`,
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  redirect(`/login?sent=${encodeURIComponent(email)}`);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-surface p-8 shadow-sm">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Nexus v2</h1>
          <p className="text-sm text-muted">Sign in with a magic link.</p>
        </div>
        <form action={sendMagicLink} className="space-y-4">
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-foreground">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-md bg-brand px-3 py-2 text-sm font-medium text-background transition hover:opacity-90"
          >
            Send magic link
          </button>
        </form>
        {params.sent && (
          <p className="text-sm text-muted">
            Magic link sent to <span className="font-medium text-foreground">{params.sent}</span>.
            Check your inbox.
          </p>
        )}
        {params.error && (
          <p className="text-sm text-[color:hsl(0,60%,45%)]">{params.error}</p>
        )}
      </div>
    </main>
  );
}
