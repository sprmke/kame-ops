import { dueEntryKey, normalizeCardLast4 } from "@/lib/due/normalize";
import { parseDueDateToYmd } from "@/lib/due/parse-due-date";

type SoaRowLike = {
  issuerId: string;
  cardLast4: string;
  dueDate: string;
  soaUnavailable?: boolean;
  minimumDue?: string;
};

type DueRowLike = {
  issuerId: string;
  cardLast4: string;
  dueDateYmd: string;
  paidAt: Date | string | null;
};

/** Paid column for SOA summary PDFs — reads Postgres due entries, not JSON state. */
export function overviewPaidLabel(row: SoaRowLike, dues: DueRowLike[]): string {
  if (row.soaUnavailable || row.minimumDue === "SOA not yet available") {
    return "—";
  }
  const ymd = parseDueDateToYmd(row.dueDate);
  if (!ymd) return "—";

  const rowKey = dueEntryKey(row.issuerId, row.cardLast4);
  const rowIss = row.issuerId.trim().toLowerCase();

  const sameCardAndDue = (d: DueRowLike) =>
    dueEntryKey(d.issuerId, d.cardLast4) === rowKey &&
    d.dueDateYmd.trim() === ymd;

  const strict = dues.find(sameCardAndDue);
  if (strict) return strict.paidAt ? "Yes" : "No";

  const byLastAndDue = dues.filter(
    (d) =>
      normalizeCardLast4(d.cardLast4) === normalizeCardLast4(row.cardLast4) &&
      d.dueDateYmd.trim() === ymd,
  );
  if (byLastAndDue.length === 1) {
    return byLastAndDue[0]!.paidAt ? "Yes" : "No";
  }
  if (byLastAndDue.length > 1) {
    const iss = byLastAndDue.filter(
      (d) => (d.issuerId ?? "").trim().toLowerCase() === rowIss,
    );
    if (iss.length === 1) return iss[0]!.paidAt ? "Yes" : "No";
    return "—";
  }

  return "—";
}

export function buildOverviewPaidLabelFn(dues: DueRowLike[]) {
  return (row: SoaRowLike) => overviewPaidLabel(row, dues);
}
