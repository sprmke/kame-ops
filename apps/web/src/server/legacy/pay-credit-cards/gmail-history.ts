// @ts-nocheck
import type { gmail_v1 } from 'googleapis';

export type HistoryPollResult = {
  /** New mailbox history id to persist for the next poll. */
  newHistoryId: string;
  /** Message ids from `messageAdded` events (deduped, insertion order). */
  addedMessageIds: string[];
};

/**
 * Gmail / Google client 404 (expired history cursor, deleted message, etc.).
 */
export function isGmailNotFoundError(err: unknown): boolean {
  const g = err as {
    code?: number | string;
    response?: { status?: number };
    message?: string;
  };
  if (g.response?.status === 404) return true;
  if (g.code === 404 || g.code === '404') return true;
  if (
    typeof g.message === 'string' &&
    /requested entity was not found/i.test(g.message)
  ) {
    return true;
  }
  return false;
}

/**
 * Current mailbox history id (use to initialize watch state).
 */
export async function getMailboxHistoryId(
  gmail: gmail_v1.Gmail,
): Promise<string> {
  const prof = await gmail.users.getProfile({ userId: 'me' });
  const id = prof.data.historyId;
  if (!id) throw new Error('Gmail profile missing historyId');
  return id;
}

/**
 * Lists `messageAdded` history since `startHistoryId`, following pagination.
 * On expired/invalid `startHistoryId`, throws an error with `historyExpired: true`.
 */
export async function listAddedMessageIdsSince(
  gmail: gmail_v1.Gmail,
  startHistoryId: string,
): Promise<HistoryPollResult> {
  const seen = new Set<string>();
  const addedMessageIds: string[] = [];
  let pageToken: string | undefined;
  let newHistoryId = startHistoryId;

  try {
    for (;;) {
      const res = await gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        historyTypes: ['messageAdded'],
        pageToken,
        maxResults: 500,
      });

      if (res.data.historyId) newHistoryId = res.data.historyId;

      for (const h of res.data.history ?? []) {
        for (const m of h.messagesAdded ?? []) {
          const id = m.message?.id;
          if (!id || seen.has(id)) continue;
          seen.add(id);
          addedMessageIds.push(id);
        }
      }

      pageToken = res.data.nextPageToken ?? undefined;
      if (!pageToken) break;
    }
  } catch (e) {
    if (isGmailNotFoundError(e)) {
      const err = new Error(
        'Gmail history expired or invalid startHistoryId — re-initialize watch state',
      );
      (err as Error & { historyExpired?: boolean }).historyExpired = true;
      throw err;
    }
    throw e;
  }

  return { newHistoryId, addedMessageIds };
}
