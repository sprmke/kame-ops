import { describe, expect, it, beforeAll } from "vitest";

beforeAll(() => {
  process.env.AUTH_SECRET ??= "test-auth-secret-32-characters-min!";
});

import {
  createGoogleLinkState,
  parseGoogleLinkState,
} from "@/lib/auth/google-link-state";

describe("google-link-state", () => {
  it("round-trips signed state", () => {
    const token = createGoogleLinkState({
      userId: "user-1",
      creditCardIds: ["card-a", "card-b"],
      callbackUrl: "/dashboard/settings",
    });

    const parsed = parseGoogleLinkState(token);
    expect(parsed).not.toBeNull();
    expect(parsed?.userId).toBe("user-1");
    expect(parsed?.creditCardIds).toEqual(["card-a", "card-b"]);
    expect(parsed?.callbackUrl).toBe("/dashboard/settings");
  });

  it("rejects tampered state", () => {
    const token = createGoogleLinkState({
      userId: "user-1",
      creditCardIds: [],
      callbackUrl: "/dashboard/settings",
    });
    const tampered = `${token}x`;
    expect(parseGoogleLinkState(tampered)).toBeNull();
  });
});
