export const AUTOMATION_JOB_TYPES = [
  "send_due_reminders",
  "run_soa_pipeline",
] as const;

export type AutomationJobType = (typeof AUTOMATION_JOB_TYPES)[number];

/** Seeded on first visit; not user-creatable via the UI. */
export const MANAGED_AUTOMATION_JOB_TYPES = [
  "send_due_reminders",
  "run_soa_pipeline",
] as const satisfies readonly AutomationJobType[];

export function isManagedAutomationJobType(jobType: string): boolean {
  return MANAGED_AUTOMATION_JOB_TYPES.includes(
    jobType as (typeof MANAGED_AUTOMATION_JOB_TYPES)[number],
  );
}

export const AUTOMATION_JOB_TYPE_OPTIONS: ReadonlyArray<{
  value: AutomationJobType;
  label: string;
  defaultName: string;
}> = [
  {
    value: "send_due_reminders",
    label: "Send payment reminders",
    defaultName: "Payment reminders",
  },
  {
    value: "run_soa_pipeline",
    label: "Check Gmail for statements",
    defaultName: "SOA check",
  },
];

export function automationJobTypeLabel(jobType: string): string {
  return (
    AUTOMATION_JOB_TYPE_OPTIONS.find((o) => o.value === jobType)?.label ??
    jobType
  );
}

export function defaultAutomationName(jobType: AutomationJobType): string {
  return (
    AUTOMATION_JOB_TYPE_OPTIONS.find((o) => o.value === jobType)?.defaultName ??
    "Automation"
  );
}
