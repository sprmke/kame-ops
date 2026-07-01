'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { inferRouterOutputs } from '@trpc/server';
import {
  ArrowLeft,
  Calendar,
  FileText,
  PhilippinePeso,
  Receipt,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

import { DashboardPageHeader } from '@/components/shared/DashboardPageHeader';
import { SoaStatementDetailContentSkeleton } from '@/components/shared/skeletons';
import { StatCard } from '@/components/shared/StatCard';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { ROUTES } from '@/config/routes';
import { api } from '@/lib/api/client';
import type { AppRouter } from '@/server/routers/_app';
import { formatPhpAmount } from '@/lib/utils/format-money';
import { isStatementMarkedPaid } from '@/lib/soa/paid-status';

import {
  CategorizeWithAiProvider,
  useCategorizeWithAiActions,
} from './CategorizeWithAiProvider';
import { SoaPdfPreview } from './SoaPdfPreview';
import { SoaTransactionList } from './SoaTransactionList';
import { CardBankLabel } from '@/lib/credit-cards/CardBankLabel';
import { resolveCardAccent } from '@/lib/credit-cards/card-accent';

import {
  daysUntilDue,
  dueCountdownLabel,
  formatDisplayAmount,
  periodLabel,
} from '../lib/soa-utils';
import {
  classifyTransaction,
  parseTransactionAmount,
  sumTransactionsByKind,
} from '../lib/transaction-utils';

type SoaStatementDetailPageProps = {
  periodId: string;
  statementId: string;
};

type SoaStatementDetail = NonNullable<
  inferRouterOutputs<AppRouter>['soa']['getStatement']
>;

export function SoaStatementDetailPage({
  periodId,
  statementId,
}: SoaStatementDetailPageProps) {
  const { data, isLoading } = api.soa.getStatement.useQuery({
    periodId,
    statementId,
  });

  if (isLoading) {
    return (
      <div className="space-y-8">
        <SoaStatementDetailContentSkeleton />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-12 space-y-4 text-center">
        <p className="text-sm text-muted-foreground">Statement not found.</p>
        <Button variant="outline" asChild>
          <Link href={ROUTES.dashboard.soaPeriod(periodId)}>
            <ArrowLeft className="mr-2 w-4 h-4" />
            Back
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <CategorizeWithAiProvider
      periodId={periodId}
      statementId={statementId}
      transactions={data.statement.transactions ?? []}
    >
      <SoaStatementDetailBody
        periodId={periodId}
        period={data.period}
        statement={data.statement}
      />
    </CategorizeWithAiProvider>
  );
}

function SoaStatementDetailBody({
  periodId,
  period,
  statement,
}: {
  periodId: string;
  period: SoaStatementDetail['period'];
  statement: SoaStatementDetail['statement'];
}) {
  const { data: dues } = api.reminders.listDue.useQuery({ unpaidOnly: false });
  const categorize = useCategorizeWithAiActions();
  const [pdfOpen, setPdfOpen] = useState(false);

  const paid = useMemo(() => {
    if (!dues) return false;
    return isStatementMarkedPaid(
      {
        issuerId: statement.issuerId,
        cardLast4: statement.cardLast4,
        dueDateYmd: statement.dueDateYmd,
        statementMonth: statement.statementMonth,
        statementYear: statement.statementYear,
      },
      dues.map((due) => ({
        issuerId: due.issuerId,
        cardLast4: due.cardLast4,
        dueDateYmd: due.dueDateYmd,
        paidAt: due.paidAt,
        statementPeriodKey: due.statementPeriodKey,
      })),
    );
  }, [statement, dues]);

  const txStats = useMemo(() => {
    const transactions = statement.transactions ?? [];
    const charges = transactions.reduce((sum, t) => {
      const kind = classifyTransaction(t.description, t.amount);
      if (kind === 'purchase' || kind === 'interest' || kind === 'fee') {
        return sum + parseTransactionAmount(t.amount);
      }
      return sum;
    }, 0);
    const credits = sumTransactionsByKind(transactions, ['credit', 'payment']);
    const interest = sumTransactionsByKind(transactions, ['interest']);
    const fees = sumTransactionsByKind(transactions, ['fee']);

    return { charges, credits, interest, fees, count: transactions.length };
  }, [statement.transactions]);

  const accent = resolveCardAccent(statement.issuerId, statement.cardColor);
  const days = daysUntilDue(statement.dueDateYmd);
  const countdown = dueCountdownLabel(days);
  const hasPdf =
    !!statement.pdfFileName &&
    statement.pdfFileName !== '—' &&
    !statement.soaUnavailable;

  const urgencyVariant =
    paid || days === null
      ? ('muted' as const)
      : days < 0
        ? ('destructive' as const)
        : days <= 4
          ? ('warning' as const)
          : ('default' as const);

  const stmtMonthLabel = periodLabel(
    statement.statementMonth,
    statement.statementYear,
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-y-1 gap-x-2 items-center text-sm text-muted-foreground">
        <Link
          href={ROUTES.dashboard.soa}
          className="transition-colors shrink-0 hover:text-foreground"
        >
          SOA
        </Link>
        <span className="shrink-0">/</span>
        <Link
          href={ROUTES.dashboard.soaPeriod(periodId)}
          className="min-w-0 max-w-[12rem] truncate transition-colors hover:text-foreground sm:max-w-none"
        >
          {period.label}
        </Link>
        <span className="shrink-0">/</span>
        <span className="min-w-0 truncate text-foreground">
          {statement.bankLabel} ···· {statement.cardLast4}
        </span>
      </div>

      <DashboardPageHeader
        title={`${statement.bankLabel} ···· ${statement.cardLast4}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href={ROUTES.dashboard.soaPeriod(periodId)}>
                <ArrowLeft className="mr-2 w-4 h-4" />
                Back
              </Link>
            </Button>
            {txStats.count > 0 && (
              <Button
                variant="outline"
                onClick={() => categorize.openChoiceDialog()}
                disabled={categorize.isPending}
              >
                <Sparkles className="mr-2 w-4 h-4" />
                Categorized with AI
              </Button>
            )}
            {hasPdf && (
              <Button variant="outline" onClick={() => setPdfOpen(true)}>
                <FileText className="mr-2 w-4 h-4" />
                Source PDF
              </Button>
            )}
          </div>
        }
      />

      <Card
        className="overflow-hidden border-border/80 shadow-card"
        style={accent.stripeStyle}
      >
        <CardHeader className="pb-4 space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <CardBankLabel
              issuerId={statement.issuerId}
              color={statement.cardColor}
              label={statement.bankLabel}
            />
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
              <p className="text-2xl font-bold tabular-nums font-display">
                {formatDisplayAmount(statement.totalDue)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Minimum
              </p>
              <p className="text-xl font-semibold tabular-nums font-display">
                {formatDisplayAmount(statement.minimumDue)}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <Calendar className="w-3 h-3" />
                Due
              </p>
              <p className="font-medium">{statement.dueDate ?? '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Statement date
              </p>
              <p className="font-medium">{statement.statementDate ?? '—'}</p>
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
        <div className="flex gap-3 justify-between items-center">
          <h2 className="text-lg font-semibold font-display">Transactions</h2>
          {txStats.count > 0 && (
            <p className="text-sm tabular-nums text-muted-foreground">
              {txStats.count} {txStats.count === 1 ? 'line' : 'lines'}
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
