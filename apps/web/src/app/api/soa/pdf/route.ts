import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/auth-config";
import { soaPeriodService } from "@/server/services/soa-period.service";
import { soaService } from "@/server/services/soa.service";

/** HTTP header values must be ASCII; period labels use "May 2026 → June 2026". */
function safePdfFileName(name: string): string {
  const ascii = name
    .replace(/\s+/g, "-")
    .replace(/[^\w.-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return ascii.length > 0 ? `${ascii}.pdf` : "soa-summary.pdf";
}

function summaryFileName(period: {
  mode: string;
  fromMonth: number;
  fromYear: number;
  toMonth: number;
  toYear: number;
  label: string;
}): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (
    period.mode === "range" &&
    (period.fromMonth !== period.toMonth || period.fromYear !== period.toYear)
  ) {
    return `soa-summary-range-${period.fromYear}-${pad(period.fromMonth)}-to-${period.toYear}-${pad(period.toMonth)}.pdf`;
  }
  return safePdfFileName(`soa-summary-${period.label}`);
}

function pdfResponse(buffer: Buffer, fileName: string) {
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safePdfFileName(fileName.replace(/\.pdf$/i, ""))}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "source";

  if (type === "summary") {
    const periodId = searchParams.get("periodId");
    if (periodId) {
      const period = await soaPeriodService.getPeriod(
        session.user.id,
        periodId,
      );
      if (!period) {
        return NextResponse.json(
          { error: "Period not found" },
          { status: 404 },
        );
      }
      const buffer = await soaService.readPeriodSummaryPdf(
        session.user.id,
        period,
      );
      if (!buffer) {
        return NextResponse.json({ error: "PDF not found" }, { status: 404 });
      }
      return pdfResponse(buffer, summaryFileName(period));
    }

    const month = Number(searchParams.get("month"));
    const year = Number(searchParams.get("year"));
    if (!month || !year) {
      return NextResponse.json(
        { error: "month and year or periodId required" },
        { status: 400 },
      );
    }
    const filePath = await soaService.resolvePeriodSummaryPdfPath(
      session.user.id,
      month,
      year,
    );
    if (!filePath) {
      return NextResponse.json({ error: "PDF not found" }, { status: 404 });
    }
    let buffer: Buffer;
    try {
      const { readFile } = await import("fs/promises");
      buffer = await readFile(filePath);
    } catch {
      return NextResponse.json({ error: "PDF not found" }, { status: 404 });
    }
    const fileName = `soa-summary-${year}-${String(month).padStart(2, "0")}.pdf`;
    return pdfResponse(buffer, fileName);
  }

  const statementId = searchParams.get("statementId");
  if (!statementId) {
    return NextResponse.json(
      { error: "statementId required" },
      { status: 400 },
    );
  }
  const buffer = await soaService.readStatementPdfForPreview(
    session.user.id,
    statementId,
  );
  if (!buffer) {
    return NextResponse.json({ error: "PDF not found" }, { status: 404 });
  }
  return pdfResponse(buffer, "statement.pdf");
}
