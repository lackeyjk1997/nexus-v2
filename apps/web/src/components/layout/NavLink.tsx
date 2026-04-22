"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Layers, type LucideIcon } from "lucide-react";

import type { NavIconName } from "@/config/nav";
import { cn } from "@/lib/utils";

/**
 * Icons resolved inside the client boundary. Server can't pass a component
 * reference as a prop (Next.js RSC rejects non-serializable function props);
 * NavLink receives a string `iconName` and maps it here. Adding a new
 * icon requires one edit here + one in `config/nav.ts`.
 */
const ICONS: Record<NavIconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  pipeline: Layers,
};

interface NavLinkProps {
  href: string;
  label: string;
  iconName: NavIconName;
}

export function NavLink({ href, label, iconName }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname?.startsWith(`${href}/`);
  const Icon = ICONS[iconName];

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-md px-3 py-2",
        "text-sm font-medium transition-colors duration-fast ease-out-soft",
        isActive
          ? "bg-signal-50 text-signal-700"
          : "text-secondary hover:bg-muted hover:text-primary",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors duration-fast",
          isActive ? "text-signal-600" : "text-tertiary group-hover:text-primary",
        )}
      />
      <span>{label}</span>
    </Link>
  );
}
