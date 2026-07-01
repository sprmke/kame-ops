import { google } from "googleapis";

import { env } from "@/env";
import { googleOAuthRedirectUri } from "@/lib/auth/google-oauth-uri";

/** True when Google OAuth refresh failed (expired / revoked token, wrong client, etc.). */
export function isInvalidGrantError(err: unknown): boolean {
  const s =
    err instanceof Error
      ? `${err.message}\n${(err as NodeJS.ErrnoException).code ?? ""}`
      : String(err);
  if (/invalid_grant/i.test(s)) return true;
  const g = err as {
    response?: { data?: { error?: string; error_description?: string } };
  };
  const d = g.response?.data;
  if (d?.error === "invalid_grant") return true;
  if (
    typeof d?.error_description === "string" &&
    /invalid_grant/i.test(d.error_description)
  ) {
    return true;
  }
  return false;
}

export function formatGoogleAuthError(err: unknown): string {
  if (!isInvalidGrantError(err)) {
    return err instanceof Error ? err.message : String(err);
  }
  return [
    "Google OAuth failed: invalid_grant (refresh token expired, revoked, or not valid for this OAuth client).",
    "Fix: sign out and sign in again with Google from the KameOps login page.",
    "Ensure the Google Cloud OAuth client redirect URI matches your app URL + /api/auth/callback/google.",
  ].join("\n");
}

function readTokenCredentials(): Record<string, unknown> | null {
  const tokenJson = process.env.GMAIL_TOKEN_JSON;
  if (!tokenJson) return null;
  try {
    return JSON.parse(tokenJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Shared OAuth2 client for Gmail and Google Calendar (tokens from gmail.service bridge). */
export async function createGoogleOAuth2Client() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured.",
    );
  }

  const tokens = readTokenCredentials();
  if (!tokens) {
    throw new Error(
      "Gmail is not connected. Sign in with Google to grant Gmail and Calendar access.",
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    googleOAuthRedirectUri(),
  );
  oauth2Client.setCredentials(tokens);

  try {
    if (tokens.refresh_token) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials({ ...tokens, ...credentials });
      process.env.GMAIL_TOKEN_JSON = JSON.stringify({
        ...tokens,
        ...credentials,
      });
    } else {
      await oauth2Client.getAccessToken();
    }
  } catch (e) {
    throw new Error(formatGoogleAuthError(e));
  }

  return oauth2Client;
}
