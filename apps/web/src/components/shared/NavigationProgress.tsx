"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils/cn";
import { NAV_PROGRESS_START } from "@/lib/navigation-progress";

function NavigationProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRoute = useRef(true);
  const routeKey = `${pathname}?${searchParams.toString()}`;

  const clearTimers = useCallback(() => {
    if (trickleRef.current) {
      clearInterval(trickleRef.current);
      trickleRef.current = null;
    }
    if (hideRef.current) {
      clearTimeout(hideRef.current);
      hideRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    clearTimers();
    setVisible(true);
    setProgress((value) => (value > 0 ? value : 10));
    trickleRef.current = setInterval(() => {
      setProgress((value) => {
        if (value >= 92) return value;
        const step = Math.max(0.5, (92 - value) * 0.1);
        return Math.min(92, value + step);
      });
    }, 180);
  }, [clearTimers]);

  const complete = useCallback(() => {
    clearTimers();
    setProgress(100);
    hideRef.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 280);
  }, [clearTimers]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (isFirstRoute.current) {
      isFirstRoute.current = false;
      return;
    }
    complete();
  }, [routeKey, complete, mounted]);

  useEffect(() => {
    if (!mounted) return;

    const onStart = () => start();

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const anchor = (event.target as Element).closest("a");
      if (!anchor?.href) return;
      if (anchor.target === "_blank") return;
      if (anchor.hasAttribute("download")) return;
      if (anchor.getAttribute("data-no-nav-progress") != null) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;

      const next = `${url.pathname}${url.search}`;
      const current = `${window.location.pathname}${window.location.search}`;
      if (next === current) return;

      start();
    };

    const onPopState = () => start();

    window.addEventListener(NAV_PROGRESS_START, onStart);
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener(NAV_PROGRESS_START, onStart);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      clearTimers();
    };
  }, [start, clearTimers, mounted]);

  if (!mounted || (!visible && progress === 0)) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999]"
      aria-hidden
    >
      <div
        className={cn(
          "h-[3px] origin-left bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.45)] transition-[width,opacity] duration-200 ease-out",
          progress >= 100 && "opacity-0 duration-300",
        )}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressBar />
    </Suspense>
  );
}
