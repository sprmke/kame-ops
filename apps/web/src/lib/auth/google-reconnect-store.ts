import { isGoogleReconnectRequiredError } from "@/lib/auth/google-reconnect";

type GoogleReconnectSnapshot = {
  open: boolean;
  message: string | null;
};

type Listener = () => void;

const CLOSED_SNAPSHOT: GoogleReconnectSnapshot = { open: false, message: null };

let snapshot: GoogleReconnectSnapshot = CLOSED_SNAPSHOT;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeGoogleReconnect(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getGoogleReconnectSnapshot(): GoogleReconnectSnapshot {
  return snapshot;
}

/** Stable snapshot for useSyncExternalStore SSR — must not allocate per call. */
export function getGoogleReconnectServerSnapshot(): GoogleReconnectSnapshot {
  return CLOSED_SNAPSHOT;
}

export function openGoogleReconnectModal(message?: string | null): void {
  snapshot = {
    open: true,
    message: message?.trim() || null,
  };
  emit();
}

export function closeGoogleReconnectModal(): void {
  if (!snapshot.open && !snapshot.message) return;
  snapshot = CLOSED_SNAPSHOT;
  emit();
}

export function notifyGoogleReconnectRequired(error: unknown): void {
  if (!isGoogleReconnectRequiredError(error)) return;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error !== null &&
          "message" in error &&
          typeof (error as { message: unknown }).message === "string"
        ? (error as { message: string }).message
        : null;
  openGoogleReconnectModal(message);
}
