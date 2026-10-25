import type { SgaSession } from "./session/types.js";

/** What the guards accept: a session, or no session. No session grants no access. */
export type MaybeSession = SgaSession | null | undefined;

// A runtime check rather than `server-only`: the root entry must stay
// importable from plain Node, where `server-only` throws.
function assertServer(name: string): void {
  if ("window" in globalThis) {
    throw new Error(`@nusgaops/sgauth: ${name}() is server-only`);
  }
}

function heldKeys(session: MaybeSession): Set<string> {
  return new Set(session?.positions.map((position) => position.key));
}

/** Whether the session holds the position. `false` for no session. */
export function hasPosition(session: MaybeSession, key: string): boolean {
  assertServer("hasPosition");
  return heldKeys(session).has(key);
}

/** Whether the session holds at least one of `keys`. `false` for empty `keys`. */
export function hasAnyPosition(
  session: MaybeSession,
  keys: readonly string[],
): boolean {
  assertServer("hasAnyPosition");
  const held = heldKeys(session);
  return keys.some((key) => held.has(key));
}

/** Whether the session holds every one of `keys`. `false` for empty `keys`, so nothing is granted vacuously. */
export function hasAllPositions(
  session: MaybeSession,
  keys: readonly string[],
): boolean {
  assertServer("hasAllPositions");
  const held = heldKeys(session);
  return keys.length > 0 && keys.every((key) => held.has(key));
}

/** Whether the user is an admin or the primary admin. `false` for no session. */
export function isAdmin(session: MaybeSession): boolean {
  assertServer("isAdmin");
  return session ? session.user.isAdmin || session.user.isPrimaryAdmin : false;
}
