import {
  buildSoaRunStepPlan,
  type SoaRunStepSnapshot,
} from "@/lib/soa-run-progress";

export type {
  SoaRunProgressSnapshot,
  SoaRunStepId,
  SoaRunStepSnapshot,
} from "@/lib/soa-run-progress";

export type RunSoaFormValues = {
  mode: "single" | "range";
  fromMonth: number;
  fromYear: number;
  toMonth: number;
  toYear: number;
  monthCount: number;
  rangeStyle: "explicit" | "rolling";
  notifyTelegram: boolean;
  notifySlack: boolean;
  createCalendar: boolean;
};

export type RunSoaProgressStep = SoaRunStepSnapshot;

export function monthSpan(values: RunSoaFormValues): number {
  if (values.mode === "single") return 1;
  if (values.rangeStyle === "rolling") {
    return Math.max(1, values.monthCount);
  }
  const from = values.fromYear * 12 + values.fromMonth;
  const to = values.toYear * 12 + values.toMonth;
  return Math.max(1, to - from + 1);
}

export function buildRunSoaProgressSteps(
  values: RunSoaFormValues,
): RunSoaProgressStep[] {
  return buildSoaRunStepPlan({
    monthCount: monthSpan(values),
    notifyTelegram: values.notifyTelegram,
    notifySlack: values.notifySlack,
    createCalendar: values.createCalendar,
  });
}

export function toRunSoaPipelineInput(values: RunSoaFormValues, runId: string) {
  const isRolling = values.mode === "range" && values.rangeStyle === "rolling";

  return {
    mode: values.mode,
    fromMonth: isRolling ? values.toMonth : values.fromMonth,
    fromYear: isRolling ? values.toYear : values.fromYear,
    toMonth: values.toMonth,
    toYear: values.toYear,
    monthCount: isRolling ? values.monthCount : undefined,
    notifyTelegram: values.notifyTelegram,
    notifySlack: values.notifySlack,
    createCalendar: values.createCalendar,
    runId,
  };
}

export type SoaRunPeriodLike = {
  mode: string;
  fromMonth: number;
  fromYear: number;
  toMonth: number;
  toYear: number;
  notifyTelegram: boolean;
  notifySlack: boolean;
  createCalendar: boolean;
};

export function periodToRunInitial(
  period: SoaRunPeriodLike,
): Partial<RunSoaFormValues> {
  const isSingle =
    period.mode === "single" ||
    (period.fromMonth === period.toMonth && period.fromYear === period.toYear);

  return {
    mode: isSingle ? "single" : "range",
    fromMonth: period.fromMonth,
    fromYear: period.fromYear,
    toMonth: period.toMonth,
    toYear: period.toYear,
    rangeStyle: "explicit",
    notifyTelegram: period.notifyTelegram,
    notifySlack: period.notifySlack,
    createCalendar: period.createCalendar,
  };
}
