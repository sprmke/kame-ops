"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { RunSoaProgressStep } from "../lib/run-soa-progress";
import { estimateRunDurationMs } from "../lib/run-soa-progress";

/** Progress aligned to the visible step list (not a separate time curve). */
function progressFromElapsed(
  steps: RunSoaProgressStep[],
  elapsedMs: number,
  durationMs: number,
  capPercent: number,
): { activeStepIndex: number; progress: number } {
  const count = Math.max(1, steps.length);
  const ratio = Math.min(elapsedMs / durationMs, capPercent / 100);
  const rawStep = ratio * count;
  const activeStepIndex = Math.min(count - 1, Math.floor(rawStep));
  const partial = rawStep - activeStepIndex;
  const progress = Math.min(
    capPercent,
    Math.round(((activeStepIndex + partial) / count) * 100),
  );

  return { activeStepIndex, progress };
}

export function useRunSoaProgress(
  active: boolean,
  steps: RunSoaProgressStep[],
  monthSpan: number,
) {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [finished, setFinished] = useState(false);
  const wasActive = useRef(false);

  const durationMs = useMemo(
    () => estimateRunDurationMs(steps.length, monthSpan),
    [steps.length, monthSpan],
  );

  useEffect(() => {
    if (active) {
      wasActive.current = true;
      setFinished(false);
      setActiveStepIndex(0);
      setProgress(0);

      const startedAt = Date.now();
      const tickMs = 250;

      const interval = window.setInterval(() => {
        const elapsed = Date.now() - startedAt;
        const next = progressFromElapsed(steps, elapsed, durationMs, 92);
        setActiveStepIndex(next.activeStepIndex);
        setProgress(next.progress);
      }, tickMs);

      return () => window.clearInterval(interval);
    }

    if (wasActive.current) {
      setFinished(true);
      setProgress(100);
      setActiveStepIndex(Math.max(0, steps.length - 1));
      wasActive.current = false;
      return;
    }

    setActiveStepIndex(0);
    setProgress(0);
    setFinished(false);
    return undefined;
  }, [active, durationMs, steps]);

  const currentStep = steps[activeStepIndex] ?? steps[0];

  return {
    activeStepIndex,
    progress,
    finished,
    currentStep,
  };
}
