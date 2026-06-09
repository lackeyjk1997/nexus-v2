import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DealFitnessView, FitnessEventRow } from "@/lib/deal-fitness";

import { FitnessRadar, ScoreRing } from "./fitness-viz";

/**
 * Deal Fitness — v1-parity layout (2026-06-09 evening directive supersedes
 * "bones only"): score header with ring + velocity, Fit Balance radar,
 * Buying Committee / Buyer Momentum / Conversation Signals cards, then the
 * four fit-category event columns with evidence + coaching. Server
 * component; data is everything the deal_fitness job persists.
 */

const CATEGORY_META: Array<{ key: string; label: string }> = [
  { key: "business_fit", label: "Business Fit" },
  { key: "emotional_fit", label: "Emotional Fit" },
  { key: "technical_fit", label: "Technical Fit" },
  { key: "readiness_fit", label: "Readiness Fit" },
];

function formatWhen(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function velocityBadge(trend: string | null) {
  if (trend === "accelerating") return <Badge variant="success">↗ Accelerating</Badge>;
  if (trend === "decelerating") return <Badge variant="warning">↘ Decelerating</Badge>;
  if (trend === "stalled") return <Badge variant="error">Stalled</Badge>;
  if (trend === "stable") return <Badge variant="neutral">→ Stable</Badge>;
  return null;
}

function EventRow({ e }: { e: FitnessEventRow }) {
  return (
    <li
      className={`rounded-md border px-3 py-2.5 ${
        e.detected ? "border-subtle bg-surface" : "border-subtle bg-muted"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
            e.detected
              ? "bg-success text-inverse"
              : "border border-strong bg-transparent"
          }`}
        >
          {e.detected ? "✓" : ""}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className={`text-sm font-medium ${e.detected ? "text-primary" : "text-secondary"}`}>
              {e.label}
            </p>
            {e.detected && (
              <span className="text-tertiary shrink-0 text-xs">{formatWhen(e.detectedAt)}</span>
            )}
          </div>
          {e.detected ? (
            <>
              {e.description && (
                <p className="text-secondary mt-0.5 text-xs">{e.description}</p>
              )}
              {e.evidence.length > 0 && (
                <details className="mt-1">
                  <summary className="text-tertiary cursor-pointer text-xs">
                    Evidence ({e.evidence.length})
                    {typeof e.confidence === "number"
                      ? ` · confidence ${e.confidence.toFixed(2)}`
                      : ""}
                  </summary>
                  <ul className="mt-1.5 flex flex-col gap-1.5">
                    {e.evidence.map((ev, i) => (
                      <li key={i}>
                        <blockquote className="text-secondary border-l-2 border-accent pl-2.5 text-xs italic leading-relaxed">
                          “{ev.quote}”
                        </blockquote>
                        <p className="text-tertiary mt-0.5 pl-2.5 text-[11px]">
                          {ev.source_label ?? "transcript"}
                        </p>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          ) : (
            e.coachingText && (
              <p className="text-secondary mt-0.5 text-xs leading-relaxed">
                <span className="text-warning">💡 Coaching:</span>{" "}
                <span className="italic">{e.coachingText}</span>
              </p>
            )
          )}
        </div>
      </div>
    </li>
  );
}

export function DealFitnessSection({ view }: { view: DealFitnessView }) {
  const { scores, events, calls } = view;
  const detectedCount = events.filter((e) => e.detected).length;
  const committee = scores?.stakeholderEngagement ?? null;
  const momentum = scores?.buyerMomentum ?? null;
  const signals = scores?.conversationSignals ?? null;
  const commitments = signals?.commitment_tracking ?? [];
  const ownership = signals?.language_progression ?? null;

  return (
    <section aria-label="Deal Fitness" className="flex flex-col gap-5">
      <header className="flex items-baseline justify-between gap-4">
        <h2 className="text-primary font-display text-2xl tracking-tight">Deal Fitness</h2>
        <Badge variant="signal">oDeal Framework</Badge>
      </header>

      {!scores ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-secondary text-sm">
              No fitness analysis yet. The score computes automatically when a
              call lands on this deal — watch this space after the first sync.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Score header: ring + velocity + insight */}
          <Card>
            <CardContent className="flex flex-wrap items-center gap-6 py-5">
              <ScoreRing score={scores.overall} size={88} strokeWidth={7} />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  {velocityBadge(scores.velocityTrend)}
                  {scores.fitImbalance && <Badge variant="warning">Imbalanced</Badge>}
                  <span className="text-tertiary text-xs">
                    {detectedCount} of {events.length} buyer behaviors observed ·
                    last updated {formatWhen(scores.updatedAt)}
                  </span>
                </div>
                {(scores.dealInsight ?? scores.overallAssessment) && (
                  <p className="text-secondary max-w-3xl text-sm leading-relaxed">
                    {scores.dealInsight ?? scores.overallAssessment}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Fit Balance radar */}
          <Card>
            <CardHeader>
              <CardTitle>Fit Balance</CardTitle>
            </CardHeader>
            <CardContent className="text-primary">
              <FitnessRadar
                business={scores.business}
                emotional={scores.emotional}
                technical={scores.technical}
                readiness={scores.readiness}
              />
            </CardContent>
          </Card>

          {/* Committee / Momentum / Signals */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader className="flex-row items-baseline justify-between space-y-0">
                <CardTitle>Buying Committee</CardTitle>
                {committee?.multithreading_score != null && (
                  <span className="text-tertiary text-xs">
                    multithreading {committee.multithreading_score}/10
                  </span>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="text-primary text-3xl font-semibold tabular-nums">
                  {committee?.contacts?.length ?? 0}
                  <span className="text-tertiary ml-2 text-sm font-normal">
                    buyer-side stakeholder{(committee?.contacts?.length ?? 0) === 1 ? "" : "s"}
                  </span>
                </p>
                {committee?.expansion_pattern && (
                  <p className="text-secondary text-xs">{committee.expansion_pattern}</p>
                )}
                <ul className="mt-1 flex flex-col gap-1">
                  {(committee?.contacts ?? []).slice(0, 6).map((c, i) => (
                    <li key={i} className="text-sm">
                      <span className="text-primary font-medium">{c.name}</span>
                      <span className="text-tertiary text-xs">
                        {" "}
                        {c.title ? `· ${c.title}` : ""} {c.role ? `· ${c.role}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-baseline justify-between space-y-0">
                <CardTitle>Buyer Momentum</CardTitle>
                {momentum?.trend && (
                  <Badge
                    variant={
                      momentum.trend === "accelerating"
                        ? "success"
                        : momentum.trend === "decelerating"
                        ? "warning"
                        : "neutral"
                    }
                  >
                    {momentum.trend}
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-2.5">
                {momentum?.buyer_initiated_pct != null && (
                  <p className="text-sm">
                    <span className="text-tertiary">Buyer-initiated:</span>{" "}
                    <span className="text-primary font-medium tabular-nums">
                      {momentum.buyer_initiated_pct}%
                    </span>
                  </p>
                )}
                {momentum?.insight && (
                  <p className="text-secondary text-xs leading-relaxed">{momentum.insight}</p>
                )}
                {commitments.length > 0 && (
                  <div>
                    <p className="text-primary text-xs font-medium">
                      Promises:{" "}
                      {commitments.filter((c) => c.status === "kept").length} of{" "}
                      {commitments.length} kept
                    </p>
                    <ul className="mt-1.5 flex flex-col gap-1.5">
                      {commitments.slice(0, 4).map((c, i) => (
                        <li key={i} className="text-xs">
                          <span
                            className={
                              c.status === "kept"
                                ? "text-success"
                                : c.status === "broken"
                                ? "text-error"
                                : "text-warning"
                            }
                          >
                            {c.status === "kept" ? "✓" : c.status === "broken" ? "✗" : "…"}
                          </span>{" "}
                          <span className="text-secondary">“{c.promise}”</span>
                          <span className="text-tertiary"> — {c.promised_by}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-baseline justify-between space-y-0">
                <CardTitle>Conversation Signals</CardTitle>
                {ownership?.overall_ownership_percent != null && (
                  <span className="text-tertiary text-xs">
                    ownership {ownership.overall_ownership_percent}%
                  </span>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-2.5">
                {(ownership?.per_call_ownership ?? []).slice(0, 4).map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-tertiary w-12 shrink-0 text-xs">
                      Call {c.call_index ?? i + 1}
                    </span>
                    <svg width="120" height="6" role="img" aria-label="ownership share">
                      <rect width="120" height="6" rx="3" fill="#E1E7EF" />
                      <rect
                        width={Math.max(3, (120 * (c.we_our_pct ?? 0)) / 100)}
                        height="6"
                        rx="3"
                        fill="#4F5FE0"
                      />
                    </svg>
                    <span className="text-tertiary text-xs tabular-nums">
                      {c.we_our_pct ?? 0}%
                    </span>
                  </div>
                ))}
                {ownership?.trend && (
                  <p className="text-secondary text-xs italic leading-relaxed">
                    {ownership.trend}
                  </p>
                )}
                {signals?.deal_temperament && (
                  <p className="text-sm">
                    <span className="text-tertiary">Temperament:</span>{" "}
                    <Badge variant="neutral">{signals.deal_temperament}</Badge>
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Four fit-category event columns */}
          <div className="grid gap-4 lg:grid-cols-2">
            {CATEGORY_META.map((cat) => {
              const catEvents = events.filter((e) => e.fitCategory === cat.key);
              const catDetected = catEvents.filter((e) => e.detected).length;
              const catScore =
                cat.key === "business_fit"
                  ? scores.business
                  : cat.key === "emotional_fit"
                  ? scores.emotional
                  : cat.key === "technical_fit"
                  ? scores.technical
                  : scores.readiness;
              return (
                <Card key={cat.key}>
                  <CardHeader className="flex-row items-baseline justify-between space-y-0">
                    <CardTitle>{cat.label}</CardTitle>
                    <span className="text-tertiary text-xs tabular-nums">
                      {catDetected}/{catEvents.length} · {catScore ?? "—"}%
                    </span>
                  </CardHeader>
                  <CardContent>
                    <ul className="flex flex-col gap-2">
                      {catEvents.map((e) => (
                        <EventRow key={e.eventKey} e={e} />
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Calls & notes: transcript = system of record, AI note auxiliary */}
      <Card>
        <CardHeader>
          <CardTitle>Calls &amp; notes ({calls.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {calls.length === 0 ? (
            <p className="text-tertiary text-sm">No calls on this deal yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {calls.map((c) => (
                <li key={c.transcriptId} className="rounded-md border border-subtle px-4 py-3">
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
        </CardContent>
      </Card>

      {/* Keep the e2e/test contract: overall score testid */}
      {scores && (
        <span data-testid="fitness-overall" className="hidden">
          {scores.overall}
        </span>
      )}
    </section>
  );
}
