"use client";

import { useEffect, useMemo } from "react";
import { Receipt } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorkflowProgressPanel } from "@/components/shared/WorkflowProgressPanel";

import { useReceiptUploadProgress } from "../hooks/use-receipt-upload-progress";
import {
  buildReceiptUploadProgressSteps,
  type ReceiptUploadOptions,
} from "../lib/receipt-upload-progress";

export type ReceiptUploadSettled = "success" | "error" | null;

type ReceiptUploadProgressDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processId: string | null;
  options: ReceiptUploadOptions;
  isPending: boolean;
  settled?: ReceiptUploadSettled;
  errorMessage?: string | null;
  onComplete?: () => void;
};

export function ReceiptUploadProgressDialog({
  open,
  onOpenChange,
  processId,
  options,
  isPending,
  settled = null,
  errorMessage,
  onComplete,
}: ReceiptUploadProgressDialogProps) {
  const fallbackSteps = useMemo(
    () => buildReceiptUploadProgressSteps(options),
    [options],
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
  } = useReceiptUploadProgress(processId, fallbackSteps, isPending, settled);

  const progressFailedState = !isPending && runFailed;
  const progressFinishedState = !isPending && !runFailed && open;

  useEffect(() => {
    if (!runSucceeded || isPending || !open) return;

    const timer = window.setTimeout(() => {
      onComplete?.();
    }, 1200);

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
          <DialogTitle className="font-display">Processing receipt</DialogTitle>
        </DialogHeader>

        <WorkflowProgressPanel
          steps={liveSteps}
          activeStepIndex={activeStepIndex}
          progress={progressFinishedState ? 100 : progress}
          finished={progressFinishedState || progressFinished}
          failed={progressFailedState || progressFailed}
          errorMessage={errorMessage}
          detail={detail}
          icon={Receipt}
          doneTitle="Receipt processed"
          failedTitle="Upload failed"
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
