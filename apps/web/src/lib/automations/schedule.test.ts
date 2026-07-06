import { describe, expect, it } from "vitest";

import {
  computeNextRunAt,
  formatScheduleLabel,
  isAutomationJobDue,
  isScheduleDue,
  normalizeScheduleInput,
  parseLegacyCronSchedule,
  scheduleConfigToStorageString,
} from "./schedule";

describe("automation schedule", () => {
  it("formats daily schedule label", () => {
    expect(
      formatScheduleLabel(
        { frequency: "daily", hour: 8, minute: 0 },
        "Asia/Manila",
      ),
    ).toBe("Every day at 8:00 AM (Asia/Manila)");
  });

  it("converts schedule config to storage cron", () => {
    expect(
      scheduleConfigToStorageString({
        frequency: "weekly",
        hour: 12,
        minute: 30,
        dayOfWeek: 1,
      }),
    ).toBe("30 12 * * 1");
  });

  it("parses legacy daily cron", () => {
    expect(parseLegacyCronSchedule("0 8 * * *")).toEqual({
      frequency: "daily",
      hour: 8,
      minute: 0,
    });
  });

  it("detects due daily schedule", () => {
    const config = normalizeScheduleInput({
      frequency: "daily",
      hour: 8,
      minute: 0,
    });
    const now = new Date("2026-06-29T00:00:00.000Z");
    expect(isScheduleDue(config, "Asia/Manila", now)).toBe(true);
    expect(
      isScheduleDue(
        config,
        "Asia/Manila",
        now,
        new Date("2026-06-29T00:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("computes next run after current slot", () => {
    const config = normalizeScheduleInput({
      frequency: "daily",
      hour: 8,
      minute: 0,
    });
    const from = new Date("2026-06-29T00:05:00.000Z");
    const next = computeNextRunAt(config, "Asia/Manila", from);
    expect(next.getTime()).toBeGreaterThan(from.getTime());
  });

  it("runs overdue jobs when nextRunAt is in the past", () => {
    const config = normalizeScheduleInput({
      frequency: "daily",
      hour: 12,
      minute: 0,
    });
    const now = new Date("2026-07-07T01:16:00.000+08:00");
    const lastRunAt = new Date("2026-06-29T14:46:00.000+08:00");
    const nextRunAt = new Date("2026-06-30T12:00:00.000+08:00");

    expect(
      isAutomationJobDue(config, "Asia/Manila", now, {
        lastRunAt,
        nextRunAt,
      }),
    ).toBe(true);
    expect(isScheduleDue(config, "Asia/Manila", now, lastRunAt)).toBe(false);
  });

  it("skips overdue jobs already completed for the due window", () => {
    const config = normalizeScheduleInput({
      frequency: "daily",
      hour: 12,
      minute: 0,
    });
    const now = new Date("2026-07-07T12:30:00.000+08:00");
    const lastRunAt = new Date("2026-07-07T12:01:00.000+08:00");
    const nextRunAt = new Date("2026-07-07T12:00:00.000+08:00");

    expect(
      isAutomationJobDue(config, "Asia/Manila", now, {
        lastRunAt,
        nextRunAt,
      }),
    ).toBe(false);
  });
});
