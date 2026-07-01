import { isGoogleReconnectRequiredError } from "@/lib/auth/google-reconnect";

type GoogleReconnectSnapshot = {
  open: boolean;
  message: string | null;
};

type Listener = () => void;

let snapshot: GoogleReconnectSnapshot = { open: false, message: null };
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

export function openGoogleReconnectModal(message?: string | null): void {
  snapshot = {
    open: true,
    message: message?.trim() || null,
  };
  emit();
}

export function closeGoogleReconnectModal(): void {
  if (!snapshot.open && !snapshot.message) return;
  snapshot = { open: false, message: null };
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
