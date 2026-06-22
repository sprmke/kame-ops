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

export type RunSoaProgressStep = {
  id: string;
  label: string;
  weight: number;
};

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
  const months = monthSpan(values);

  const steps: RunSoaProgressStep[] = [
    { id: "prepare", label: "Preparing your cards", weight: 1 },
    {
      id: "gmail",
      label:
        months > 1
          ? `Searching Gmail for ${months} statement periods`
          : "Searching Gmail for statements",
      weight: 2 + months,
    },
    {
      id: "parse",
      label:
        months > 1
          ? "Reading and unlocking statement PDFs"
          : "Reading your statement PDFs",
      weight: 3 + months * 1.5,
    },
    {
      id: "summary",
      label:
        months > 1
          ? "Building your multi-month summary"
          : "Building your summary",
      weight: 2 + months * 0.5,
    },
    { id: "save", label: "Saving statements and due dates", weight: 2 },
  ];

  if (values.notifyTelegram) {
    steps.push({
      id: "telegram",
      label: "Sending summary to Telegram",
      weight: 1.5,
    });
  }
  if (values.notifySlack) {
    steps.push({ id: "slack", label: "Sending summary to Slack", weight: 1.5 });
  }
  if (values.createCalendar) {
    steps.push({
      id: "calendar",
      label: "Adding due dates to Google Calendar",
      weight: 1.5,
    });
  }

  steps.push({ id: "finish", label: "Wrapping up", weight: 1 });

  return steps;
}

export function estimateRunDurationMs(
  stepCount: number,
  monthSpan: number,
): number {
  return Math.min(
    120_000,
    Math.max(14_000, 10_000 + stepCount * 1_800 + monthSpan * 2_500),
  );
}
