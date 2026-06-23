"use client";

import Link from "next/link";
import { Calendar, FileText, Receipt } from "lucide-react";

import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ROUTES } from "@/config/routes";

import { CardBankLabel } from "@/lib/credit-cards/CardBankLabel";
import { resolveCardAccent } from "@/lib/credit-cards/card-accent";

import {
  daysUntilDue,
  dueCountdownLabel,
  formatDisplayAmount,
  type SoaStatement,
} from "../lib/soa-utils";

type SoaStatementCardProps = {
  periodId: string;
  statement: SoaStatement;
  paid?: boolean;
  onPreviewSource: () => void;
};

export function SoaStatementCard({
  periodId,
  statement,
  paid,
  onPreviewSource,
}: SoaStatementCardProps) {
  const accent = resolveCardAccent(statement.issuerId, statement.cardColor);
  const days = daysUntilDue(statement.dueDateYmd);
  const countdown = dueCountdownLabel(days);
  const hasPdf =
    !!statement.pdfFileName &&
    statement.pdfFileName !== "—" &&
    !statement.soaUnavailable;
  const txCount = statement.transactions?.length ?? 0;
  const detailHref = ROUTES.dashboard.soaStatement(periodId, statement.id);

  const urgencyVariant =
    paid || days === null
      ? ("muted" as const)
      : days < 0
        ? ("destructive" as const)
        : days <= 4
          ? ("warning" as const)
          : ("default" as const);

  return (
    <Card
      className="group overflow-hidden border-border/80 shadow-card transition-all hover:shadow-card-hover"
      style={accent.stripeStyle}
    >
      <CardHeader className="space-y-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardBankLabel
                issuerId={statement.issuerId}
                color={statement.cardColor}
                label={statement.bankLabel}
              />
              {paid && <StatusBadge label="Paid" variant="success" />}
              {countdown && !paid && (
                <StatusBadge label={countdown} variant={urgencyVariant} />
              )}
            </div>
            <div>
              <Link
                href={detailHref}
                className="font-display text-xl font-bold tracking-tight transition-colors hover:text-primary"
              >
                ···· {statement.cardLast4}
              </Link>
              {statement.statementDate && statement.statementDate !== "—" && (
                <p className="text-xs text-muted-foreground">
                  Stmt {statement.statementDate}
                </p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Total due
            </p>
            <p className="font-display text-lg font-bold tabular-nums text-foreground">
              {formatDisplayAmount(statement.totalDue)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 text-sm">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Minimum
            </p>
            <p className="font-medium tabular-nums">
              {formatDisplayAmount(statement.minimumDue)}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <Calendar className="h-3 w-3" />
              Due
            </p>
            <p className="font-medium">{statement.dueDate ?? "—"}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {txCount > 0 && (
            <Button variant="default" size="sm" className="h-8" asChild>
              <Link href={detailHref}>
                <Receipt className="mr-1.5 h-3.5 w-3.5" />
                View
              </Link>
            </Button>
          )}
          {hasPdf && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={onPreviewSource}
            >
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              Source PDF
            </Button>
          )}
        </div>
      </CardHeader>
    </Card>
  );
}
