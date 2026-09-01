import { describe, expect, test } from "vitest";

import { formatUserFacingErrorMessage } from "./user-facing-message";

describe("formatUserFacingErrorMessage", () => {
  test("simplifies google oauth errors", () => {
    expect(
      formatUserFacingErrorMessage(
        "Google OAuth failed: invalid_grant (refresh token expired, revoked, or not valid for this OAuth client). Fix: sign out and sign in again with Google from the KameOps login page. Ensure the Google Cloud OAuth client redirect URI matches your app URL + /api/auth/callback/google.",
      ),
    ).toBe(
      "Your Google sign-in expired or was revoked. Sign in again to restore Gmail access.",
    );
  });

  test("strips Fix instructions from other errors", () => {
    expect(
      formatUserFacingErrorMessage(
        "Something broke. Fix: edit env vars and restart the server.",
      ),
    ).toBe("Something broke.");
  });

  test("default when empty", () => {
    expect(formatUserFacingErrorMessage(null)).toBe(
      "Something went wrong. Try again.",
    );
  });
});
