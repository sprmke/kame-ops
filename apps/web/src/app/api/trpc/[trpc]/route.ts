import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { createTRPCContext } from "@/server/context";
import { runWithRequestCache } from "@/server/lib/request-cache";
import { appRouter } from "@/server/routers/_app";

export const maxDuration = 300;

const respond = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: createTRPCContext,
  });

/**
 * Queries arrive as GET and only read, so identical reads in a batch can share a
 * result. Mutations arrive as POST and must always see live rows.
 */
export const GET = (req: Request) => runWithRequestCache(() => respond(req));

export const POST = (req: Request) => respond(req);
