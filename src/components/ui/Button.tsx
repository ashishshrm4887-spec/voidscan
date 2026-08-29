import * as React from "react";
import { cn } from "@/lib/utils";

const variants = {
  default: "bg-accent text-accent-fg hover:opacity-90",
  secondary:
    "bg-surface text-fg shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]",
  ghost: "text-muted hover:text-fg hover:bg-surface",
  outline:
    "text-fg shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)] bg-transparent",
} as const;

const sizes = {
  default: "h-11 rounded-md px-4 text-sm",
  sm: "h-9 rounded-sm px-3 text-xs",
  lg: "h-12 rounded-md px-5 text-sm",
} as const;

export function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[opacity,transform,box-shadow] duration-[var(--motion-quick)] ease-[var(--ease-out)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
