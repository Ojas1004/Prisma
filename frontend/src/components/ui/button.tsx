import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/** Shadcn-pattern Button. Styled against this app's own dark palette
 * (theme.css custom properties), not shadcn's default light theme —
 * `default` matches the console's `.btn-primary` pill, `outline` matches
 * `.btn-sm`. */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold tracking-tight transition-[opacity,background,border-color,color] disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
  {
    variants: {
      variant: {
        default: "bg-[var(--accent)] text-white hover:opacity-85 focus-visible:outline-[var(--accent-bright)]",
        outline:
          "border border-[var(--line)] bg-[var(--surface-1)] text-[var(--ink)] hover:bg-[var(--accent)] hover:border-[var(--accent-bright)] hover:text-white focus-visible:outline-[var(--accent-bright)]",
        ghost: "text-[var(--ink-3)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]",
        destructive: "bg-[#f2555a] text-white hover:opacity-85 focus-visible:outline-[#f2555a]",
      },
      size: {
        default: "h-11 px-[18px]",
        sm: "h-9 px-4 text-[13px]",
        lg: "h-12 px-6",
        icon: "h-9 w-9 rounded-[10px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
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
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
