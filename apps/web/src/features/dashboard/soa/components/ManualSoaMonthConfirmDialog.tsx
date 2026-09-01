"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { closestMonthInRange } from "@/lib/soa/calendar-month";
import { formatSoaPeriodLabel } from "@/lib/soa/period";

import type { ManualSoaConfirmPending } from "../hooks/use-soa-manual-upload";

type ManualSoaMonthConfirmDialogProps = {
  pending: ManualSoaConfirmPending | null;
  onSkip: () => void;
  onForce: (month: number, year: number) => void;
  onSaveDetected: () => void;
};

export function ManualSoaMonthConfirmDialog({
  pending,
  onSkip,
  onForce,
  onSaveDetected,
}: ManualSoaMonthConfirmDialogProps) {
  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) onSkip();
      }}
    >
      <DialogContent>
        {pending ? (
          <ConfirmBody
            key={`${pending.fileName}-${pending.reason}`}
            pending={pending}
            onSkip={onSkip}
            onForce={onForce}
            onSaveDetected={onSaveDetected}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ConfirmBody({
  pending,
  onSkip,
  onForce,
  onSaveDetected,
}: {
  pending: ManualSoaConfirmPending;
  onSkip: () => void;
  onForce: (month: number, year: number) => void;
  onSaveDetected: () => void;
}) {
  const defaultMonth =
    closestMonthInRange(pending.detected, pending.periodMonths) ??
    pending.periodMonths[0] ??
    null;
  const [forced, setForced] = useState(
    defaultMonth ? `${defaultMonth.year}-${defaultMonth.month}` : "",
  );
  const selected =
    pending.periodMonths.find((m) => `${m.year}-${m.month}` === forced) ??
    defaultMonth;

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {pending.reason === "unknown_month"
            ? "Choose statement month"
            : "Month does not match"}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4 text-sm">
        <p className="text-foreground">
          {pending.preview.bankLabel} ···· {pending.preview.cardLast4}
        </p>
        {pending.detected && (
          <p className="text-muted-foreground">
            Detected{" "}
            {formatSoaPeriodLabel(
              pending.detected.month,
              pending.detected.year,
            )}
          </p>
        )}
        <p className="text-muted-foreground">{pending.periodLabel}</p>
        {pending.periodMonths.length > 0 && (
          <Select value={forced} onValueChange={setForced}>
            <SelectTrigger aria-label="Attach to month">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pending.periodMonths.map((m) => (
                <SelectItem
                  key={`${m.year}-${m.month}`}
                  value={`${m.year}-${m.month}`}
                >
                  {formatSoaPeriodLabel(m.month, m.year)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <DialogFooter className="flex-col gap-2 sm:flex-row">
        <Button variant="outline" onClick={onSkip}>
          Skip
        </Button>
        {pending.detected && pending.reason === "out_of_range" && (
          <Button variant="outline" onClick={onSaveDetected}>
            Save detected
          </Button>
        )}
        <Button
          onClick={() => {
            if (!selected) return;
            onForce(selected.month, selected.year);
          }}
          disabled={!selected}
        >
          Attach
        </Button>
      </DialogFooter>
    </>
  );
}
