import "server-only";

import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { env } from "@/env";

const SUPABASE_PREFIX = "sb:";
const LOCAL_PREFIX = "local:";

function isSupabaseConfigured(): boolean {
  return !!(
    env.SUPABASE_URL &&
    env.SUPABASE_SERVICE_ROLE_KEY &&
    env.SUPABASE_STORAGE_BUCKET_PRIVATE
  );
}

function getSupabaseAdmin() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase storage is not configured");
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export const storageService = {
  /** True when Supabase Storage env vars are set (production target). */
  isCloudStorage(): boolean {
    return isSupabaseConfigured();
  },

  /**
   * Upload a private file (receipts, SOA PDFs).
   * Returns a prefixed storage key/path stored in DB.
   */
  async uploadPrivate(
    userId: string,
    filename: string,
    buffer: Buffer,
    contentType?: string,
    folder = "receipts",
  ): Promise<string> {
    const safeName = sanitizeFilename(filename);
    const objectKey = `${folder}/${userId}/${Date.now()}-${safeName}`;

    if (isSupabaseConfigured()) {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.storage
        .from(env.SUPABASE_STORAGE_BUCKET_PRIVATE!)
        .upload(objectKey, buffer, {
          contentType: contentType ?? "application/octet-stream",
          upsert: false,
        });
      if (error) {
        throw new Error(`Storage upload failed: ${error.message}`);
      }
      return `${SUPABASE_PREFIX}${objectKey}`;
    }

    const localDirName =
      folder === "receipts" ? "kame-ops-receipts" : `kame-ops-${folder}`;
    const dir = join(tmpdir(), localDirName, userId);
    await mkdir(dir, { recursive: true });
    const localPath = join(dir, `${Date.now()}-${safeName}`);
    await writeFile(localPath, buffer);
    return `${LOCAL_PREFIX}${localPath}`;
  },

  /**
   * Resolve a stored path/key to a local filesystem path for parsing.
   * Downloads Supabase objects to a temp file when needed.
   */
  async resolveLocalPath(storagePath: string): Promise<string> {
    if (storagePath.startsWith(LOCAL_PREFIX)) {
      return storagePath.slice(LOCAL_PREFIX.length);
    }

    if (storagePath.startsWith(SUPABASE_PREFIX)) {
      const objectKey = storagePath.slice(SUPABASE_PREFIX.length);
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.storage
        .from(env.SUPABASE_STORAGE_BUCKET_PRIVATE!)
        .download(objectKey);
      if (error || !data) {
        throw new Error(
          `Storage download failed: ${error?.message ?? "no data"}`,
        );
      }
      const buf = Buffer.from(await data.arrayBuffer());
      const downloadDir = join(tmpdir(), "kame-ops-downloads");
      await mkdir(downloadDir, { recursive: true });
      const tmpPath = join(downloadDir, objectKey.replace(/\//g, "_"));
      await writeFile(tmpPath, buf);
      return tmpPath;
    }

    // Legacy: bare absolute path from older uploads
    return storagePath;
  },

  /** Read a private object from storage (null when missing or unreadable). */
  async readPrivate(storagePath: string): Promise<Buffer | null> {
    if (!storagePath) return null;

    if (storagePath.startsWith(LOCAL_PREFIX)) {
      try {
        return await readFile(storagePath.slice(LOCAL_PREFIX.length));
      } catch {
        return null;
      }
    }

    if (storagePath.startsWith(SUPABASE_PREFIX)) {
      if (!isSupabaseConfigured()) return null;
      const objectKey = storagePath.slice(SUPABASE_PREFIX.length);
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.storage
        .from(env.SUPABASE_STORAGE_BUCKET_PRIVATE!)
        .download(objectKey);
      if (error || !data) return null;
      return Buffer.from(await data.arrayBuffer());
    }

    try {
      return await readFile(storagePath);
    } catch {
      return null;
    }
  },

  /** Signed URL for private objects (null for local/temp paths). */
  async createSignedDownloadUrl(
    storagePath: string,
    expiresInSeconds = 3600,
  ): Promise<string | null> {
    if (!storagePath.startsWith(SUPABASE_PREFIX) || !isSupabaseConfigured()) {
      return null;
    }
    const objectKey = storagePath.slice(SUPABASE_PREFIX.length);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(env.SUPABASE_STORAGE_BUCKET_PRIVATE!)
      .createSignedUrl(objectKey, expiresInSeconds);
    if (error) return null;
    return data.signedUrl;
  },
};
