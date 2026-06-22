// @ts-nocheck
import fs from "node:fs";
import { google } from "googleapis";

import { projectPaths } from "./config";

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
  )
    return true;
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

type OAuthClientCreds = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

function readEnvOAuthCreds(): OAuthClientCreds | null {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    redirectUri:
      process.env.GMAIL_OAUTH_REDIRECT_URI ??
      "http://127.0.0.1:8765/oauth2callback",
  };
}

function readFileOAuthCreds(): OAuthClientCreds | null {
  if (!fs.existsSync(projectPaths.credentialsJson)) return null;
  const creds = JSON.parse(
    fs.readFileSync(projectPaths.credentialsJson, "utf8"),
  );
  const installed = creds.installed ?? creds.web;
  if (!installed?.client_id || !installed?.client_secret) return null;
  return {
    clientId: installed.client_id,
    clientSecret: installed.client_secret,
    redirectUri: "http://127.0.0.1:8765/oauth2callback",
  };
}

function readTokenCredentials(): Record<string, unknown> | null {
  const tokenJson = process.env.GMAIL_TOKEN_JSON;
  if (tokenJson) {
    try {
      return JSON.parse(tokenJson) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (!fs.existsSync(projectPaths.tokenJson)) return null;
  return JSON.parse(fs.readFileSync(projectPaths.tokenJson, "utf8"));
}

/** Shared OAuth2 client for Gmail and Google Calendar legacy modules. */
export async function createGoogleOAuth2Client() {
  const creds = readEnvOAuthCreds() ?? readFileOAuthCreds();
  if (!creds) {
    throw new Error(
      "Google OAuth is not configured. Sign in with Google or set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.",
    );
  }

  const tokens = readTokenCredentials();
  if (!tokens) {
    throw new Error(
      "Gmail is not connected. Sign in with Google to grant Gmail and Calendar access.",
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    creds.clientId,
    creds.clientSecret,
    creds.redirectUri,
  );
  oauth2Client.setCredentials(tokens);

  try {
    if (tokens.refresh_token) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials({ ...tokens, ...credentials });
      if (process.env.GMAIL_TOKEN_JSON) {
        process.env.GMAIL_TOKEN_JSON = JSON.stringify({
          ...tokens,
          ...credentials,
        });
      }
    } else {
      await oauth2Client.getAccessToken();
    }
  } catch (e) {
    throw new Error(formatGoogleAuthError(e));
  }

  return oauth2Client;
}
