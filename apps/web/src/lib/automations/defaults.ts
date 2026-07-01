import { defaultAutomationName } from "@/lib/automations/job-types";

export const DEFAULT_AUTOMATION_SCHEDULE = {
  frequency: "daily" as const,
  hour: 12,
  minute: 0,
};

export const DEFAULT_REMINDERS_SCHEDULE = DEFAULT_AUTOMATION_SCHEDULE;

export const PAYMENT_REMINDERS_SCHEDULE_NOTE =
  "Checks daily for cards within your reminder window.";

export function defaultRemindersJobName() {
  return defaultAutomationName("send_due_reminders");
}

export function defaultSoaPipelineJobName() {
  return defaultAutomationName("run_soa_pipeline");
}
