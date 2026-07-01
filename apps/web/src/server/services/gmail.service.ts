import { and, eq } from "drizzle-orm";
import type { Account } from "next-auth";
import { google } from "googleapis";

import { env } from "@/env";
import { googleOAuthRedirectUri } from "@/lib/auth/google-oauth-uri";
import { isGoogleReconnectRequiredMessage } from "@/lib/auth/google-reconnect";
import { GOOGLE_OAUTH_SCOPES } from "@/lib/auth/google-scopes";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import {
  formatGoogleAuthError,
  isInvalidGrantError,
} from "@/lib/google/google-oauth";
import { integrationService } from "@/server/services/integration.service";

export type GoogleOAuthTokens = {
  access_token?: string;
  refresh_token?: string;
  expiry_date?: number;
  token_type?: string;
  scope?: string;
};

export const gmailService = {
  async isConnected(userId: string): Promise<boolean> {
    const tokens = await this.getTokensForUser(userId);
    return !!tokens?.refresh_token;
  },

  async checkAuthStatus(
    userId: string,
  ): Promise<
    { ok: true } | { ok: false; requiresReconnect: true; message: string }
  > {
    try {
      await this.applyTokensToEnv(userId);
      return { ok: true };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error ?? "Unknown error");
      if (
        isInvalidGrantError(error) ||
        isGoogleReconnectRequiredMessage(message)
      ) {
        return { ok: false, requiresReconnect: true, message };
      }
      return { ok: true };
    }
  },

  async getTokensForUser(userId: string): Promise<GoogleOAuthTokens | null> {
    const account = await db.query.accounts.findFirst({
      where: and(eq(accounts.userId, userId), eq(accounts.provider, "google")),
    });
    if (!account?.refreshToken && !account?.accessToken) return null;

    return {
      access_token: account.accessToken ?? undefined,
      refresh_token: account.refreshToken ?? undefined,
      expiry_date: account.expiresAt ? account.expiresAt.getTime() : undefined,
      token_type: account.tokenType ?? undefined,
      scope: account.scope ?? undefined,
    };
  },

  /**
   * Persist Google OAuth tokens from NextAuth sign-in into `accounts`.
   * Preserves refresh_token when Google omits it on re-auth.
   */
  async upsertGoogleAccount(
    userId: string,
    oauthAccount: Account,
  ): Promise<void> {
    if (oauthAccount.provider !== "google" || !oauthAccount.providerAccountId) {
      return;
    }

    const existing = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.provider, "google"),
        eq(accounts.providerAccountId, oauthAccount.providerAccountId),
      ),
    });

    const refreshToken =
      oauthAccount.refresh_token ?? existing?.refreshToken ?? null;
    const expiresAt = oauthAccount.expires_at
      ? new Date(oauthAccount.expires_at * 1000)
      : null;

    const values = {
      userId,
      type: oauthAccount.type,
      provider: oauthAccount.provider,
      providerAccountId: oauthAccount.providerAccountId,
      refreshToken,
      accessToken: oauthAccount.access_token ?? existing?.accessToken ?? null,
      expiresAt,
      tokenType: oauthAccount.token_type ?? null,
      scope: oauthAccount.scope ?? null,
      idToken: oauthAccount.id_token ?? null,
    };

    if (existing) {
      await db.update(accounts).set(values).where(eq(accounts.id, existing.id));
    } else {
      await db.insert(accounts).values(values);
    }
  },

  /** Mark Gmail + Calendar integrations connected for dashboard status. */
  async markGoogleIntegrationsConnected(
    userId: string,
    email: string,
  ): Promise<void> {
    const connectedAt = new Date().toISOString();
    await integrationService.upsert(userId, {
      provider: "gmail",
      config: { email, connectedAt },
    });
    await integrationService.upsert(userId, {
      provider: "google_calendar",
      config: { email, connectedAt },
    });
  },

  async persistTokensForUser(
    userId: string,
    tokens: GoogleOAuthTokens,
  ): Promise<void> {
    const account = await db.query.accounts.findFirst({
      where: and(eq(accounts.userId, userId), eq(accounts.provider, "google")),
    });
    if (!account) return;

    await db
      .update(accounts)
      .set({
        accessToken: tokens.access_token ?? account.accessToken,
        refreshToken: tokens.refresh_token ?? account.refreshToken,
        expiresAt: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : account.expiresAt,
        tokenType: tokens.token_type ?? account.tokenType,
        scope: tokens.scope ?? account.scope,
      })
      .where(eq(accounts.id, account.id));
  },

  /**
   * Bridge DB tokens into process.env for lib/soa Gmail and Calendar clients.
   * Refreshes the access token when a refresh token is available.
   */
  async applyTokensToEnv(userId: string): Promise<void> {
    let tokens = await this.getTokensForUser(userId);
    if (!tokens?.refresh_token && !tokens?.access_token) {
      throw new Error(
        "Gmail is not connected. Sign in with Google and grant Gmail access.",
      );
    }

    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      throw new Error(
        "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured.",
      );
    }

    const redirectUri = googleOAuthRedirectUri();

    if (tokens.refresh_token) {
      const oauth2 = new google.auth.OAuth2(
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET,
        redirectUri,
      );
      oauth2.setCredentials(tokens);

      try {
        const { credentials } = await oauth2.refreshAccessToken();
        tokens = {
          ...tokens,
          access_token: credentials.access_token ?? tokens.access_token,
          refresh_token: credentials.refresh_token ?? tokens.refresh_token,
          expiry_date: credentials.expiry_date ?? tokens.expiry_date,
          token_type: credentials.token_type ?? tokens.token_type,
          scope: credentials.scope ?? tokens.scope,
        };
        await this.persistTokensForUser(userId, tokens);
      } catch (error) {
        throw new Error(formatGoogleAuthError(error));
      }
    }

    process.env.GMAIL_TOKEN_JSON = JSON.stringify(tokens);
    process.env.GMAIL_OAUTH_CLIENT_ID = env.GOOGLE_CLIENT_ID;
    process.env.GMAIL_OAUTH_CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET;
    process.env.GMAIL_OAUTH_REDIRECT_URI = redirectUri;
  },

  /** Which Gmail mailbox the active OAuth token reads (after applyTokensToEnv). */
  async getActiveMailboxProfile(): Promise<{
    email: string | null;
    scope: string | null;
    hasRefreshToken: boolean;
    hasGmailReadScope: boolean;
    redirectUri: string;
  }> {
    const redirectUri = googleOAuthRedirectUri();
    const tokenJson = process.env.GMAIL_TOKEN_JSON;
    let scope: string | null = null;
    let hasRefreshToken = false;
    if (tokenJson) {
      try {
        const parsed = JSON.parse(tokenJson) as {
          scope?: string;
          refresh_token?: string;
        };
        scope = parsed.scope ?? null;
        hasRefreshToken = !!parsed.refresh_token;
      } catch {
        // ignore
      }
    }

    const hasGmailReadScope =
      !!scope?.includes("gmail.readonly") ||
      GOOGLE_OAUTH_SCOPES.some(
        (s) => s.includes("gmail") && scope?.includes(s),
      );

    const { getGmailClient } = await import("@/lib/soa/gmail-fetch");
    const gmail = await getGmailClient();
    const profile = await gmail.users.getProfile({ userId: "me" });

    return {
      email: profile.data.emailAddress ?? null,
      scope,
      hasRefreshToken,
      hasGmailReadScope,
      redirectUri,
    };
  },
};
