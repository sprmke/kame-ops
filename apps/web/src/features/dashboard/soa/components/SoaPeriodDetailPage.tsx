"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  CreditCard,
  FileText,
  PhilippinePeso,
  Play,
} from "lucide-react";

import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { StatCard } from "@/components/shared/StatCard";
import { ViewToggle } from "@/components/shared/ViewToggle";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ROUTES } from "@/config/routes";
import { api } from "@/lib/api/client";
import { formatPhpAmount } from "@/lib/utils/format-money";
import { cn } from "@/lib/utils/cn";

import { RunSoaDialog } from "./RunSoaDialog";
import { SoaPdfPreview } from "./SoaPdfPreview";
import {
  SoaPeriodAnalyticsTab,
  SoaPeriodOverviewTab,
} from "./SoaPeriodAnalyticsTabs";
import { SoaStatementCard } from "./SoaStatementCard";
import { SoaStatementTable } from "./SoaStatementTable";
import { usePersistedViewMode } from "@/hooks/use-persisted-view-mode";
import {
  dueEntryKey,
  groupStatementsByPeriod,
  periodLabel,
  type SoaStatement,
} from "../lib/soa-utils";
import { periodToRunInitial } from "../lib/run-soa-progress";
import { useSoaRunDialog } from "../hooks/use-soa-run-dialog";

type PdfPreviewState =
  | { kind: "closed" }
  | { kind: "source"; statementId: string; title: string }
  | { kind: "summary"; periodId: string; title: string };

export function SoaPeriodDetailPage({ periodId }: { periodId: string }) {
  const utils = api.useUtils();
  const { data: period, isLoading } = api.soa.getPeriod.useQuery({ periodId });
  const { data: dues } = api.reminders.listDue.useQuery({ unpaidOnly: false });

  const [pdfPreview, setPdfPreview] = useState<PdfPreviewState>({
    kind: "closed",
  });
  const { viewMode, setViewMode } = usePersistedViewMode(
    "kame-ops:soa-view-mode",
  );

  const { openRun, runPipeline, runDialogProps } = useSoaRunDialog({
    initial: period ? periodToRunInitial(period) : undefined,
    onRunSuccess: () => {
      void utils.soa.getPeriod.invalidate({ periodId });
      void utils.soa.listPeriods.invalidate();
      void utils.reminders.listDue.invalidate();
    },
  });

  const statementGroups = useMemo(() => {
    if (!period?.statements) return [];
    return groupStatementsByPeriod(period.statements as SoaStatement[]);
  }, [period?.statements]);

  const paidLookup = useMemo(() => {
    const map = new Set<string>();
    for (const d of dues ?? []) {
      if (d.paidAt) {
        map.add(dueEntryKey(d.issuerId, d.cardLast4, d.dueDateYmd));
      }
    }
    return map;
  }, [dues]);

  const flatStatements = useMemo(() => {
    return statementGroups.flatMap((group) => group.statements);
  }, [statementGroups]);

  const pdfUrl =
    pdfPreview.kind === "source"
      ? `/api/soa/pdf?type=source&statementId=${pdfPreview.statementId}`
      : pdfPreview.kind === "summary"
        ? `/api/soa/pdf?type=summary&periodId=${pdfPreview.periodId}`
        : null;

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!period) {
    return (
      <div className="space-y-4 text-center py-16">
        <p className="text-muted-foreground">SOA period not found.</p>
        <Button asChild variant="outline">
          <Link href={ROUTES.dashboard.soa}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
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
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => openRun()} disabled={runPipeline.isPending}>
              <Play className="mr-2 h-4 w-4" />
              Re-run
            </Button>
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
              <FileText className="mr-2 h-4 w-4" />
              Summary PDF
            </Button>
          </div>
        }
      />

      <RunSoaDialog {...runDialogProps} />

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
          title={statementGroups.length > 1 ? "Outstanding" : "Total due"}
          value={formatPhpAmount(period.totalDue)}
          icon={PhilippinePeso}
        />
        <StatCard
          title="Minimum due"
          value={formatPhpAmount(period.totalMinimum)}
          icon={CreditCard}
        />
        <StatCard title="Cards" value={period.cardCount} icon={FileText} />
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
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0">
          <SoaPeriodOverviewTab
            statements={flatStatements}
            totalDue={period.totalDue}
            cardCount={period.cardCount}
          />
        </TabsContent>

        <TabsContent value="transactions" className="mt-0 space-y-6">
          {!!period.statements.length && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground tabular-nums">
                  {flatStatements.length}
                </span>{" "}
                {flatStatements.length === 1 ? "statement" : "statements"}
              </p>
              <ViewToggle
                value={viewMode}
                onChange={setViewMode}
                options={["table", "grid"]}
              />
            </div>
          )}

          <div className="space-y-10">
            {viewMode === "table" ? (
              flatStatements.length > 0 ? (
                <SoaStatementTable
                  periodId={periodId}
                  statements={flatStatements}
                  paidLookup={paidLookup}
                  dueEntryKey={dueEntryKey}
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
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No statements in this period. Re-run SOA to fetch data.
                </p>
              )
            ) : (
              <>
                {statementGroups.map((group) => (
                  <section key={group.key} className="space-y-4">
                    {statementGroups.length > 1 && (
                      <div className="border-b border-border/60 pb-3">
                        <h2 className="font-display text-lg font-semibold">
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
                          paid={paidLookup.has(
                            dueEntryKey(s.issuerId, s.cardLast4, s.dueDateYmd),
                          )}
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
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    No statements in this period. Re-run SOA to fetch data.
                  </p>
                )}
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="mt-0">
          <SoaPeriodAnalyticsTab statements={flatStatements} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
