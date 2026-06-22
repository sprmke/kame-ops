"use client";

import { FileText } from "lucide-react";

import {
  ClickableTableRow,
  TableRowActions,
} from "@/components/shared/ClickableTableRow";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils/cn";

import {
  daysUntilDue,
  dueCountdownLabel,
  formatDisplayAmount,
  issuerAccent,
  periodLabel,
  type SoaStatement,
} from "../lib/soa-utils";

type SoaStatementTableProps = {
  periodId: string;
  statements: SoaStatement[];
  paidLookup: Set<string>;
  dueEntryKey: (
    issuerId: string,
    cardLast4: string,
    dueDateYmd: string | null,
  ) => string;
  onPreviewSource: (statement: SoaStatement) => void;
  showPeriodColumn?: boolean;
};

export function SoaStatementTable({
  periodId,
  statements,
  paidLookup,
  dueEntryKey: dueKey,
  onPreviewSource,
  showPeriodColumn = false,
}: SoaStatementTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/80">
      <Table>
        <TableHeader>
          <TableRow>
            {showPeriodColumn && <TableHead>Period</TableHead>}
            <TableHead>Bank</TableHead>
            <TableHead>Card</TableHead>
            <TableHead>Statement</TableHead>
            <TableHead className="text-right">Total due</TableHead>
            <TableHead className="text-right">Minimum</TableHead>
            <TableHead>Due</TableHead>
            <TableHead className="w-[52px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {statements.map((statement) => {
            const paid = paidLookup.has(
              dueKey(
                statement.issuerId,
                statement.cardLast4,
                statement.dueDateYmd,
              ),
            );
            const days = daysUntilDue(statement.dueDateYmd);
            const countdown = dueCountdownLabel(days);
            const accent = issuerAccent(statement.issuerId);
            const hasPdf =
              !!statement.pdfFileName &&
              statement.pdfFileName !== "—" &&
              !statement.soaUnavailable;
            const detailHref = ROUTES.dashboard.soaStatement(
              periodId,
              statement.id,
            );

            const urgencyVariant =
              paid || days === null
                ? ("muted" as const)
                : days < 0
                  ? ("destructive" as const)
                  : days <= 4
                    ? ("warning" as const)
                    : ("default" as const);

            return (
              <ClickableTableRow
                key={statement.id}
                href={detailHref}
                className={cn("border-l-4", accent.border)}
              >
                {showPeriodColumn && (
                  <TableCell className="text-muted-foreground">
                    {periodLabel(
                      statement.statementMonth,
                      statement.statementYear,
                    )}
                  </TableCell>
                )}
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
                      accent.badge,
                    )}
                  >
                    <span
                      className={cn("h-1.5 w-1.5 rounded-full", accent.dot)}
                    />
                    {statement.bankLabel}
                  </span>
                </TableCell>
                <TableCell className="font-medium tabular-nums">
                  ···· {statement.cardLast4}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {statement.statementDate && statement.statementDate !== "—"
                    ? statement.statementDate
                    : "—"}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatDisplayAmount(statement.totalDue)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatDisplayAmount(statement.minimumDue)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span>{statement.dueDate ?? "—"}</span>
                    {paid && <StatusBadge label="Paid" variant="success" />}
                    {countdown && !paid && (
                      <StatusBadge label={countdown} variant={urgencyVariant} />
                    )}
                  </div>
                </TableCell>
                <TableRowActions>
                  {hasPdf ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Preview source PDF"
                      onClick={() => onPreviewSource(statement)}
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                  ) : null}
                </TableRowActions>
              </ClickableTableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
