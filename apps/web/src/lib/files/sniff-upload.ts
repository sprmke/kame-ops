const PDF = "application/pdf";
const JPEG = "image/jpeg";
const PNG = "image/png";
const GIF = "image/gif";
const WEBP = "image/webp";

export const MANUAL_SOA_MAX_BYTES = 15 * 1024 * 1024;

export const MANUAL_SOA_MIME_TYPES = new Set([PDF, JPEG, PNG, GIF, WEBP]);

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false;
  return sig.every((b, i) => bytes[i] === b);
}

/** Detect PDF/JPEG/PNG/GIF/WEBP from magic bytes. */
export function sniffUploadMime(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return PDF; // %PDF
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return JPEG;
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return PNG;
  }
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return GIF;
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return WEBP;
  }
  return null;
}

export function mimeFromFileName(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return PDF;
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return JPEG;
  if (lower.endsWith(".png")) return PNG;
  if (lower.endsWith(".gif")) return GIF;
  if (lower.endsWith(".webp")) return WEBP;
  return null;
}

/**
 * Prefer magic bytes. Fall back to a declared type / extension only when they
 * agree with an allowed SOA upload type (empty Content-Type is not trusted).
 */
export function resolveAllowedUploadMime(
  bytes: Uint8Array,
  fileName: string,
  declaredType: string | undefined,
): string | null {
  const sniffed = sniffUploadMime(bytes);
  if (sniffed) return sniffed;

  const declared = (declaredType ?? "").toLowerCase().split(";")[0]!.trim();
  const fromName = mimeFromFileName(fileName);
  if (
    declared &&
    MANUAL_SOA_MIME_TYPES.has(declared) &&
    fromName === declared
  ) {
    return declared;
  }
  return null;
}

export function isImageMime(mime: string): boolean {
  return mime.startsWith("image/");
}

export function isPdfMime(mime: string): boolean {
  return mime === PDF;
}

export function extensionForMime(mime: string): string {
  if (mime === PDF) return "pdf";
  if (mime === JPEG) return "jpg";
  if (mime === PNG) return "png";
  if (mime === GIF) return "gif";
  if (mime === WEBP) return "webp";
  return "bin";
}
