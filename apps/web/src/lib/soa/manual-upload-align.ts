import {
  type CalendarMonth,
  isMonthInInclusiveRange,
  isValidCalendarMonth,
} from "./calendar-month";

export type ManualUploadAlignInput = {
  detected: CalendarMonth | null;
  periodFrom: CalendarMonth;
  periodTo: CalendarMonth;
  force?: CalendarMonth | null;
  allowOutOfRange?: boolean;
};

export type ManualUploadAlignResult =
  | { kind: "ok"; month: CalendarMonth; outOfRange: boolean }
  | {
      kind: "needs_confirmation";
      reason: "out_of_range" | "unknown_month";
      detected: CalendarMonth | null;
    };

export function alignManualUploadMonth(
  input: ManualUploadAlignInput,
): ManualUploadAlignResult {
  const { detected, periodFrom, periodTo, allowOutOfRange } = input;
  const force = isValidCalendarMonth(input.force) ? input.force : null;

  if (force) {
    const inRange = isMonthInInclusiveRange(force, periodFrom, periodTo);
    if (inRange || allowOutOfRange) {
      return { kind: "ok", month: force, outOfRange: !inRange };
    }
    return {
      kind: "needs_confirmation",
      reason: "out_of_range",
      detected: force,
    };
  }

  if (!detected) {
    return {
      kind: "needs_confirmation",
      reason: "unknown_month",
      detected: null,
    };
  }

  const inRange = isMonthInInclusiveRange(detected, periodFrom, periodTo);
  if (inRange) {
    return { kind: "ok", month: detected, outOfRange: false };
  }

  if (allowOutOfRange) {
    return { kind: "ok", month: detected, outOfRange: true };
  }

  return {
    kind: "needs_confirmation",
    reason: "out_of_range",
    detected,
  };
}
