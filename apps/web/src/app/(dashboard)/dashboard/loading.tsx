import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { OverviewContentSkeleton } from "@/components/shared/skeletons";

export default function OverviewLoading() {
  return (
    <div className="space-y-8">
      <DashboardPageHeader title="Overview" />
      <OverviewContentSkeleton />
    </div>
  );
}
