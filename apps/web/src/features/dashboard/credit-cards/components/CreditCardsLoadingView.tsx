import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import {
  CreditCardsContentSkeleton,
  SkeletonPageActions,
} from "@/components/shared/skeletons";

export function CreditCardsLoadingView() {
  return (
    <div className="space-y-8">
      <DashboardPageHeader
        title="Credit cards"
        actions={<SkeletonPageActions count={1} />}
      />
      <CreditCardsContentSkeleton />
    </div>
  );
}
