import {
  BANK_ISSUER_LABELS,
  BANK_ISSUERS,
  type BankIssuer,
} from "@/lib/db/schema/credit-cards";

const ISSUER_PATTERNS: { id: BankIssuer; patterns: RegExp[] }[] = [
  {
    id: "metrobank",
    patterns: [/\bmetrobank\b/i, /\bmfree\b/i, /\bmsoa\b/i],
  },
  {
    id: "rcbc",
    patterns: [/\brcbc\b/i, /\bflex\s+visa\b/i, /rizal\s+commercial/i],
  },
  {
    id: "bpi",
    patterns: [
      /\bbpi\b/i,
      /bank of the philippine islands/i,
      /bpi credit card/i,
    ],
  },
  {
    id: "unionbank",
    patterns: [/\bunionbank\b/i, /\bunion\s+bank\b/i, /\brewards\s+visa\b/i],
  },
];

export function detectIssuerFromSoaText(text: string): BankIssuer | null {
  const flat = text.replace(/\s+/g, " ");
  let best: { id: BankIssuer; score: number } | null = null;

  for (const { id, patterns } of ISSUER_PATTERNS) {
    let score = 0;
    for (const re of patterns) {
      if (re.test(flat)) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { id, score };
    }
  }

  return best?.id ?? null;
}

export function bankLabelForIssuer(issuerId: string): string {
  const id = issuerId.toLowerCase();
  if ((BANK_ISSUERS as readonly string[]).includes(id)) {
    return BANK_ISSUER_LABELS[id as BankIssuer];
  }
  return issuerId;
}

export function parseIssuerId(
  raw: string | null | undefined,
): BankIssuer | null {
  const id = String(raw ?? "")
    .trim()
    .toLowerCase();
  if ((BANK_ISSUERS as readonly string[]).includes(id)) {
    return id as BankIssuer;
  }
  return null;
}
