import type { CSSProperties } from "react";

import {
  DEFAULT_CARD_COLORS,
  isValidCardColor,
  type BankIssuer,
} from "@/lib/db/schema/credit-cards";

export const ISSUER_ACCENTS: Record<
  BankIssuer,
  { dot: string; badge: string; border: string }
> = {
  metrobank: {
    dot: "bg-[hsl(var(--chart-1))]",
    badge:
      "bg-[hsl(var(--chart-1)/0.12)] text-[hsl(var(--chart-1))] border-[hsl(var(--chart-1)/0.25)]",
    border: "border-l-4 border-l-[hsl(var(--chart-1))]",
  },
  rcbc: {
    dot: "bg-[hsl(var(--chart-4))]",
    badge:
      "bg-[hsl(var(--chart-4)/0.12)] text-[hsl(var(--chart-4))] border-[hsl(var(--chart-4)/0.25)]",
    border: "border-l-4 border-l-[hsl(var(--chart-4))]",
  },
  bpi: {
    dot: "bg-primary",
    badge: "bg-primary/10 text-primary border-primary/25",
    border: "border-l-4 border-l-primary",
  },
  unionbank: {
    dot: "bg-[hsl(var(--destructive))]",
    badge:
      "bg-[hsl(var(--destructive)/0.12)] text-[hsl(var(--destructive))] border-[hsl(var(--destructive)/0.25)]",
    border: "border-l-4 border-l-[hsl(var(--destructive))]",
  },
};

function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

export type ResolvedCardAccent = {
  color: string;
  stripeStyle: CSSProperties;
  swatchStyle: CSSProperties;
};

export function issuerAccent(issuerId: string) {
  if (issuerId in ISSUER_ACCENTS) {
    return ISSUER_ACCENTS[issuerId as BankIssuer];
  }
  return ISSUER_ACCENTS.bpi;
}

export function displayCardColor(
  issuerId: string,
  color?: string | null,
): string {
  if (isValidCardColor(color)) return color.toUpperCase();
  const issuer =
    issuerId in DEFAULT_CARD_COLORS ? (issuerId as BankIssuer) : "bpi";
  return DEFAULT_CARD_COLORS[issuer];
}

/** Visible on light and dark surfaces, including very dark brand colors. */
export function cardColorSwatchStyle(color: string): CSSProperties {
  return {
    backgroundColor: color,
    boxShadow: `0 0 0 1px ${hexWithAlpha(color, 0.65)}, inset 0 0 0 1px rgba(255,255,255,0.12)`,
  };
}

export function resolveCardAccent(
  issuerId: string,
  color?: string | null,
): ResolvedCardAccent {
  const brandColor = displayCardColor(issuerId, color);

  return {
    color: brandColor,
    stripeStyle: { boxShadow: `inset 4px 0 0 0 ${brandColor}` },
    swatchStyle: cardColorSwatchStyle(brandColor),
  };
}
