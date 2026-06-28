"use client";

import { useMemo, useRef, useState } from "react";
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
  ReceiptUploadProgressDialog,
  type ReceiptUploadSettled,
} from "./ReceiptUploadProgressDialog";
import {
  paymentStatusLabel,
  ReceiptAiVerdictBadge,
} from "./ReceiptAiVerdictBadge";

export function ReceiptsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedDueEntryId, setSelectedDueEntryId] = useState<string>("");
  const [progressOpen, setProgressOpen] = useState(false);
  const [activeProcessId, setActiveProcessId] = useState<string | null>(null);
  const [uploadSettled, setUploadSettled] =
    useState<ReceiptUploadSettled>(null);
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(
    null,
  );
  const [isUploading, setIsUploading] = useState(false);
  const utils = api.useUtils();

  const { data: receipts, isLoading } = api.receipts.list.useQuery();
  const { data: unpaidDues } = api.receipts.unpaidDueEntries.useQuery();
  const { data: integrations } = api.integrations.list.useQuery();

  const connected = useMemo(
    () => new Set(integrations?.map((i) => i.provider) ?? []),
    [integrations],
  );

  const uploadOptions = useMemo(
    () => ({
      markPaid: true,
      updateCalendar:
        connected.has("gmail") || connected.has("google_calendar"),
    }),
    [connected],
  );

  const validateAndMarkPaid = api.receipts.validateAndMarkPaid.useMutation({
    onSuccess: (result) => {
      if (result.payment.ok) {
        setUploadSettled("success");
        toast.success(
          `Payment confirmed — •••• ${result.receipt.parsedCardLast4 ?? "????"}`,
        );
      } else if (result.payment.code === "validate_only") {
        setUploadSettled("success");
        toast.message("Receipt validated");
      } else if (result.payment.code === "ai_error") {
        setUploadErrorMessage(result.payment.reason);
        setUploadSettled("error");
        toast.error("AI validation unavailable", {
          description: result.payment.reason,
        });
      } else {
        setUploadErrorMessage(result.payment.reason);
        setUploadSettled("error");
        toast.error(result.payment.reason);
      }
      void utils.receipts.list.invalidate();
      void utils.receipts.unpaidDueEntries.invalidate();
      void utils.reminders.listDue.invalidate();
      void utils.reminders.status.invalidate();
      setIsUploading(false);
      setSelectedDueEntryId("");
    },
    onError: (e) => {
      setUploadErrorMessage(e.message);
      setUploadSettled("error");
      toast.error(e.message);
      setIsUploading(false);
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
    const processId = crypto.randomUUID();
    setActiveProcessId(processId);
    setUploadSettled(null);
    setUploadErrorMessage(null);
    setProgressOpen(true);
    setIsUploading(true);

    const form = new FormData();
    form.append("file", file);
    form.append("processId", processId);
    form.append("markPaid", "true");
    form.append(
      "updateCalendar",
      uploadOptions.updateCalendar ? "true" : "false",
    );

    try {
      const res = await fetch("/api/receipts/upload", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Upload failed");
      }
      const { storagePath } = (await res.json()) as { storagePath: string };
      validateAndMarkPaid.mutate({
        storagePath,
        originalFileName: file.name,
        dueEntryId: selectedDueEntryId || undefined,
        markPaid: true,
        processId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      setUploadErrorMessage(message);
      setUploadSettled("error");
      toast.error(message);
      setIsUploading(false);
    }
  }

  function handleProgressComplete() {
    setProgressOpen(false);
    setActiveProcessId(null);
    setUploadSettled(null);
    setUploadErrorMessage(null);
  }

  function handleProgressOpenChange(open: boolean) {
    if (!open && (isUploading || validateAndMarkPaid.isPending)) return;
    if (!open && uploadSettled === "success") return;
    if (!open) {
      handleProgressComplete();
    } else {
      setProgressOpen(open);
    }
  }

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
                e.target.value = "";
              }}
            />
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={isUploading || validateAndMarkPaid.isPending}
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload receipt
            </Button>
          </>
        }
      />

      <ReceiptUploadProgressDialog
        open={progressOpen}
        onOpenChange={handleProgressOpenChange}
        processId={activeProcessId}
        options={uploadOptions}
        isPending={isUploading || validateAndMarkPaid.isPending}
        settled={uploadSettled}
        errorMessage={uploadErrorMessage}
        onComplete={handleProgressComplete}
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
