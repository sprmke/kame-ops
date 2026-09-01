import { NextResponse } from "next/server";
import { google } from "googleapis";

import { parseGoogleLinkState } from "@/lib/auth/google-link-state";
import { googleLinkOAuthRedirectUri } from "@/lib/auth/google-link-oauth-uri";
import { env } from "@/env";
import { ROUTES } from "@/config/routes";
import { gmailService } from "@/server/services/gmail.service";

function redirectWithStatus(
  request: Request,
  callbackUrl: string,
  params: Record<string, string>,
): NextResponse {
  const base = new URL(callbackUrl, request.url);
  for (const [key, value] of Object.entries(params)) {
    base.searchParams.set(key, value);
  }
  return NextResponse.redirect(base);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const stateToken = url.searchParams.get("state");
  const fallbackCallback = ROUTES.dashboard.settings;

  if (error) {
    return redirectWithStatus(request, fallbackCallback, {
      googleLink: "error",
      googleLinkMessage: error,
    });
  }

  const state = stateToken ? parseGoogleLinkState(stateToken) : null;
  if (!state || !code) {
    return redirectWithStatus(request, fallbackCallback, {
      googleLink: "error",
      googleLinkMessage: "Invalid or expired link session.",
    });
  }

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return redirectWithStatus(request, state.callbackUrl, {
      googleLink: "error",
      googleLinkMessage: "Google OAuth is not configured.",
    });
  }

  try {
    const oauth2 = new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      googleLinkOAuthRedirectUri(),
    );

    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);

    const oauth2User = google.oauth2({ version: "v2", auth: oauth2 });
    const profile = await oauth2User.userinfo.get();
    const email = profile.data.email?.toLowerCase();
    if (!email) {
      throw new Error("Google account has no email address.");
    }

    const accountId = await gmailService.linkGoogleAccountFromOAuth({
      userId: state.userId,
      email,
      name: profile.data.name,
      providerAccountId: profile.data.id ?? email,
      tokens: {
        access_token: tokens.access_token ?? undefined,
        refresh_token: tokens.refresh_token ?? undefined,
        expiry_date: tokens.expiry_date ?? undefined,
        token_type: tokens.token_type ?? undefined,
        scope: tokens.scope ?? undefined,
      },
      creditCardIds: state.creditCardIds,
    });

    return redirectWithStatus(request, state.callbackUrl, {
      googleLink: "success",
      googleAccountId: accountId,
    });
  } catch (linkError) {
    const message =
      linkError instanceof Error ? linkError.message : "Link failed.";
    return redirectWithStatus(request, state.callbackUrl, {
      googleLink: "error",
      googleLinkMessage: message,
    });
  }
}
