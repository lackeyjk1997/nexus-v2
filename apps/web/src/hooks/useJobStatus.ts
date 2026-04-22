"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type JobStatusValue = "queued" | "running" | "succeeded" | "failed";

export interface JobStatusState {
  status: JobStatusValue;
  result: unknown;
  error: string | null;
  updatedAt: number;
}

/**
 * Subscribe-first ordering: we open the Realtime channel, and only after the
 * SUBSCRIBED callback fires do we fetch the initial row. That way any update
 * that happens between initial fetch and subscription can't be lost. The
 * `setState(prev => prev ?? snapshot)` guard ensures the initial fetch never
 * clobbers a newer Realtime update that arrived first.
 */
export function useJobStatus(jobId: string | null): JobStatusState | null {
  const [state, setState] = useState<JobStatusState | null>(null);

  useEffect(() => {
    if (!jobId) {
      setState(null);
      return;
    }
    let active = true;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`job:${jobId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${jobId}` },
        (payload) => {
          if (!active) return;
          const row = payload.new as {
            status: JobStatusValue;
            result: unknown;
            error: string | null;
          };
          setState({
            status: row.status,
            result: row.result,
            error: row.error ?? null,
            updatedAt: Date.now(),
          });
        },
      )
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED" || !active) return;
        const { data } = await supabase
          .from("jobs")
          .select("status, result, error")
          .eq("id", jobId)
          .maybeSingle();
        if (!active || !data) return;
        const snapshot: JobStatusState = {
          status: data.status as JobStatusValue,
          result: data.result,
          error: (data.error as string | null) ?? null,
          updatedAt: Date.now(),
        };
        setState((prev) => prev ?? snapshot);
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [jobId]);

  return state;
}
