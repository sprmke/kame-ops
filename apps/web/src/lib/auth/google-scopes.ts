/** OAuth scopes granted at sign-in (Gmail SOA + Calendar due events). */
export const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
] as const;

export const GOOGLE_OAUTH_SCOPE_STRING = GOOGLE_OAUTH_SCOPES.join(" ");
