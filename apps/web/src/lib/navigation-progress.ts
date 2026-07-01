export const NAV_PROGRESS_START = "kame:navigation-progress-start";

export function startNavigationProgress() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NAV_PROGRESS_START));
}
