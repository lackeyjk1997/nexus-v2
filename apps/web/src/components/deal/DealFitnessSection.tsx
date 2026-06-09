import type { DealFitnessView } from "@/lib/deal-fitness";

/**
 * Deal Fitness — UI BONES ONLY (Demo 2026-06-10 Run 2 directive: structural
 * semantics + plumbed data; a later design pass reskins without re-plumbing).
 *
 * Sections: overall + per-dimension scores · evidence list (verbatim quotes
 * + provenance) · not-yet coaching (collapsed) · calls & notes (raw Granola
 * transcript = system of record; AI note as auxiliary context) ·
 * last-updated. Server component; zero client JS beyond native <details>.
 */

const CATEGORY_LABELS: Record<string, string> = {
  business_fit: "Business fit",
  emotional_fit: "Emotional fit",
  technical_fit: "Technical fit",
  readiness_fit: "Readiness fit",
};

function formatWhen(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function DealFitnessSection({ view }: { view: DealFitnessView }) {
  const { scores, events, calls } = view;
  const detected = events.filter((e) => e.detected);
  const notYet = events.filter((e) => !e.detected);

  return (
    <section aria-label="Deal Fitness" className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between gap-4">
        <h2 className="text-primary text-xl font-semibold tracking-tight">
          Deal Fitness
        </h2>
        {scores && (
          <p className="text-tertiary text-xs">
            Last updated {formatWhen(scores.updatedAt)}
            {scores.velocityTrend ? ` · trend: ${scores.velocityTrend}` : ""}
          </p>
        )}
      </header>

      {!scores ? (
        <p className="text-secondary rounded-md border border-subtle bg-muted px-4 py-3 text-sm">
          No fitness analysis yet. The score computes automatically when a
          call lands on this deal.
        </p>
      ) : (
        <>
          {/* Scores: overall + 4 dimensions */}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-md border border-subtle bg-surface px-4 py-3">
              <dt className="text-tertiary text-xs uppercase tracking-wide">
                Overall
              </dt>
              <dd
                className="text-primary text-2xl font-semibold tabular-nums"
                data-testid="fitness-overall"
              >
                {scores.overall ?? "—"}
              </dd>
            </div>
            {(
              [
                ["business_fit", scores.business],
                ["emotional_fit", scores.emotional],
                ["technical_fit", scores.technical],
                ["readiness_fit", scores.readiness],
              ] as const
            ).map(([key, value]) => (
              <div
                key={key}
                className="rounded-md border border-subtle bg-surface px-4 py-3"
              >
                <dt className="text-tertiary text-xs uppercase tracking-wide">
                  {CATEGORY_LABELS[key]}
                </dt>
                <dd className="text-primary text-2xl font-semibold tabular-nums">
                  {value ?? "—"}
                </dd>
              </div>
            ))}
          </dl>

          {scores.dealInsight && (
            <p className="text-secondary border-l-2 border-subtle pl-4 text-sm leading-relaxed">
              {scores.dealInsight}
            </p>
          )}

          {/* Detected events with verbatim evidence + provenance */}
          <div className="flex flex-col gap-2">
            <h3 className="text-primary text-sm font-medium">
              Detected buyer behaviors ({detected.length})
            </h3>
            {detected.length === 0 ? (
              <p className="text-tertiary text-sm">
                None detected yet — evidence accrues per call.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {detected.map((e) => (
                  <li
                    key={e.eventKey}
                    className="rounded-md border border-subtle bg-surface px-4 py-3"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-primary text-sm font-medium">
                        {e.label}
                        <span className="text-tertiary ml-2 text-xs">
                          {CATEGORY_LABELS[e.fitCategory] ?? e.fitCategory}
                          {typeof e.confidence === "number"
                            ? ` · confidence ${e.confidence.toFixed(2)}`
                            : ""}
                        </span>
                      </p>
                      <span className="text-tertiary shrink-0 text-xs">
                        {formatWhen(e.detectedAt)}
                      </span>
                    </div>
                    {e.description && (
                      <p className="text-secondary mt-1 text-sm">{e.description}</p>
                    )}
                    {e.evidence.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-2">
                        {e.evidence.map((ev, i) => (
                          <li key={i} className="text-sm">
                            <blockquote className="text-secondary border-l-2 border-subtle pl-3 italic">
                              “{ev.quote}”
                            </blockquote>
                            <p className="text-tertiary mt-0.5 pl-3 text-xs">
                              {ev.source_label ?? "transcript"}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Not-yet events: collapsed coaching list */}
          <details className="rounded-md border border-subtle bg-muted px-4 py-3">
            <summary className="text-secondary cursor-pointer text-sm">
              Not yet observed ({notYet.length}) — coaching
            </summary>
            <ul className="mt-2 flex flex-col gap-1.5">
              {notYet.map((e) => (
                <li key={e.eventKey} className="text-sm">
                  <span className="text-primary">{e.label}:</span>{" "}
                  <span className="text-secondary">
                    {e.coachingText ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}

      {/* Calls & notes: transcript = system of record, AI note auxiliary */}
      <div className="flex flex-col gap-2">
        <h3 className="text-primary text-sm font-medium">
          Calls &amp; notes ({calls.length})
        </h3>
        {calls.length === 0 ? (
          <p className="text-tertiary text-sm">No calls on this deal yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {calls.map((c) => (
              <li
                key={c.transcriptId}
                className="rounded-md border border-subtle bg-surface px-4 py-3"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-primary text-sm font-medium">{c.title}</p>
                  <span className="text-tertiary shrink-0 text-xs">
                    {c.source} · {formatWhen(c.recordedAt)}
                  </span>
                </div>
                {c.summaryMarkdown && (
                  <details className="mt-2">
                    <summary className="text-secondary cursor-pointer text-xs">
                      Granola note
                    </summary>
                    <pre className="text-secondary mt-1 max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-relaxed">
                      {c.summaryMarkdown}
                    </pre>
                  </details>
                )}
                <details className="mt-1">
                  <summary className="text-secondary cursor-pointer text-xs">
                    Raw transcript ({Math.round(c.textLength / 1000)}k chars)
                  </summary>
                  <pre className="text-secondary mt-1 max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-relaxed">
                    {c.transcriptText}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
