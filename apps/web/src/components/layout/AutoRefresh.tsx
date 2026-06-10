"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Silent server-data refresher (Demo 2026-06-10 Run 2 — live-score
 * experience). Re-runs the server components on an interval so freshly
 * computed fitness scores APPEAR while the page is on screen — no manual
 * reload during the demo's click→score beat.
 *
 * router.refresh() preserves client state (scroll, open <details>) and
 * re-fetches server data only. Paused when the tab is hidden.
 */
export function AutoRefresh({ intervalMs = 8000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const t = setInterval(tick, intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);
  return null;
}
