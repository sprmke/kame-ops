import { AlertCircle, CheckCircle2, Clock3 } from "lucide-react";

import {
  dueMonthPaidStatus,
  type DueMonthPaidStatus,
} from "@/lib/soa/due-month";
import { cn } from "@/lib/utils/cn";

const PAID_STATUS_CONFIG: Record<
  DueMonthPaidStatus,
  {
    Icon: typeof CheckCircle2;
    className: string;
    label: string;
  }
> = {
  all_paid: {
    Icon: CheckCircle2,
    className: "text-[hsl(var(--success))]",
    label: "All paid",
  },
  partial: {
    Icon: Clock3,
    className: "text-[hsl(var(--warning))]",
    label: "Partially paid",
  },
  unpaid: {
    Icon: AlertCircle,
    className: "text-[hsl(var(--warning))]",
    label: "Unpaid",
  },
};

type ReceiptGroupHeaderProps = {
  label: string;
  showPaidSummary?: boolean;
  paidSummary?: { paidCount: number; totalCount: number };
};

export function ReceiptGroupHeader({
  label,
  showPaidSummary = false,
  paidSummary,
}: ReceiptGroupHeaderProps) {
  if (!showPaidSummary || !paidSummary || paidSummary.totalCount === 0) {
    return <h2 className="font-display text-lg font-semibold">{label}</h2>;
  }

  const { paidCount, totalCount } = paidSummary;
  const status = dueMonthPaidStatus(paidCount, totalCount);
  const { Icon, className, label: statusLabel } = PAID_STATUS_CONFIG[status];

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h2 className="font-display text-lg font-semibold">{label}</h2>
      <div
        className={cn(
          "flex items-center gap-1.5 text-sm font-medium",
          className,
        )}
        aria-label={`${paidCount} of ${totalCount} paid. ${statusLabel}.`}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="tabular-nums">
          {paidCount}/{totalCount} paid
        </span>
      </div>
    </div>
  );
}
