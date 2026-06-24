"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api/client";

import type { RunSoaSettled } from "../components/RunSoaDialog";
import {
  toRunSoaPipelineInput,
  type RunSoaFormValues,
} from "../lib/run-soa-progress";

interface SoaRunPipelineResult {
  ok: boolean;
  periodId?: string | null;
  message?: string;
  warning?: string;
  parsedCount?: number;
}

export interface UseSoaRunDialogOptions {
  initial?: Partial<RunSoaFormValues>;
  onRunSuccess?: (result: SoaRunPipelineResult) => void | Promise<void>;
  onAfterRunComplete?: (periodId: string | null) => void;
}

export function useSoaRunDialog(options: UseSoaRunDialogOptions = {}) {
  const [runOpen, setRunOpen] = useState(false);
  const [runInitial, setRunInitial] = useState<
    Partial<RunSoaFormValues> | undefined
  >();
  const [runSettled, setRunSettled] = useState<RunSoaSettled>(null);
  const [runErrorMessage, setRunErrorMessage] = useState<string | null>(null);
  const lastPeriodIdRef = useRef<string | null>(null);

  const runPipeline = api.soa.runPipeline.useMutation({
    onSuccess: async (result) => {
      if (!result.ok) {
        setRunErrorMessage(result.message ?? "SOA run failed");
        setRunSettled("error");
        toast.error(result.message ?? "SOA run failed", { duration: 15000 });
        return;
      }

      lastPeriodIdRef.current = result.periodId ?? null;
      setRunSettled("success");
      if (result.warning) {
        toast.warning(result.warning, { duration: 20000 });
      } else if ((result.parsedCount ?? 1) === 0) {
        toast.warning("SOA run finished with no parsed statements.", {
          duration: 12000,
        });
      } else {
        toast.success("SOA run complete");
      }
      await options.onRunSuccess?.(result);
    },
    onError: (error) => {
      setRunErrorMessage(error.message);
      setRunSettled("error");
      toast.error(error.message);
    },
  });

  function handleRunDialogOpenChange(open: boolean) {
    setRunOpen(open);
    if (!open) {
      setRunSettled(null);
      setRunErrorMessage(null);
      lastPeriodIdRef.current = null;
    }
  }

  function handleRunComplete() {
    const periodId = lastPeriodIdRef.current;
    setRunOpen(false);
    setRunSettled(null);
    setRunErrorMessage(null);
    lastPeriodIdRef.current = null;
    options.onAfterRunComplete?.(periodId);
  }

  function openRun(initial?: Partial<RunSoaFormValues>) {
    setRunInitial(initial);
    setRunOpen(true);
  }

  return {
    runOpen,
    setRunOpen,
    openRun,
    runPipeline,
    runDialogProps: {
      open: runOpen,
      onOpenChange: handleRunDialogOpenChange,
      initial: runInitial ?? options.initial,
      isPending: runPipeline.isPending,
      settled: runSettled,
      errorMessage: runErrorMessage,
      onRunComplete: handleRunComplete,
      onSubmit: (values: RunSoaFormValues) => {
        setRunSettled(null);
        setRunErrorMessage(null);
        runPipeline.mutate(toRunSoaPipelineInput(values));
      },
    },
  };
}
