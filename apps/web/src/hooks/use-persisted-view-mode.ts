"use client";

import { useEffect, useState } from "react";

import type { ViewMode } from "@/components/shared/ViewToggle";

export function usePersistedViewMode(storageKey: string) {
  const [viewMode, setViewModeState] = useState<ViewMode>("table");

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored === "grid" || stored === "table") {
      setViewModeState(stored);
    }
  }, [storageKey]);

  function setViewMode(mode: ViewMode) {
    setViewModeState(mode);
    localStorage.setItem(storageKey, mode);
  }

  return { viewMode, setViewMode };
}
