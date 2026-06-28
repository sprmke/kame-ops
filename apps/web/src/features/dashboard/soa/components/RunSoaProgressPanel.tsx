"use client";

import { FileText } from "lucide-react";

import { WorkflowProgressPanel } from "@/components/shared/WorkflowProgressPanel";

import type { RunSoaProgressStep } from "../lib/run-soa-progress";

type RunSoaProgressPanelProps = {
  steps: RunSoaProgressStep[];
  activeStepIndex: number;
  progress: number;
  finished?: boolean;
  failed?: boolean;
  errorMessage?: string | null;
  detail?: string | null;
};

export function RunSoaProgressPanel(props: RunSoaProgressPanelProps) {
  return (
    <WorkflowProgressPanel
      {...props}
      icon={FileText}
      doneTitle="All done"
      failedTitle="Run failed"
    />
  );
}
