import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request memoization for read helpers.
 *
 * A single tRPC batch fans out into many procedures that re-read the same
 * user-scoped rows (category rules, card lists, statement lookups). Against a
 * remote database each repeat costs a full round trip, so we collapse identical
 * calls within one request into a single in-flight promise.
 *
 * Scope is one HTTP request, so nothing survives long enough to go stale.
 */
const storage = new AsyncLocalStorage<Map<string, Promise<unknown>>>();

export function runWithRequestCache<T>(fn: () => Promise<T>): Promise<T> {
  return storage.run(new Map(), fn);
}

/**
 * Wrap a read function so repeat calls with the same arguments within a request
 * share one result. Outside a request scope it passes straight through.
 */
export function cachedPerRequest<Args extends unknown[], Result>(
  keyPrefix: string,
  fn: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return (...args: Args): Promise<Result> => {
    const store = storage.getStore();
    if (!store) return fn(...args);

    const key = `${keyPrefix}:${JSON.stringify(args)}`;
    const cached = store.get(key);
    if (cached) return cached as Promise<Result>;

    // Rejections must not be memoized, or one failure poisons the whole request.
    const pending = fn(...args).catch((error: unknown) => {
      store.delete(key);
      throw error;
    });

    store.set(key, pending);
    return pending;
  };
}

/**
 * Drop memoized reads after a write so later callers in the same request see the
 * new rows. Repair routines on read paths rely on this.
 */
export function invalidateRequestCache(...keyPrefixes: string[]): void {
  const store = storage.getStore();
  if (!store) return;

  for (const key of store.keys()) {
    if (keyPrefixes.some((prefix) => key.startsWith(`${prefix}:`))) {
      store.delete(key);
    }
  }
}
