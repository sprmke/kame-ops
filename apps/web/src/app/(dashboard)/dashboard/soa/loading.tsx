import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import {
  SoaListContentSkeleton,
  SkeletonPageActions,
} from "@/components/shared/skeletons";

export default function SoaLoading() {
  return (
    <div className="space-y-8">
      <DashboardPageHeader
        title="Statement of account"
        actions={<SkeletonPageActions count={1} />}
      />
      <SoaListContentSkeleton />
    </div>
  );
}
