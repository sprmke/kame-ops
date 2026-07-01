"use client";

import { useSyncExternalStore } from "react";
import { Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useReconnectGoogle } from "@/hooks/use-reconnect-google";
import {
  closeGoogleReconnectModal,
  getGoogleReconnectSnapshot,
  subscribeGoogleReconnect,
} from "@/lib/auth/google-reconnect-store";

export function GoogleReconnectModal() {
  const open = useSyncExternalStore(
    subscribeGoogleReconnect,
    () => getGoogleReconnectSnapshot().open,
    () => false,
  );
  const { reconnectGoogle, isReconnectPending } = useReconnectGoogle();

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeGoogleReconnectModal();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <DialogTitle>Reconnect Gmail</DialogTitle>
          </div>
        </DialogHeader>
        <Button
          className="w-full"
          onClick={() => reconnectGoogle()}
          disabled={isReconnectPending}
        >
          Reconnect Gmail
        </Button>
      </DialogContent>
    </Dialog>
  );
}
