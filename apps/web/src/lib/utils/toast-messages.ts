/** User-friendly toast copy — avoid `(s)` plural hacks and zero-count noise. */

export function deletedStatementsMessage(count: number): string {
  if (count === 0) return "Period deleted";
  if (count === 1) return "1 statement removed";
  return `${count} statements removed`;
}

export function sentRemindersMessage(count: number): string {
  if (count === 0) return "No reminders to send";
  if (count === 1) return "1 reminder sent";
  return `${count} reminders sent`;
}
