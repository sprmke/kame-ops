import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import {
  AiKeysCardSkeleton,
  AutomationCardSkeleton,
  BreadcrumbSkeleton,
  CategoryRulesSkeleton,
  CreditCardGridSkeleton,
  DataTableSkeleton,
  DueDatesSummarySkeleton,
  DueEntryGridSkeleton,
  IntegrationCardSkeleton,
  ListCountToolbarSkeleton,
  ListViewToolbarSkeleton,
  OverviewListCardSkeleton,
  OverviewPeriodMissionSkeleton,
  QuickActionCardSkeleton,
  ReceiptGridSkeleton,
  SkeletonPageActions,
  SkeletonShell,
  SoaPeriodGridSkeleton,
  StatCardsRowSkeleton,
  StatementHeroSkeleton,
  StatusBarSkeleton,
  TabsSkeleton,
  TransactionListSkeleton,
} from "./parts";

export function OverviewContentSkeleton() {
  return (
    <SkeletonShell label="Loading overview">
      <div className="space-y-8">
        <OverviewPeriodMissionSkeleton />
        <div className="grid gap-6 lg:grid-cols-2">
          <OverviewListCardSkeleton />
          <OverviewListCardSkeleton />
        </div>
      </div>
    </SkeletonShell>
  );
}

export function RemindersHubContentSkeleton() {
  return (
    <SkeletonShell label="Loading reminders">
      <div className="space-y-10">
        <div className="space-y-4">
          <Skeleton className="h-5 w-24" />
          <div className="grid gap-3 lg:grid-cols-2">
            <AutomationCardSkeleton />
            <AutomationCardSkeleton />
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-5 w-24" />
          <DueDatesSummarySkeleton />
          <Card className="border-border/80 shadow-card">
            <CardContent className="p-4 sm:p-5">
              <DueEntryGridSkeleton />
            </CardContent>
          </Card>
        </div>
      </div>
    </SkeletonShell>
  );
}

export function RemindersContentSkeleton() {
  return (
    <SkeletonShell label="Loading reminders">
      <div className="space-y-4">
        <DueDatesSummarySkeleton />
        <Card className="border-border/80 shadow-card">
          <CardContent className="p-4 sm:p-5">
            <DueEntryGridSkeleton />
          </CardContent>
        </Card>
      </div>
    </SkeletonShell>
  );
}

export function ReceiptsContentSkeleton() {
  return (
    <SkeletonShell label="Loading receipts">
      <div className="space-y-6">
        <ListCountToolbarSkeleton />
        <ReceiptGridSkeleton />
      </div>
    </SkeletonShell>
  );
}

export function CreditCardsContentSkeleton() {
  return (
    <SkeletonShell label="Loading credit cards">
      <div className="space-y-4">
        <ListViewToolbarSkeleton />
        <CreditCardGridSkeleton />
      </div>
    </SkeletonShell>
  );
}

export function SoaListContentSkeleton() {
  return (
    <SkeletonShell label="Loading SOA runs">
      <div className="space-y-4">
        <StatCardsRowSkeleton />
        <ListViewToolbarSkeleton />
        <SoaPeriodGridSkeleton />
      </div>
    </SkeletonShell>
  );
}

export function AutomationsContentSkeleton() {
  return (
    <SkeletonShell label="Loading automations">
      <div className="space-y-4">
        <AutomationCardSkeleton />
        <AutomationCardSkeleton />
      </div>
    </SkeletonShell>
  );
}

export function IntegrationsSettingsSkeleton() {
  return (
    <SkeletonShell label="Loading integrations">
      <div className="grid gap-6 lg:grid-cols-2">
        <IntegrationCardSkeleton fullWidth />
        <IntegrationCardSkeleton />
        <IntegrationCardSkeleton />
        <AiKeysCardSkeleton />
      </div>
    </SkeletonShell>
  );
}

export function TransactionCategoryRulesContentSkeleton() {
  return (
    <SkeletonShell label="Loading category rules">
      <CategoryRulesSkeleton />
    </SkeletonShell>
  );
}

export function SoaPeriodDetailContentSkeleton() {
  return (
    <SkeletonShell label="Loading SOA period">
      <div className="space-y-8">
        <BreadcrumbSkeleton />
        <StatCardsRowSkeleton />
        <TabsSkeleton />
      </div>
    </SkeletonShell>
  );
}

export function SoaStatementDetailContentSkeleton() {
  return (
    <SkeletonShell label="Loading statement">
      <div className="space-y-8">
        <BreadcrumbSkeleton />
        <StatementHeroSkeleton />
        <StatCardsRowSkeleton count={4} />
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-16" />
          </div>
          <TransactionListSkeleton />
        </div>
      </div>
    </SkeletonShell>
  );
}

export * from "./parts";
