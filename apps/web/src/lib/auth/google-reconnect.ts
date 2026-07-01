export const GOOGLE_RECONNECT_ERROR_CODE = "GOOGLE_RECONNECT_REQUIRED";

export function isGoogleReconnectRequiredMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    /invalid_grant/.test(normalized) ||
    /google oauth failed/.test(normalized) ||
    /gmail is not connected/.test(normalized) ||
    (/sign in/.test(normalized) &&
      (/gmail/.test(normalized) || /google/.test(normalized))) ||
    /reconnect google/.test(normalized) ||
    /grant gmail/.test(normalized) ||
    /refresh token expired/.test(normalized) ||
    /token has been expired or revoked/.test(normalized)
  );
}

export function isGoogleReconnectRequiredError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const record = error as {
    message?: string;
    data?: { code?: string };
    shape?: { data?: { code?: string } };
  };

  if (record.data?.code === GOOGLE_RECONNECT_ERROR_CODE) return true;
  if (record.shape?.data?.code === GOOGLE_RECONNECT_ERROR_CODE) return true;

  const message = record.message;
  return (
    typeof message === "string" && isGoogleReconnectRequiredMessage(message)
  );
}
