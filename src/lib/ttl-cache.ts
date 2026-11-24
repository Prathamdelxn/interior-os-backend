// =============================================================================
// InteriorOS Backend — tiny in-process TTL cache
//
// A page fires 5-10 API calls at once and every one re-checked the same user
// status / role / project membership in MongoDB. Caching those answers for a
// few seconds per server instance removes most of that repeated round-trip time.
// Entries expire on their own; call `invalidate*` after changing roles/members
// so the change applies immediately on this instance.
// =============================================================================

interface Entry<T> {
  value: T;
  expires: number;
}

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 5000;

/**
 * Return the cached value for `key`, or compute it with `load` and cache it for `ttlMs`.
 * Concurrent callers for the same key share one in-flight load.
 */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const p = load()
    .then((value) => {
      if (store.size >= MAX_ENTRIES) store.clear(); // crude bound; entries are cheap to rebuild
      store.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Drop every cached entry whose key starts with `prefix` (e.g. after a role/member change). */
export function invalidatePrefix(prefix: string): void {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}

/** Drop everything (e.g. after editing an org role that many users share). */
export function invalidateAll(): void {
  store.clear();
}
