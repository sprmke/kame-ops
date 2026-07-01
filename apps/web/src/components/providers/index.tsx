"use client";

import { useState, type ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";
import { NavigationProgress } from "@/components/shared/NavigationProgress";
import { GoogleReconnectModal } from "@/components/shared/GoogleReconnectModal";
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
            staleTime: 1000 * 60 * 5,
            refetchOnWindowFocus: false,
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
            {children}
            <GoogleReconnectModal />
            <Toaster />
          </ThemeProvider>
        </TRPCProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
