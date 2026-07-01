const MONTH_ABBR: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

/** Parse "Mon DD, YYYY" display dates from SOA parsers into YYYY-MM-DD. */
export function parseDisplayDateYmd(
  display: string | null | undefined,
): string | null {
  if (!display || display === "—") return null;
  const m = display.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})$/);
  if (!m) return null;
  const mon = MONTH_ABBR[m[1]!];
  if (mon === undefined) return null;
  return `${m[3]}-${String(mon + 1).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
}
