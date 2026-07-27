"use client";

import { Eye, MoreVertical, Sparkles, Trash2 } from "lucide-react";

import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  buildReceiptPaymentCoverage,
  coverageBadgeVariant,
  formatReceiptCardTitle,
  isPdfReceipt,
} from "../lib/receipt-display";
import {
  formatReceiptDate,
  formatReceiptDueDate,
  receiptCardLabel,
  type ReceiptListItem,
} from "../lib/receipt-utils";
import {
  paymentStatusLabel,
  ReceiptAiVerdictBadge,
} from "./ReceiptAiVerdictBadge";
import { ReceiptThumbnail } from "./ReceiptThumbnail";

type ReceiptCardProps = {
  receipt: ReceiptListItem;
  onView: (receipt: ReceiptListItem) => void;
  onDelete: (receipt: ReceiptListItem) => void;
  onRevalidate: (receipt: ReceiptListItem) => void;
  isRevalidatePending?: boolean;
};

export function ReceiptCard({
  receipt,
  onView,
  onDelete,
  onRevalidate,
  isRevalidatePending,
}: ReceiptCardProps) {
  const title = formatReceiptCardTitle(receipt);
  const coverage = buildReceiptPaymentCoverage(receipt);
  const dueDate = formatReceiptDueDate(receipt.dueDateYmd);
  const cardLabel = receipt.cardDisplayLabel ?? receiptCardLabel(receipt);
  const showCardLabel = cardLabel !== title && !title.includes(cardLabel);

  const paidLabel =
    coverage?.paidLabel ??
    (receipt.parsedAmountRaw && receipt.parsedAmountRaw !== "—"
      ? receipt.parsedAmountRaw
      : "—");
  const totalLabel = coverage?.totalLabel ?? receipt.totalDue ?? null;

  return (
    <Card className="relative overflow-hidden border-border/80 shadow-sm">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1 z-10 h-8 w-8 shrink-0"
            aria-label="Receipt actions"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onView(receipt)}>
            <Eye className="mr-2 h-4 w-4" />
            View
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={isRevalidatePending}
            onClick={() => onRevalidate(receipt)}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Re-validate with AI
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => onDelete(receipt)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex min-h-[7.5rem] items-stretch sm:min-h-[8rem]">
        <ReceiptThumbnail
          receiptId={receipt.id}
          fileName={receipt.originalFileName}
          alt={title}
          layout="sidebar"
          onClick={() => onView(receipt)}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-2 p-3 pr-10">
          <div className="min-w-0 space-y-0.5">
            <h3
              className="truncate font-display text-sm font-semibold leading-snug"
              title={title}
            >
              {title}
            </h3>
            {showCardLabel ? (
              <p className="truncate text-xs text-muted-foreground">
                {cardLabel}
              </p>
            ) : null}
            <p className="text-[11px] text-muted-foreground">
              {dueDate
                ? `Due ${dueDate}`
                : formatReceiptDate(new Date(receipt.createdAt))}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge
              label={paymentStatusLabel(receipt.paymentStatus)}
              variant={
                receipt.paymentStatus === "marked_paid"
                  ? "success"
                  : receipt.paymentStatus === "partial"
                    ? "warning"
                    : "muted"
              }
            />
            <ReceiptAiVerdictBadge verdict={receipt.aiVerdict} compact />
            {coverage && coverage.coverageLabel !== "unknown" ? (
              <StatusBadge
                label={coverage.coverageText}
                variant={coverageBadgeVariant(coverage)}
              />
            ) : null}
          </div>

          <div className="mt-auto space-y-1">
            <p className="font-display text-base font-semibold tabular-nums leading-none">
              <span>{paidLabel}</span>
              {totalLabel && totalLabel !== "—" ? (
                <span className="text-sm font-medium text-muted-foreground">
                  {" "}
                  / {totalLabel}
                </span>
              ) : null}
            </p>
            {receipt.minimumDue && receipt.minimumDue !== "—" ? (
              <p className="text-[11px] text-muted-foreground">
                Min {receipt.minimumDue}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}

export { isPdfReceipt as isPdfFile };
