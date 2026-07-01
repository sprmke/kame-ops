"use client";

import { useEffect, useState } from "react";
import {
  Download,
  ExternalLink,
  Loader2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { MediaPreviewSkeleton } from "@/components/shared/skeletons";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";

import {
  buildReceiptPaymentCoverage,
  coverageBadgeVariant,
  formatReceiptCardTitle,
  isPdfReceipt,
} from "../lib/receipt-display";
import {
  formatReceiptDate,
  receiptCardLabel,
  receiptFileUrl,
  type ReceiptListItem,
} from "../lib/receipt-utils";
import {
  paymentStatusLabel,
  ReceiptAiVerdictBadge,
} from "./ReceiptAiVerdictBadge";
import { ReceiptValidationChecklist } from "./ReceiptValidationChecklist";

type ReceiptPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: ReceiptListItem | null;
  onDelete?: (receipt: ReceiptListItem) => void;
  onMarkPaid?: (receiptId: string) => void;
  isMarkPaidPending?: boolean;
  onRevalidate?: (receiptId: string) => void;
  isRevalidatePending?: boolean;
};

function formatDueDateYmd(ymd: string | null): string {
  if (!ymd) return "—";
  const date = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(date.getTime())) return ymd;
  return formatReceiptDate(date);
}

function DetailRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn("text-right tabular-nums", emphasize && "font-semibold")}
      >
        {value}
      </span>
    </div>
  );
}

export function ReceiptPreviewDialog({
  open,
  onOpenChange,
  receipt,
  onDelete,
  onMarkPaid,
  isMarkPaidPending,
  onRevalidate,
  isRevalidatePending,
}: ReceiptPreviewDialogProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const receiptId = receipt?.id ?? null;
  const fileUrl = receiptId ? receiptFileUrl(receiptId) : null;
  const isPdf = isPdfReceipt(receipt?.originalFileName);
  const title = receipt ? formatReceiptCardTitle(receipt) : "Receipt";
  const coverage = receipt ? buildReceiptPaymentCoverage(receipt) : null;

  const canMarkPaid =
    receipt &&
    receipt.paymentStatus === "pending" &&
    receipt.aiVerdict &&
    receipt.aiVerdict !== "invalid";

  useEffect(() => {
    if (!open || !fileUrl) {
      setBlobUrl(null);
      setFailed(false);
      setLoading(false);
      return;
    }

    let revoked: string | null = null;
    const controller = new AbortController();

    async function loadFile() {
      setLoading(true);
      setFailed(false);
      setBlobUrl(null);

      try {
        const res = await fetch(fileUrl!, {
          signal: controller.signal,
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        revoked = URL.createObjectURL(blob);
        setBlobUrl(revoked);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadFile();

    return () => {
      controller.abort();
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [open, fileUrl]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(92dvh,900px)] max-h-[92dvh] w-[calc(100%-1rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:w-full sm:p-0"
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border px-4 sm:px-5">
          <DialogTitle className="min-w-0 flex-1 truncate text-left font-display text-base font-semibold leading-none">
            {title}
          </DialogTitle>
          <div className="flex shrink-0 items-center gap-0.5">
            {fileUrl ? (
              <>
                <Button asChild variant="ghost" size="icon" className="h-9 w-9">
                  <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    <span className="sr-only">Open in new tab</span>
                  </a>
                </Button>
                <Button asChild variant="ghost" size="icon" className="h-9 w-9">
                  <a href={fileUrl} download={title}>
                    <Download className="h-4 w-4" />
                    <span className="sr-only">Download</span>
                  </a>
                </Button>
              </>
            ) : null}
            <DialogClose asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </DialogClose>
          </div>
        </div>

        {receipt ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              <div className="max-h-[45dvh] min-h-0 shrink-0 overflow-y-auto overscroll-contain border-b border-border bg-muted/20 p-4 lg:max-h-none lg:min-h-0 lg:flex-1 lg:border-b-0 lg:border-r">
                <div className="mx-auto w-full max-w-md">
                  {loading ? (
                    <MediaPreviewSkeleton className="min-h-[240px] w-full lg:min-h-[280px]" />
                  ) : failed || !blobUrl ? (
                    <p className="py-8 text-sm text-muted-foreground">
                      Could not load receipt
                    </p>
                  ) : isPdf ? (
                    <iframe
                      src={blobUrl}
                      title={title}
                      className="h-[min(60dvh,520px)] w-full rounded-md border border-border bg-background lg:h-[min(100%,520px)] lg:min-h-[320px]"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={blobUrl}
                      alt={title}
                      className="h-auto w-full max-w-full rounded-md"
                    />
                  )}
                </div>
              </div>

              <div className="flex min-h-0 w-full flex-col overflow-y-auto overscroll-contain lg:w-[380px] lg:shrink-0">
                <div className="space-y-5 p-4 sm:p-5">
                  <section className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        label={paymentStatusLabel(receipt.paymentStatus)}
                        variant={
                          receipt.paymentStatus === "marked_paid"
                            ? "success"
                            : "muted"
                        }
                      />
                      <ReceiptAiVerdictBadge
                        verdict={receipt.aiVerdict}
                        compact
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Uploaded {formatReceiptDate(new Date(receipt.createdAt))}
                    </p>
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold">Card</h3>
                    <div className="space-y-1.5 rounded-lg border border-border/80 bg-muted/10 p-3">
                      <DetailRow
                        label="Card"
                        value={receiptCardLabel(receipt)}
                      />
                      <DetailRow
                        label="Statement date"
                        value={receipt.statementDate ?? "—"}
                      />
                      <DetailRow
                        label="Due date"
                        value={formatDueDateYmd(receipt.dueDateYmd)}
                      />
                      <DetailRow
                        label="Minimum due"
                        value={receipt.minimumDue ?? "—"}
                      />
                      <DetailRow
                        label="Total due"
                        value={receipt.totalDue ?? "—"}
                        emphasize
                      />
                    </div>
                  </section>

                  {coverage ? (
                    <section className="space-y-2">
                      <h3 className="text-sm font-semibold">Payment</h3>
                      <div className="space-y-2 rounded-lg border border-border/80 bg-muted/10 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-display text-lg font-semibold tabular-nums">
                            <span>{coverage.paidLabel}</span>
                            {coverage.totalLabel !== "—" && (
                              <span className="text-sm font-medium text-muted-foreground">
                                {" "}
                                / {coverage.totalLabel}
                              </span>
                            )}
                          </p>
                          <StatusBadge
                            label={coverage.coverageText}
                            variant={coverageBadgeVariant(coverage)}
                          />
                        </div>
                        {coverage.totalDue > 0 && (
                          <div className="h-1.5 overflow-hidden rounded-full bg-primary/15">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                coverage.coverageLabel === "full"
                                  ? "bg-[hsl(var(--success))]"
                                  : coverage.coverageLabel === "minimum"
                                    ? "bg-primary"
                                    : "bg-destructive",
                              )}
                              style={{ width: `${coverage.progressPercent}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </section>
                  ) : null}

                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold">AI validation</h3>
                    <ReceiptValidationChecklist
                      receipt={receipt}
                      alwaysExpanded
                    />
                  </section>
                </div>

                {(canMarkPaid && onMarkPaid) || onRevalidate || onDelete ? (
                  <div className="mt-auto flex flex-wrap gap-2 border-t border-border p-4 sm:p-5">
                    {canMarkPaid && onMarkPaid ? (
                      <Button
                        disabled={isMarkPaidPending || isRevalidatePending}
                        onClick={() => onMarkPaid(receipt.id)}
                      >
                        Mark paid
                      </Button>
                    ) : null}
                    {onRevalidate ? (
                      <Button
                        variant="outline"
                        disabled={isRevalidatePending || isMarkPaidPending}
                        onClick={() => onRevalidate(receipt.id)}
                      >
                        {isRevalidatePending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="mr-2 h-4 w-4" />
                        )}
                        Re-validate with AI
                      </Button>
                    ) : null}
                    {onDelete ? (
                      <Button
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        disabled={isRevalidatePending}
                        onClick={() => {
                          onOpenChange(false);
                          onDelete(receipt);
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remove
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
