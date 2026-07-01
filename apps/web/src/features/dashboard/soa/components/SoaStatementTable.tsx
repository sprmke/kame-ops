"use client";

import { FileText } from "lucide-react";

import {
  ClickableTableRow,
  TableRowActions,
} from "@/components/shared/ClickableTableRow";
import { TableCard } from "@/components/shared/TableCard";
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

import { CardBankLabel } from "@/lib/credit-cards/CardBankLabel";
import { resolveCardAccent } from "@/lib/credit-cards/card-accent";

import {
  daysUntilDue,
  dueCountdownLabel,
  formatDisplayAmount,
  periodLabel,
  type SoaStatement,
} from "../lib/soa-utils";
import { isStatementMarkedPaid } from "@/lib/soa/paid-status";
import type { DueEntryPaidMatchInput } from "@/lib/soa/paid-status";

type SoaStatementTableProps = {
  periodId: string;
  statements: SoaStatement[];
  paidDues: DueEntryPaidMatchInput[];
  onPreviewSource: (statement: SoaStatement) => void;
  showPeriodColumn?: boolean;
};

export function SoaStatementTable({
  periodId,
  statements,
  paidDues,
  onPreviewSource,
  showPeriodColumn = false,
}: SoaStatementTableProps) {
  return (
    <TableCard>
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
            const paid = isStatementMarkedPaid(statement, paidDues);
            const days = daysUntilDue(statement.dueDateYmd);
            const countdown = dueCountdownLabel(days);
            const accent = resolveCardAccent(
              statement.issuerId,
              statement.cardColor,
            );
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
                style={accent.stripeStyle}
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
                  <CardBankLabel
                    issuerId={statement.issuerId}
                    color={statement.cardColor}
                    label={statement.bankLabel}
                    showSwatch={false}
                  />
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
                      className="shrink-0"
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
    </TableCard>
  );
}
