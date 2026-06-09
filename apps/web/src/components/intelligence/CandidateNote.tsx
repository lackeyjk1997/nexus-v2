import type { CandidateView } from "@/lib/intelligence";
import { Badge } from "@/components/ui/badge";

/**
 * An emerging category candidate — observations from several reps that
 * clustered into the same shape and cleared the evidence bar
 * (minMemberCount 3, confidence ≥ medium). Awaiting manager promotion.
 * Server component, display-only for Day 5 B (promotion flow is Phase 5).
 */
export function CandidateNote({ candidate }: { candidate: CandidateView }) {
  return (
    <article className="rounded-lg border border-subtle bg-surface p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="slate">Emerging</Badge>
        <span className="text-tertiary text-xs">
          {candidate.memberCount} reps captured this independently
        </span>
      </div>
      <h3 className="text-primary font-display mt-3 text-xl leading-snug">
        {candidate.title}
      </h3>
      {candidate.basis && (
        <p className="text-secondary mt-3 max-w-prose text-sm leading-relaxed">
          {candidate.basis}
        </p>
      )}
      <p className="text-tertiary mt-4 text-xs">
        {candidate.confidence} confidence
        {candidate.vertical && <> · {candidate.vertical}</>} · awaiting review as a
        new signal category
      </p>
    </article>
  );
}
