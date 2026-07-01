"use client";

import { CheckCircle2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  formatDueCardTitle,
  type DueEntryListItem,
} from "../lib/reminder-utils";

type MarkPaidChoiceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: DueEntryListItem | null;
  onUploadReceipt: () => void;
  onMarkWithoutReceipt: () => void;
  disabled?: boolean;
};

export function MarkPaidChoiceDialog({
  open,
  onOpenChange,
  entry,
  onUploadReceipt,
  onMarkWithoutReceipt,
  disabled,
}: MarkPaidChoiceDialogProps) {
  const title = entry ? formatDueCardTitle(entry) : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {entry ? `Mark ${title} as paid?` : "Mark as paid?"}
          </DialogTitle>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button
            type="button"
            className="w-full"
            onClick={onUploadReceipt}
            disabled={disabled}
          >
            <Upload className="mr-2 h-4 w-4" />
            Upload receipt
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onMarkWithoutReceipt}
            disabled={disabled}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Mark as done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
