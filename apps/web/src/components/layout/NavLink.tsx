"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";

interface NavLinkProps {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

export function NavLink({ href, label, icon: Icon }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname?.startsWith(`${href}/`);

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
