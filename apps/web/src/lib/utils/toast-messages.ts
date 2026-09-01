/** User-friendly toast copy — avoid `(s)` plural hacks and zero-count noise. */

export function deletedStatementsMessage(count: number): string {
  if (count === 0) return "Period deleted";
  if (count === 1) return "1 statement removed";
  return `${count} statements removed`;
}

export function dedupedStatementsMessage(count: number): string {
  if (count === 0) return "No duplicates found";
  if (count === 1) return "1 duplicate removed";
  return `${count} duplicates removed`;
}

export function manualSoaSavedMessage(saved: number, updated: number): string {
  if (saved > 0 && updated > 0) {
    return `${saved} added, ${updated} updated`;
  }
  if (updated > 0) {
    return updated === 1
      ? "Statement updated"
      : `${updated} statements updated`;
  }
  if (saved === 1) return "Statement added";
  if (saved > 1) return `${saved} statements added`;
  return "Statement added";
}
