const MON: Record<string, number> = {
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

/** Parse SOA due date display string (e.g. `Apr 15, 2026`) to `YYYY-MM-DD`. */
export function parseDueDateToYmd(dueDateStr: string): string | null {
  if (!dueDateStr || dueDateStr === "—") return null;
  const m = dueDateStr.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})$/);
  if (!m) return null;
  const mon = MON[m[1]!];
  if (mon === undefined) return null;
  const y = Number(m[3]);
  const d = Number(m[2]);
  const mo = String(mon + 1).padStart(2, "0");
  const dy = String(d).padStart(2, "0");
  return `${y}-${mo}-${dy}`;
}
