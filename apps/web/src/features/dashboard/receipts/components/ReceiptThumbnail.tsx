"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";

import { ThumbnailSkeleton } from "@/components/shared/skeletons";

import { cn } from "@/lib/utils/cn";

import { isPdfReceipt } from "../lib/receipt-display";
import { receiptFileUrl } from "../lib/receipt-utils";

type ReceiptThumbnailProps = {
  receiptId: string;
  fileName: string | null;
  alt: string;
  onClick?: () => void;
  className?: string;
  layout?: "sidebar" | "cover";
};

export function ReceiptThumbnail({
  receiptId,
  fileName,
  alt,
  onClick,
  className,
  layout = "sidebar",
}: ReceiptThumbnailProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const isPdf = isPdfReceipt(fileName);

  useEffect(() => {
    if (isPdf) {
      setLoading(false);
      return;
    }

    let revoked: string | null = null;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setFailed(false);
      setSrc(null);

      try {
        const res = await fetch(receiptFileUrl(receiptId), {
          signal: controller.signal,
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error("Failed to load");
        const blob = await res.blob();
        revoked = URL.createObjectURL(blob);
        setSrc(revoked);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();

    return () => {
      controller.abort();
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [receiptId, isPdf]);

  const shellClass = cn(
    "relative flex shrink-0 items-center justify-center overflow-hidden bg-muted/30",
    layout === "cover"
      ? "aspect-[4/3] w-full border-b border-border/80"
      : "h-auto min-h-full w-[5.25rem] self-stretch border-r border-border/80 sm:w-24",
    className,
  );

  const body = (
    <>
      {loading ? (
        <ThumbnailSkeleton layout={layout} />
      ) : isPdf ? (
        <div className="flex flex-col items-center gap-1 p-2 text-muted-foreground">
          <FileText className="h-6 w-6" />
          <span className="text-[10px] font-medium">PDF</span>
        </div>
      ) : failed || !src ? (
        <span className="px-2 text-center text-[10px] text-muted-foreground">
          No preview
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className={cn(
            "object-contain object-center",
            layout === "cover"
              ? "h-full w-full p-2"
              : "max-h-full max-w-full p-1",
          )}
        />
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          shellClass,
          "group transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        )}
        aria-label={`View ${alt}`}
      >
        {body}
        <span className="pointer-events-none absolute inset-0 bg-black/0 transition group-hover:bg-black/5" />
      </button>
    );
  }

  return <div className={shellClass}>{body}</div>;
}
