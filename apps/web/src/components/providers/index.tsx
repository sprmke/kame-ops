"use client";

import { useState, type ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";
import { NavigationProgress } from "@/components/shared/NavigationProgress";
import { GoogleReconnectModal } from "@/components/shared/GoogleReconnectModal";
import { GoogleReconnectMonitor } from "@/components/shared/GoogleReconnectMonitor";
import { TRPCProvider } from "@/lib/api/client";

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Keeps server-prefetched data from being refetched right after
            // hydration, and makes back-navigation render from cache.
            staleTime: 1000 * 60 * 5,
            gcTime: 1000 * 60 * 30,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            retry: 1,
          },
        },
      }),
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <TRPCProvider queryClient={queryClient}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <NavigationProgress />
            <GoogleReconnectMonitor />
            {children}
            <GoogleReconnectModal />
            <Toaster />
          </ThemeProvider>
        </TRPCProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
