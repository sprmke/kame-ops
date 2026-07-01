import path from "node:path";

export type DownloadedTelegramFile = {
  buffer: Buffer;
  mimeType: string;
  telegramFilePath: string;
  sizeBytes: number;
};

type TgGetFileResp = {
  ok: boolean;
  result?: { file_id: string; file_path?: string; file_size?: number };
  description?: string;
};

function mimeFromTelegramPath(telegramFilePath: string): string {
  const ext = path.extname(telegramFilePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".pdf") return "application/pdf";
  return "image/jpeg";
}

/** Download a Telegram photo/document without persisting to disk. */
export async function downloadTelegramFile(
  token: string,
  fileId: string,
): Promise<DownloadedTelegramFile> {
  const metaRes = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
    { signal: AbortSignal.timeout(20_000) },
  );
  const meta = (await metaRes.json().catch(() => ({}))) as TgGetFileResp;
  if (!metaRes.ok || !meta.ok || !meta.result?.file_path) {
    throw new Error(
      meta.description
        ? `Telegram getFile: ${meta.description}`
        : `Telegram getFile: HTTP ${metaRes.status}`,
    );
  }

  const telegramFilePath = meta.result.file_path;
  const fileRes = await fetch(
    `https://api.telegram.org/file/bot${token}/${telegramFilePath}`,
    { signal: AbortSignal.timeout(60_000) },
  );
  if (!fileRes.ok) {
    throw new Error(`Telegram file download: HTTP ${fileRes.status}`);
  }

  const buffer = Buffer.from(await fileRes.arrayBuffer());
  return {
    buffer,
    mimeType: mimeFromTelegramPath(telegramFilePath),
    telegramFilePath,
    sizeBytes: buffer.length,
  };
}
