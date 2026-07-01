"use client";

import { useEffect, useMemo } from "react";
import { Bell, FileText } from "lucide-react";

import { WorkflowProgressPanel } from "@/components/shared/WorkflowProgressPanel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AutomationJobType } from "@/lib/automations/job-types";
import {
  automationRunDialogTitle,
  automationRunDoneTitle,
  formatAutomationRunSummaryLines,
} from "@/lib/automation-run-summary";
import { WORKFLOW_DONE_DISMISS_MS } from "@/lib/constants/workflow-ui";

import { buildAutomationRunFallbackSteps } from "../lib/automation-run-progress";
import { useAutomationRunProgress } from "../hooks/use-automation-run-progress";

export type AutomationRunSettled = "success" | "error" | null;

type AutomationRunProgressDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processId: string | null;
  jobType: AutomationJobType | null;
  isPending: boolean;
  settled?: AutomationRunSettled;
  errorMessage?: string | null;
  result?: unknown;
  onComplete?: () => void;
};

export function AutomationRunProgressDialog({
  open,
  onOpenChange,
  processId,
  jobType,
  isPending,
  settled = null,
  errorMessage,
  result,
  onComplete,
}: AutomationRunProgressDialogProps) {
  const fallbackSteps = useMemo(
    () => (jobType ? buildAutomationRunFallbackSteps(jobType) : []),
    [jobType],
  );

  const runFailed = settled === "error";
  const runSucceeded = settled === "success";

  const {
    steps: liveSteps,
    activeStepIndex,
    progress,
    detail,
    finished: progressFinished,
    failed: progressFailed,
  } = useAutomationRunProgress(
    processId,
    jobType,
    fallbackSteps,
    isPending,
    settled,
  );

  const progressFailedState = !isPending && runFailed;
  const progressFinishedState = !isPending && !runFailed && open;

  const summaryLines = useMemo(() => {
    if (!runSucceeded || !jobType || !result) return undefined;
    const lines = formatAutomationRunSummaryLines(jobType, result);
    return lines.length ? lines : undefined;
  }, [runSucceeded, jobType, result]);

  useEffect(() => {
    if (!runSucceeded || isPending || !open) return;

    const timer = window.setTimeout(() => {
      onComplete?.();
    }, WORKFLOW_DONE_DISMISS_MS);

    return () => window.clearTimeout(timer);
  }, [runSucceeded, isPending, open, onComplete]);

  function handleOpenChange(next: boolean) {
    if (!next && isPending) return;
    if (!next && runSucceeded && open) return;
    onOpenChange(next);
  }

  const title = jobType ? automationRunDialogTitle(jobType) : "Running";
  const doneTitle = jobType ? automationRunDoneTitle(jobType) : "Finished";
  const Icon = jobType === "run_soa_pipeline" ? FileText : Bell;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[90vh] max-w-lg overflow-x-hidden overflow-y-auto"
        onPointerDownOutside={(e) => {
          if (isPending || (runSucceeded && open)) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isPending || (runSucceeded && open)) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-display">{title}</DialogTitle>
        </DialogHeader>

        <WorkflowProgressPanel
          steps={liveSteps}
          activeStepIndex={activeStepIndex}
          progress={progressFinishedState ? 100 : progress}
          finished={progressFinishedState || progressFinished}
          failed={progressFailedState || progressFailed}
          errorMessage={errorMessage}
          detail={detail}
          icon={Icon}
          doneTitle={doneTitle}
          failedTitle="Run failed"
          summaryLines={summaryLines}
        />

        {progressFailedState && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
