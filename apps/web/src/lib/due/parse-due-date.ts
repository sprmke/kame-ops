import { parseSoaCalendarDate } from "@/lib/soa/calendar-month";

/** Parse SOA due date display string (e.g. `Apr 15, 2026` or ISO) to `YYYY-MM-DD`. */
export function parseDueDateToYmd(dueDateStr: string): string | null {
  if (!dueDateStr || dueDateStr === "—") return null;
  const d = parseSoaCalendarDate(dueDateStr);
  if (!d) return null;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dy}`;
}
