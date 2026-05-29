"use client";

import { useState } from "react";
import { FileText, Mail, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api/client";

export function SoaPage() {
  const utils = api.useUtils();
  const { data: statements, isLoading } = api.soa.list.useQuery();
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const runPipeline = api.soa.runPipeline.useMutation({
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.message ?? "SOA run failed");
        return;
      }
      toast.success(
        `SOA complete — ${r.rowCount} rows, ${r.persisted?.saved ?? 0} saved to history`,
      );
      void utils.soa.list.invalidate();
      void utils.overview.stats.invalidate();
      void utils.reminders.listDue.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const pollGmail = api.soa.pollGmail.useMutation({
    onSuccess: () => {
      toast.success("Gmail poll finished");
      void utils.soa.list.invalidate();
      void utils.overview.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <DashboardPageHeader
        title="Statement of account"
        description="Fetch SOA PDFs from Gmail, parse amounts, generate summary PDF, and notify Telegram/Slack."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() =>
                runPipeline.mutate({
                  month: Number(month),
                  year: Number(year),
                })
              }
              disabled={runPipeline.isPending}
            >
              <FileText className="mr-2 h-4 w-4" />
              Run SOA
            </Button>
            <Button
              variant="outline"
              onClick={() => pollGmail.mutate()}
              disabled={pollGmail.isPending}
            >
              <Mail className="mr-2 h-4 w-4" />
              Poll Gmail
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Statement period</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <div className="space-y-2">
            <Label htmlFor="month">Month</Label>
            <Input
              id="month"
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-24"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="year">Year</Label>
            <Input
              id="year"
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-28"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner size="lg" />
        </div>
      ) : !statements?.length ? (
        <EmptyState
          icon={<FileText className="h-6 w-6 text-muted-foreground" />}
          title="No statements yet"
          message="Run SOA for a statement period to fetch, parse, and store your credit card statements."
        />
      ) : (
        <div className="space-y-3">
          {statements.map((s) => {
            const expanded = expandedId === s.id;
            return (
              <Card key={s.id}>
                <CardHeader
                  className="cursor-pointer"
                  onClick={() => setExpandedId(expanded ? null : s.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">
                        {s.bankLabel} · {s.cardLast4}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {s.statementMonth}/{s.statementYear} · Due{" "}
                        {s.dueDate ?? "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge label={s.totalDue ?? "—"} variant="muted" />
                      {expanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CardHeader>
                {expanded && (
                  <CardContent className="space-y-2 border-t border-border pt-4 text-sm">
                    <p>
                      <span className="text-muted-foreground">
                        Minimum due:
                      </span>{" "}
                      {s.minimumDue}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Total due:</span>{" "}
                      {s.totalDue}
                    </p>
                    {s.transactions?.length ? (
                      <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-md bg-muted/40 p-2 text-xs">
                        {s.transactions.slice(0, 20).map((t) => (
                          <li key={t.id} className="flex justify-between gap-2">
                            <span className="truncate">{t.description}</span>
                            <span className="shrink-0 font-medium">
                              {t.amount}
                            </span>
                          </li>
                        ))}
                        {s.transactions.length > 20 && (
                          <li className="text-muted-foreground">
                            +{s.transactions.length - 20} more transactions
                          </li>
                        )}
                      </ul>
                    ) : null}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
