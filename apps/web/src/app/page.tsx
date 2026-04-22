import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function HomePage() {
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
