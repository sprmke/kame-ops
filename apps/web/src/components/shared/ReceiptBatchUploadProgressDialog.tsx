"use client";

import { useEffect, useMemo } from "react";
import { Receipt } from "lucide-react";

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
  batchPrepActiveStepIndex,
  batchPrepDetail,
  buildBatchPrepSteps,
  buildReceiptUploadStepPlan,
  computeBatchPrepProgressPercent,
  type ReceiptBatchPrepProgress,
  type ReceiptUploadStepPlanInput,
} from "@/lib/receipt-upload-progress";
import { useReceiptUploadProgress } from "@/hooks/use-receipt-upload-progress";
import type { ReceiptUploadSettled } from "@/hooks/use-receipt-upload-progress";

export type ReceiptUploadOptions = ReceiptUploadStepPlanInput;
export type { ReceiptUploadSettled, ReceiptBatchPrepProgress };

export type CardUploadJob = {
  processId: string;
  cardLabel: string;
  receiptCount: number;
  settled: ReceiptUploadSettled;
  errorMessage: string | null;
};

type ReceiptBatchUploadProgressDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobs: CardUploadJob[];
  options: ReceiptUploadOptions;
  isPending: boolean;
  batchProgress?: ReceiptBatchPrepProgress | null;
  onComplete?: () => void;
};

function BatchUploadPrepPanel({
  progress,
}: {
  progress: ReceiptBatchPrepProgress;
}) {
  const steps = useMemo(() => buildBatchPrepSteps(progress), [progress]);
  const activeStepIndex = batchPrepActiveStepIndex(progress);
  const detail = batchPrepDetail(progress);

  return (
    <WorkflowProgressPanel
      steps={steps}
      activeStepIndex={activeStepIndex}
      progress={computeBatchPrepProgressPercent(progress)}
      detail={detail}
      icon={Receipt}
      doneTitle="Ready to process"
      failedTitle="Upload failed"
    />
  );
}

function CardUploadProgressSection({
  job,
  options,
  isPending,
}: {
  job: CardUploadJob;
  options: ReceiptUploadOptions;
  isPending: boolean;
}) {
  const fallbackSteps = useMemo(
    () => buildReceiptUploadStepPlan(options),
    [options],
  );

  const runFailed = job.settled === "error";

  const {
    steps: liveSteps,
    activeStepIndex,
    progress,
    detail,
    finished: progressFinished,
    failed: progressFailed,
    item: itemProgress,
  } = useReceiptUploadProgress(
    job.processId,
    fallbackSteps,
    isPending && job.settled === null,
    job.settled,
  );

  const progressFailedState = !isPending && runFailed;
  const progressFinishedState = !isPending && !runFailed;

  return (
    <div className="space-y-3 rounded-lg border border-border/80 bg-card/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-sm font-semibold text-foreground">
          {job.cardLabel}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {job.receiptCount} {job.receiptCount === 1 ? "receipt" : "receipts"}
        </p>
      </div>

      <WorkflowProgressPanel
        steps={liveSteps}
        activeStepIndex={activeStepIndex}
        progress={progressFinishedState ? 100 : progress}
        finished={progressFinishedState || progressFinished}
        failed={progressFailedState || progressFailed}
        errorMessage={job.errorMessage}
        detail={detail}
        icon={Receipt}
        doneTitle="Receipts saved"
        failedTitle="Upload failed"
        itemProgress={itemProgress}
      />
    </div>
  );
}

function dialogTitle(
  batchProgress: ReceiptBatchPrepProgress | null | undefined,
  jobCount: number,
): string {
  if (batchProgress?.phase === "uploading") {
    return batchProgress.total > 1 ? "Uploading receipts" : "Uploading receipt";
  }
  if (batchProgress?.phase === "analyzing") {
    return batchProgress.total > 1 ? "Analyzing receipts" : "Analyzing receipt";
  }
  if (jobCount > 1) {
    return "Processing receipts";
  }
  return "Processing receipt";
}

export function ReceiptBatchUploadProgressDialog({
  open,
  onOpenChange,
  jobs,
  options,
  isPending,
  batchProgress,
  onComplete,
}: ReceiptBatchUploadProgressDialogProps) {
  const allSucceeded =
    jobs.length > 0 && jobs.every((job) => job.settled === "success");
  const anyRunning = isPending || jobs.some((job) => job.settled === null);
  const showPrepPanel =
    batchProgress != null &&
    (batchProgress.phase === "uploading" ||
      batchProgress.phase === "analyzing");
  const showCardJobs = jobs.length > 0 && batchProgress?.phase !== "analyzing";

  useEffect(() => {
    if (!allSucceeded || isPending || !open) return;
    const timer = window.setTimeout(() => {
      onComplete?.();
    }, WORKFLOW_DONE_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [allSucceeded, isPending, open, onComplete]);

  function handleOpenChange(next: boolean) {
    if (!next && anyRunning) return;
    if (!next && allSucceeded && open) return;
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[90vh] max-w-lg overflow-x-hidden overflow-y-auto"
        onPointerDownOutside={(e) => {
          if (anyRunning || (allSucceeded && open)) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (anyRunning || (allSucceeded && open)) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-display">
            {dialogTitle(batchProgress, jobs.length)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {showPrepPanel && batchProgress ? (
            <BatchUploadPrepPanel progress={batchProgress} />
          ) : null}

          {showCardJobs
            ? jobs.map((job) => (
                <CardUploadProgressSection
                  key={job.processId}
                  job={job}
                  options={options}
                  isPending={isPending}
                />
              ))
            : null}
        </div>

        {jobs.some((job) => job.settled === "error") && !isPending ? (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
