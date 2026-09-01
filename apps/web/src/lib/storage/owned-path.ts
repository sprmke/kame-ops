const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Manual-upload storage keys are `{folder}/{userId}/…` (Supabase) or
 * `…/kame-ops-{folder}/{userId}/…` (local). Reject anything else so a client
 * cannot point processManualUpload at another user's object.
 */
export function privateStoragePathBelongsToUser(
  storagePath: string,
  userId: string,
): boolean {
  if (!userId || !UUID_RE.test(userId)) return false;
  if (storagePath.includes("\0") || storagePath.includes("..")) return false;

  if (storagePath.startsWith("sb:")) {
    const key = storagePath.slice(3);
    return (
      key.startsWith(`soa/${userId}/`) || key.startsWith(`receipts/${userId}/`)
    );
  }

  if (storagePath.startsWith("local:")) {
    const localPath = storagePath.slice(6).replaceAll("\\", "/");
    return (
      localPath.includes(`/kame-ops-soa/${userId}/`) ||
      localPath.includes(`/kame-ops-receipts/${userId}/`)
    );
  }

  return false;
}
