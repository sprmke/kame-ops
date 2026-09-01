import type { AutomationJobType } from "@/lib/automations/job-types";

type ReminderRunResult = {
  sent?: number;
  skipped?: number;
  failed?: number;
  inWindowCount?: number;
  readyCount?: number;
  message?: string;
};

type SoaRunResult = {
  ok?: boolean;
  message?: string;
  statementCount?: number;
  parsedCount?: number;
  rowCount?: number;
  unavailableCount?: number;
  warning?: string;
};

export function formatReminderRunSummary(result: ReminderRunResult): string[] {
  const lines: string[] = [];

  if (result.message) {
    lines.push(result.message);
  } else if ((result.sent ?? 0) > 0) {
    lines.push(
      `Sent ${result.sent} reminder${result.sent === 1 ? "" : "s"} via Telegram or Slack.`,
    );
  } else if ((result.inWindowCount ?? 0) === 0) {
    lines.push("No cards are in your reminder window today.");
  } else {
    lines.push("No new reminders were sent.");
  }

  if ((result.skipped ?? 0) > 0) {
    lines.push(
      `${result.skipped} skipped — already sent today or notifications not configured.`,
    );
  }
  if ((result.failed ?? 0) > 0) {
    lines.push(`${result.failed} failed to send.`);
  }
  if (result.inWindowCount != null && result.inWindowCount > 0) {
    lines.push(
      `${result.inWindowCount} card${result.inWindowCount === 1 ? "" : "s"} in reminder window.`,
    );
  }

  return lines;
}

export function formatSoaRunSummary(result: SoaRunResult): string[] {
  if (result.ok === false && result.message) {
    return [result.message];
  }

  const lines: string[] = [];
  const statements = result.statementCount ?? result.parsedCount ?? 0;

  if (statements > 0) {
    lines.push(
      `Parsed ${statements} statement${statements === 1 ? "" : "s"} from Gmail.`,
    );
  } else {
    lines.push("No new statements were parsed from Gmail.");
  }

  if (result.rowCount != null && result.rowCount > 0) {
    lines.push(
      `${result.rowCount} card row${result.rowCount === 1 ? "" : "s"} updated.`,
    );
  }
  if ((result.unavailableCount ?? 0) > 0) {
    lines.push(
      `${result.unavailableCount} card${result.unavailableCount === 1 ? "" : "s"} marked unavailable (no SOA email found).`,
    );
  }
  if (result.warning) {
    lines.push(result.warning);
  }

  return lines;
}

export function formatAutomationRunSummary(
  jobType: string,
  result: unknown,
): string | null {
  const lines = formatAutomationRunSummaryLines(jobType, result);
  return lines[0] ?? null;
}

export type AutomationRunResultTone =
  | "success"
  | "neutral"
  | "warning"
  | "error";

export function getAutomationRunResultTone(
  jobType: string,
  result: unknown,
): AutomationRunResultTone {
  if (!result || typeof result !== "object") return "neutral";

  if (jobType === "send_due_reminders") {
    const r = result as ReminderRunResult;
    if ((r.failed ?? 0) > 0) return "warning";
    if ((r.sent ?? 0) > 0) return "success";
    return "neutral";
  }

  if (jobType === "run_soa_pipeline") {
    const r = result as SoaRunResult;
    if (r.ok === false || r.warning) return "warning";
    if ((r.statementCount ?? r.parsedCount ?? 0) > 0) return "success";
    return "neutral";
  }

  return "neutral";
}

export function getAutomationRunResultPresentation(
  jobType: string,
  result: unknown,
): { tone: AutomationRunResultTone; lines: string[] } | null {
  const lines = formatAutomationRunSummaryLines(jobType, result);
  if (lines.length === 0) return null;
  return {
    tone: getAutomationRunResultTone(jobType, result),
    lines,
  };
}

export function formatAutomationRunSummaryLines(
  jobType: string,
  result: unknown,
): string[] {
  if (!result || typeof result !== "object") return [];

  if (jobType === "send_due_reminders") {
    return formatReminderRunSummary(result as ReminderRunResult);
  }
  if (jobType === "run_soa_pipeline") {
    return formatSoaRunSummary(result as SoaRunResult);
  }
  return [];
}

export function parseAutomationRunResult(
  jobType: AutomationJobType | string,
  resultSummary: string | null | undefined,
): unknown {
  if (!resultSummary) return null;
  try {
    return JSON.parse(resultSummary) as unknown;
  } catch {
    return null;
  }
}

export function automationRunDialogTitle(jobType: string): string {
  if (jobType === "send_due_reminders") return "Sending payment reminders";
  if (jobType === "run_soa_pipeline") return "Checking Gmail for statements";
  return "Running automation";
}

export function automationRunDoneTitle(jobType: string): string {
  if (jobType === "send_due_reminders") return "Reminders finished";
  if (jobType === "run_soa_pipeline") return "SOA check finished";
  return "Run finished";
}
