import {
  buildReceiptUploadStepPlan,
  type ReceiptUploadStepSnapshot,
} from "@/lib/receipt-upload-progress";

export type {
  ReceiptUploadProgressSnapshot,
  ReceiptUploadStepId,
  ReceiptUploadStepSnapshot,
} from "@/lib/receipt-upload-progress";

export type ReceiptUploadProgressStep = ReceiptUploadStepSnapshot;

export type ReceiptUploadOptions = {
  markPaid: boolean;
  updateCalendar: boolean;
};

export function buildReceiptUploadProgressSteps(
  options: ReceiptUploadOptions,
): ReceiptUploadProgressStep[] {
  return buildReceiptUploadStepPlan(options);
}
