export const MIN_DUE_DAY = 1;
export const MAX_DUE_DAY = 31;

export function isValidDueDay(value: number): boolean {
  return (
    Number.isInteger(value) && value >= MIN_DUE_DAY && value <= MAX_DUE_DAY
  );
}

export function expectedDueDateYmd(
  year: number,
  month: number,
  dueDay: number,
): string {
  if (!isValidDueDay(dueDay)) {
    throw new Error("Due day must be between 1 and 31");
  }
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new Error("Invalid due month");
  }

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(dueDay, lastDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function expectedDueDateCandidates(
  asOfYmd: string,
  dueDay: number,
): string[] {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(asOfYmd);
  if (!match) throw new Error("Invalid reference date");

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isInteger(year) || monthIndex < 0 || monthIndex > 11) {
    throw new Error("Invalid reference date");
  }

  return [-1, 0, 1].map((offset) => {
    const target = new Date(Date.UTC(year, monthIndex + offset, 1));
    return expectedDueDateYmd(
      target.getUTCFullYear(),
      target.getUTCMonth() + 1,
      dueDay,
    );
  });
}

export function formatExpectedDueDate(ymd: string): string {
  const date = new Date(`${ymd}T00:00:00`);
  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
