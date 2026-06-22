"use client";

import { useEffect, useState } from "react";
import { Calendar, MessageCircle, Slack } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api/client";

type EditSoaPeriodDialogProps = {
  periodId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EditSoaPeriodDialog({
  periodId,
  open,
  onOpenChange,
}: EditSoaPeriodDialogProps) {
  const utils = api.useUtils();
  const { data: period } = api.soa.getPeriod.useQuery(
    { periodId: periodId! },
    { enabled: !!periodId && open },
  );

  const [notifyTelegram, setNotifyTelegram] = useState(true);
  const [notifySlack, setNotifySlack] = useState(true);
  const [createCalendar, setCreateCalendar] = useState(false);

  useEffect(() => {
    if (!period) return;
    setNotifyTelegram(period.notifyTelegram);
    setNotifySlack(period.notifySlack);
    setCreateCalendar(period.createCalendar);
  }, [period]);

  const update = api.soa.updatePeriod.useMutation({
    onSuccess: () => {
      toast.success("Settings saved");
      void utils.soa.listPeriods.invalidate();
      if (periodId) void utils.soa.getPeriod.invalidate({ periodId });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Edit SOA run</DialogTitle>
        </DialogHeader>
        {period && (
          <p className="text-sm text-muted-foreground">{period.label}</p>
        )}
        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between gap-3">
            <Label className="flex items-center gap-2 font-normal">
              <MessageCircle className="h-4 w-4" />
              Telegram on next run
            </Label>
            <Switch
              checked={notifyTelegram}
              onCheckedChange={setNotifyTelegram}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label className="flex items-center gap-2 font-normal">
              <Slack className="h-4 w-4" />
              Slack on next run
            </Label>
            <Switch checked={notifySlack} onCheckedChange={setNotifySlack} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label className="flex items-center gap-2 font-normal">
              <Calendar className="h-4 w-4" />
              Google Calendar on next run
            </Label>
            <Switch
              checked={createCalendar}
              onCheckedChange={setCreateCalendar}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!periodId || update.isPending}
            onClick={() =>
              periodId &&
              update.mutate({
                periodId,
                notifyTelegram,
                notifySlack,
                createCalendar,
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
