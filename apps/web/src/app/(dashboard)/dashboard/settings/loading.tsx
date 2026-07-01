import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { IntegrationsSettingsSkeleton } from "@/components/shared/skeletons";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function TransactionCategoryRulesSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Skeleton className="h-10 flex-1 rounded-md" />
          <Skeleton className="h-10 w-full rounded-md sm:w-[200px]" />
          <Skeleton className="h-10 w-full rounded-md sm:w-24" />
        </div>
        <div className="divide-y divide-border/60 rounded-lg border border-border/80">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 px-3 py-2.5"
            >
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsLoading() {
  return (
    <div className="space-y-8">
      <DashboardPageHeader title="Settings" />
      <IntegrationsSettingsSkeleton />
      <TransactionCategoryRulesSkeleton />
    </div>
  );
}
