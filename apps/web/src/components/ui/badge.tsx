import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Badge — reserved meaning-carriers. Per DESIGN-SYSTEM §1 principle 1
 * ("restraint"), neutral is the default. Accent/signal is for AI-authored
 * markers. Semantic variants (success/warning/error) carry meaning, not
 * decoration.
 */
const badgeVariants = cva(
  [
    "inline-flex items-center rounded-full border px-2.5 py-0.5",
    "text-xs font-medium",
    "transition-colors duration-fast ease-out-soft",
  ].join(" "),
  {
    variants: {
      variant: {
        neutral: "border-subtle bg-muted text-primary",
        slate: "border-slate-200 bg-slate-50 text-slate-700",
        signal: "border-signal-200 bg-signal-50 text-signal-700",
        success: "border-success-light bg-success-light text-success-dark",
        warning: "border-warning-light bg-warning-light text-warning-dark",
        error: "border-error-light bg-error-light text-error-dark",
        outline: "border-subtle text-primary",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
