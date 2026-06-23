"use client";

import { formatBankIssuer } from "@/lib/db/schema/credit-cards";
import { cn } from "@/lib/utils/cn";

import { resolveCardAccent } from "./card-accent";

type CardBankLabelProps = {
  issuerId: string;
  color?: string | null;
  label?: string;
  className?: string;
  /** Hide swatch when the row/card already has a color stripe. */
  showSwatch?: boolean;
};

export function CardBankLabel({
  issuerId,
  color,
  label,
  className,
  showSwatch = true,
}: CardBankLabelProps) {
  const accent = resolveCardAccent(issuerId, color);
  const text = label ?? formatBankIssuer(issuerId);

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {showSwatch ? (
        <span
          className="size-2 shrink-0 rounded-full"
          style={accent.swatchStyle}
          aria-hidden
        />
      ) : null}
      <span className="text-sm text-foreground">{text}</span>
    </span>
  );
}
