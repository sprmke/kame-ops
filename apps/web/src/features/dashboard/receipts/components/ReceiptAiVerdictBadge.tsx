import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import type { ReceiptAiVerdict } from "@/lib/receipts/types";

export function formatReceiptAiVerdictLabel(
  verdict: ReceiptAiVerdict | string | null | undefined,
): string {
  switch (String(verdict ?? "").toLowerCase()) {
    case "valid":
      return "Valid";
    case "likely_valid":
      return "Likely valid";
    case "unclear":
      return "Unclear";
    case "invalid":
      return "Invalid";
    case "skipped":
      return "Not checked";
    default:
      return "Unknown";
  }
}

function compactBadgeClass(verdict: ReceiptAiVerdict | string): string {
  const v = String(verdict).toLowerCase();
  if (v === "valid" || v === "likely_valid") {
    return "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30";
  }
  if (v === "invalid") {
    return "bg-red-50 text-red-800 ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30";
  }
  return "bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/30";
}

function cardClass(verdict: ReceiptAiVerdict | string): string {
  const v = String(verdict).toLowerCase();
  if (v === "valid" || v === "likely_valid") {
    return "border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-500/25 dark:bg-emerald-500/10";
  }
  if (v === "invalid") {
    return "border-red-200/80 bg-red-50/60 dark:border-red-500/25 dark:bg-red-500/10";
  }
  return "border-amber-200/80 bg-amber-50/60 dark:border-amber-500/25 dark:bg-amber-500/10";
}

function NoticeIcon({ verdict }: { verdict: ReceiptAiVerdict | string }) {
  const v = String(verdict).toLowerCase();
  const className = "size-4 shrink-0 mt-0.5";
  if (v === "valid" || v === "likely_valid") {
    return (
      <CheckCircle2
        className={cn(className, "text-emerald-600 dark:text-emerald-400")}
        aria-hidden
      />
    );
  }
  if (v === "invalid") {
    return (
      <XCircle
        className={cn(className, "text-red-600 dark:text-red-400")}
        aria-hidden
      />
    );
  }
  if (v === "unclear") {
    return (
      <HelpCircle
        className={cn(className, "text-amber-600 dark:text-amber-400")}
        aria-hidden
      />
    );
  }
  return (
    <AlertTriangle
      className={cn(className, "text-amber-600 dark:text-amber-400")}
      aria-hidden
    />
  );
}

type Props = {
  verdict: ReceiptAiVerdict | string | null | undefined;
  summary?: string | null;
  className?: string;
  compact?: boolean;
};

export function ReceiptAiVerdictBadge({
  verdict,
  summary,
  className,
  compact = false,
}: Props) {
  if (!verdict || String(verdict).toLowerCase() === "skipped") return null;

  if (compact) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1",
          compactBadgeClass(verdict),
          className,
        )}
      >
        {formatReceiptAiVerdictLabel(verdict)}
      </span>
    );
  }

  return (
    <div
      className={cn(
        "flex gap-2 rounded-lg border px-3 py-2.5",
        cardClass(verdict),
        className,
      )}
      role="status"
    >
      <NoticeIcon verdict={verdict} />
      <div className="min-w-0 space-y-0.5">
        <p className="text-xs font-medium leading-snug text-foreground">
          {formatReceiptAiVerdictLabel(verdict)}
        </p>
        {summary ? (
          <p className="text-[11px] leading-snug text-muted-foreground">
            {summary}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function paymentStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "marked_paid":
      return "Paid";
    case "rejected":
      return "Rejected";
    case "ai_error":
      return "AI error";
    case "pending":
      return "Pending";
    default:
      return status ?? "—";
  }
}
