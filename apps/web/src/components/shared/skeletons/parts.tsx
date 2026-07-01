import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { tableCardClassName } from "@/components/shared/TableCard";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";

type SkeletonShellProps = {
  className?: string;
  children: React.ReactNode;
  label?: string;
};

export function SkeletonShell({
  className,
  children,
  label = "Loading content",
}: SkeletonShellProps) {
  return (
    <div
      className={className}
      aria-busy="true"
      aria-live="polite"
      role="status"
    >
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function SkeletonPageActions({ count = 1 }: { count?: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-9 rounded-md", i === 0 ? "w-28" : "w-24")}
        />
      ))}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <Card className="relative overflow-hidden border-border/80 shadow-card">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-muted"
        aria-hidden
      />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  );
}

export function StatCardsRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ListViewToolbarSkeleton() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Skeleton className="h-5 w-24" />
      <div className="hidden items-center gap-2 md:flex">
        <Skeleton className="h-9 w-[4.5rem] rounded-md" />
        <Skeleton className="h-9 w-9 rounded-md" />
      </div>
    </div>
  );
}

export function GroupToggleSkeleton() {
  return (
    <div className="inline-flex items-center rounded-lg border bg-muted p-1">
      <Skeleton className="h-8 w-[5.5rem] rounded-md" />
      <Skeleton className="h-8 w-[5.5rem] rounded-md bg-transparent" />
      <Skeleton className="h-8 w-[5.5rem] rounded-md bg-transparent" />
    </div>
  );
}

export function ListCountToolbarSkeleton() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Skeleton className="h-5 w-28" />
      <GroupToggleSkeleton />
    </div>
  );
}

export function StatusBarSkeleton() {
  return (
    <Card className="border-border/80 shadow-card">
      <CardContent className="flex flex-wrap items-center gap-3 py-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-28 rounded-full" />
        <Skeleton className="h-6 w-32 rounded-full" />
      </CardContent>
    </Card>
  );
}

export function DueDatesSummarySkeleton() {
  return (
    <Card className="border-border/80 shadow-card">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-6 w-36" />
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-28 rounded-full" />
            <Skeleton className="h-6 w-32 rounded-full" />
          </div>
        </div>
        <GroupToggleSkeleton />
      </CardContent>
    </Card>
  );
}

export function DueEntryCardSkeleton() {
  return (
    <Card className="border-border/80 shadow-card">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-6 w-14 shrink-0 rounded-full" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-6 w-full rounded-full" />
        <div className="flex justify-between">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="flex justify-between">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-9 w-full rounded-md" />
      </CardContent>
    </Card>
  );
}

export function DueEntryGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <DueEntryCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ReceiptCardSkeleton() {
  return (
    <Card className="relative overflow-hidden border-border/80 shadow-sm">
      <Skeleton className="absolute right-1 top-1 z-10 h-8 w-8 rounded-md" />
      <div className="flex min-h-[7.5rem] items-stretch sm:min-h-[8rem]">
        <Skeleton className="w-24 shrink-0 rounded-none sm:w-28" />
        <div className="flex min-w-0 flex-1 flex-col gap-2 p-3 pr-10">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <div className="mt-auto space-y-1">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </div>
    </Card>
  );
}

export function ReceiptGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <ReceiptCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function CreditCardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="overflow-hidden border-border/80 shadow-card">
          <Skeleton className="h-1 w-full rounded-none" />
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-4 w-20" />
                <div className="flex gap-1.5">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
              </div>
              <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function DataTableSkeleton({
  columns = 6,
  rows = 7,
}: {
  columns?: number;
  rows?: number;
}) {
  return (
    <div className={tableCardClassName}>
      <div className="border-b border-border/80 bg-muted/20 px-4 py-3">
        <div className="flex gap-4">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton
              key={i}
              className={cn("h-4", i === columns - 1 ? "ml-auto w-8" : "w-20")}
            />
          ))}
        </div>
      </div>
      <div className="divide-y divide-border/60">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: columns }).map((_, col) => (
              <Skeleton
                key={col}
                className={cn(
                  "h-4",
                  col === 0
                    ? "w-32"
                    : col === columns - 1
                      ? "ml-auto w-8"
                      : "w-20",
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SoaPeriodCardSkeleton() {
  return (
    <Card className="flex h-full flex-col overflow-hidden border-border/80 shadow-card">
      <Skeleton className="h-1 w-full shrink-0 rounded-none" />
      <CardHeader className="shrink-0 space-y-0 pb-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-4/5" />
            <div className="flex flex-wrap gap-1.5">
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
        </div>
      </CardHeader>
      <CardContent className="mt-auto space-y-3 pt-0">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-24" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-20" />
          </div>
        </div>
        <Skeleton className="h-9 w-full rounded-md" />
      </CardContent>
    </Card>
  );
}

export function SoaPeriodGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <SoaPeriodCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function AutomationCardSkeleton() {
  return (
    <Card className="border-border/80 shadow-card">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-56" />
          <Skeleton className="h-3 w-44" />
        </div>
        <Skeleton className="h-8 w-24 rounded-md" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </CardContent>
    </Card>
  );
}

function OverviewProgressMetricSkeleton({
  labelWidth = "w-24",
  valueWidth = "w-10",
  captionWidth = "w-full max-w-[13rem]",
}: {
  labelWidth?: string;
  valueWidth?: string;
  captionWidth?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Skeleton className={cn("h-4", labelWidth)} />
        <Skeleton className={cn("h-4 shrink-0", valueWidth)} />
      </div>
      <Skeleton className="h-2.5 w-full rounded-full" />
      <Skeleton className={cn("h-3", captionWidth)} />
    </div>
  );
}

export function OverviewPeriodMissionSkeleton() {
  return (
    <Card className="overflow-hidden border-border/80 shadow-card">
      <div className="h-1 w-full bg-muted" aria-hidden />
      <CardContent className="space-y-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
              <Skeleton className="h-6 w-28" />
            </div>
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-9 w-[5.75rem] shrink-0 rounded-md" />
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <OverviewProgressMetricSkeleton
            labelWidth="w-28"
            valueWidth="w-8"
            captionWidth="w-full max-w-[15rem]"
          />
          <OverviewProgressMetricSkeleton
            labelWidth="w-24"
            valueWidth="w-20"
            captionWidth="w-full max-w-[12rem]"
          />
          <OverviewProgressMetricSkeleton
            labelWidth="w-12"
            valueWidth="w-10"
            captionWidth="w-24"
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function OverviewListCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-36" />
        <Skeleton className="mt-2 h-3 w-44" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2"
          >
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        ))}
        <Skeleton className="h-8 w-full rounded-md" />
      </CardContent>
    </Card>
  );
}

export function QuickActionCardSkeleton() {
  return (
    <Card className="h-full border-border/80">
      <CardHeader className="pb-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="mt-2 h-3 w-32" />
      </CardHeader>
    </Card>
  );
}

export function IntegrationCardSkeleton({
  fullWidth = false,
}: {
  fullWidth?: boolean;
}) {
  return (
    <Card className={fullWidth ? "lg:col-span-2" : undefined}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-36" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-10 w-full rounded-md" />
        {fullWidth ? null : (
          <>
            <div className="space-y-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
            <Skeleton className="h-10 w-full rounded-md" />
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function AiKeysCardSkeleton() {
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-28" />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-10 w-full rounded-md" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-28 rounded-md" />
              <Skeleton className="h-9 w-20 rounded-md" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function CategoryRulesSkeleton() {
  return (
    <div className="space-y-3">
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
  );
}

export function CardFormSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-10 w-full rounded-md" />
    </div>
  );
}

export function BreadcrumbSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="h-4 w-12" />
      <Skeleton className="h-3 w-2" />
      <Skeleton className="h-4 w-24" />
    </div>
  );
}

export function TabsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="inline-flex h-10 items-center rounded-md bg-muted p-1">
        <Skeleton className="h-8 w-24 rounded-sm" />
        <Skeleton className="h-8 w-28 rounded-sm bg-transparent" />
        <Skeleton className="h-8 w-24 rounded-sm bg-transparent" />
      </div>
      <ListCountToolbarSkeleton />
      <SoaPeriodGridSkeleton count={3} />
    </div>
  );
}

export function StatementHeroSkeleton() {
  return (
    <Card className="overflow-hidden border-border/80 shadow-card">
      <div className="h-1 w-full bg-muted" />
      <CardHeader className="space-y-4 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-14 rounded-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-7 w-24" />
            </div>
          ))}
        </div>
      </CardHeader>
    </Card>
  );
}

export function TransactionListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2 rounded-lg border border-border/80">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-4 border-b border-border/60 px-4 py-3 last:border-0"
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-3/4 max-w-xs" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-4 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function MediaPreviewSkeleton({ className }: { className?: string }) {
  return (
    <Skeleton
      className={cn(
        "h-full w-full min-h-[240px] rounded-md lg:min-h-[380px]",
        className,
      )}
    />
  );
}

export function PdfPreviewSkeleton() {
  return <MediaPreviewSkeleton className="min-h-[70vh] rounded-none" />;
}

export function ReceiptPreviewDetailsSkeleton() {
  return (
    <div className="space-y-5 p-4 sm:p-5">
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <Skeleton className="h-3 w-32" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-12" />
        <div className="space-y-2 rounded-lg border border-border/80 bg-muted/10 p-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex justify-between gap-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    </div>
  );
}

export function ThumbnailSkeleton({
  layout = "sidebar",
}: {
  layout?: "sidebar" | "cover";
}) {
  return (
    <Skeleton
      className={cn(
        "rounded-none",
        layout === "cover"
          ? "aspect-[4/3] w-full"
          : "h-full min-h-full w-[5.25rem] sm:w-24",
      )}
    />
  );
}
