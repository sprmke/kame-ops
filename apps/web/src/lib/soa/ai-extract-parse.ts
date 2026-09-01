import { parseIssuerId } from "@/lib/soa/detect-issuer";
import type { TransactionLine } from "@/lib/soa/types";

export type SoaAiExtractResult = {
  issuerId: ReturnType<typeof parseIssuerId>;
  cardLast4: string | null;
  statementDate: string | null;
  dueDate: string | null;
  minimumDue: string | null;
  totalDue: string | null;
  transactions: TransactionLine[];
};

function normalizeLast4(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function normalizeAmount(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return raw.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  const s = String(raw)
    .replace(/[^\d.,]/g, "")
    .trim();
  if (!s) return null;
  return s;
}

function normalizeDate(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  return s && s !== "—" ? s : null;
}

function parseTransactions(raw: unknown): TransactionLine[] {
  if (!Array.isArray(raw)) return [];
  const out: TransactionLine[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const description = String(row.description ?? "").trim();
    const amount = normalizeAmount(row.amount);
    if (!description || !amount) continue;
    out.push({
      date: String(row.date ?? "").trim() || "—",
      description,
      amount,
    });
  }
  return out.slice(0, 200);
}

export function parseSoaAiExtractJson(text: string): SoaAiExtractResult | null {
  const jsonMatch = text.trim().match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    return {
      issuerId: parseIssuerId(
        String(parsed.issuer_id ?? parsed.issuerId ?? ""),
      ),
      cardLast4: normalizeLast4(parsed.card_last4 ?? parsed.cardLast4),
      statementDate: normalizeDate(
        parsed.statement_date ?? parsed.statementDate,
      ),
      dueDate: normalizeDate(parsed.due_date ?? parsed.dueDate),
      minimumDue: normalizeAmount(parsed.minimum_due ?? parsed.minimumDue),
      totalDue: normalizeAmount(parsed.total_due ?? parsed.totalDue),
      transactions: parseTransactions(parsed.transactions),
    };
  } catch {
    return null;
  }
}
