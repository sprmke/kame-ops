"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import type { inferRouterOutputs } from "@trpc/server";

import { AutomationCardSkeleton } from "@/components/shared/skeletons";
import { DashboardSection } from "@/components/shared/DashboardSection";
import type { AutomationJobType } from "@/lib/automations/job-types";
import { api } from "@/lib/api/client";
import { formatUserFacingErrorMessage } from "@/lib/errors/user-facing-message";
import type { AppRouter } from "@/server/routers/_app";

import { AutomationFormDialog } from "./AutomationFormDialog";
import { AutomationJobCard } from "./AutomationJobCard";
import {
  AutomationRunProgressDialog,
  type AutomationRunSettled,
} from "./AutomationRunProgressDialog";

type AutomationJob =
  inferRouterOutputs<AppRouter>["automations"]["list"][number];

const JOB_TYPE_ORDER = ["send_due_reminders", "run_soa_pipeline"] as const;

export function AutomationsPanel() {
  const utils = api.useUtils();
  const { data: jobs, isLoading } = api.automations.list.useQuery();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<AutomationJob | null>(null);

  const [progressOpen, setProgressOpen] = useState(false);
  const [runningJob, setRunningJob] = useState<AutomationJob | null>(null);
  const [processId, setProcessId] = useState<string | null>(null);
  const [runSettled, setRunSettled] = useState<AutomationRunSettled>(null);
  const [runErrorMessage, setRunErrorMessage] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<unknown>(null);

  const run = api.automations.run.useMutation({
    onSuccess: (data) => {
      const result = data.result;
      if (
        result &&
        typeof result === "object" &&
        "ok" in result &&
        result.ok === false &&
        "message" in result &&
        typeof result.message === "string"
      ) {
        setRunErrorMessage(formatUserFacingErrorMessage(result.message));
        setRunSettled("error");
      } else {
        setRunResult(result);
        setRunSettled("success");
        toast.success("Run finished");
      }
      void utils.automations.list.invalidate();
      void utils.reminders.listDue.invalidate();
      void utils.reminders.status.invalidate();
      void utils.soa.listPeriods.invalidate();
      void utils.overview.stats.invalidate();
    },
    onError: (error) => {
      const message = formatUserFacingErrorMessage(error.message);
      setRunErrorMessage(message);
      setRunSettled("error");
      toast.error(message);
    },
  });

  const sortedJobs = useMemo(() => {
    if (!jobs?.length) return [];
    return [...jobs].sort(
      (a, b) =>
        JOB_TYPE_ORDER.indexOf(a.jobType as (typeof JOB_TYPE_ORDER)[number]) -
        JOB_TYPE_ORDER.indexOf(b.jobType as (typeof JOB_TYPE_ORDER)[number]),
    );
  }, [jobs]);

  function handleRunNow(job: AutomationJob) {
    const nextProcessId = crypto.randomUUID();
    setRunningJob(job);
    setProcessId(nextProcessId);
    setRunSettled(null);
    setRunErrorMessage(null);
    setRunResult(null);
    setProgressOpen(true);
    run.mutate({ jobId: job.id, processId: nextProcessId });
  }

  function handleProgressComplete() {
    setProgressOpen(false);
    setRunningJob(null);
    setProcessId(null);
    setRunSettled(null);
    setRunErrorMessage(null);
    setRunResult(null);
  }

  const runPending = run.isPending && runSettled === null;

  return (
    <DashboardSection title="Schedule">
      <AutomationFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        job={editingJob}
      />

      <AutomationRunProgressDialog
        open={progressOpen}
        onOpenChange={setProgressOpen}
        processId={processId}
        jobType={(runningJob?.jobType as AutomationJobType) ?? null}
        isPending={runPending}
        settled={runSettled}
        errorMessage={runErrorMessage}
        result={runResult}
        onComplete={handleProgressComplete}
      />

      {isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <AutomationCardSkeleton />
          <AutomationCardSkeleton />
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {sortedJobs.map((job) => (
            <AutomationJobCard
              key={job.id}
              job={job}
              onEdit={(nextJob) => {
                setEditingJob(nextJob);
                setEditDialogOpen(true);
              }}
              onRunNow={handleRunNow}
              isRunPending={runPending && runningJob?.id === job.id}
            />
          ))}
        </div>
      )}
    </DashboardSection>
  );
}
