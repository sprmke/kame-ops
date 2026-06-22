"use client";

import { useMemo } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils/cn";
import {
  CANNOT_ANALYZE_SLUG,
  type TransactionCategorySlug,
} from "@/lib/transactions/categories";

import { TransactionCategorySelect } from "./TransactionCategorySelect";
import {
  classifyTransaction,
  cleanTransactionDescription,
  formatTransactionAmountDisplay,
  parseTransactionDate,
  transactionHasDualDates,
  TRANSACTION_KIND_META,
  type SoaTransaction,
} from "../lib/transaction-utils";

type SoaTransactionListProps = {
  transactions: SoaTransaction[];
  issuerId?: string | null;
};

function DateCell({ value }: { value: string | null }) {
  return (
    <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
      {value ?? "—"}
    </span>
  );
}

export function SoaTransactionList({
  transactions,
  issuerId,
}: SoaTransactionListProps) {
  const dualDates = useMemo(
    () => transactionHasDualDates(transactions),
    [transactions],
  );

  if (transactions.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No transactions parsed.
      </p>
    );
  }

  return (
    <div className="max-h-[min(70vh,720px)] overflow-auto rounded-lg border border-border/80">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
          <TableRow className="hover:bg-transparent">
            {dualDates ? (
              <>
                <TableHead className="w-[96px] whitespace-nowrap">
                  Post date
                </TableHead>
                <TableHead className="w-[96px] whitespace-nowrap">
                  Trans date
                </TableHead>
              </>
            ) : (
              <TableHead className="w-[100px] whitespace-nowrap">
                Date
              </TableHead>
            )}
            <TableHead>Description</TableHead>
            <TableHead className="w-[148px]">Category</TableHead>
            <TableHead className="w-[72px] text-center">Type</TableHead>
            <TableHead className="w-[120px] text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((tx) => {
            const kind = classifyTransaction(tx.description, tx.amount);
            const meta = TRANSACTION_KIND_META[kind];
            const dates = parseTransactionDate(tx.date, issuerId);
            const description = cleanTransactionDescription(tx.description);

            return (
              <TableRow
                key={tx.id}
                className={cn("transition-colors", meta.row)}
              >
                {dualDates ? (
                  <>
                    <TableCell className="py-2.5 align-middle">
                      <DateCell value={dates.posted} />
                    </TableCell>
                    <TableCell className="py-2.5 align-middle">
                      <DateCell value={dates.transacted} />
                    </TableCell>
                  </>
                ) : (
                  <TableCell className="py-2.5 align-middle">
                    <DateCell value={dates.posted} />
                  </TableCell>
                )}
                <TableCell className="py-2.5 align-middle">
                  <p className="text-sm leading-snug">{description}</p>
                </TableCell>
                <TableCell className="py-2.5 align-middle">
                  <TransactionCategorySelect
                    transactionId={tx.id}
                    value={
                      (tx.categorySlug ??
                        CANNOT_ANALYZE_SLUG) as TransactionCategorySlug
                    }
                  />
                </TableCell>
                <TableCell className="py-2.5 align-middle text-center">
                  {meta.label ? (
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                        meta.badge,
                      )}
                    >
                      {meta.label}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell
                  className={cn(
                    "py-2.5 align-middle text-right text-sm tabular-nums",
                    meta.amount,
                  )}
                >
                  {formatTransactionAmountDisplay(tx.amount)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
