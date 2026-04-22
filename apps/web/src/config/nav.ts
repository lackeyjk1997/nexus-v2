import { LayoutDashboard, Layers } from "lucide-react";
import type { ComponentType } from "react";

/**
 * Declarative route registry — DECISIONS.md 2.22 / Guardrail 36.
 *
 * Adding a route is a one-line change here; Sidebar reads from this array
 * and never hard-codes nav items. Ordering here is display order.
 *
 * Routes that are dev-only or admin-only (e.g. /jobs-demo, future /agent-admin)
 * are intentionally omitted — they remain reachable by URL but do not clutter
 * the rep's sidebar.
 */
export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

export const NAV: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pipeline", label: "Pipeline", icon: Layers },
] as const;
