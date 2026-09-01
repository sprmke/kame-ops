import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/auth-config";
import {
  MANUAL_SOA_MAX_BYTES,
  resolveAllowedUploadMime,
} from "@/lib/files/sniff-upload";
import { storageService } from "@/server/services/storage.service";

export const maxDuration = 60;

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

  if (file.size > MANUAL_SOA_MAX_BYTES) {
    return NextResponse.json(
      { error: "File too large (max 15MB)" },
      { status: 400 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = resolveAllowedUploadMime(buffer, file.name, file.type);
    if (!mime) {
      return NextResponse.json(
        { error: "File type not allowed" },
        { status: 400 },
      );
    }

    const storagePath = await storageService.uploadPrivate(
      session.user.id,
      file.name,
      buffer,
      mime,
      "soa",
    );

    return NextResponse.json({
      storagePath,
      originalFileName: file.name,
      mimeType: mime,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
