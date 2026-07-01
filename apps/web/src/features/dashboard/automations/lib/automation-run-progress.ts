import { buildReminderRunStepPlan } from "@/lib/reminder-run-progress";
import { buildSoaRunStepPlan } from "@/lib/soa-run-progress";
import type { AutomationJobType } from "@/lib/automations/job-types";

import type { WorkflowProgressStep } from "@/components/shared/WorkflowProgressPanel";

export function buildAutomationRunFallbackSteps(
  jobType: AutomationJobType,
): WorkflowProgressStep[] {
  if (jobType === "send_due_reminders") {
    return buildReminderRunStepPlan();
  }

  return buildSoaRunStepPlan({
    monthCount: 1,
    notifyTelegram: false,
    notifySlack: false,
    createCalendar: false,
  });
}
