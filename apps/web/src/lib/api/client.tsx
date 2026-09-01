"use client";

import { QueryClient } from "@tanstack/react-query";
import { httpBatchLink, loggerLink, splitLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { useState, type ReactNode } from "react";
import superjson from "superjson";

import { LOCAL_DEV_APP_URL } from "@/lib/constants/dev-url";
import { googleReconnectLink } from "@/lib/api/google-reconnect-link";
import type { AppRouter } from "@/server/routers/_app";

export const api = createTRPCReact<AppRouter>();

/**
 * Opt a query out of the foreground batch. `httpBatchLink` resolves a batch only
 * when its slowest member finishes, so background polling shares its own batch
 * and can never hold up the data a page is waiting to render.
 */
export const backgroundQuery = { context: { background: true } } as const;

function getBaseUrl() {
  if (typeof window !== "undefined") return "";
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  return LOCAL_DEV_APP_URL;
}

export function TRPCProvider({
  children,
  queryClient,
}: {
  children: ReactNode;
  queryClient: QueryClient;
}) {
  const [trpcClient] = useState(() => {
    const url = `${getBaseUrl()}/api/trpc`;

    return api.createClient({
      links: [
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === "development" ||
            (op.direction === "down" && op.result instanceof Error),
        }),
        googleReconnectLink,
        splitLink({
          condition: (op) => op.context.background === true,
          true: httpBatchLink({ url, transformer: superjson }),
          false: httpBatchLink({ url, transformer: superjson }),
        }),
      ],
    });
  });

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      {children}
    </api.Provider>
  );
}
