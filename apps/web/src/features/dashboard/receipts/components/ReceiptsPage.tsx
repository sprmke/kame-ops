"use client";

import { useRef, useState } from "react";
import { Receipt, Upload } from "lucide-react";
import { toast } from "sonner";

import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api/client";

import {
  paymentStatusLabel,
  ReceiptAiVerdictBadge,
} from "./ReceiptAiVerdictBadge";

export function ReceiptsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedDueEntryId, setSelectedDueEntryId] = useState<string>("");
  const utils = api.useUtils();

  const { data: receipts, isLoading } = api.receipts.list.useQuery();
  const { data: unpaidDues } = api.receipts.unpaidDueEntries.useQuery();

  const validateAndMarkPaid = api.receipts.validateAndMarkPaid.useMutation({
    onSuccess: (result) => {
      if (result.payment.ok) {
        toast.success(
          `Payment confirmed — •••• ${result.receipt.parsedCardLast4 ?? "????"}`,
        );
      } else if (result.payment.code === "validate_only") {
        toast.message("Receipt validated");
      } else if (result.payment.code === "ai_error") {
        toast.error("AI validation unavailable", {
          description: result.payment.reason,
        });
      } else {
        toast.error(result.payment.reason);
      }
      void utils.receipts.list.invalidate();
      void utils.receipts.unpaidDueEntries.invalidate();
      void utils.reminders.listDue.invalidate();
      void utils.reminders.status.invalidate();
      setUploading(false);
      setSelectedDueEntryId("");
    },
    onError: (e) => {
      toast.error(e.message);
      setUploading(false);
    },
  });

  const confirmMarkPaid = api.receipts.confirmMarkPaid.useMutation({
    onSuccess: () => {
      toast.success("Marked paid");
      void utils.receipts.list.invalidate();
      void utils.receipts.unpaidDueEntries.invalidate();
      void utils.reminders.listDue.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  async function handleFile(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/receipts/upload", {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { storagePath } = (await res.json()) as { storagePath: string };
      validateAndMarkPaid.mutate({
        storagePath,
        originalFileName: file.name,
        dueEntryId: selectedDueEntryId || undefined,
        markPaid: true,
      });
    } catch {
      toast.error("Upload failed");
      setUploading(false);
    }
  }

  const busy = uploading || validateAndMarkPaid.isPending;

  return (
    <div className="space-y-8">
      <DashboardPageHeader
        title="Receipts"
        actions={
          <>
            {unpaidDues && unpaidDues.length > 0 ? (
              <Select
                value={selectedDueEntryId || "__auto__"}
                onValueChange={(v) =>
                  setSelectedDueEntryId(v === "__auto__" ? "" : v)
                }
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Target due" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">Auto-match card</SelectItem>
                  {unpaidDues.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.cardDisplayLabel ?? d.bankLabel} •••• {d.cardLast4} —{" "}
                      {d.dueDateYmd}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload className="mr-2 h-4 w-4" />
              Upload receipt
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner size="lg" />
        </div>
      ) : !receipts?.length ? (
        <EmptyState
          icon={<Receipt className="h-6 w-6 text-muted-foreground" />}
          title="No receipts"
          message="Upload a payment screenshot to validate and mark SOA paid."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {receipts.map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="truncate text-sm font-medium">
                    {r.originalFileName ?? "Receipt"}
                  </CardTitle>
                  <StatusBadge
                    label={paymentStatusLabel(r.paymentStatus)}
                    variant={
                      r.paymentStatus === "marked_paid" ? "success" : "muted"
                    }
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {r.aiVerdict ? (
                  <ReceiptAiVerdictBadge
                    verdict={r.aiVerdict}
                    summary={r.aiSummary}
                  />
                ) : null}
                <div className="space-y-1 text-muted-foreground">
                  {r.parsedCardLast4 && <p>Card •••• {r.parsedCardLast4}</p>}
                  {r.parsedAmountRaw && <p>Amount {r.parsedAmountRaw}</p>}
                  {r.bankDetected && <p>{r.bankDetected}</p>}
                </div>
                {r.paymentStatus === "pending" &&
                r.aiVerdict &&
                r.aiVerdict !== "invalid" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={confirmMarkPaid.isPending}
                    onClick={() => confirmMarkPaid.mutate({ receiptId: r.id })}
                  >
                    Mark paid
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
