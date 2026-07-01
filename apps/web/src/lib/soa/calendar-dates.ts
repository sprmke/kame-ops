export function todayYmdInTimezone(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

/** `YYYY-MM` from a `YYYY-MM-DD` string. */
export function ymdYearMonth(ymd: string): string {
  return ymd.slice(0, 7);
}

/**
 * Due dates in the current month (or a future month) still get calendar events,
 * even when the due day has already passed this month.
 */
export function isDueMonthEligible(
  dueDateYmd: string,
  todayYmd: string,
): boolean {
  return ymdYearMonth(dueDateYmd) >= ymdYearMonth(todayYmd);
}
