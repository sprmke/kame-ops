"use client";

import { useMemo } from "react";

import {
  ReceiptBatchUploadProgressDialog,
  type CardUploadJob,
  type ReceiptUploadOptions,
  type ReceiptUploadSettled,
} from "@/components/shared/ReceiptBatchUploadProgressDialog";

export type { CardUploadJob, ReceiptUploadOptions, ReceiptUploadSettled };

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

/** Single-receipt wrapper — prefer ReceiptBatchUploadProgressDialog for batch uploads */
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
  const jobs = useMemo((): CardUploadJob[] => {
    if (!processId) return [];
    return [
      {
        processId,
        cardLabel: "Receipt",
        receiptCount: 1,
        settled: settled ?? null,
        errorMessage: errorMessage ?? null,
      },
    ];
  }, [processId, settled, errorMessage]);

  return (
    <ReceiptBatchUploadProgressDialog
      open={open}
      onOpenChange={onOpenChange}
      jobs={jobs}
      options={options}
      isPending={isPending}
      onComplete={onComplete}
    />
  );
}
