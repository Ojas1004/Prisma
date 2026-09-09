import * as React from "react";

import { cn } from "@/lib/utils";

/** Shadcn-pattern Input, styled to match the console's existing
 * `.console-page input[type="text"]` field treatment (dark fill, subtle
 * border, accent focus ring) rather than shadcn's default light theme. */
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-[11px] border border-[var(--line)] bg-[var(--surface-2)] px-[14px] text-sm text-[var(--ink)] outline-none transition-[border-color,background,box-shadow] placeholder:text-[var(--ink-3)] hover:border-[var(--line-strong)] focus:border-[var(--accent-bright)] focus:bg-[var(--surface-1)] focus:shadow-[0_0_0_3px_rgba(168,85,247,0.22)] disabled:cursor-not-allowed disabled:opacity-50",
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
