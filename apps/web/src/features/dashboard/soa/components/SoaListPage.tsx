"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CreditCard,
  FileText,
  Mail,
  PhilippinePeso,
  Play,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListViewToolbar } from "@/components/shared/ListViewToolbar";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { StatCard } from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/config/routes";
import { api } from "@/lib/api/client";
import { useListPagination } from "@/lib/hooks/use-list-pagination";
import { formatPhpAmount } from "@/lib/utils/format-money";
import { deletedStatementsMessage } from "@/lib/utils/toast-messages";

import { EditSoaPeriodDialog } from "./EditSoaPeriodDialog";
import {
  RunSoaDialog,
  type RunSoaFormValues,
  type RunSoaSettled,
} from "./RunSoaDialog";
import { SoaPeriodCard } from "./SoaPeriodCard";
import { SoaPeriodTable, type SoaPeriodRow } from "./SoaPeriodTable";
import { useSoaViewMode } from "../hooks/use-soa-view-mode";

function toRunInput(values: RunSoaFormValues) {
  const isRolling = values.mode === "range" && values.rangeStyle === "rolling";

  return {
    mode: values.mode,
    fromMonth: isRolling ? values.toMonth : values.fromMonth,
    fromYear: isRolling ? values.toYear : values.fromYear,
    toMonth: values.toMonth,
    toYear: values.toYear,
    monthCount: isRolling ? values.monthCount : undefined,
    notifyTelegram: values.notifyTelegram,
    notifySlack: values.notifySlack,
    createCalendar: values.createCalendar,
  };
}

export function SoaListPage() {
  const router = useRouter();
  const utils = api.useUtils();
  const { data: periods, isLoading } = api.soa.listPeriods.useQuery();
  const { viewMode, setViewMode } = useSoaViewMode();
  const pagination = useListPagination(periods ?? [], 7);

  const listStats = useMemo(() => {
    if (!periods?.length) return null;

    let lastRunAt: Date | null = null;
    let totalStatements = 0;

    for (const period of periods) {
      totalStatements += period.statementCount;
      if (period.lastRunAt) {
        const runAt = new Date(period.lastRunAt);
        if (!lastRunAt || runAt > lastRunAt) lastRunAt = runAt;
      }
    }

    const latestByRun = [...periods].sort((a, b) => {
      const aTime = a.lastRunAt ? new Date(a.lastRunAt).getTime() : 0;
      const bTime = b.lastRunAt ? new Date(b.lastRunAt).getTime() : 0;
      return bTime - aTime;
    })[0];

    return {
      runs: periods.length,
      statements: totalStatements,
      totalDue: latestByRun?.totalDue ?? 0,
      nextDueYmd: latestByRun?.nextDueYmd ?? null,
      lastRunAt,
    };
  }, [periods]);

  const [runOpen, setRunOpen] = useState(false);
  const [runInitial, setRunInitial] = useState<Partial<RunSoaFormValues>>();
  const [runSettled, setRunSettled] = useState<RunSoaSettled>(null);
  const [runErrorMessage, setRunErrorMessage] = useState<string | null>(null);
  const navigatePeriodIdRef = useRef<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const runPipeline = api.soa.runPipeline.useMutation({
    onSuccess: (r) => {
      if (!r.ok) {
        setRunErrorMessage(r.message ?? "SOA run failed");
        setRunSettled("error");
        toast.error(r.message ?? "SOA run failed");
        return;
      }
      navigatePeriodIdRef.current = r.periodId ?? null;
      setRunSettled("success");
      toast.success("SOA run complete");
      void utils.soa.listPeriods.invalidate();
      void utils.overview.stats.invalidate();
    },
    onError: (e) => {
      setRunErrorMessage(e.message);
      setRunSettled("error");
      toast.error(e.message);
    },
  });

  function handleRunDialogOpenChange(open: boolean) {
    setRunOpen(open);
    if (!open) {
      setRunSettled(null);
      setRunErrorMessage(null);
      navigatePeriodIdRef.current = null;
    }
  }

  function handleRunComplete() {
    const periodId = navigatePeriodIdRef.current;
    setRunOpen(false);
    setRunSettled(null);
    setRunErrorMessage(null);
    navigatePeriodIdRef.current = null;
    if (periodId) {
      router.push(ROUTES.dashboard.soaPeriod(periodId));
    }
  }

  const deletePeriod = api.soa.deletePeriod.useMutation({
    onSuccess: (r) => {
      toast.success(deletedStatementsMessage(r.removed));
      setDeleteId(null);
      void utils.soa.listPeriods.invalidate();
      void utils.overview.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const pollGmail = api.soa.pollGmail.useMutation({
    onSuccess: () => {
      toast.success("Gmail poll finished");
      void utils.soa.listPeriods.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  function openRerun(period: SoaPeriodRow) {
    const isSingle =
      period.mode === "single" ||
      (period.fromMonth === period.toMonth &&
        period.fromYear === period.toYear);
    setRunInitial({
      mode: isSingle ? "single" : "range",
      fromMonth: period.fromMonth,
      fromYear: period.fromYear,
      toMonth: period.toMonth,
      toYear: period.toYear,
      rangeStyle: "explicit",
      notifyTelegram: period.notifyTelegram,
      notifySlack: period.notifySlack,
      createCalendar: period.createCalendar,
    });
    setRunOpen(true);
  }

  return (
    <div className="space-y-8">
      <DashboardPageHeader
        title="Statement of account"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="shadow-glow"
              onClick={() => {
                setRunInitial(undefined);
                setRunOpen(true);
              }}
            >
              <Play className="mr-2 h-4 w-4" />
              Run SOA
            </Button>
            <Button
              variant="outline"
              onClick={() => pollGmail.mutate()}
              disabled={pollGmail.isPending}
            >
              <Mail className="mr-2 h-4 w-4" />
              Poll Gmail
            </Button>
          </div>
        }
      />

      <RunSoaDialog
        open={runOpen}
        onOpenChange={handleRunDialogOpenChange}
        initial={runInitial}
        isPending={runPipeline.isPending}
        settled={runSettled}
        errorMessage={runErrorMessage}
        onRunComplete={handleRunComplete}
        onSubmit={(values) => {
          setRunSettled(null);
          setRunErrorMessage(null);
          runPipeline.mutate(toRunInput(values));
        }}
      />

      <EditSoaPeriodDialog
        periodId={editId}
        open={!!editId}
        onOpenChange={(open) => !open && setEditId(null)}
      />

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete SOA period?"
        description="Statements in this date range will be removed."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deleteId) deletePeriod.mutate({ periodId: deleteId });
        }}
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner size="lg" />
        </div>
      ) : !periods?.length ? (
        <EmptyState
          icon={<FileText className="h-6 w-6 text-muted-foreground" />}
          title="No SOA runs yet"
          message="Run SOA to fetch and parse credit card statements."
          action={
            <Button onClick={() => setRunOpen(true)}>
              <Play className="mr-2 h-4 w-4" />
              Run SOA
            </Button>
          }
        />
      ) : (
        <>
          {listStats && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                title="SOA runs"
                value={listStats.runs}
                icon={FileText}
              />
              <StatCard
                title="Statements"
                value={listStats.statements}
                icon={CreditCard}
              />
              <StatCard
                title="Latest total due"
                value={formatPhpAmount(listStats.totalDue)}
                icon={PhilippinePeso}
              />
              <StatCard
                title="Last run"
                value={
                  listStats.lastRunAt
                    ? listStats.lastRunAt.toLocaleDateString("en-PH", {
                        month: "short",
                        day: "numeric",
                      })
                    : "—"
                }
                icon={CalendarDays}
              />
            </div>
          )}

          <ListViewToolbar
            total={pagination.total}
            itemLabel="SOAs"
            page={pagination.page}
            pageCount={pagination.pageCount}
            rangeStart={pagination.rangeStart}
            rangeEnd={pagination.rangeEnd}
            hasMultiplePages={pagination.hasMultiplePages}
            onPageChange={pagination.setPage}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
          {viewMode === "table" ? (
            <SoaPeriodTable
              periods={pagination.items}
              onRerun={openRerun}
              onEdit={setEditId}
              onDelete={setDeleteId}
            />
          ) : (
            <div className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-3">
              {pagination.items.map((period) => (
                <SoaPeriodCard
                  key={period.id}
                  period={period}
                  onRerun={openRerun}
                  onEdit={setEditId}
                  onDelete={setDeleteId}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
