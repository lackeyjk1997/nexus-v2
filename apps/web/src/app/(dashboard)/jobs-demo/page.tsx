"use client";

import { useState } from "react";
import { useJobStatus } from "@/hooks/useJobStatus";

export default function JobsDemoPage() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [enqueuing, setEnqueuing] = useState(false);
  const [enqueueError, setEnqueueError] = useState<string | null>(null);
  const status = useJobStatus(jobId);

  async function enqueue() {
    setEnqueuing(true);
    setEnqueueError(null);
    setJobId(null);
    try {
      const res = await fetch("/api/jobs/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "noop", input: { ts: Date.now() } }),
      });
      const data: { jobId?: string; error?: string } = await res.json();
      if (!res.ok || !data.jobId) {
        setEnqueueError(data.error ?? `enqueue failed: ${res.status}`);
        return;
      }
      setJobId(data.jobId);
    } catch (err) {
      setEnqueueError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnqueuing(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="max-w-xl space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Jobs smoke test</h1>
        <p className="text-sm text-muted">
          Enqueue a <code>noop</code> job. pg_cron picks it up within 10s;
          Supabase Realtime pushes the status changes to this page.
        </p>
      </div>
      <button
        onClick={enqueue}
        disabled={enqueuing}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-60"
      >
        {enqueuing ? "Enqueueing…" : "Enqueue noop job"}
      </button>
      {enqueueError && (
        <p className="text-sm text-[color:hsl(0,60%,45%)]">{enqueueError}</p>
      )}
      {jobId && (
        <div className="w-full max-w-xl space-y-2 rounded-lg border border-border bg-surface p-4 font-mono text-xs">
          <div>
            <span className="text-muted">jobId: </span>
            {jobId}
          </div>
          <div>
            <span className="text-muted">status: </span>
            <span className="font-semibold">{status?.status ?? "…"}</span>
          </div>
          {status?.result !== undefined && status?.result !== null && (
            <div>
              <span className="text-muted">result: </span>
              {JSON.stringify(status.result)}
            </div>
          )}
          {status?.error && (
            <div className="text-[color:hsl(0,60%,45%)]">
              <span className="text-muted">error: </span>
              {status.error}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
