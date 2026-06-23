import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "crypto";

const ALGORITHM = "aes-256-gcm";

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, "kame-ops-salt", 32);
}

/** Primary secret used for new encryption. */
function getEncryptSecret(): string {
  const enc = process.env.ENCRYPTION_KEY?.trim();
  if (enc) return enc;
  const auth = process.env.AUTH_SECRET?.trim();
  if (auth) return auth;
  return "dev-only-key";
}

/**
 * Secrets to try when decrypting legacy data.
 * Older rows may have been encrypted with AUTH_SECRET before ENCRYPTION_KEY existed.
 */
function getDecryptSecrets(): string[] {
  const secrets: string[] = [];
  const enc = process.env.ENCRYPTION_KEY?.trim();
  const auth = process.env.AUTH_SECRET?.trim();
  if (enc) secrets.push(enc);
  if (auth && auth !== enc) secrets.push(auth);
  if (secrets.length === 0) secrets.push("dev-only-key");
  return secrets;
}

function getKey(): Buffer {
  return deriveKey(getEncryptSecret());
}

function tryDecryptWithKey(encoded: string, key: Buffer): string | null {
  try {
    const buf = Buffer.from(encoded, "base64");
    if (buf.length < 29) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    return null;
  }
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(encoded: string): string {
  const plain = tryDecryptSecret(encoded);
  if (plain === null) {
    throw new Error(
      "Failed to decrypt secret. ENCRYPTION_KEY may not match the key used when this data was saved.",
    );
  }
  return plain;
}

/** Returns null when the blob cannot be decrypted (usually ENCRYPTION_KEY mismatch). */
export function tryDecryptSecret(encoded: string): string | null {
  if (!encoded?.trim()) return null;

  const trimmed = encoded.trim();
  if (trimmed.startsWith("{")) {
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      return null;
    }
  }

  for (const secret of getDecryptSecrets()) {
    const plain = tryDecryptWithKey(trimmed, deriveKey(secret));
    if (plain !== null) return plain;
  }
  return null;
}
