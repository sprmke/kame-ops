"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, HelpCircle, MessageCircle, Slack } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/lib/api/client";
import { WORKFLOW_DONE_DISMISS_MS } from "@/lib/constants/workflow-ui";
import { computeSoaGmailPlan } from "@/lib/credit-cards/soa-gmail-plan";
import { cn } from "@/lib/utils/cn";

import { useRunSoaProgress } from "../hooks/use-run-soa-progress";
import {
  buildRunSoaProgressSteps,
  type RunSoaFormValues,
} from "../lib/run-soa-progress";
import { RunSoaProgressPanel } from "./RunSoaProgressPanel";
import { StatementMonthSelect } from "./StatementMonthSelect";

export type { RunSoaFormValues };

export type RunSoaSettled = "success" | "error" | null;

type RunSoaDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Partial<RunSoaFormValues>;
  runId?: string | null;
  onSubmit: (values: RunSoaFormValues) => void;
  isPending?: boolean;
  settled?: RunSoaSettled;
  errorMessage?: string | null;
  onRunComplete?: () => void;
};

const now = new Date();

const GOOGLE_CALENDAR_HINT =
  "Events are created when a card's due date is in the current month or later—including due days that already passed this month.";

function defaultValues(): RunSoaFormValues {
  return {
    mode: "single",
    fromMonth: now.getMonth() + 1,
    fromYear: now.getFullYear(),
    toMonth: now.getMonth() + 1,
    toYear: now.getFullYear(),
    monthCount: 4,
    rangeStyle: "explicit",
    notifyTelegram: false,
    notifySlack: false,
    createCalendar: false,
  };
}

function resolveSubmitValues(form: RunSoaFormValues): RunSoaFormValues {
  if (form.mode === "single") {
    return {
      ...form,
      toMonth: form.fromMonth,
      toYear: form.fromYear,
    };
  }

  if (form.rangeStyle === "rolling") {
    return {
      ...form,
      fromMonth: form.toMonth,
      fromYear: form.toYear,
    };
  }

  return form;
}

export function RunSoaDialog({
  open,
  onOpenChange,
  initial,
  runId = null,
  onSubmit,
  isPending,
  settled = null,
  errorMessage,
  onRunComplete,
}: RunSoaDialogProps) {
  const { data: integrations } = api.integrations.list.useQuery(undefined, {
    enabled: open,
  });
  const { data: cards } = api.creditCards.list.useQuery(undefined, {
    enabled: open,
  });
  const { data: googleAccounts } = api.integrations.listGoogleAccounts.useQuery(
    undefined,
    { enabled: open },
  );
  const soaGmailPlan = useMemo(
    () => computeSoaGmailPlan(cards, googleAccounts),
    [cards, googleAccounts],
  );
  const connected = new Set(integrations?.map((i) => i.provider) ?? []);
  const [form, setForm] = useState<RunSoaFormValues>(defaultValues);
  const [runningValues, setRunningValues] = useState<RunSoaFormValues | null>(
    null,
  );

  const showProgress = runningValues !== null;
  const progressValues = runningValues ?? form;
  const progressSteps = useMemo(
    () => buildRunSoaProgressSteps(progressValues),
    [progressValues],
  );
  const runFailed = settled === "error";
  const runSucceeded = settled === "success";
  const {
    steps: liveSteps,
    activeStepIndex,
    progress,
    detail,
    finished: progressFinished,
    failed: progressFailed,
  } = useRunSoaProgress(runId, progressSteps, !!isPending, settled);

  const progressFailedState = !isPending && runFailed;
  const progressFinishedState = !isPending && !runFailed && showProgress;

  useEffect(() => {
    if (!open) return;
    const providers = new Set(integrations?.map((i) => i.provider) ?? []);
    const base = { ...defaultValues(), ...initial };
    setForm({
      ...base,
      notifyTelegram: base.notifyTelegram && providers.has("telegram"),
      notifySlack: base.notifySlack && providers.has("slack"),
      createCalendar: base.createCalendar,
    });
  }, [open, initial, integrations]);

  useEffect(() => {
    if (!runSucceeded || isPending || !showProgress) return;

    const timer = window.setTimeout(() => {
      setRunningValues(null);
      onRunComplete?.();
    }, WORKFLOW_DONE_DISMISS_MS);

    return () => window.clearTimeout(timer);
  }, [runSucceeded, isPending, showProgress, onRunComplete]);

  useEffect(() => {
    if (!open) {
      setRunningValues(null);
    }
  }, [open]);

  function patch<K extends keyof RunSoaFormValues>(
    key: K,
    value: RunSoaFormValues[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit() {
    const values = resolveSubmitValues(form);
    setRunningValues(values);
    onSubmit(values);
  }

  function handleOpenChange(next: boolean) {
    if (!next && isPending) return;
    if (!next && runSucceeded && showProgress) return;
    if (!next) {
      setRunningValues(null);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[90vh] max-w-lg overflow-y-auto"
        onPointerDownOutside={(e) => {
          if (isPending || (runSucceeded && showProgress)) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isPending || (runSucceeded && showProgress)) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-display">
            {showProgress ? "Running SOA" : "Run SOA"}
          </DialogTitle>
        </DialogHeader>

        {showProgress ? (
          <>
            <RunSoaProgressPanel
              steps={liveSteps}
              activeStepIndex={activeStepIndex}
              progress={progressFinishedState ? 100 : progress}
              finished={progressFinishedState || progressFinished}
              failed={progressFailedState || progressFailed}
              errorMessage={errorMessage}
              detail={detail}
            />
            {progressFailedState && (
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setRunningValues(null);
                    onOpenChange(false);
                  }}
                >
                  Close
                </Button>
              </DialogFooter>
            )}
          </>
        ) : (
          <div className="space-y-6 py-2">
            {soaGmailPlan.activeCardCount > 0 ? (
              <p className="text-sm text-muted-foreground">
                {soaGmailPlan.activeCardCount} active card
                {soaGmailPlan.activeCardCount === 1 ? "" : "s"}
                {soaGmailPlan.inboxCount > 0
                  ? ` · ${soaGmailPlan.inboxCount} Gmail inbox${soaGmailPlan.inboxCount === 1 ? "" : "es"}`
                  : ""}
              </p>
            ) : null}
            <div className="space-y-3">
              <Label>Period</Label>
              <RadioGroup
                value={form.mode}
                onValueChange={(v: string) =>
                  patch("mode", v as "single" | "range")
                }
                className="grid grid-cols-1 gap-2 sm:grid-cols-2"
              >
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm",
                    form.mode === "single" && "border-primary bg-primary/5",
                  )}
                >
                  <RadioGroupItem value="single" />
                  Single month
                </label>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm",
                    form.mode === "range" && "border-primary bg-primary/5",
                  )}
                >
                  <RadioGroupItem value="range" />
                  Date range
                </label>
              </RadioGroup>
            </div>

            {form.mode === "single" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <StatementMonthSelect
                  id="single-month"
                  value={form.fromMonth}
                  onChange={(m) => patch("fromMonth", m)}
                />
                <div className="space-y-2">
                  <Label htmlFor="single-year">Year</Label>
                  <Input
                    id="single-year"
                    type="number"
                    value={form.fromYear}
                    onChange={(e) => patch("fromYear", Number(e.target.value))}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <RadioGroup
                  value={form.rangeStyle}
                  onValueChange={(v: string) =>
                    patch("rangeStyle", v as "explicit" | "rolling")
                  }
                  className="space-y-2"
                >
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <RadioGroupItem value="explicit" />
                    From — to
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <RadioGroupItem value="rolling" />
                    Last N months ending at
                  </label>
                </RadioGroup>

                {form.rangeStyle === "explicit" ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <StatementMonthSelect
                      label="From month"
                      value={form.fromMonth}
                      onChange={(m) => patch("fromMonth", m)}
                    />
                    <div className="space-y-2">
                      <Label>From year</Label>
                      <Input
                        type="number"
                        value={form.fromYear}
                        onChange={(e) =>
                          patch("fromYear", Number(e.target.value))
                        }
                      />
                    </div>
                    <StatementMonthSelect
                      label="To month"
                      value={form.toMonth}
                      onChange={(m) => patch("toMonth", m)}
                    />
                    <div className="space-y-2">
                      <Label>To year</Label>
                      <Input
                        type="number"
                        value={form.toYear}
                        onChange={(e) =>
                          patch("toYear", Number(e.target.value))
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>N Months</Label>
                      <Input
                        type="number"
                        min={1}
                        max={60}
                        value={form.monthCount}
                        onChange={(e) =>
                          patch("monthCount", Number(e.target.value))
                        }
                      />
                    </div>
                    <StatementMonthSelect
                      label="End month"
                      value={form.toMonth}
                      onChange={(m) => patch("toMonth", m)}
                    />
                    <div className="space-y-2">
                      <Label>End year</Label>
                      <Input
                        type="number"
                        value={form.toYear}
                        onChange={(e) =>
                          patch("toYear", Number(e.target.value))
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3 rounded-lg border border-border/80 bg-muted/30 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                After run
              </p>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <MessageCircle className="h-4 w-4 text-muted-foreground" />
                  Telegram
                </div>
                <Switch
                  checked={form.notifyTelegram}
                  onCheckedChange={(v) => patch("notifyTelegram", v)}
                  disabled={!connected.has("telegram")}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <Slack className="h-4 w-4 text-muted-foreground" />
                  Slack
                </div>
                <Switch
                  checked={form.notifySlack}
                  onCheckedChange={(v) => patch("notifySlack", v)}
                  disabled={!connected.has("slack")}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="flex items-center gap-1.5">
                    Google Calendar
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                            aria-label="About Google Calendar"
                          >
                            <HelpCircle className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="max-w-xs text-xs leading-relaxed"
                        >
                          {GOOGLE_CALENDAR_HINT}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </span>
                </div>
                <Switch
                  checked={form.createCalendar}
                  onCheckedChange={(v) => patch("createCalendar", v)}
                  disabled={
                    !connected.has("gmail") && !connected.has("google_calendar")
                  }
                />
              </div>
            </div>
          </div>
        )}

        {!showProgress && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>Run</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
