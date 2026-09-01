import { formatGoogleReconnectReason } from "@/lib/auth/google-reconnect-message";
import { isGoogleReconnectRequiredMessage } from "@/lib/auth/google-reconnect";

const DEFAULT_ERROR = "Something went wrong. Try again.";

/** Plain-language error text for cards, toasts, and progress dialogs. */
export function formatUserFacingErrorMessage(
  message: string | null | undefined,
): string {
  const trimmed = message?.trim();
  if (!trimmed) return DEFAULT_ERROR;

  if (isGoogleReconnectRequiredMessage(trimmed)) {
    return formatGoogleReconnectReason(trimmed);
  }

  const withoutFix = trimmed.split(/\.\s*Fix:/i)[0]?.trim();
  const primary = (withoutFix ?? trimmed).split("\n")[0]?.trim() ?? trimmed;
  const sentence = primary.endsWith(".") ? primary : `${primary}.`;

  return sentence.length > 200 ? `${sentence.slice(0, 197)}…` : sentence;
}
