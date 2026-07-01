import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/auth-config";
import { ReceiptUploadProgressReporter } from "@/server/services/receipt-upload-progress.service";
import { storageService } from "@/server/services/storage.service";

export const maxDuration = 60;

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File too large (max 10MB)" },
      { status: 400 },
    );
  }

  if (file.type && !ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "File type not allowed" },
      { status: 400 },
    );
  }

  const processIdRaw = form.get("processId");
  const processId =
    typeof processIdRaw === "string" && processIdRaw.length > 0
      ? processIdRaw
      : null;
  const markPaid = form.get("markPaid") !== "false";
  const updateCalendar = form.get("updateCalendar") === "true";

  let reporter: ReceiptUploadProgressReporter | null = null;
  if (processId) {
    reporter = await ReceiptUploadProgressReporter.create(
      session.user.id,
      processId,
      { markPaid, updateCalendar },
    );
    await reporter.activate("upload", file.name);
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = await storageService.uploadPrivate(
      session.user.id,
      file.name,
      buffer,
      file.type || undefined,
    );

    await reporter?.completeStep("upload");

    return NextResponse.json({
      storagePath,
      originalFileName: file.name,
      storageBackend: storageService.isCloudStorage() ? "supabase" : "local",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    await reporter?.fail(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
