import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import {
  ReceiptsContentSkeleton,
  SkeletonPageActions,
} from "@/components/shared/skeletons";

export default function ReceiptsLoading() {
  return (
    <div className="space-y-8">
      <DashboardPageHeader
        title="Receipts"
        actions={<SkeletonPageActions count={1} />}
      />
      <ReceiptsContentSkeleton />
    </div>
  );
}
