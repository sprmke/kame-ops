import { NextResponse } from "next/server";
import { google } from "googleapis";

import { auth } from "@/lib/auth/auth-config";
import { createGoogleLinkState } from "@/lib/auth/google-link-state";
import { googleLinkOAuthRedirectUri } from "@/lib/auth/google-link-oauth-uri";
import { GOOGLE_OAUTH_SCOPE_STRING } from "@/lib/auth/google-scopes";
import { env } from "@/env";
import { ROUTES } from "@/config/routes";

function safeCallbackUrl(raw: string | null): string {
  if (!raw?.startsWith("/") || raw.startsWith("//")) {
    return ROUTES.dashboard.settings;
  }
  return raw;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL(ROUTES.login, request.url));
  }

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Google OAuth is not configured." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const callbackUrl = safeCallbackUrl(url.searchParams.get("callbackUrl"));
  const creditCardIds = url.searchParams
    .getAll("creditCardId")
    .filter((id) => id.length > 0);

  const state = createGoogleLinkState({
    userId: session.user.id,
    creditCardIds,
    callbackUrl,
  });

  const oauth2 = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    googleLinkOAuthRedirectUri(),
  );

  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_OAUTH_SCOPE_STRING.split(" "),
    state,
    include_granted_scopes: true,
  });

  return NextResponse.redirect(authUrl);
}
