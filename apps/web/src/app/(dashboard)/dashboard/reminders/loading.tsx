import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { RemindersHubContentSkeleton } from "@/components/shared/skeletons";

export default function RemindersLoading() {
  return (
    <div className="space-y-8">
      <DashboardPageHeader title="Reminders" />
      <RemindersHubContentSkeleton />
    </div>
  );
}
