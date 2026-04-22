import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Nothing is flat (DESIGN-SYSTEM §1 principle 3, non-negotiable):
 * every variant MUST carry either a shadow, a border, or a hover treatment.
 * Primary + accent lift on hover; secondary/ghost/link carry a hover bg or
 * underline. No variant ships naked.
 *
 * Accent is reserved for AI-initiated actions (DESIGN-SYSTEM §8 Buttons rule).
 * Default to variant="primary" for everything else.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium",
    "transition-all duration-fast ease-out-soft",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: [
          "bg-graphite-900 text-inverse shadow-sm",
          "hover:shadow-md hover:-translate-y-px",
          "active:translate-y-0 active:shadow-sm",
        ].join(" "),
        secondary: [
          "bg-surface text-primary border border-default shadow-sm",
          "hover:shadow-md hover:bg-muted hover:-translate-y-px",
          "active:translate-y-0 active:shadow-sm",
        ].join(" "),
        ghost: "text-primary hover:bg-muted",
        accent: [
          "bg-signal-600 text-inverse shadow-sm",
          "hover:bg-signal-700 hover:shadow-md hover:-translate-y-px",
          "active:translate-y-0 active:shadow-sm",
        ].join(" "),
        destructive: [
          "bg-error text-inverse shadow-sm",
          "hover:bg-error-dark hover:shadow-md hover:-translate-y-px",
          "active:translate-y-0 active:shadow-sm",
        ].join(" "),
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-11 px-6 text-sm",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
