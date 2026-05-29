export { middlewareAuth as middleware } from "@/lib/auth/middleware-auth";

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register"],
};
