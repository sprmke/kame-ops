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

import {
  TransactionCategorySelect,
  TRANSACTION_CATEGORY_SELECT_WIDTH_CLASS,
} from "./TransactionCategorySelect";
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

type TransactionRowModel = {
  tx: SoaTransaction;
  kind: ReturnType<typeof classifyTransaction>;
  meta: (typeof TRANSACTION_KIND_META)[keyof typeof TRANSACTION_KIND_META];
  dates: ReturnType<typeof parseTransactionDate>;
  description: string;
};

function useTransactionRows(
  transactions: SoaTransaction[],
  issuerId?: string | null,
): TransactionRowModel[] {
  return useMemo(
    () =>
      transactions.map((tx) => {
        const kind = classifyTransaction(tx.description, tx.amount);
        return {
          tx,
          kind,
          meta: TRANSACTION_KIND_META[kind],
          dates: parseTransactionDate(tx.date, issuerId),
          description: cleanTransactionDescription(tx.description),
        };
      }),
    [transactions, issuerId],
  );
}

function TransactionTypeBadge({ meta }: { meta: TransactionRowModel["meta"] }) {
  if (!meta.label) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        meta.badge,
      )}
    >
      {meta.label}
    </span>
  );
}

function TransactionCategoryField({ tx }: { tx: SoaTransaction }) {
  return (
    <TransactionCategorySelect
      transactionId={tx.id}
      value={
        (tx.categorySlug ?? CANNOT_ANALYZE_SLUG) as TransactionCategorySlug
      }
    />
  );
}

function SoaTransactionCards({
  rows,
  dualDates,
}: {
  rows: TransactionRowModel[];
  dualDates: boolean;
}) {
  return (
    <div className="space-y-3 md:hidden">
      {rows.map(({ tx, meta, dates, description }) => (
        <article
          key={tx.id}
          className={cn(
            "rounded-lg border border-border/80 bg-card p-4 shadow-card",
            meta.row,
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium leading-snug">{description}</p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {dualDates ? (
                  <>
                    Posted {dates.posted ?? "—"}
                    {dates.transacted ? ` · Trans ${dates.transacted}` : null}
                  </>
                ) : (
                  (dates.posted ?? "—")
                )}
              </p>
            </div>
            <p
              className={cn(
                "shrink-0 text-sm font-semibold tabular-nums",
                meta.amount,
              )}
            >
              {formatTransactionAmountDisplay(tx.amount)}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <TransactionCategoryField tx={tx} />
            <TransactionTypeBadge meta={meta} />
          </div>
        </article>
      ))}
    </div>
  );
}

function SoaTransactionTable({
  rows,
  dualDates,
}: {
  rows: TransactionRowModel[];
  dualDates: boolean;
}) {
  return (
    <div className="hidden max-h-[min(70vh,720px)] overflow-auto rounded-lg border border-border/80 md:block">
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
            <TableHead className={TRANSACTION_CATEGORY_SELECT_WIDTH_CLASS}>
              Category
            </TableHead>
            <TableHead className="w-[72px] text-center">Type</TableHead>
            <TableHead className="w-[120px] text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ tx, meta, dates, description }) => (
            <TableRow key={tx.id} className={cn("transition-colors", meta.row)}>
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
              <TableCell
                className={cn(
                  "py-2.5 align-middle",
                  TRANSACTION_CATEGORY_SELECT_WIDTH_CLASS,
                )}
              >
                <TransactionCategoryField tx={tx} />
              </TableCell>
              <TableCell className="py-2.5 align-middle text-center">
                <TransactionTypeBadge meta={meta} />
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
          ))}
        </TableBody>
      </Table>
    </div>
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
  const rows = useTransactionRows(transactions, issuerId);

  if (transactions.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No transactions parsed.
      </p>
    );
  }

  return (
    <>
      <SoaTransactionCards rows={rows} dualDates={dualDates} />
      <SoaTransactionTable rows={rows} dualDates={dualDates} />
    </>
  );
}
