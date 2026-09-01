function splitAccountScopedMessage(raw: string): {
  accountLabel?: string;
  errorText: string;
} {
  const colonIndex = raw.indexOf(": ");
  if (colonIndex <= 0 || colonIndex > 120) {
    return { errorText: raw };
  }

  const prefix = raw.slice(0, colonIndex).trim();
  if (!prefix.includes("@")) {
    return { errorText: raw };
  }

  return {
    accountLabel: prefix,
    errorText: raw.slice(colonIndex + 2).trim(),
  };
}

/** Plain-language reason for the reconnect Gmail modal. */
export function formatGoogleReconnectReason(message: string | null): string {
  if (!message?.trim()) {
    return "KameOps can't read Gmail right now. Sign in with Google again to fetch statement emails.";
  }

  const { accountLabel, errorText } = splitAccountScopedMessage(message.trim());
  const normalized = errorText.toLowerCase();
  const forAccount = accountLabel ? ` for ${accountLabel}` : "";

  if (
    /gmail is not connected|not connected|connect a google account|sign in with google to grant/.test(
      normalized,
    )
  ) {
    return accountLabel
      ? `${accountLabel} isn't connected. Sign in with Google to fetch statement emails.`
      : "Gmail isn't connected yet. Sign in with Google to fetch statement emails.";
  }

  if (
    /invalid_grant|refresh token expired|token has been expired or revoked|expired or revoked|google oauth failed/.test(
      normalized,
    )
  ) {
    return `Your Google sign-in${forAccount} expired or was revoked. Sign in again to restore Gmail access.`;
  }

  if (/gmail\.readonly|scope|grant gmail|missing gmail/.test(normalized)) {
    return `Gmail access${forAccount} is incomplete. Sign in again and allow Gmail permissions.`;
  }

  if (/reconnect google|reconnect gmail/.test(normalized)) {
    return `Gmail access${forAccount} needs to be refreshed. Sign in with Google again.`;
  }

  return accountLabel
    ? `Gmail for ${accountLabel} isn't working. Sign in with Google again.`
    : "Gmail isn't working right now. Sign in with Google again.";
}
