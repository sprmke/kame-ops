import NextAuth from 'next-auth';
import type { NextAuthConfig } from 'next-auth';

import { ROUTES } from '@/config/routes';

/** Slim auth config for Edge middleware — no database imports. */
export const middlewareAuthConfig: NextAuthConfig = {
  providers: [],
  pages: {
    signIn: ROUTES.login,
    error: '/auth/error',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isDashboard = nextUrl.pathname.startsWith('/dashboard');
      const isAuth =
        nextUrl.pathname.startsWith('/login') ||
        nextUrl.pathname.startsWith('/register');

      if (isDashboard) return isLoggedIn;
      if (isAuth && isLoggedIn) {
        return Response.redirect(new URL(ROUTES.dashboard.root, nextUrl));
      }
      return true;
    },
  },
  session: { strategy: 'jwt' },
  trustHost: true,
};

export const { auth: middlewareAuth } = NextAuth(middlewareAuthConfig);
