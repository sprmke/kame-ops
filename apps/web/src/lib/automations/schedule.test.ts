import { describe, expect, it } from "vitest";

import {
  computeNextRunAt,
  formatScheduleLabel,
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
});
