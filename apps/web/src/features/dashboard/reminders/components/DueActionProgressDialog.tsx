"use client";

import { useEffect, useMemo } from "react";
import { CheckCircle2 } from "lucide-react";

import { WorkflowProgressPanel } from "@/components/shared/WorkflowProgressPanel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WORKFLOW_DONE_DISMISS_MS } from "@/lib/constants/workflow-ui";
import {
  buildDueActionStepPlan,
  type DueActionType,
} from "@/lib/due-action-progress";

import { useDueActionProgress } from "../hooks/use-due-action-progress";

export type DueActionSettled = "success" | "error" | null;

type DueActionProgressDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processId: string | null;
  action: DueActionType;
  isPending: boolean;
  settled?: DueActionSettled;
  errorMessage?: string | null;
  onComplete?: () => void;
};

export function DueActionProgressDialog({
  open,
  onOpenChange,
  processId,
  action,
  isPending,
  settled = null,
  errorMessage,
  onComplete,
}: DueActionProgressDialogProps) {
  const fallbackSteps = useMemo(() => buildDueActionStepPlan(action), [action]);

  const runFailed = settled === "error";
  const runSucceeded = settled === "success";

  const {
    steps: liveSteps,
    activeStepIndex,
    progress,
    detail,
    finished: progressFinished,
    failed: progressFailed,
  } = useDueActionProgress(processId, fallbackSteps, isPending, settled);

  const progressFailedState = !isPending && runFailed;
  const progressFinishedState = !isPending && !runFailed && open;

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

  const title = action === "mark_paid" ? "Marking paid" : "Marking unpaid";
  const doneTitle =
    action === "mark_paid" ? "Marked as paid" : "Marked as unpaid";

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
          icon={CheckCircle2}
          doneTitle={doneTitle}
          failedTitle="Update failed"
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
