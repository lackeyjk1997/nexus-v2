import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Input — DESIGN-SYSTEM §8 Inputs.
 * bg-surface, 1px border-subtle. Focus: border-accent + 3px ring at
 * --ring-focus (signal-600 @ 15%). Disabled: bg-muted + text-disabled.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "bg-surface text-primary placeholder:text-tertiary",
          "flex h-10 w-full rounded-md border border-subtle px-3 py-2 text-sm",
          "transition-colors duration-fast ease-out-soft",
          "focus:outline-none focus:border-accent",
          "focus:shadow-[0_0_0_3px_var(--ring-focus)]",
          "disabled:bg-muted disabled:text-disabled disabled:cursor-not-allowed",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-primary",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
