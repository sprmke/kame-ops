import "server-only";

import { createHash } from "crypto";
import { basename } from "path";
import { and, eq, isNull } from "drizzle-orm";

import { env } from "@/env";
import { db } from "@/lib/db";
import { creditCards } from "@/lib/db/schema";
import { tryDecryptSecret } from "@/lib/utils/encryption";
import { checkPdfEngineReady } from "@/server/lib/pdf-engine";
import { checkQpdfEngineReady } from "@/server/lib/qpdf-engine";

export type SoaCardPreflight = {
  issuer: string;
  last4: string;
  label?: string;
  decryptOk: boolean;
  passwordLength: number;
  gmailMonthOffset: number;
  soaSubject: string | null;
};

export type SoaRuntimeHints = {
  nodeEnv: string;
  vercel: boolean;
  encryptionKeyConfigured: boolean;
  encryptionKeyFingerprint: string;
  bpiOcrEnabled: boolean;
  authUrl: string | null;
  appUrl: string;
  authUrlMatchesApp: boolean;
  pdfEngineOk: boolean;
  qpdfEngineOk: boolean;
  pdfEngineError: string | null;
  qpdfEngineError: string | null;
};

export type SoaParseFailureDetail = {
  bankId: string;
  bankLabel: string;
  fileName: string;
  error: string;
  passwordsTried: number;
  issuerCardLast4s: string[];
};

function encryptionKeyFingerprint(): string {
  const key =
    process.env.ENCRYPTION_KEY?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    "dev-only-key";
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}

export function sanitizeSoaParseError(error: string): string {
  return error
    .replace(/\/tmp\/[^\s)]+/g, (match) => basename(match))
    .replace(/\/var\/[^\s)]+/g, (match) => basename(match))
    .slice(0, 240);
}

function formatFailureLine(f: SoaParseFailureDetail): string {
  const sanitized = sanitizeSoaParseError(f.error);
  const cards =
    f.issuerCardLast4s.length > 0
      ? ` (tried •••• ${f.issuerCardLast4s.join(", •••• ")})`
      : "";
  return `${f.bankLabel} · ${f.fileName}: ${sanitized}${cards}`;
}

export const soaDiagnosticsService = {
  async checkCards(userId: string): Promise<SoaCardPreflight[]> {
    const rows = await db.query.creditCards.findMany({
      where: and(eq(creditCards.userId, userId), isNull(creditCards.deletedAt)),
      orderBy: (t, { asc }) => [asc(t.issuer), asc(t.last4)],
    });

    return rows.map((c) => {
      const plain = tryDecryptSecret(c.pdfPasswordEncrypted);
      return {
        issuer: c.issuer,
        last4: c.last4,
        label: c.label ?? undefined,
        decryptOk: plain !== null,
        passwordLength: plain?.length ?? 0,
        gmailMonthOffset: c.gmailMonthOffset ?? 0,
        soaSubject: c.soaSubject,
      };
    });
  },

  async runtimeHints(): Promise<SoaRuntimeHints> {
    const appUrl = env.NEXT_PUBLIC_APP_URL;
    const authUrl = env.AUTH_URL ?? null;
    const [pdfEngine, qpdfEngine] = await Promise.all([
      checkPdfEngineReady(),
      checkQpdfEngineReady(),
    ]);
    return {
      nodeEnv: env.NODE_ENV,
      vercel: !!process.env.VERCEL,
      encryptionKeyConfigured: !!process.env.ENCRYPTION_KEY?.trim(),
      encryptionKeyFingerprint: encryptionKeyFingerprint(),
      bpiOcrEnabled: /^(1|true|yes)$/i.test(process.env.BPI_OCR?.trim() ?? ""),
      authUrl,
      appUrl,
      authUrlMatchesApp:
        !authUrl || authUrl.replace(/\/$/, "") === appUrl.replace(/\/$/, ""),
      pdfEngineOk: pdfEngine.ok,
      qpdfEngineOk: qpdfEngine.ok,
      pdfEngineError: pdfEngine.ok ? null : pdfEngine.error,
      qpdfEngineError: qpdfEngine.ok ? null : qpdfEngine.error,
    };
  },

  formatPreflightFailure(cards: SoaCardPreflight[]): string | null {
    const bad = cards.filter((c) => !c.decryptOk);
    if (bad.length === 0) return null;

    const list = bad.map((c) => `${c.issuer} •••• ${c.last4}`).join(", ");
    return `Cannot decrypt PDF password for: ${list}. ENCRYPTION_KEY fingerprint: ${encryptionKeyFingerprint()}.`;
  },

  formatPdfEngineFailure(hints: SoaRuntimeHints): string | null {
    if (hints.pdfEngineOk) return null;
    const detail = hints.pdfEngineError ? ` (${hints.pdfEngineError})` : "";
    return `PDF engine not available on server${detail}.`;
  },

  formatParseFailureWarning(options: {
    parsedCount: number;
    downloadedPdfCount: number;
    parseFailures: number;
    parseErrors: SoaParseFailureDetail[];
  }): string | undefined {
    const { parsedCount, downloadedPdfCount, parseFailures, parseErrors } =
      options;

    if (parseFailures === 0 || downloadedPdfCount === 0) return undefined;

    const lines = parseErrors.slice(0, 4).map(formatFailureLine);
    const more =
      parseErrors.length > 4 ? ` (+${parseErrors.length - 4} more)` : "";

    if (parsedCount === 0) {
      return [
        `Downloaded ${downloadedPdfCount} SOA PDF(s) but unlocked 0.`,
        ...lines,
        "Check PDF passwords in Credit Cards or ENCRYPTION_KEY on this server.",
        more,
      ]
        .filter(Boolean)
        .join(" ");
    }

    return [
      `${parsedCount} statement(s) saved; ${parseFailures} of ${downloadedPdfCount} PDF(s) failed to unlock.`,
      ...lines,
      more,
    ]
      .filter(Boolean)
      .join(" ");
  },

  logRunStart(
    userId: string,
    periodLabel: string,
    preflight: SoaCardPreflight[],
  ): void {
    console.info(
      "[soa] run-start",
      JSON.stringify({
        userId,
        period: periodLabel,
        cardCount: preflight.length,
      }),
    );
  },

  logRunBlocked(
    userId: string,
    reason: string,
    preflight: SoaCardPreflight[],
  ): void {
    console.error(
      "[soa] run-blocked",
      JSON.stringify({ userId, reason, cardCount: preflight.length }),
    );
  },

  logPdfUnlockFailed(detail: SoaParseFailureDetail): void {
    console.error(
      "[soa] pdf-unlock-failed",
      JSON.stringify({
        bankId: detail.bankId,
        fileName: detail.fileName,
        passwordsTried: detail.passwordsTried,
        error: sanitizeSoaParseError(detail.error),
      }),
    );
  },

  logRunEnd(summary: Record<string, unknown>): void {
    console.info("[soa] run-end", JSON.stringify(summary));
  },
};
