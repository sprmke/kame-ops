"use client";

import { useEffect, useState } from "react";
import { Download, ExternalLink, FileText, X } from "lucide-react";

import { PdfPreviewSkeleton } from "@/components/shared/skeletons";
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

type PreviewKind = "pdf" | "image";

function previewKindFromType(contentType: string): PreviewKind | null {
  const type = contentType.toLowerCase();
  if (type.includes("pdf")) return "pdf";
  if (type.startsWith("image/")) return "image";
  return null;
}

function downloadFilename(title: string, kind: PreviewKind | null): string {
  const base = title
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  const ext = kind === "image" ? "jpg" : "pdf";
  return `${base || "soa-summary"}.${ext}`;
}

export function SoaPdfPreview({
  open,
  onOpenChange,
  title,
  pdfUrl,
}: SoaPdfPreviewProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<PreviewKind | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || !pdfUrl) {
      setBlobUrl(null);
      setPreviewKind(null);
      setFailed(false);
      setLoading(false);
      return;
    }

    let revoked: string | null = null;
    const controller = new AbortController();

    async function loadPreview() {
      setLoading(true);
      setFailed(false);
      setBlobUrl(null);
      setPreviewKind(null);

      try {
        const res = await fetch(pdfUrl!, {
          signal: controller.signal,
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const kind = previewKindFromType(
          blob.type || res.headers.get("content-type") || "",
        );
        if (!kind) throw new Error("Unsupported preview type");
        const url = URL.createObjectURL(blob);
        revoked = url;
        setPreviewKind(kind);
        setBlobUrl(url);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadPreview();

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
          setPreviewKind(null);
          setFailed(false);
          setLoading(false);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(92dvh,900px)] max-h-[92dvh] w-[calc(100%-1rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:w-full sm:p-0"
      >
        <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-2.5 sm:flex-nowrap sm:px-5">
          <DialogTitle className="min-w-0 flex-1 truncate text-left font-display text-base font-semibold leading-none">
            {title}
          </DialogTitle>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {pdfUrl && (
              <>
                {downloadHref && !loading && (
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={downloadHref}
                      download={downloadFilename(title, previewKind)}
                    >
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
              <Button variant="ghost" size="icon" className="h-9 w-9">
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
              Unavailable
            </div>
          ) : loading ? (
            <PdfPreviewSkeleton />
          ) : failed || !blobUrl ? (
            <div className="flex h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
              <FileText className="h-8 w-8 opacity-50" />
              <p>File not found. Open in a new tab.</p>
              <Button variant="outline" size="sm" asChild>
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                  Open in new tab
                </a>
              </Button>
            </div>
          ) : previewKind === "image" ? (
            <div className="flex h-[70vh] items-center justify-center overflow-auto bg-muted/30 p-4">
              <img
                src={blobUrl}
                alt={title}
                className="max-h-full max-w-full object-contain"
              />
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
