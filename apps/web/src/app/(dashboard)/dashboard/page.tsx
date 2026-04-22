import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function signOut() {
  "use server";
  const { redirect } = await import("next/navigation");
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email ?? "unknown";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <div className="max-w-xl space-y-4 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted">
          Logged in as <span className="font-medium text-foreground">{email}</span>
        </p>
        <p className="text-sm text-muted">
          Phase 1 Day 2 complete. UI lands Phase 2.
        </p>
      </div>
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition hover:bg-surface"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
