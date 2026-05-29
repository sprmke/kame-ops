import Link from "next/link";
import type { Route } from "next";

import { BrandMark } from "@/components/brand/BrandMark";
import { cn } from "@/lib/utils/cn";

interface BrandLogoProps {
  href?: Route;
  className?: string;
  showTagline?: boolean;
  size?: "sm" | "md" | "lg";
}

const TITLE_SIZE = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-xl",
} as const;

/**
 * Full KameOps wordmark with optional tagline.
 */
export function BrandLogo({
  href,
  className,
  showTagline = false,
  size = "md",
}: BrandLogoProps) {
  const content = (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandMark size={size} />
      <div className="min-w-0 leading-tight">
        <span
          className={cn(
            "font-display font-semibold tracking-tight text-foreground",
            TITLE_SIZE[size],
          )}
        >
          Kame<span className="text-primary">Ops</span>
        </span>
        {showTagline && (
          <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            Finance automation
          </p>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="inline-flex rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {content}
      </Link>
    );
  }

  return content;
}
