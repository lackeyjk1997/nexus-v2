"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useJobStatus } from "@/hooks/useJobStatus";

function statusVariant(status?: string) {
  switch (status) {
    case "succeeded":
      return "success" as const;
    case "failed":
      return "error" as const;
    case "running":
      return "signal" as const;
    case "queued":
      return "slate" as const;
    default:
      return "neutral" as const;
  }
}

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
    <div className="flex flex-1 flex-col gap-6 p-8">
      <header>
        <h1 className="text-primary text-3xl font-semibold tracking-tight">
          Jobs smoke test
        </h1>
        <p className="text-secondary mt-1 text-sm">
          Enqueue a <code className="font-mono text-xs">noop</code> job. pg_cron
          picks it up within 10s; Supabase Realtime pushes status changes to
          this page.
        </p>
      </header>

      <div>
        <Button onClick={enqueue} disabled={enqueuing}>
          {enqueuing ? "Enqueueing…" : "Enqueue noop job"}
        </Button>
        {enqueueError && (
          <p className="text-error mt-3 text-sm">{enqueueError}</p>
        )}
      </div>

      {jobId && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <span>Job</span>
              <Badge variant={statusVariant(status?.status)}>
                {status?.status ?? "…"}
              </Badge>
            </CardTitle>
            <CardDescription className="font-mono text-xs">
              {jobId}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 font-mono text-xs">
            {status?.result !== undefined && status?.result !== null && (
              <div>
                <span className="text-tertiary">result: </span>
                <span className="text-primary">
                  {JSON.stringify(status.result)}
                </span>
              </div>
            )}
            {status?.error && (
              <div>
                <span className="text-tertiary">error: </span>
                <span className="text-error">{status.error}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
