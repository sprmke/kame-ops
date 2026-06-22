/** Parse Philippine-peso style amounts from SOA strings (e.g. "20,920.72"). */
export function parsePhpAmount(raw: string | null | undefined): number {
  if (!raw || raw === "—") return 0;
  return Number.parseFloat(raw.replace(/[^0-9.]/g, "")) || 0;
}

/** Format a number as PHP with thousands separators. */
export function formatPhpAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
