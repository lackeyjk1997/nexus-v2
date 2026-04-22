import type { ReactNode } from "react";

import { Sidebar } from "./Sidebar";

/**
 * Authenticated app shell. Sidebar + main column.
 * Used only under the authenticated (dashboard) layout — login / landing
 * pages render without it.
 */
export function AppShell({
  userEmail,
  children,
}: {
  userEmail: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-base flex min-h-screen">
      <Sidebar userEmail={userEmail} />
      <main className="flex min-h-screen flex-1 flex-col">{children}</main>
    </div>
  );
}
