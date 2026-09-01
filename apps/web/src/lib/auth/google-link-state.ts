import { createHmac, timingSafeEqual } from "node:crypto";

export type GoogleLinkState = {
  userId: string;
  creditCardIds: string[];
  callbackUrl: string;
  exp: number;
};

const STATE_TTL_MS = 15 * 60 * 1000;

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not configured.");
  }
  return secret;
}

function signPayload(payload: string): string {
  return createHmac("sha256", authSecret()).update(payload).digest("base64url");
}

export function createGoogleLinkState(input: {
  userId: string;
  creditCardIds: string[];
  callbackUrl: string;
}): string {
  const state: GoogleLinkState = {
    userId: input.userId,
    creditCardIds: input.creditCardIds,
    callbackUrl: input.callbackUrl,
    exp: Date.now() + STATE_TTL_MS,
  };
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

export function parseGoogleLinkState(token: string): GoogleLinkState | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = signPayload(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as GoogleLinkState;
    if (
      !parsed.userId ||
      !Array.isArray(parsed.creditCardIds) ||
      !parsed.callbackUrl ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}
