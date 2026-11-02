// Tiny in-memory cache shared across route navigations.
// Pages that fetch via supabase useEffect (not TanStack Query) can hydrate
// from here on remount, then refresh in the background only if stale.
// Cache lives for the tab's lifetime; a hard refresh clears it.

type Entry = { t: number; data: unknown };
const store = new Map<string, Entry>();

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 min

export function readNavCache<T>(key: string): T | undefined {
  const hit = store.get(key);
  return hit ? (hit.data as T) : undefined;
}

export function isNavCacheFresh(key: string, ttlMs = DEFAULT_TTL_MS): boolean {
  const hit = store.get(key);
  return !!hit && Date.now() - hit.t < ttlMs;
}

export function writeNavCache<T>(key: string, data: T): void {
  store.set(key, { t: Date.now(), data });
}

export function invalidateNavCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const k of Array.from(store.keys())) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}
