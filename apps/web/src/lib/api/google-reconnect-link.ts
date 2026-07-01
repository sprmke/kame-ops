import { TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";

import { notifyGoogleReconnectRequired } from "@/lib/auth/google-reconnect-store";
import type { AppRouter } from "@/server/routers/_app";

export const googleReconnectLink: TRPCLink<AppRouter> = () => {
  return ({ next, op }) => {
    return observable((observer) => {
      const subscription = next(op).subscribe({
        next(value) {
          observer.next(value);
        },
        error(error) {
          notifyGoogleReconnectRequired(error);
          observer.error(error);
        },
        complete() {
          observer.complete();
        },
      });

      return () => subscription.unsubscribe();
    });
  };
};
