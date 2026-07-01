/** Shared comma-separated API key input parsing (Settings UI + server). */

export function parseCommaSeparatedKeys(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** True when segment is a masked preview (`••••abcd`), not a full API key. */
export function isMaskedKeySegment(segment: string): boolean {
  return /^•{4}/.test(segment.trim());
}

export function inputHasOnlyMaskedKeys(raw: string): boolean {
  const segments = parseCommaSeparatedKeys(raw);
  return segments.length > 0 && segments.every(isMaskedKeySegment);
}

export function maskApiKeyPreview(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 4) return "••••";
  return `••••${trimmed.slice(-4)}`;
}

export function resolveKeysFromInput(
  raw: string,
  existingKeys: string[],
): string[] {
  const segments = parseCommaSeparatedKeys(raw);
  if (segments.length === 0) return [];

  const resolved: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    if (isMaskedKeySegment(segment)) {
      const existing = existingKeys[i];
      if (!existing) {
        throw new Error("Could not keep existing key — re-enter full API keys");
      }
      resolved.push(existing);
      continue;
    }
    if (segment.length < 10) {
      throw new Error(`Key ${i + 1} looks too short`);
    }
    resolved.push(segment);
  }
  return resolved;
}
