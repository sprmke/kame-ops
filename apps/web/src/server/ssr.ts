import "server-only";

import { createServerSideHelpers } from "@trpc/react-query/server";
import superjson from "superjson";

import { createTRPCContext } from "@/server/context";
import { runWithRequestCache } from "@/server/lib/request-cache";
import { appRouter } from "@/server/routers/_app";

/**
 * Fetch page data during the server render instead of after hydration.
 *
 * Without this the browser must download and run the bundle before it can even
 * ask for data, so the skeleton is guaranteed to show for at least one full
 * round trip. Prefetching inlines the result into the HTML, and the matching
 * `useQuery` on the client reads it straight from the hydrated cache.
 */
export async function createSsrHelpers() {
  return createServerSideHelpers({
    router: appRouter,
    ctx: await createTRPCContext(),
    transformer: superjson,
  });
}

type SsrHelpers = Awaited<ReturnType<typeof createSsrHelpers>>;

/**
 * Prefetch must never break a page: if a query fails server-side we fall back to
 * the normal client fetch, which renders the usual loading and error states.
 */
export async function prefetchForPage(
  prefetch: (helpers: SsrHelpers) => Promise<unknown>,
) {
  return runWithRequestCache(async () => {
    const helpers = await createSsrHelpers();
    try {
      await prefetch(helpers);
    } catch {
      // Fall through to client-side fetching.
    }
    return helpers.dehydrate();
  });
}
