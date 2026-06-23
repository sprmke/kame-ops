"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { RunSoaProgressStep } from "../lib/run-soa-progress";
import { estimateRunDurationMs } from "../lib/run-soa-progress";

/** Progress aligned to the visible step list (not a separate time curve). */
function progressFromElapsed(
  steps: RunSoaProgressStep[],
  elapsedMs: number,
  durationMs: number,
): { activeStepIndex: number; progress: number; pastEstimate: boolean } {
  const count = Math.max(1, steps.length);
  const pastEstimate = elapsedMs >= durationMs;

  // Reach the last step quickly, then creep toward 99% while the server finishes.
  const ratio = pastEstimate
    ? 0.92 + Math.min(0.07, (elapsedMs - durationMs) / durationMs / 10)
    : Math.min(elapsedMs / durationMs, 0.92);

  const rawStep = ratio * count;
  const activeStepIndex = Math.min(count - 1, Math.floor(rawStep));
  const partial = rawStep - activeStepIndex;
  const progress = Math.min(
    99,
    Math.round(((activeStepIndex + partial) / count) * 100),
  );

  return { activeStepIndex, progress, pastEstimate };
}

export function useRunSoaProgress(
  active: boolean,
  steps: RunSoaProgressStep[],
  monthSpan: number,
  forceComplete = false,
) {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [finishedVisual, setFinishedVisual] = useState(false);
  const [pastEstimate, setPastEstimate] = useState(false);
  const wasActive = useRef(false);

  const durationMs = useMemo(
    () => estimateRunDurationMs(steps.length, monthSpan),
    [steps.length, monthSpan],
  );

  useEffect(() => {
    if (forceComplete) {
      setFinishedVisual(true);
      setProgress(100);
      setActiveStepIndex(Math.max(0, steps.length - 1));
      setPastEstimate(false);
      return;
    }

    if (active) {
      wasActive.current = true;
      setFinishedVisual(false);
      setActiveStepIndex(0);
      setProgress(0);
      setPastEstimate(false);

      const startedAt = Date.now();
      const tickMs = 250;

      const interval = window.setInterval(() => {
        const elapsed = Date.now() - startedAt;
        const next = progressFromElapsed(steps, elapsed, durationMs);
        setActiveStepIndex(next.activeStepIndex);
        setProgress(next.progress);
        setPastEstimate(next.pastEstimate);
      }, tickMs);

      return () => window.clearInterval(interval);
    }

    if (wasActive.current) {
      setFinishedVisual(true);
      setProgress(100);
      setActiveStepIndex(Math.max(0, steps.length - 1));
      setPastEstimate(false);
      wasActive.current = false;
      return;
    }

    setActiveStepIndex(0);
    setProgress(0);
    setPastEstimate(false);
    return undefined;
  }, [active, durationMs, forceComplete, steps]);

  const currentStep = steps[activeStepIndex] ?? steps[0];

  return {
    activeStepIndex,
    progress: forceComplete ? 100 : progress,
    finished: forceComplete || finishedVisual,
    pastEstimate: active && pastEstimate && !forceComplete,
    currentStep,
  };
}
