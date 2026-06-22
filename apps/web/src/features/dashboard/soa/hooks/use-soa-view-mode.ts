"use client";

import { useEffect, useState } from "react";

import type { ViewMode } from "@/components/shared/ViewToggle";

const STORAGE_KEY = "kame-ops:soa-view-mode";

export function useSoaViewMode() {
  const [viewMode, setViewModeState] = useState<ViewMode>("table");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "grid" || stored === "table") {
      setViewModeState(stored);
    }
  }, []);

  function setViewMode(mode: ViewMode) {
    setViewModeState(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }

  return { viewMode, setViewMode };
}
