import { describe, expect, test } from "bun:test";

import { manualSoaSavedMessage } from "./toast-messages";

describe("manualSoaSavedMessage", () => {
  test("describes mixed batches", () => {
    expect(manualSoaSavedMessage(1, 0)).toBe("Statement added");
    expect(manualSoaSavedMessage(0, 1)).toBe("Statement updated");
    expect(manualSoaSavedMessage(2, 1)).toBe("2 added, 1 updated");
    expect(manualSoaSavedMessage(0, 2)).toBe("2 statements updated");
  });
});
