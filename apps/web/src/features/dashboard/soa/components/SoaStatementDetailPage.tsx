"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  FileText,
  PhilippinePeso,
  Receipt,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ROUTES } from "@/config/routes";
import { api } from "@/lib/api/client";
import { formatPhpAmount } from "@/lib/utils/format-money";
import { cn } from "@/lib/utils/cn";

import { SoaPdfPreview } from "./SoaPdfPreview";
import { SoaTransactionList } from "./SoaTransactionList";
import {
  daysUntilDue,
  dueCountdownLabel,
  formatDisplayAmount,
  issuerAccent,
  periodLabel,
} from "../lib/soa-utils";
import {
  classifyTransaction,
  parseTransactionAmount,
  sumTransactionsByKind,
} from "../lib/transaction-utils";

type SoaStatementDetailPageProps = {
  periodId: string;
  statementId: string;
};

export function SoaStatementDetailPage({
  periodId,
  statementId,
}: SoaStatementDetailPageProps) {
  const { data, isLoading } = api.soa.getStatement.useQuery({
    periodId,
    statementId,
  });
  const { data: dues } = api.reminders.listDue.useQuery({ unpaidOnly: false });

  const [pdfOpen, setPdfOpen] = useState(false);

  const paid = useMemo(() => {
    if (!data?.statement || !dues) return false;
    const s = data.statement;
    return dues.some(
      (d) =>
        d.issuerId === s.issuerId &&
        d.cardLast4 === s.cardLast4 &&
        d.dueDateYmd === s.dueDateYmd &&
        !!d.paidAt,
    );
  }, [data?.statement, dues]);

  const txStats = useMemo(() => {
    const transactions = data?.statement.transactions ?? [];
    const charges = transactions.reduce((sum, t) => {
      const kind = classifyTransaction(t.description, t.amount);
      if (kind === "purchase" || kind === "interest" || kind === "fee") {
        return sum + parseTransactionAmount(t.amount);
      }
      return sum;
    }, 0);
    const credits = sumTransactionsByKind(transactions, ["credit", "payment"]);
    const interest = sumTransactionsByKind(transactions, ["interest"]);
    const fees = sumTransactionsByKind(transactions, ["fee"]);

    return { charges, credits, interest, fees, count: transactions.length };
  }, [data?.statement.transactions]);

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">Statement not found.</p>
        <Button variant="outline" asChild>
          <Link href={ROUTES.dashboard.soaPeriod(periodId)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>
    );
  }

  const { period, statement } = data;
  const accent = issuerAccent(statement.issuerId);
  const days = daysUntilDue(statement.dueDateYmd);
  const countdown = dueCountdownLabel(days);
  const hasPdf =
    !!statement.pdfFileName &&
    statement.pdfFileName !== "—" &&
    !statement.soaUnavailable;

  const urgencyVariant =
    paid || days === null
      ? ("muted" as const)
      : days < 0
        ? ("destructive" as const)
        : days <= 4
          ? ("warning" as const)
          : ("default" as const);

  const stmtMonthLabel = periodLabel(
    statement.statementMonth,
    statement.statementYear,
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href={ROUTES.dashboard.soa}
          className="transition-colors hover:text-foreground"
        >
          SOA
        </Link>
        <span>/</span>
        <Link
          href={ROUTES.dashboard.soaPeriod(periodId)}
          className="transition-colors hover:text-foreground"
        >
          {period.label}
        </Link>
        <span>/</span>
        <span className="text-foreground">
          {statement.bankLabel} ···· {statement.cardLast4}
        </span>
      </div>

      <DashboardPageHeader
        title={`${statement.bankLabel} ···· ${statement.cardLast4}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href={ROUTES.dashboard.soaPeriod(periodId)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            {hasPdf && (
              <Button variant="outline" onClick={() => setPdfOpen(true)}>
                <FileText className="mr-2 h-4 w-4" />
                Source PDF
              </Button>
            )}
          </div>
        }
      />

      <Card
        className={cn(
          "overflow-hidden border-border/80 shadow-card",
          "border-l-4",
          accent.border,
        )}
      >
        <CardHeader className="space-y-4 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                accent.badge,
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", accent.dot)} />
              {statement.bankLabel}
            </span>
            <span className="text-xs text-muted-foreground">
              {stmtMonthLabel}
            </span>
            {paid && <StatusBadge label="Paid" variant="success" />}
            {countdown && !paid && (
              <StatusBadge label={countdown} variant={urgencyVariant} />
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Total due
              </p>
              <p className="font-display text-2xl font-bold tabular-nums">
                {formatDisplayAmount(statement.totalDue)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Minimum
              </p>
              <p className="font-display text-xl font-semibold tabular-nums">
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
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Statement date
              </p>
              <p className="font-medium">{statement.statementDate ?? "—"}</p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {txStats.count > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Transactions" value={txStats.count} icon={Receipt} />
          <StatCard
            title="Charges"
            value={formatPhpAmount(txStats.charges)}
            icon={TrendingUp}
          />
          <StatCard
            title="Credits"
            value={formatPhpAmount(txStats.credits)}
            icon={TrendingDown}
          />
          {(txStats.interest > 0 || txStats.fees > 0) && (
            <StatCard
              title="Interest & fees"
              value={formatPhpAmount(txStats.interest + txStats.fees)}
              icon={PhilippinePeso}
            />
          )}
        </div>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Transactions</h2>
          {txStats.count > 0 && (
            <p className="text-sm text-muted-foreground tabular-nums">
              {txStats.count} {txStats.count === 1 ? "line" : "lines"}
            </p>
          )}
        </div>
        <SoaTransactionList
          transactions={statement.transactions ?? []}
          issuerId={statement.issuerId}
        />
      </section>

      {hasPdf && (
        <SoaPdfPreview
          open={pdfOpen}
          onOpenChange={setPdfOpen}
          title={`${statement.bankLabel} ···· ${statement.cardLast4}`}
          pdfUrl={`/api/soa/pdf?statementId=${statement.id}`}
        />
      )}
    </div>
  );
}
