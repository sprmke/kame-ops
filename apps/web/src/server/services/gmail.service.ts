import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { Account } from "next-auth";
import { google } from "googleapis";

import { env } from "@/env";
import { googleOAuthRedirectUri } from "@/lib/auth/google-oauth-uri";
import { isGoogleReconnectRequiredMessage } from "@/lib/auth/google-reconnect";
import { GOOGLE_OAUTH_SCOPES } from "@/lib/auth/google-scopes";
import { db } from "@/lib/db";
import { accounts, creditCards } from "@/lib/db/schema";
import { formatGoogleAccountLabel } from "@/lib/google/google-account-display";
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

export type GoogleAccountSummary = {
  id: string;
  name: string | null;
  email: string | null;
  hasRefreshToken: boolean;
  linkedCardCount: number;
  isDefault: boolean;
};

/** Refresh a little before real expiry so an in-flight pipeline never races the boundary. */
const TOKEN_EXPIRY_SKEW_MS = 5 * 60 * 1000;

function accessTokenIsUsable(tokens: GoogleOAuthTokens): boolean {
  if (!tokens.access_token) return false;
  if (!tokens.expiry_date) return false;
  return tokens.expiry_date - TOKEN_EXPIRY_SKEW_MS > Date.now();
}

function accountTokens(account: {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
  tokenType: string | null;
  scope: string | null;
}): GoogleOAuthTokens | null {
  if (!account.refreshToken && !account.accessToken) return null;
  return {
    access_token: account.accessToken ?? undefined,
    refresh_token: account.refreshToken ?? undefined,
    expiry_date: account.expiresAt ? account.expiresAt.getTime() : undefined,
    token_type: account.tokenType ?? undefined,
    scope: account.scope ?? undefined,
  };
}

export const gmailService = {
  async listGoogleAccounts(userId: string): Promise<GoogleAccountSummary[]> {
    const rows = await db.query.accounts.findMany({
      where: and(eq(accounts.userId, userId), eq(accounts.provider, "google")),
      orderBy: (t, { asc }) => [asc(t.googleEmail), asc(t.id)],
    });

    const defaultAccountId = await this.getDefaultGoogleAccountId(userId);

    const cards = await db.query.creditCards.findMany({
      where: eq(creditCards.userId, userId),
      columns: { googleAccountId: true },
    });

    const linkedCounts = new Map<string, number>();
    for (const row of rows) {
      const count = cards.filter(
        (card) =>
          card.googleAccountId === row.id ||
          (card.googleAccountId === null && row.id === defaultAccountId),
      ).length;
      linkedCounts.set(row.id, count);
    }

    const summaries: GoogleAccountSummary[] = [];
    for (const row of rows) {
      let email = row.googleEmail;
      let name = row.googleName;
      if ((!email || !name) && row.refreshToken) {
        const profile = await this.backfillGoogleProfile(userId, row.id);
        email = profile.email ?? email;
        name = profile.name ?? name;
      }

      summaries.push({
        id: row.id,
        name,
        email,
        hasRefreshToken: !!row.refreshToken,
        linkedCardCount: linkedCounts.get(row.id) ?? 0,
        isDefault: row.id === defaultAccountId,
      });
    }

    return summaries;
  },

  async fetchGoogleUserInfo(
    userId: string,
    accountId: string,
  ): Promise<{ email: string | null; name: string | null }> {
    await this.applyTokensToEnv(userId, accountId);

    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      return { email: null, name: null };
    }

    const tokenJson = process.env.GMAIL_TOKEN_JSON;
    if (!tokenJson) return { email: null, name: null };

    try {
      const tokens = JSON.parse(tokenJson) as Record<string, unknown>;
      const oauth2Client = new google.auth.OAuth2(
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET,
        googleOAuthRedirectUri(),
      );
      oauth2Client.setCredentials(tokens);

      const oauth2User = google.oauth2({ version: "v2", auth: oauth2Client });
      const profile = await oauth2User.userinfo.get();

      return {
        email: profile.data.email?.trim().toLowerCase() ?? null,
        name: profile.data.name?.trim() ?? null,
      };
    } catch {
      return { email: null, name: null };
    }
  },

  async backfillGoogleProfile(
    userId: string,
    accountId: string,
  ): Promise<{ email: string | null; name: string | null }> {
    const profile = await this.fetchGoogleUserInfo(userId, accountId);
    if (!profile.email && !profile.name) return profile;

    const patch: { googleEmail?: string; googleName?: string } = {};
    if (profile.email) patch.googleEmail = profile.email;
    if (profile.name) patch.googleName = profile.name;

    await db
      .update(accounts)
      .set(patch)
      .where(
        and(
          eq(accounts.id, accountId),
          eq(accounts.userId, userId),
          eq(accounts.provider, "google"),
        ),
      );

    return profile;
  },

  async updateGoogleAccountCards(
    userId: string,
    accountId: string,
    creditCardIds: string[],
  ): Promise<{ linkedCount: number }> {
    await this.assertGoogleAccountOwned(userId, accountId);

    const ownedCards = await db.query.creditCards.findMany({
      where: eq(creditCards.userId, userId),
      columns: { id: true, googleAccountId: true },
    });
    const ownedIds = new Set(ownedCards.map((c) => c.id));
    const selectedIds = creditCardIds.filter((id) => ownedIds.has(id));

    const unlinkIds = ownedCards
      .filter(
        (c) => c.googleAccountId === accountId && !selectedIds.includes(c.id),
      )
      .map((c) => c.id);

    if (unlinkIds.length > 0) {
      await db
        .update(creditCards)
        .set({ googleAccountId: null })
        .where(
          and(
            eq(creditCards.userId, userId),
            inArray(creditCards.id, unlinkIds),
          ),
        );
    }

    if (selectedIds.length > 0) {
      await db
        .update(creditCards)
        .set({ googleAccountId: accountId })
        .where(
          and(
            eq(creditCards.userId, userId),
            inArray(creditCards.id, selectedIds),
          ),
        );
    }

    return { linkedCount: selectedIds.length };
  },

  async getDefaultGoogleAccountId(userId: string): Promise<string | null> {
    const row = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.userId, userId),
        eq(accounts.provider, "google"),
        isNotNull(accounts.refreshToken),
      ),
      columns: { id: true },
      orderBy: (t, { asc }) => [asc(t.googleEmail), asc(t.id)],
    });
    return row?.id ?? null;
  },

  async assertGoogleAccountOwned(
    userId: string,
    googleAccountId: string,
  ): Promise<void> {
    const row = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.id, googleAccountId),
        eq(accounts.userId, userId),
        eq(accounts.provider, "google"),
      ),
      columns: { id: true },
    });
    if (!row) {
      throw new Error("Google account not found.");
    }
  },

  async isConnected(userId: string): Promise<boolean> {
    const defaultId = await this.getDefaultGoogleAccountId(userId);
    if (!defaultId) return false;
    const tokens = await this.getTokensForAccount(userId, defaultId);
    return !!tokens?.refresh_token;
  },

  async getGoogleAccountIdsForSoa(userId: string): Promise<string[]> {
    const defaultId = await this.getDefaultGoogleAccountId(userId);
    const cards = await db.query.creditCards.findMany({
      where: and(
        eq(creditCards.userId, userId),
        isNull(creditCards.deletedAt),
        eq(creditCards.isActive, true),
      ),
      columns: { googleAccountId: true },
    });

    const ids = new Set<string>();
    for (const card of cards) {
      const resolved = card.googleAccountId ?? defaultId;
      if (resolved) ids.add(resolved);
    }
    return [...ids];
  },

  async checkAuthStatus(
    userId: string,
  ): Promise<
    { ok: true } | { ok: false; requiresReconnect: true; message: string }
  > {
    try {
      const accountIds = await this.getGoogleAccountIdsForSoa(userId);
      if (accountIds.length === 0) {
        return {
          ok: false,
          requiresReconnect: true,
          message:
            "Gmail is not connected. Connect a Google account in Settings.",
        };
      }

      const rows = await db.query.accounts.findMany({
        where: and(
          eq(accounts.userId, userId),
          inArray(accounts.id, accountIds),
        ),
      });

      const results = await Promise.all(
        rows.map(async (row) => {
          const label = formatGoogleAccountLabel({
            name: row.googleName,
            email: row.googleEmail,
          });
          const tokens = accountTokens(row);

          if (!tokens?.refresh_token) {
            return {
              ok: false as const,
              message: `${label}: Google account needs to be reconnected.`,
            };
          }
          // A still-valid access token proves the grant is live; no network call needed.
          if (accessTokenIsUsable(tokens)) return { ok: true as const };

          try {
            await this.refreshAccountTokens(userId, row.id, tokens);
            return { ok: true as const };
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : String(error ?? "Unknown error");
            return { ok: false as const, message: `${label}: ${message}` };
          }
        }),
      );

      const failed = results.find((result) => !result.ok);
      if (failed && !failed.ok) {
        return {
          ok: false,
          requiresReconnect: true,
          message: failed.message,
        };
      }

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

  async getTokensForAccount(
    userId: string,
    accountId: string,
  ): Promise<GoogleOAuthTokens | null> {
    const account = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.id, accountId),
        eq(accounts.userId, userId),
        eq(accounts.provider, "google"),
      ),
    });
    if (!account) return null;
    return accountTokens(account);
  },

  /** @deprecated Prefer getTokensForAccount with explicit account id. */
  async getTokensForUser(userId: string): Promise<GoogleOAuthTokens | null> {
    const defaultId = await this.getDefaultGoogleAccountId(userId);
    if (!defaultId) return null;
    return this.getTokensForAccount(userId, defaultId);
  },

  /**
   * Persist Google OAuth tokens from NextAuth sign-in into `accounts`.
   * Preserves refresh_token when Google omits it on re-auth.
   */
  async upsertGoogleAccount(
    userId: string,
    oauthAccount: Account,
    profile?: { email?: string | null; name?: string | null },
  ): Promise<string> {
    if (oauthAccount.provider !== "google" || !oauthAccount.providerAccountId) {
      throw new Error("Invalid Google OAuth account.");
    }

    const normalizedEmail = profile?.email?.trim().toLowerCase() || null;
    const normalizedName = profile?.name?.trim() || null;

    const existing = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.provider, "google"),
        eq(accounts.providerAccountId, oauthAccount.providerAccountId),
      ),
    });

    if (existing && existing.userId !== userId) {
      throw new Error("This Google account is linked to another KameOps user.");
    }

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
      googleEmail: normalizedEmail ?? existing?.googleEmail ?? null,
      googleName: normalizedName ?? existing?.googleName ?? null,
    };

    if (existing) {
      const [updated] = await db
        .update(accounts)
        .set(values)
        .where(eq(accounts.id, existing.id))
        .returning({ id: accounts.id });
      return updated!.id;
    }

    const [inserted] = await db
      .insert(accounts)
      .values(values)
      .returning({ id: accounts.id });
    return inserted!.id;
  },

  async linkGoogleAccountFromOAuth(input: {
    userId: string;
    email: string;
    name?: string | null;
    providerAccountId: string;
    tokens: GoogleOAuthTokens;
    creditCardIds: string[];
  }): Promise<string> {
    const accountId = await this.upsertGoogleAccount(
      input.userId,
      {
        provider: "google",
        type: "oauth",
        providerAccountId: input.providerAccountId,
        access_token: input.tokens.access_token,
        refresh_token: input.tokens.refresh_token,
        expires_at: input.tokens.expiry_date
          ? Math.floor(input.tokens.expiry_date / 1000)
          : undefined,
        token_type: input.tokens.token_type as Account["token_type"],
        scope: input.tokens.scope,
      } satisfies Pick<
        Account,
        | "provider"
        | "type"
        | "providerAccountId"
        | "access_token"
        | "refresh_token"
        | "expires_at"
        | "token_type"
        | "scope"
      > as Account,
      { email: input.email, name: input.name },
    );

    await this.markGoogleIntegrationsConnected(input.userId, input.email);

    if (input.creditCardIds.length > 0) {
      const ownedCards = await db.query.creditCards.findMany({
        where: and(
          eq(creditCards.userId, input.userId),
          inArray(creditCards.id, input.creditCardIds),
        ),
        columns: { id: true },
      });
      const ownedIds = ownedCards.map((c) => c.id);
      if (ownedIds.length > 0) {
        await db
          .update(creditCards)
          .set({ googleAccountId: accountId })
          .where(
            and(
              eq(creditCards.userId, input.userId),
              inArray(creditCards.id, ownedIds),
            ),
          );
      }
    }

    return accountId;
  },

  async disconnectGoogleAccount(
    userId: string,
    accountId: string,
  ): Promise<void> {
    await this.assertGoogleAccountOwned(userId, accountId);

    await db
      .update(creditCards)
      .set({ googleAccountId: null })
      .where(
        and(
          eq(creditCards.userId, userId),
          eq(creditCards.googleAccountId, accountId),
        ),
      );

    await db
      .delete(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)));

    const remaining = await this.listGoogleAccounts(userId);
    if (remaining.length === 0) {
      await integrationService.upsert(userId, {
        provider: "gmail",
        config: {},
        isActive: false,
      });
      await integrationService.upsert(userId, {
        provider: "google_calendar",
        config: {},
        isActive: false,
      });
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

  async persistTokensForAccount(
    userId: string,
    accountId: string,
    tokens: GoogleOAuthTokens,
  ): Promise<void> {
    const account = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.id, accountId),
        eq(accounts.userId, userId),
        eq(accounts.provider, "google"),
      ),
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

  /** @deprecated Prefer persistTokensForAccount. */
  async persistTokensForUser(
    userId: string,
    tokens: GoogleOAuthTokens,
  ): Promise<void> {
    const defaultId = await this.getDefaultGoogleAccountId(userId);
    if (!defaultId) return;
    await this.persistTokensForAccount(userId, defaultId, tokens);
  },

  /** Exchange the refresh token for a fresh access token and persist the result. */
  async refreshAccountTokens(
    userId: string,
    accountId: string,
    tokens: GoogleOAuthTokens,
  ): Promise<GoogleOAuthTokens> {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      throw new Error(
        "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured.",
      );
    }

    const oauth2 = new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      googleOAuthRedirectUri(),
    );
    oauth2.setCredentials(tokens);

    try {
      const { credentials } = await oauth2.refreshAccessToken();
      const next: GoogleOAuthTokens = {
        ...tokens,
        access_token: credentials.access_token ?? tokens.access_token,
        refresh_token: credentials.refresh_token ?? tokens.refresh_token,
        expiry_date: credentials.expiry_date ?? tokens.expiry_date,
        token_type: credentials.token_type ?? tokens.token_type,
        scope: credentials.scope ?? tokens.scope,
      };
      await this.persistTokensForAccount(userId, accountId, next);
      return next;
    } catch (error) {
      throw new Error(formatGoogleAuthError(error));
    }
  },

  /**
   * Bridge DB tokens into process.env for lib/soa Gmail and Calendar clients.
   * Refreshes the access token only once the cached one is at/near expiry.
   */
  async applyTokensToEnv(
    userId: string,
    accountId?: string | null,
  ): Promise<void> {
    const resolvedAccountId =
      accountId ?? (await this.getDefaultGoogleAccountId(userId));
    if (!resolvedAccountId) {
      throw new Error(
        "Gmail is not connected. Connect a Google account in Settings.",
      );
    }

    let tokens = await this.getTokensForAccount(userId, resolvedAccountId);
    if (!tokens?.refresh_token && !tokens?.access_token) {
      throw new Error(
        "Gmail is not connected. Connect a Google account in Settings.",
      );
    }

    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      throw new Error(
        "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured.",
      );
    }

    const redirectUri = googleOAuthRedirectUri();

    if (tokens.refresh_token && !accessTokenIsUsable(tokens)) {
      tokens = await this.refreshAccountTokens(
        userId,
        resolvedAccountId,
        tokens,
      );
    }

    process.env.GMAIL_TOKEN_JSON = JSON.stringify({
      ...tokens,
      googleAccountId: resolvedAccountId,
    });
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
    googleAccountId: string | null;
  }> {
    const redirectUri = googleOAuthRedirectUri();
    const tokenJson = process.env.GMAIL_TOKEN_JSON;
    let scope: string | null = null;
    let hasRefreshToken = false;
    let googleAccountId: string | null = null;
    if (tokenJson) {
      try {
        const parsed = JSON.parse(tokenJson) as {
          scope?: string;
          refresh_token?: string;
          googleAccountId?: string;
        };
        scope = parsed.scope ?? null;
        hasRefreshToken = !!parsed.refresh_token;
        googleAccountId = parsed.googleAccountId ?? null;
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
      googleAccountId,
    };
  },

  buildGoogleLinkUrl(input: {
    callbackUrl: string;
    creditCardIds?: string[];
  }): string {
    const params = new URLSearchParams();
    params.set("callbackUrl", input.callbackUrl);
    for (const id of input.creditCardIds ?? []) {
      params.append("creditCardId", id);
    }
    return `/api/auth/google/link?${params.toString()}`;
  },
};
