import { redirect } from "next/navigation";

import { CandidateNote } from "@/components/intelligence/CandidateNote";
import { PatternNote } from "@/components/intelligence/PatternNote";
import { getIntelligenceBriefing } from "@/lib/intelligence";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Intelligence dashboard — Phase 4 Day 5 B.
 *
 * The portfolio briefing: synthesized cross-deal patterns
 * (`intelligence_dashboard_patterns`) + emerging category candidates
 * (`category_candidates`), both via SurfaceAdmission with stored-judgment
 * ordering (see lib/intelligence.ts). Presented notes-first: a well-kept
 * notebook, not a BI tool. Empty states are intentional (§1.18) — when
 * nothing clears the bar, the page says so plainly.
 */
export default async function IntelligencePage() {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const briefing = await getIntelligenceBriefing(data.user.id);
  const { patterns, candidates, heldBackCount, stats } = briefing;

  return (
    <div className="flex flex-1 justify-center px-8 py-12">
      <div className="w-full max-w-2xl">
        <header>
          <h1 className="text-primary font-display text-4xl tracking-tight">
            Intelligence
          </h1>
          <p className="text-secondary mt-3 text-sm leading-relaxed">
            What Nexus computed from {stats.callsProcessed} call
            {stats.callsProcessed === 1 ? "" : "s"} — {stats.signalsDetected}{" "}
            signal{stats.signalsDetected === 1 ? "" : "s"} across{" "}
            {stats.dealsWatched} deal{stats.dealsWatched === 1 ? "" : "s"} in the
            last 30 days. Only what cleared the evidence bar is here.
          </p>
        </header>

        <section aria-label="Patterns" className="mt-12">
          {patterns.length === 0 ? (
            <div className="rounded-lg border border-subtle bg-muted px-6 py-10 text-center">
              <p className="text-primary font-display text-xl">
                Nothing to surface yet.
              </p>
              <p className="text-secondary mx-auto mt-2 max-w-md text-sm leading-relaxed">
                Nexus stays quiet until a pattern shows up on at least two deals
                with real dollars behind it. Silence here means no
                cross-portfolio risk has cleared that bar.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-12">
              {patterns.map((pattern, i) => (
                <PatternNote key={pattern.id} pattern={pattern} index={i} />
              ))}
            </div>
          )}
        </section>

        {candidates.length > 0 && (
          <section aria-label="Emerging from the field" className="mt-16">
            <h2 className="text-tertiary text-xs font-medium uppercase tracking-wide">
              Emerging from the field
            </h2>
            <div className="mt-4 flex flex-col gap-4">
              {candidates.map((candidate) => (
                <CandidateNote key={candidate.id} candidate={candidate} />
              ))}
            </div>
          </section>
        )}

        {heldBackCount > 0 && (
          <footer className="mt-16 border-t border-subtle pt-6">
            <p className="text-tertiary text-xs leading-relaxed">
              Nexus is watching {heldBackCount} more emerging thread
              {heldBackCount === 1 ? "" : "s"} — observed, but held below the
              evidence threshold. They surface when corroboration arrives, not
              before.
            </p>
          </footer>
        )}
      </div>
    </div>
  );
}
