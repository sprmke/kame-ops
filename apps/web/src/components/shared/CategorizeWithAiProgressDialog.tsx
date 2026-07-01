"use client";

import { useEffect, useMemo } from "react";
import { Sparkles } from "lucide-react";

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
import { buildAiCategorizeStepPlan } from "@/lib/ai-categorize-progress";
import {
  useAiCategorizeProgress,
  type AiCategorizeSettled,
} from "@/hooks/use-ai-categorize-progress";

type CategorizeWithAiProgressDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processId: string | null;
  isPending: boolean;
  settled?: AiCategorizeSettled;
  errorMessage?: string | null;
  onComplete?: () => void;
};

export function CategorizeWithAiProgressDialog({
  open,
  onOpenChange,
  processId,
  isPending,
  settled = null,
  errorMessage,
  onComplete,
}: CategorizeWithAiProgressDialogProps) {
  const fallbackSteps = useMemo(() => buildAiCategorizeStepPlan(), []);

  const runFailed = settled === "error";
  const runSucceeded = settled === "success";

  const {
    steps: liveSteps,
    activeStepIndex,
    progress,
    detail,
    finished: progressFinished,
    failed: progressFailed,
  } = useAiCategorizeProgress(processId, fallbackSteps, isPending, settled);

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
          <DialogTitle className="font-display">
            Categorizing with AI
          </DialogTitle>
        </DialogHeader>

        <WorkflowProgressPanel
          steps={liveSteps}
          activeStepIndex={activeStepIndex}
          progress={progressFinishedState ? 100 : progress}
          finished={progressFinishedState || progressFinished}
          failed={progressFailedState || progressFailed}
          errorMessage={errorMessage}
          detail={detail}
          icon={Sparkles}
          doneTitle="Categories updated"
          failedTitle="Categorization failed"
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

export type { AiCategorizeSettled };
