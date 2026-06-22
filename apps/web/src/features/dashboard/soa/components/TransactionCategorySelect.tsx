"use client";

import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api/client";
import {
  CANNOT_ANALYZE_SLUG,
  type TransactionCategorySlug,
} from "@/lib/transactions/categories";
import { cn } from "@/lib/utils/cn";

type TransactionCategorySelectProps = {
  transactionId: string;
  value: TransactionCategorySlug;
  editable?: boolean;
  className?: string;
  onUpdated?: () => void;
};

export function TransactionCategorySelect({
  transactionId,
  value,
  editable = true,
  className,
  onUpdated,
}: TransactionCategorySelectProps) {
  const utils = api.useUtils();
  const { data: options } = api.transactionCategories.listOptions.useQuery();

  const update =
    api.transactionCategories.updateTransactionCategory.useMutation({
      onSuccess: () => {
        void utils.soa.getStatement.invalidate();
        void utils.soa.getPeriod.invalidate();
        onUpdated?.();
      },
      onError: (e) => toast.error(e.message),
    });

  if (!editable) {
    return (
      <span className={cn("text-sm", className)}>
        {options?.find((o) => o.slug === value)?.label ?? value}
      </span>
    );
  }

  return (
    <Select
      value={value}
      onValueChange={(slug) => {
        update.mutate({
          transactionId,
          categorySlug: slug as TransactionCategorySlug,
          learn: true,
        });
      }}
      disabled={update.isPending}
    >
      <SelectTrigger
        className={cn(
          "h-8 border-dashed text-xs",
          value === CANNOT_ANALYZE_SLUG && "text-muted-foreground",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options?.map((opt) => (
          <SelectItem key={opt.slug} value={opt.slug} className="text-xs">
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
