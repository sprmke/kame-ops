"use client";

import { useEffect, useState } from "react";
import { Download, ExternalLink, FileText, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

type SoaPdfPreviewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  pdfUrl: string | null;
};

function downloadFilename(title: string): string {
  const base = title
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return `${base || "soa-summary"}.pdf`;
}

export function SoaPdfPreview({
  open,
  onOpenChange,
  title,
  pdfUrl,
}: SoaPdfPreviewProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || !pdfUrl) {
      setBlobUrl(null);
      setFailed(false);
      setLoading(false);
      return;
    }

    let revoked: string | null = null;
    const controller = new AbortController();

    async function loadPdf() {
      setLoading(true);
      setFailed(false);
      setBlobUrl(null);

      try {
        const res = await fetch(pdfUrl!, {
          signal: controller.signal,
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("pdf")) throw new Error("Not a PDF");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        revoked = url;
        setBlobUrl(url);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadPdf();

    return () => {
      controller.abort();
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [open, pdfUrl]);

  const downloadHref = blobUrl ?? pdfUrl;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setBlobUrl(null);
          setFailed(false);
          setLoading(false);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <DialogTitle className="min-w-0 flex-1 truncate font-display text-base">
            {title}
          </DialogTitle>
          <div className="flex shrink-0 items-center gap-2">
            {pdfUrl && (
              <>
                {downloadHref && !loading && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={downloadHref} download={downloadFilename(title)}>
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      Download
                    </a>
                  </Button>
                )}
                <Button variant="outline" size="sm" asChild>
                  <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    Open
                  </a>
                </Button>
              </>
            )}
            <DialogClose asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </DialogClose>
          </div>
        </div>

        <div className="relative min-h-[70vh] bg-muted/30">
          {!pdfUrl ? (
            <div className="flex h-[70vh] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-8 w-8 opacity-50" />
              PDF unavailable
            </div>
          ) : loading ? (
            <div className="flex h-[70vh] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : failed || !blobUrl ? (
            <div className="flex h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
              <FileText className="h-8 w-8 opacity-50" />
              <p>
                PDF not found. Re-run SOA to regenerate, or open in a new tab.
              </p>
              <Button variant="outline" size="sm" asChild>
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                  Open in new tab
                </a>
              </Button>
            </div>
          ) : (
            <iframe
              title={title}
              src={blobUrl}
              className="h-[70vh] w-full border-0 bg-background"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
