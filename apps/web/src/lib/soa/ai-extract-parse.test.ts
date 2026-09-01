import { describe, expect, test } from "bun:test";

import { parseSoaAiExtractJson } from "./ai-extract-parse";

describe("parseSoaAiExtractJson", () => {
  test("parses fenced JSON and camelCase keys", () => {
    const parsed = parseSoaAiExtractJson(`
Here you go
\`\`\`json
{"issuerId":"rcbc","cardLast4":"8899","statementDate":"2026-03-12","dueDate":"Apr 08, 2026","minimumDue":1234.5,"totalDue":"9,876.00","transactions":[{"date":"Mar 01","description":"Store","amount":"10.00"}]}
\`\`\`
`);
    expect(parsed?.issuerId).toBe("rcbc");
    expect(parsed?.cardLast4).toBe("8899");
    expect(parsed?.statementDate).toBe("2026-03-12");
    expect(parsed?.dueDate).toBe("Apr 08, 2026");
    expect(parsed?.minimumDue).toBe("1,234.50");
    expect(parsed?.totalDue).toBe("9,876.00");
    expect(parsed?.transactions).toHaveLength(1);
  });

  test("returns null for non-JSON", () => {
    expect(parseSoaAiExtractJson("sorry")).toBeNull();
  });

  test("drops incomplete transactions", () => {
    const parsed = parseSoaAiExtractJson(
      JSON.stringify({
        issuer_id: "bpi",
        transactions: [
          { description: "", amount: "1.00" },
          { description: "Ok" },
        ],
      }),
    );
    expect(parsed?.transactions).toEqual([]);
  });
});
