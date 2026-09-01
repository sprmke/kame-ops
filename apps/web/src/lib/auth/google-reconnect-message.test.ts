import { describe, expect, test } from "vitest";

import { formatGoogleReconnectReason } from "./google-reconnect-message";

describe("formatGoogleReconnectReason", () => {
  test("default when message is missing", () => {
    expect(formatGoogleReconnectReason(null)).toBe(
      "KameOps can't read Gmail right now. Sign in with Google again to fetch statement emails.",
    );
  });

  test("not connected", () => {
    expect(
      formatGoogleReconnectReason(
        "Gmail is not connected. Connect a Google account in Settings.",
      ),
    ).toBe(
      "Gmail isn't connected yet. Sign in with Google to fetch statement emails.",
    );
  });

  test("expired token with account label", () => {
    expect(
      formatGoogleReconnectReason(
        "Jane Doe (jane@gmail.com): Google OAuth failed: invalid_grant (refresh token expired, revoked, or not valid for this OAuth client).",
      ),
    ).toBe(
      "Your Google sign-in for Jane Doe (jane@gmail.com) expired or was revoked. Sign in again to restore Gmail access.",
    );
  });

  test("missing gmail scope", () => {
    expect(
      formatGoogleReconnectReason(
        "Gmail token is missing gmail.readonly scope. Reconnect the affected Google account in Settings.",
      ),
    ).toBe(
      "Gmail access is incomplete. Sign in again and allow Gmail permissions.",
    );
  });
});
