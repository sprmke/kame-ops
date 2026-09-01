import { env } from "@/env";

/** Redirect URI for linking additional Google accounts (not NextAuth login). */
export function googleLinkOAuthRedirectUri(): string {
  const base = (env.AUTH_URL ?? env.NEXT_PUBLIC_APP_URL).replace(/\/$/, "");
  return `${base}/api/auth/google/link/callback`;
}
