"use client";

import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { AutomationsPanel } from "@/features/dashboard/automations/components/AutomationsPanel";
import { ReminderDueEntriesPanel } from "@/features/dashboard/reminders/components/ReminderDueEntriesPanel";

export function RemindersHubPage() {
  return (
    <div className="space-y-10">
      <DashboardPageHeader title="Reminders" />
      <AutomationsPanel />
      <ReminderDueEntriesPanel />
    </div>
  );
}
