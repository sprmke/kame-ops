import { cn } from "@/lib/utils/cn";

interface BrandMarkProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASSES = {
  sm: "h-8 w-8 rounded-lg text-xs",
  md: "h-10 w-10 rounded-xl text-sm",
  lg: "h-12 w-12 rounded-xl text-base",
} as const;

/**
 * Compact KameOps mark — gradient tile with "K" monogram.
 */
export function BrandMark({ className, size = "md" }: BrandMarkProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center bg-gradient-to-br from-primary via-primary to-[hsl(var(--primary-deep))] font-display font-bold text-primary-foreground shadow-glow",
        SIZE_CLASSES[size],
        className,
      )}
      aria-hidden
    >
      K
    </div>
  );
}
