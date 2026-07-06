export const AUTOMATION_FREQUENCIES = ["daily", "weekly", "monthly"] as const;

export type AutomationFrequency = (typeof AUTOMATION_FREQUENCIES)[number];

export type AutomationScheduleConfig = {
  frequency: AutomationFrequency;
  hour: number;
  minute: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
};

export type AutomationScheduleInput = AutomationScheduleConfig;

const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number;
};

function getZonedParts(date: Date, timeZone: string): ZonedDateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  const dayOfWeek = WEEKDAY_LABELS.indexOf(
    weekday as (typeof WEEKDAY_LABELS)[number],
  );

  const hour = read("hour");
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: hour === 24 ? 0 : hour,
    minute: read("minute"),
    dayOfWeek: dayOfWeek >= 0 ? dayOfWeek : 0,
  };
}

function formatTime12(hour: number, minute: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const minutePadded = minute.toString().padStart(2, "0");
  return `${hour12}:${minutePadded} ${period}`;
}

function ordinal(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

export function normalizeScheduleInput(
  input: AutomationScheduleInput,
): AutomationScheduleConfig {
  const config: AutomationScheduleConfig = {
    frequency: input.frequency,
    hour: input.hour,
    minute: input.minute,
  };

  if (input.frequency === "weekly") {
    config.dayOfWeek = input.dayOfWeek ?? 1;
  }

  if (input.frequency === "monthly") {
    config.dayOfMonth = Math.min(28, Math.max(1, input.dayOfMonth ?? 1));
  }

  return config;
}

/** Payment reminders always run on a daily cadence; only time is configurable. */
export function lockScheduleToDaily(
  input: AutomationScheduleInput,
): AutomationScheduleInput {
  return {
    frequency: "daily",
    hour: input.hour,
    minute: input.minute,
  };
}

export function scheduleConfigToStorageString(
  config: AutomationScheduleConfig,
): string {
  const { frequency, hour, minute, dayOfWeek, dayOfMonth } = config;
  switch (frequency) {
    case "daily":
      return `${minute} ${hour} * * *`;
    case "weekly":
      return `${minute} ${hour} * * ${dayOfWeek ?? 1}`;
    case "monthly":
      return `${minute} ${hour} ${dayOfMonth ?? 1} * *`;
  }
}

export function parseLegacyCronSchedule(
  schedule: string,
): AutomationScheduleConfig | null {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [minuteRaw, hourRaw, dom, , dow] = parts;
  const minute = Number(minuteRaw);
  const hour = Number(hourRaw);
  if (
    Number.isNaN(minute) ||
    Number.isNaN(hour) ||
    minute < 0 ||
    minute > 59 ||
    hour < 0 ||
    hour > 23
  ) {
    return null;
  }

  if (dom === "*" && dow === "*") {
    return { frequency: "daily", hour, minute };
  }

  if (dom === "*" && dow !== "*") {
    const dayOfWeek = Number(dow);
    if (Number.isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return null;
    return { frequency: "weekly", hour, minute, dayOfWeek };
  }

  if (dom !== "*" && dow === "*") {
    const dayOfMonth = Number(dom);
    if (Number.isNaN(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 28) {
      return null;
    }
    return { frequency: "monthly", hour, minute, dayOfMonth };
  }

  return null;
}

export function readScheduleConfigFromJob(job: {
  schedule: string;
  config: Record<string, unknown> | null;
}): AutomationScheduleConfig {
  const fromConfig = job.config?.scheduleConfig;
  if (
    fromConfig &&
    typeof fromConfig === "object" &&
    "frequency" in fromConfig &&
    "hour" in fromConfig &&
    "minute" in fromConfig
  ) {
    return normalizeScheduleInput(fromConfig as AutomationScheduleInput);
  }

  return (
    parseLegacyCronSchedule(job.schedule) ?? {
      frequency: "daily",
      hour: 12,
      minute: 0,
    }
  );
}

export function formatScheduleLabel(
  config: AutomationScheduleConfig,
  timeZone = "Asia/Manila",
): string {
  const timeLabel = `${formatTime12(config.hour, config.minute)} (${timeZone})`;

  switch (config.frequency) {
    case "daily":
      return `Every day at ${timeLabel}`;
    case "weekly":
      return `Every ${WEEKDAY_LABELS[config.dayOfWeek ?? 1]} at ${timeLabel}`;
    case "monthly":
      return `Every month on the ${ordinal(config.dayOfMonth ?? 1)} at ${timeLabel}`;
  }
}

function matchesFrequency(
  config: AutomationScheduleConfig,
  parts: ZonedDateParts,
): boolean {
  switch (config.frequency) {
    case "daily":
      return true;
    case "weekly":
      return parts.dayOfWeek === (config.dayOfWeek ?? 1);
    case "monthly":
      return parts.day === (config.dayOfMonth ?? 1);
  }
}

function sameScheduledSlot(
  config: AutomationScheduleConfig,
  a: ZonedDateParts,
  b: ZonedDateParts,
): boolean {
  if (a.year !== b.year || a.month !== b.month) return false;

  switch (config.frequency) {
    case "daily":
      return a.day === b.day;
    case "weekly":
      return a.dayOfWeek === b.dayOfWeek;
    case "monthly":
      return a.day === b.day;
  }
}

export function isScheduleDue(
  config: AutomationScheduleConfig,
  timeZone: string,
  now: Date,
  lastRunAt?: Date | null,
): boolean {
  const normalized = normalizeScheduleInput(config);
  const parts = getZonedParts(now, timeZone);

  if (parts.hour !== normalized.hour || parts.minute !== normalized.minute) {
    return false;
  }

  if (!matchesFrequency(normalized, parts)) return false;

  if (lastRunAt) {
    const lastParts = getZonedParts(lastRunAt, timeZone);
    if (sameScheduledSlot(normalized, lastParts, parts)) return false;
  }

  return true;
}

/** Whether an active job should run on this dispatch tick (includes overdue catch-up). */
export function isAutomationJobDue(
  config: AutomationScheduleConfig,
  timeZone: string,
  now: Date,
  options?: {
    lastRunAt?: Date | null;
    nextRunAt?: Date | null;
  },
): boolean {
  const lastRunAt = options?.lastRunAt;
  const nextRunAt = options?.nextRunAt;

  if (nextRunAt && nextRunAt.getTime() <= now.getTime()) {
    if (lastRunAt && lastRunAt.getTime() >= nextRunAt.getTime()) {
      return isScheduleDue(config, timeZone, now, lastRunAt);
    }
    return true;
  }

  return isScheduleDue(config, timeZone, now, lastRunAt);
}

function zonedLocalToUtc(
  parts: Omit<ZonedDateParts, "dayOfWeek">,
  timeZone: string,
): Date {
  const guess = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute),
  );

  for (
    let offsetMinutes = -14 * 60;
    offsetMinutes <= 14 * 60;
    offsetMinutes++
  ) {
    const candidate = new Date(guess.getTime() + offsetMinutes * 60_000);
    const zoned = getZonedParts(candidate, timeZone);
    if (
      zoned.year === parts.year &&
      zoned.month === parts.month &&
      zoned.day === parts.day &&
      zoned.hour === parts.hour &&
      zoned.minute === parts.minute
    ) {
      return candidate;
    }
  }

  return guess;
}

export function computeNextRunAt(
  config: AutomationScheduleConfig,
  timeZone: string,
  from = new Date(),
): Date {
  const normalized = normalizeScheduleInput(config);
  const start = getZonedParts(from, timeZone);

  for (let dayOffset = 0; dayOffset < 400; dayOffset++) {
    const probe = new Date(from.getTime() + dayOffset * 86_400_000);
    const probeParts = getZonedParts(probe, timeZone);

    const candidateParts = {
      year: probeParts.year,
      month: probeParts.month,
      day: probeParts.day,
      hour: normalized.hour,
      minute: normalized.minute,
    };

    const candidateUtc = zonedLocalToUtc(candidateParts, timeZone);
    if (candidateUtc <= from) continue;

    const slotParts = getZonedParts(candidateUtc, timeZone);
    if (
      slotParts.hour !== normalized.hour ||
      slotParts.minute !== normalized.minute
    ) {
      continue;
    }

    if (!matchesFrequency(normalized, slotParts)) continue;

    return candidateUtc;
  }

  return new Date(from.getTime() + 86_400_000);
}

export function parseTimeInput(value: string): {
  hour: number;
  minute: number;
} {
  const [hourRaw, minuteRaw] = value.split(":");
  return {
    hour: Number(hourRaw) || 0,
    minute: Number(minuteRaw) || 0,
  };
}

export function formatTimeInput(hour: number, minute: number): string {
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

export const WEEKDAY_OPTIONS = WEEKDAY_LABELS.map((label, value) => ({
  value,
  label,
}));
