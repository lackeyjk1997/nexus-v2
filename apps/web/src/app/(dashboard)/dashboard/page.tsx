import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
    <div className="flex flex-1 flex-col gap-6 p-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-primary text-3xl font-semibold tracking-tight">
            Dashboard
          </h1>
          <p className="text-secondary mt-1 text-sm">
            Welcome back, <span className="text-primary font-medium">{email}</span>
          </p>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
          <CardDescription>
            Rep-facing intelligence surfaces, daily digest, and call-prep briefs
            land in Phase 4. Today the pipeline page shows the live HubSpot cache.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-secondary text-sm">
          Visit <span className="text-primary font-medium">Pipeline</span> in the
          left rail to see the seeded MedVista deal.
        </CardContent>
      </Card>
    </div>
  );
}
