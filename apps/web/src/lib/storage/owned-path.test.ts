import { describe, expect, test } from "bun:test";

import { privateStoragePathBelongsToUser } from "./owned-path";

const userId = "11111111-1111-1111-1111-111111111111";
const other = "22222222-2222-2222-2222-222222222222";

describe("privateStoragePathBelongsToUser", () => {
  test("allows the caller's SOA object", () => {
    expect(
      privateStoragePathBelongsToUser(`sb:soa/${userId}/file.pdf`, userId),
    ).toBe(true);
    expect(
      privateStoragePathBelongsToUser(
        `local:/tmp/kame-ops-soa/${userId}/file.pdf`,
        userId,
      ),
    ).toBe(true);
  });

  test("rejects another user's path and traversal", () => {
    expect(
      privateStoragePathBelongsToUser(`sb:soa/${other}/file.pdf`, userId),
    ).toBe(false);
    expect(
      privateStoragePathBelongsToUser(`sb:soa/${userId}/../${other}/x`, userId),
    ).toBe(false);
    expect(privateStoragePathBelongsToUser("sb:soa/not-a-uuid/x", userId)).toBe(
      false,
    );
    expect(
      privateStoragePathBelongsToUser(`soa/${userId}/file.pdf`, userId),
    ).toBe(false);
  });
});
