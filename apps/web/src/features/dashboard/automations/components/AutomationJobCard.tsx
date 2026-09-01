"use client";

import { formatDistanceToNow } from "date-fns";
import { Pencil, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { inferRouterOutputs } from "@trpc/server";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  getAutomationRunResultPresentation,
  parseAutomationRunResult,
} from "@/lib/automation-run-summary";
import {
  automationJobTypeLabel,
  isManagedAutomationJobType,
} from "@/lib/automations/job-types";
import {
  formatScheduleLabel,
  readScheduleConfigFromJob,
} from "@/lib/automations/schedule";
import { api } from "@/lib/api/client";
import { formatUserFacingErrorMessage } from "@/lib/errors/user-facing-message";
import type { AppRouter } from "@/server/routers/_app";

import { AutomationRunResultPanel } from "./AutomationRunResultPanel";

type AutomationJob =
  inferRouterOutputs<AppRouter>["automations"]["list"][number];

type AutomationJobCardProps = {
  job: AutomationJob;
  onEdit: (job: AutomationJob) => void;
  onRunNow: (job: AutomationJob) => void;
  isRunPending?: boolean;
};

export function AutomationJobCard({
  job,
  onEdit,
  onRunNow,
  isRunPending = false,
}: AutomationJobCardProps) {
  const utils = api.useUtils();
  const scheduleConfig = readScheduleConfigFromJob(job);

  const setActive = api.automations.setActive.useMutation({
    onSuccess: () => {
      void utils.automations.list.invalidate();
      void utils.overview.stats.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = api.automations.delete.useMutation({
    onSuccess: () => {
      toast.success("Automation deleted");
      void utils.automations.list.invalidate();
      void utils.overview.stats.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const isManagedJob = isManagedAutomationJobType(job.jobType);

  const lastRunResult = parseAutomationRunResult(
    job.jobType,
    job.lastRun?.resultSummary,
  );
  const lastRunFailed = job.lastRun?.status === "failed";
  const lastRunError = job.lastRun?.errorMessage;
  const lastRunPresentation = lastRunFailed
    ? {
        tone: "error" as const,
        lines: [formatUserFacingErrorMessage(lastRunError ?? "Run failed")],
      }
    : getAutomationRunResultPresentation(job.jobType, lastRunResult);

  return (
    <Card className="border-border/80 shadow-card">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">{job.name}</CardTitle>
            <StatusBadge
              label={job.isActive ? "Active" : "Paused"}
              variant={job.isActive ? "success" : "muted"}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {automationJobTypeLabel(job.jobType)}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatScheduleLabel(scheduleConfig)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Switch
            checked={job.isActive}
            disabled={setActive.isPending}
            aria-label={job.isActive ? "Pause automation" : "Enable automation"}
            onCheckedChange={(checked) =>
              setActive.mutate({ jobId: job.id, isActive: checked })
            }
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Edit automation"
            onClick={() => onEdit(job)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          {!isManagedJob && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete automation"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete automation?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {job.name} will stop running on its schedule.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => remove.mutate({ jobId: job.id })}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button
            size="sm"
            onClick={() => onRunNow(job)}
            disabled={isRunPending}
          >
            <Play className="mr-1 h-3 w-3" />
            Run now
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {job.nextRunAt && job.isActive && (
          <p className="text-xs text-muted-foreground">
            Next run{" "}
            {new Date(job.nextRunAt) <= new Date()
              ? "now"
              : formatDistanceToNow(new Date(job.nextRunAt), {
                  addSuffix: true,
                })}
          </p>
        )}
        {job.lastRunAt && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Last run{" "}
              {formatDistanceToNow(new Date(job.lastRunAt), {
                addSuffix: true,
              })}
            </p>
            {lastRunPresentation ? (
              <AutomationRunResultPanel
                tone={lastRunPresentation.tone}
                lines={lastRunPresentation.lines}
              />
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
