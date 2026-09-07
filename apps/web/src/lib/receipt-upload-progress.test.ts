import { describe, expect, test } from "bun:test";

import {
  buildReceiptUploadStepPlan,
  computeReceiptUploadProgressPercent,
} from "@/lib/receipt-upload-progress";

function markPerItemStepsDone(
  steps: ReturnType<typeof buildReceiptUploadStepPlan>,
) {
  return steps.map((step) =>
    step.id === "upload" || step.id === "prepare"
      ? step
      : { ...step, status: "done" as const },
  );
}

function resetPerItemSteps(
  steps: ReturnType<typeof buildReceiptUploadStepPlan>,
) {
  return steps.map((step) =>
    step.id === "upload" || step.id === "prepare"
      ? { ...step, status: "done" as const }
      : { ...step, status: "pending" as const },
  );
}

describe("computeReceiptUploadProgressPercent", () => {
  test("single receipt progresses from zero toward completion", () => {
    const plan = buildReceiptUploadStepPlan({
      markPaid: true,
      updateCalendar: false,
    });
    const start = computeReceiptUploadProgressPercent(plan, {
      total: 1,
      completed: 0,
    });
    expect(start).toBeGreaterThanOrEqual(0);

    const activeValidate = plan.map((step) =>
      step.id === "validate" ? { ...step, status: "active" as const } : step,
    );
    const mid = computeReceiptUploadProgressPercent(activeValidate, {
      total: 1,
      completed: 0,
    });
    expect(mid).toBeGreaterThan(start);
  });

  test("does not regress when per-item steps reset for the next receipt", () => {
    const plan = buildReceiptUploadStepPlan({
      markPaid: true,
      updateCalendar: false,
    });
    const preludeDone = plan.map((step) =>
      step.id === "upload" || step.id === "prepare"
        ? { ...step, status: "done" as const }
        : step,
    );

    const endOfFirstReceipt = markPerItemStepsDone(preludeDone);
    const endOfFirstPercent = computeReceiptUploadProgressPercent(
      endOfFirstReceipt,
      { total: 2, completed: 0 },
    );

    const startOfSecondReceipt = resetPerItemSteps(endOfFirstReceipt);
    const startOfSecondPercent = computeReceiptUploadProgressPercent(
      startOfSecondReceipt,
      { total: 2, completed: 1 },
    );

    expect(startOfSecondPercent).toBeGreaterThanOrEqual(endOfFirstPercent);
  });

  test("completed batch group returns 100%", () => {
    const plan = buildReceiptUploadStepPlan({
      markPaid: true,
      updateCalendar: false,
    }).map((step) => ({ ...step, status: "done" as const }));

    expect(
      computeReceiptUploadProgressPercent(plan, { total: 3, completed: 3 }),
    ).toBe(100);
  });
});
