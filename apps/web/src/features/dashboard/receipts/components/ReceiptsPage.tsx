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
import { api } from "@/lib/api/client";

export function ReceiptsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const utils = api.useUtils();
  const { data: receipts, isLoading } = api.receipts.list.useQuery();

  const processOcr = api.receipts.processOcr.useMutation({
    onSuccess: (r) => {
      toast.success(
        r.parsed.cardLast4
          ? `Detected card •••• ${r.parsed.cardLast4}, amount ${r.parsed.amountRaw ?? "—"}`
          : "Receipt processed",
      );
      void utils.receipts.list.invalidate();
      setUploading(false);
    },
    onError: (e) => {
      toast.error(e.message);
      setUploading(false);
    },
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
      processOcr.mutate({ storagePath, originalFileName: file.name });
    } catch {
      toast.error("Upload failed");
      setUploading(false);
    }
  }

  return (
    <div className="space-y-8">
      <DashboardPageHeader
        title="Receipts"
        description="Upload payment receipts for OCR. Use with mark-paid workflows via Telegram or dashboard."
        actions={
          <>
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
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={uploading || processOcr.isPending}
            >
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
          message="Upload a payment screenshot or PDF to extract card last-4 and amount via OCR."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {receipts.map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">
                    {r.originalFileName ?? "Receipt"}
                  </CardTitle>
                  <StatusBadge label={r.status ?? "pending"} variant="muted" />
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {r.parsedCardLast4 && <p>Card •••• {r.parsedCardLast4}</p>}
                {r.parsedAmount && <p>Amount {r.parsedAmount}</p>}
                {r.bankDetected && <p>Bank {r.bankDetected}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
