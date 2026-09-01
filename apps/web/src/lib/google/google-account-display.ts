export type GoogleAccountDisplay = {
  name?: string | null;
  email?: string | null;
};

export function formatGoogleAccountLabel(
  account: GoogleAccountDisplay,
): string {
  const name = account.name?.trim();
  const email = account.email?.trim();
  if (name && email) return `${name} (${email})`;
  return email || name || "Google account";
}

export function formatGoogleAccountTitle(
  account: GoogleAccountDisplay,
): string {
  return account.name?.trim() || account.email?.trim() || "Google account";
}

export function formatGoogleAccountSubtitle(
  account: GoogleAccountDisplay,
): string | null {
  const name = account.name?.trim();
  const email = account.email?.trim();
  if (name && email) return email;
  return null;
}
