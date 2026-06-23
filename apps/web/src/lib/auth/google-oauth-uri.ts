import { env } from "@/env";

/** Must match the redirect URI used during Google sign-in (NextAuth callback). */
export function googleOAuthRedirectUri(): string {
  const base = (env.AUTH_URL ?? env.NEXT_PUBLIC_APP_URL).replace(/\/$/, "");
  return `${base}/api/auth/callback/google`;
}
