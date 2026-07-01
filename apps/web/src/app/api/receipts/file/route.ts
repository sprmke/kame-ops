import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/auth-config";
import { receiptService } from "@/server/services/receipt.service";
import { storageService } from "@/server/services/storage.service";

function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

function safeFileName(name: string): string {
  const ascii = name
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return ascii.length > 0 ? ascii : "receipt";
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const receiptId = new URL(request.url).searchParams.get("receiptId");
  if (!receiptId) {
    return NextResponse.json({ error: "receiptId required" }, { status: 400 });
  }

  const receipt = await receiptService.getForUser(session.user.id, receiptId);
  if (!receipt) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  const buffer = await storageService.readPrivate(receipt.storagePath);
  if (!buffer?.length) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const fileName = safeFileName(receipt.originalFileName ?? "receipt");
  const contentType = mimeFromPath(
    receipt.originalFileName ?? receipt.storagePath,
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
