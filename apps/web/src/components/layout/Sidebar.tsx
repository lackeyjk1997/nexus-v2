import { Sparkles } from "lucide-react";

import { NAV } from "@/config/nav";
import { NavLink } from "./NavLink";

/**
 * Left-rail navigation. Server component (no hooks).
 * Active-state detection lives inside NavLink (tiny client boundary).
 *
 * The sparkle + "Nexus" wordmark in the header uses signal-600 for the
 * sparkle only — "AI is here" in the language of DESIGN-SYSTEM §2.3.
 * The wordmark itself is neutral graphite.
 */
export function Sidebar({ userEmail }: { userEmail: string }) {
  return (
    <aside
      aria-label="Primary navigation"
      className="bg-muted flex h-screen w-60 shrink-0 flex-col border-r border-subtle"
    >
      <div className="flex h-16 items-center gap-2 px-6">
        <Sparkles className="h-5 w-5 text-signal-600" strokeWidth={1.75} />
        <span className="text-primary text-lg font-semibold tracking-tight">
          Nexus
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
          />
        ))}
      </nav>

      <div className="border-t border-subtle px-6 py-4">
        <p className="text-tertiary text-xs uppercase tracking-wide">
          Signed in as
        </p>
        <p className="text-secondary mt-1 truncate text-sm" title={userEmail}>
          {userEmail}
        </p>
      </div>
    </aside>
  );
}
