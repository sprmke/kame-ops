import { NextResponse } from "next/server";

import { checkCanvasEngineReady } from "@/server/lib/canvas-engine";
import { checkPdfEngineReady } from "@/server/lib/pdf-engine";
import { checkQpdfEngineReady } from "@/server/lib/qpdf-engine";

/** Local prod verification only — not exposed on deployed hosts. */
export async function GET(request: Request) {
  const host = new URL(request.url).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [pdfEngine, qpdfEngine, canvasEngine] = await Promise.all([
    checkPdfEngineReady(),
    checkQpdfEngineReady(),
    checkCanvasEngineReady(),
  ]);

  return NextResponse.json({
    nodeEnv: process.env.NODE_ENV ?? "development",
    vercel: !!process.env.VERCEL,
    cwd: process.cwd(),
    pdfEngineOk: pdfEngine.ok,
    qpdfEngineOk: qpdfEngine.ok,
    canvasEngineOk: canvasEngine.ok,
    pdfEngineError: pdfEngine.ok ? null : pdfEngine.error,
    qpdfEngineError: qpdfEngine.ok ? null : qpdfEngine.error,
    canvasEngineError: canvasEngine.ok ? null : canvasEngine.error,
  });
}
