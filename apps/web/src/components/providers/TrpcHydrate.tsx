"use client";

import { HydrationBoundary, type DehydratedState } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";
import superjson from "superjson";

interface TrpcHydrateProps {
  /** superjson-serialized output of `createServerSideHelpers().dehydrate()`. */
  state: unknown;
  children: ReactNode;
}

/**
 * Seeds the client query cache with data already fetched during the server
 * render, so the matching `useQuery` resolves on first paint instead of firing
 * a request after hydration.
 */
export function TrpcHydrate({ state, children }: TrpcHydrateProps) {
  const dehydrated = useMemo(
    () => superjson.deserialize<DehydratedState>(state as never),
    [state],
  );

  return <HydrationBoundary state={dehydrated}>{children}</HydrationBoundary>;
}
