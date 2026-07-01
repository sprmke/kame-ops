export function reminderFingerprint(params: {
  issuerId: string;
  cardLast4: string;
  dueDateYmd: string;
  daysAway: number;
}): string {
  return `reminder:${params.issuerId}:${params.cardLast4}:${params.dueDateYmd}:D-${params.daysAway}`;
}
