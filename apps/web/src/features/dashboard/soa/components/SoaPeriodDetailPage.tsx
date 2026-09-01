"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { inferRouterOutputs } from "@trpc/server";
import {
  ArrowLeft,
  CalendarDays,
  CircleCheck,
  CreditCard,
  FileText,
  Loader2,
  PhilippinePeso,
  Play,
  Sparkles,
  Upload,
} from "lucide-react";

import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { SoaPeriodDetailContentSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/StatCard";
import { ViewToggle } from "@/components/shared/ViewToggle";
import { ViewModeLayout } from "@/components/shared/ViewModeLayout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ROUTES } from "@/config/routes";
import { api } from "@/lib/api/client";
import type { AppRouter } from "@/server/routers/_app";
import { formatPhpAmount } from "@/lib/utils/format-money";
import { cn } from "@/lib/utils/cn";

import {
  CategorizeWithAiProvider,
  useCategorizeWithAiActions,
} from "./CategorizeWithAiProvider";
import { ManualSoaMonthConfirmDialog } from "./ManualSoaMonthConfirmDialog";
import { RunSoaDialog } from "./RunSoaDialog";
import { SoaPdfPreview } from "./SoaPdfPreview";
import {
  SoaPeriodAnalyticsTab,
  SoaPeriodOverviewTab,
} from "./SoaPeriodAnalyticsTabs";
import { SoaStatementCard } from "./SoaStatementCard";
import { SoaStatementTable } from "./SoaStatementTable";
import { usePersistedViewMode } from "@/hooks/use-persisted-view-mode";
import { isStatementMarkedPaid } from "@/lib/soa/paid-status";
import {
  groupStatementsByPeriod,
  periodLabel,
  type SoaStatement,
} from "../lib/soa-utils";
import { periodToRunInitial } from "../lib/run-soa-progress";
import { useSoaManualUpload } from "../hooks/use-soa-manual-upload";
import { useSoaRunDialog } from "../hooks/use-soa-run-dialog";

type PdfPreviewState =
  | { kind: "closed" }
  | { kind: "source"; statementId: string; title: string }
  | { kind: "summary"; periodId: string; title: string };

type SoaPeriodDetail = NonNullable<
  inferRouterOutputs<AppRouter>["soa"]["getPeriod"]
>;

type CategorizeTransactionInput = {
  categorySlug?: string | null;
  categorySource?: string | null;
};

export function SoaPeriodDetailPage({ periodId }: { periodId: string }) {
  const { data: period, isLoading } = api.soa.getPeriod.useQuery({ periodId });

  if (isLoading) {
    return (
      <div className="space-y-8">
        <SoaPeriodDetailContentSkeleton />
      </div>
    );
  }

  if (!period) {
    return (
      <div className="py-16 space-y-4 text-center">
        <p className="text-muted-foreground">SOA period not found.</p>
        <Button asChild variant="outline">
          <Link href={ROUTES.dashboard.soa}>
            <ArrowLeft className="mr-2 w-4 h-4" />
            Back
          </Link>
        </Button>
      </div>
    );
  }

  const statementGroups = groupStatementsByPeriod(
    period.statements as SoaStatement[],
  );
  const flatStatements = statementGroups.flatMap((group) => group.statements);
  const periodTransactions: CategorizeTransactionInput[] =
    flatStatements.flatMap((statement) => statement.transactions ?? []);

  return (
    <CategorizeWithAiProvider
      periodId={periodId}
      transactions={periodTransactions}
    >
      <SoaPeriodDetailBody
        periodId={periodId}
        period={period}
        statementGroups={statementGroups}
        flatStatements={flatStatements}
        periodTransactions={periodTransactions}
      />
    </CategorizeWithAiProvider>
  );
}

function SoaPeriodDetailBody({
  periodId,
  period,
  statementGroups,
  flatStatements,
  periodTransactions,
}: {
  periodId: string;
  period: SoaPeriodDetail;
  statementGroups: ReturnType<typeof groupStatementsByPeriod>;
  flatStatements: SoaStatement[];
  periodTransactions: CategorizeTransactionInput[];
}) {
  const utils = api.useUtils();
  const { data: dues } = api.reminders.listDue.useQuery({ unpaidOnly: false });
  const categorize = useCategorizeWithAiActions();

  const [pdfPreview, setPdfPreview] = useState<PdfPreviewState>({
    kind: "closed",
  });
  const { viewMode, setViewMode } = usePersistedViewMode(
    "kame-ops:soa-view-mode",
  );

  const { openRun, runPipeline, runDialogProps } = useSoaRunDialog({
    initial: periodToRunInitial(period),
    onRunSuccess: () => {
      void utils.soa.getPeriod.invalidate({ periodId });
      void utils.soa.listPeriods.invalidate();
      void utils.reminders.listDue.invalidate();
    },
  });

  const manualUpload = useSoaManualUpload(periodId, () => {
    void utils.soa.getPeriod.invalidate({ periodId });
    void utils.soa.listPeriods.invalidate();
    void utils.reminders.listDue.invalidate();
    void utils.overview.stats.invalidate();
  });

  const paidDues = useMemo(
    () =>
      (dues ?? []).map((due) => ({
        issuerId: due.issuerId,
        cardLast4: due.cardLast4,
        dueDateYmd: due.dueDateYmd,
        paidAt: due.paidAt,
        statementPeriodKey: due.statementPeriodKey,
      })),
    [dues],
  );

  const pdfUrl =
    pdfPreview.kind === "source"
      ? `/api/soa/pdf?type=source&statementId=${pdfPreview.statementId}`
      : pdfPreview.kind === "summary"
        ? `/api/soa/pdf?type=summary&periodId=${pdfPreview.periodId}`
        : null;

  return (
    <div className="space-y-8">
      <div className="flex gap-2 items-center">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={ROUTES.dashboard.soa}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            SOA
          </Link>
        </Button>
      </div>

      <DashboardPageHeader
        title={period.label}
        actions={
          <div className="flex flex-wrap gap-2 items-center">
            <input
              ref={manualUpload.fileRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={manualUpload.handleFileInputChange}
            />
            <Button
              variant="outline"
              onClick={() => manualUpload.triggerFilePicker()}
              disabled={manualUpload.isPending || runPipeline.isPending}
            >
              {manualUpload.isPending ? (
                <Loader2 className="mr-2 w-4 h-4 animate-spin" />
              ) : (
                <Upload className="mr-2 w-4 h-4" />
              )}
              {manualUpload.progressLabel
                ? `Uploading ${manualUpload.progressLabel}`
                : "Upload"}
            </Button>
            <Button onClick={() => openRun()} disabled={runPipeline.isPending}>
              <Play className="mr-2 w-4 h-4" />
              Re-run
            </Button>
            {periodTransactions.length > 0 && (
              <Button
                variant="outline"
                onClick={() => categorize.openChoiceDialog()}
                disabled={categorize.isPending}
              >
                <Sparkles className="mr-2 w-4 h-4" />
                Categorized with AI
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() =>
                setPdfPreview({
                  kind: "summary",
                  periodId,
                  title: `${period.label} summary`,
                })
              }
            >
              <FileText className="mr-2 w-4 h-4" />
              Summary PDF
            </Button>
          </div>
        }
      />

      <RunSoaDialog {...runDialogProps} />
      <ManualSoaMonthConfirmDialog
        pending={manualUpload.confirmPending}
        onSkip={() => manualUpload.resolveConfirm({ action: "skip" })}
        onForce={(month, year) =>
          manualUpload.resolveConfirm({ action: "force", month, year })
        }
        onSaveDetected={() =>
          manualUpload.resolveConfirm({ action: "outOfRange" })
        }
      />

      <SoaPdfPreview
        open={pdfPreview.kind !== "closed"}
        onOpenChange={(open) => {
          if (!open) setPdfPreview({ kind: "closed" });
        }}
        title={pdfPreview.kind !== "closed" ? pdfPreview.title : "PDF"}
        pdfUrl={pdfUrl}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Outstanding"
          value={formatPhpAmount(period.totalDue)}
          icon={PhilippinePeso}
        />
        <StatCard
          title="Minimum due"
          value={formatPhpAmount(period.grossMinimumDue)}
          icon={CreditCard}
        />
        <StatCard
          title="Total paid"
          value={formatPhpAmount(period.totalPaid)}
          icon={CircleCheck}
        />
        <StatCard
          title="Next due"
          value={
            period.nextDueYmd
              ? new Date(`${period.nextDueYmd}T00:00:00`).toLocaleDateString(
                  "en-PH",
                  { month: "short", day: "numeric" },
                )
              : "—"
          }
          icon={CalendarDays}
        />
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="overflow-x-auto justify-start w-full">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="transactions">Cards</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0">
          <SoaPeriodOverviewTab
            statements={flatStatements}
            totalPaid={period.totalPaid}
            outstandingDue={period.totalDue}
            grossStatementDue={period.grossStatementDue}
            grossMinimumDue={period.grossMinimumDue}
            minimumRemaining={period.totalMinimum}
            minimumMetCardCount={period.minimumMetCardCount}
            cardCount={period.cardCount}
            paidCardCount={period.paidCardCount}
            nextDueYmd={period.nextDueYmd}
          />
        </TabsContent>

        <TabsContent value="transactions" className="mt-0 space-y-6">
          {!!period.statements.length && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium tabular-nums text-foreground">
                  {flatStatements.length}
                </span>{" "}
                {flatStatements.length === 1 ? "statement" : "statements"}
              </p>
              <ViewToggle
                value={viewMode}
                onChange={setViewMode}
                options={["table", "grid"]}
                className="w-full sm:w-auto"
              />
            </div>
          )}

          <div className="space-y-10">
            <ViewModeLayout
              viewMode={viewMode}
              table={
                flatStatements.length > 0 ? (
                  <SoaStatementTable
                    periodId={periodId}
                    statements={flatStatements}
                    paidDues={paidDues}
                    onPreviewSource={(s) =>
                      setPdfPreview({
                        kind: "source",
                        statementId: s.id,
                        title: `${s.bankLabel} ···· ${s.cardLast4}`,
                      })
                    }
                    showPeriodColumn={statementGroups.length > 1}
                  />
                ) : (
                  <p className="py-12 text-sm text-center text-muted-foreground">
                    No statements in this period.
                  </p>
                )
              }
              grid={
                <>
                  {statementGroups.map((group) => (
                    <section key={group.key} className="space-y-4">
                      {statementGroups.length > 1 && (
                        <div className="pb-3 border-b border-border/60">
                          <h2 className="text-lg font-semibold font-display">
                            {periodLabel(group.month, group.year)}
                          </h2>
                          <p className="text-sm text-muted-foreground">
                            {group.cardCount} cards ·{" "}
                            {formatPhpAmount(group.totalDue)} statement total
                          </p>
                        </div>
                      )}

                      <div
                        className={cn(
                          "grid gap-4",
                          "md:grid-cols-2 xl:grid-cols-3",
                        )}
                      >
                        {group.statements.map((s) => (
                          <SoaStatementCard
                            key={s.id}
                            periodId={periodId}
                            statement={s}
                            paid={isStatementMarkedPaid(s, paidDues)}
                            onPreviewSource={() =>
                              setPdfPreview({
                                kind: "source",
                                statementId: s.id,
                                title: `${s.bankLabel} ···· ${s.cardLast4}`,
                              })
                            }
                          />
                        ))}
                      </div>
                    </section>
                  ))}

                  {!period.statements.length && (
                    <p className="py-12 text-sm text-center text-muted-foreground">
                      No statements in this period.
                    </p>
                  )}
                </>
              }
            />
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="mt-0">
          <SoaPeriodAnalyticsTab statements={flatStatements} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
