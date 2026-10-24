import type { SgaSession } from "./types.js";

interface Entry {
  value: SgaSession | null;
  freshUntil: number;
  staleUntil: number;
}

export type CacheLookup =
  | { state: "fresh"; value: SgaSession | null }
  | { state: "stale"; value: SgaSession }
  | { state: "miss" };

/** Hex SHA-256 of a session token. The raw token is never stored. */
export async function sha256Hex(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  let hex = "";
  for (const byte of new Uint8Array(digest)) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

function isExpired(session: SgaSession, now: number): boolean {
  const limit = Math.min(
    Date.parse(session.session.expiresAt),
    Date.parse(session.session.absoluteExpiresAt),
  );
  // An unparseable timestamp yields NaN, which must count as expired.
  return !(now < limit);
}

/**
 * Dependency-free LRU with a fresh window and a stale-if-error window.
 * Timestamps come from `Date.now()` so fake timers drive them.
 */
export class SessionCache {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly maxEntries: number) {}

  /**
   * Looks up a key. A hit is moved to the most-recently-used end. A session
   * past its own expiry is dropped and reported as a miss. A lookup outside
   * the fresh window reports `stale` only while the stale window is open.
   */
  get(key: string): CacheLookup {
    const entry = this.entries.get(key);
    if (entry === undefined) return { state: "miss" };
    const now = Date.now();
    if (entry.value !== null && isExpired(entry.value, now)) {
      this.entries.delete(key);
      return { state: "miss" };
    }
    if (now < entry.freshUntil) {
      this.entries.delete(key);
      this.entries.set(key, entry);
      return { state: "fresh", value: entry.value };
    }
    if (entry.value !== null && now < entry.staleUntil) {
      return { state: "stale", value: entry.value };
    }
    this.entries.delete(key);
    return { state: "miss" };
  }

  /** Stores a positive entry, stale-servable for `staleSeconds` past its fresh window. */
  setSession(
    key: string,
    value: SgaSession,
    ttlSeconds: number,
    staleSeconds: number,
  ): void {
    const freshUntil = Date.now() + ttlSeconds * 1000;
    this.put(key, {
      value,
      freshUntil,
      staleUntil: freshUntil + staleSeconds * 1000,
    });
  }

  /** Stores a negative entry. It is never served stale. */
  setNegative(key: string, ttlSeconds: number): void {
    const freshUntil = Date.now() + ttlSeconds * 1000;
    this.put(key, { value: null, freshUntil, staleUntil: freshUntil });
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  private put(key: string, entry: Entry): void {
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) break;
      this.entries.delete(oldest.value);
    }
  }
}
