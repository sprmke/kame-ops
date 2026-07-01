"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { inferRouterOutputs } from "@trpc/server";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_AUTOMATION_SCHEDULE,
  PAYMENT_REMINDERS_SCHEDULE_NOTE,
} from "@/lib/automations/defaults";
import {
  AUTOMATION_JOB_TYPE_OPTIONS,
  defaultAutomationName,
  isManagedAutomationJobType,
  type AutomationJobType,
} from "@/lib/automations/job-types";
import {
  lockScheduleToDaily,
  readScheduleConfigFromJob,
  type AutomationScheduleInput,
} from "@/lib/automations/schedule";
import { api } from "@/lib/api/client";
import type { AppRouter } from "@/server/routers/_app";

import { AutomationScheduleFields } from "./AutomationScheduleFields";

type AutomationJob =
  inferRouterOutputs<AppRouter>["automations"]["list"][number];

type AutomationFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job?: AutomationJob | null;
};

const DEFAULT_SCHEDULE: AutomationScheduleInput = DEFAULT_AUTOMATION_SCHEDULE;

export function AutomationFormDialog({
  open,
  onOpenChange,
  job,
}: AutomationFormDialogProps) {
  const utils = api.useUtils();
  const isEdit = Boolean(job);

  const [name, setName] = useState("");
  const [jobType, setJobType] = useState<AutomationJobType>("run_soa_pipeline");
  const [schedule, setSchedule] =
    useState<AutomationScheduleInput>(DEFAULT_SCHEDULE);

  useEffect(() => {
    if (!open) return;
    if (job) {
      setName(job.name);
      setJobType(job.jobType as AutomationJobType);
      setSchedule(readScheduleConfigFromJob(job));
      return;
    }
    setName(defaultAutomationName("run_soa_pipeline"));
    setJobType("run_soa_pipeline");
    setSchedule(DEFAULT_SCHEDULE);
  }, [open, job]);

  const create = api.automations.create.useMutation({
    onSuccess: () => {
      toast.success("Automation created");
      void utils.automations.list.invalidate();
      void utils.overview.stats.invalidate();
      onOpenChange(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const update = api.automations.update.useMutation({
    onSuccess: () => {
      toast.success("Automation updated");
      void utils.automations.list.invalidate();
      void utils.overview.stats.invalidate();
      onOpenChange(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const isPending = create.isPending || update.isPending;
  const isRemindersJob = job?.jobType === "send_due_reminders";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit automation" : "Create automation"}
          </DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const payload = {
              name: name.trim() || defaultAutomationName(jobType),
              jobType,
              schedule: isRemindersJob
                ? lockScheduleToDaily(schedule)
                : schedule,
            };
            if (job) {
              update.mutate({ jobId: job.id, ...payload });
              return;
            }
            create.mutate(payload);
          }}
        >
          {!isEdit && (
            <div className="space-y-2">
              <Label>What should run?</Label>
              <Select
                value={jobType}
                onValueChange={(value) => {
                  const nextType = value as AutomationJobType;
                  setJobType(nextType);
                  setName(defaultAutomationName(nextType));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTOMATION_JOB_TYPE_OPTIONS.filter(
                    (option) => !isManagedAutomationJobType(option.value),
                  ).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={name}
              disabled={isRemindersJob}
              onChange={(event) => setName(event.target.value)}
              placeholder={defaultAutomationName(jobType)}
            />
          </div>

          <AutomationScheduleFields
            value={schedule}
            onChange={setSchedule}
            dailyOnly={isRemindersJob}
            dailyOnlyNote={PAYMENT_REMINDERS_SCHEDULE_NOTE}
          />

          <Button type="submit" disabled={isPending} className="w-full">
            {isEdit ? "Save changes" : "Create"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
