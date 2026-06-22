import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import type { NextAuthConfig } from "next-auth";
import { eq } from "drizzle-orm";

import { env } from "@/env";
import { ROUTES } from "@/config/routes";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { GOOGLE_OAUTH_SCOPE_STRING } from "@/lib/auth/google-scopes";
import { gmailService } from "@/server/services/gmail.service";

const googleProviders =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? [
        Google({
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          authorization: {
            params: {
              scope: GOOGLE_OAUTH_SCOPE_STRING,
              access_type: "offline",
              prompt: "consent",
            },
          },
        }),
      ]
    : [];

export const authConfig: NextAuthConfig = {
  providers: googleProviders,
  pages: {
    signIn: ROUTES.login,
    error: "/auth/error",
  },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return false;
      if (!profile?.email) return false;
      return true;
    },
    async jwt({ token, account, profile }) {
      if (account?.provider === "google" && profile?.email) {
        const email = profile.email.toLowerCase();
        let user = await db.query.users.findFirst({
          where: eq(users.email, email),
        });

        if (!user) {
          const [created] = await db
            .insert(users)
            .values({
              email,
              name: profile.name ?? email,
              image: profile.picture ?? null,
              emailVerified: new Date(),
            })
            .returning();
          user = created;
        } else if (!user.emailVerified) {
          await db
            .update(users)
            .set({
              emailVerified: new Date(),
              name: user.name ?? profile.name ?? email,
              image: user.image ?? profile.picture ?? null,
            })
            .where(eq(users.id, user.id));
        }

        if (user) {
          token.sub = user.id;
          token.email = email;
          await gmailService.upsertGoogleAccount(user.id, account);
          await gmailService.markGoogleIntegrationsConnected(user.id, email);
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }
      if (token.email && session.user) {
        session.user.email = token.email as string;
      }
      return session;
    },
  },
  session: { strategy: "jwt" },
  trustHost: true,
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
