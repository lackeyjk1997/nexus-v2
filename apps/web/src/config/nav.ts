/**
 * Declarative route registry — DECISIONS.md 2.22 / Guardrail 36.
 *
 * Adding a route is a one-line change here (plus mapping `iconName` → component
 * in `components/layout/NavLink.tsx`). Sidebar reads from this array and never
 * hard-codes nav items. Ordering here is display order.
 *
 * Routes that are dev-only or admin-only (e.g. /jobs-demo, future /agent-admin)
 * are intentionally omitted — they remain reachable by URL but do not clutter
 * the rep's sidebar.
 *
 * Why `iconName` (string) instead of a component reference: passing a
 * lucide-react component reference from a Server Component (Sidebar) into a
 * Client Component (NavLink) is rejected by Next.js RSC ("Functions cannot be
 * passed directly to Client Components"). The component must be imported +
 * resolved inside the client boundary. `iconName` is a serializable union that
 * NavLink maps to the actual icon.
 */
export type NavIconName = "dashboard" | "pipeline";

export interface NavItem {
  href: string;
  label: string;
  iconName: NavIconName;
}

export const NAV: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard", iconName: "dashboard" },
  { href: "/pipeline", label: "Pipeline", iconName: "pipeline" },
] as const;
