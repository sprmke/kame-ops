"use client";

import { useState } from "react";
import { Zap, Play, History } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { api } from "@/lib/api/client";

const JOB_TYPES = [
  { value: "run_soa_pipeline", label: "Run SOA pipeline" },
  { value: "send_due_reminders", label: "Send due reminders" },
] as const;

export function AutomationsPage() {
  const utils = api.useUtils();
  const { data: jobs, isLoading } = api.automations.list.useQuery();
  const create = api.automations.create.useMutation({
    onSuccess: () => {
      toast.success("Automation created");
      void utils.automations.list.invalidate();
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const run = api.automations.run.useMutation({
    onSuccess: () => {
      toast.success("Job completed");
      void utils.automations.list.invalidate();
      void utils.overview.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState("0 8 * * *");
  const [jobType, setJobType] =
    useState<(typeof JOB_TYPES)[number]["value"]>("send_due_reminders");

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <DashboardPageHeader
        title="Automations"
        description="Schedule SOA runs and daily reminders. Wire cron to /api/cron/* with your CRON_SECRET."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Zap className="mr-2 h-4 w-4" />
                New automation
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create automation</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  create.mutate({ name, schedule, jobType });
                }}
              >
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cron schedule</Label>
                  <Input
                    value={schedule}
                    onChange={(e) => setSchedule(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    e.g. 0 8 * * * = daily at 8:00
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Job type</Label>
                  <Select
                    value={jobType}
                    onValueChange={(v) => setJobType(v as typeof jobType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {JOB_TYPES.map((j) => (
                        <SelectItem key={j.value} value={j.value}>
                          {j.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="submit"
                  disabled={create.isPending}
                  className="w-full"
                >
                  Create
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {!jobs?.length ? (
        <EmptyState
          icon={<Zap className="h-6 w-6 text-muted-foreground" />}
          title="No automations"
          message="Create a job to run SOA or reminders on a schedule via external cron."
        />
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <Card key={job.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
                <div>
                  <CardTitle className="text-base">{job.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {job.jobType} ·{" "}
                    <code className="text-xs">{job.schedule}</code>
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => run.mutate({ jobId: job.id })}
                  disabled={run.isPending}
                >
                  <Play className="mr-1 h-3 w-3" />
                  Run now
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {job.lastRunAt && (
                  <p className="text-xs text-muted-foreground">
                    Last run{" "}
                    {formatDistanceToNow(new Date(job.lastRunAt), {
                      addSuffix: true,
                    })}
                  </p>
                )}
                {job.runs?.length ? (
                  <div className="rounded-lg border border-border bg-muted/20 p-3">
                    <p className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      <History className="h-3 w-3" />
                      Recent runs
                    </p>
                    <ul className="space-y-2">
                      {job.runs.map((r) => (
                        <li key={r.id} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span>
                              {formatDistanceToNow(new Date(r.startedAt), {
                                addSuffix: true,
                              })}
                            </span>
                            <StatusBadge
                              label={r.status}
                              variant={
                                r.status === "completed"
                                  ? "success"
                                  : r.status === "failed"
                                    ? "destructive"
                                    : "muted"
                              }
                            />
                          </div>
                          {r.errorMessage && (
                            <p className="text-xs text-destructive">
                              {r.errorMessage}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
