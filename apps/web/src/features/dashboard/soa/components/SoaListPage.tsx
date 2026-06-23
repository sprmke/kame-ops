"use client";

import { useMemo, useState } from "react";
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
import { usePersistedViewMode } from "@/hooks/use-persisted-view-mode";
import { useListPagination } from "@/lib/hooks/use-list-pagination";
import { formatPhpAmount } from "@/lib/utils/format-money";
import { deletedStatementsMessage } from "@/lib/utils/toast-messages";

import { EditSoaPeriodDialog } from "./EditSoaPeriodDialog";
import { RunSoaDialog } from "./RunSoaDialog";
import { SoaPeriodCard } from "./SoaPeriodCard";
import { SoaPeriodTable, type SoaPeriodRow } from "./SoaPeriodTable";
import { useSoaRunDialog } from "../hooks/use-soa-run-dialog";
import { periodToRunInitial } from "../lib/run-soa-progress";
import { computeSoaListStats } from "../lib/soa-utils";

export function SoaListPage() {
  const router = useRouter();
  const utils = api.useUtils();
  const { data: periods, isLoading } = api.soa.listPeriods.useQuery();
  const { viewMode, setViewMode } = usePersistedViewMode(
    "kame-ops:soa-view-mode",
  );
  const pagination = useListPagination(periods ?? [], 7);

  const listStats = useMemo(
    () => (periods?.length ? computeSoaListStats(periods) : null),
    [periods],
  );

  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { openRun, runDialogProps } = useSoaRunDialog({
    onRunSuccess: () => {
      void utils.soa.listPeriods.invalidate();
      void utils.overview.stats.invalidate();
    },
    onAfterRunComplete: (periodId) => {
      if (periodId) {
        router.push(ROUTES.dashboard.soaPeriod(periodId));
      }
    },
  });

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
    openRun(periodToRunInitial(period));
  }

  return (
    <div className="space-y-8">
      <DashboardPageHeader
        title="Statement of account"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button className="shadow-glow" onClick={() => openRun()}>
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

      <RunSoaDialog {...runDialogProps} />

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
            <Button onClick={() => openRun()}>
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
