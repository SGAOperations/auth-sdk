import type { SgaSession } from "./types.js";

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Structural guard for the 200 body. Checks required fields and their types
 * only, ignores unknown keys, and builds the result by explicit field picks so
 * extra server fields never reach the caller.
 */
export function parseSession(body: unknown): SgaSession | null {
  if (!isObj(body)) return null;
  const { user, positions, session } = body;
  if (!isObj(user) || !isObj(session) || !Array.isArray(positions)) {
    return null;
  }
  const { id, email, name, preferredName, isAdmin, isPrimaryAdmin } = user;
  if (
    typeof id !== "string" ||
    typeof email !== "string" ||
    typeof name !== "string" ||
    !(typeof preferredName === "string" || preferredName === null) ||
    typeof isAdmin !== "boolean" ||
    typeof isPrimaryAdmin !== "boolean"
  ) {
    return null;
  }
  const picked: SgaSession["positions"] = [];
  for (const position of positions) {
    if (
      !isObj(position) ||
      typeof position["key"] !== "string" ||
      typeof position["name"] !== "string"
    ) {
      return null;
    }
    picked.push({ key: position["key"], name: position["name"] });
  }
  const { expiresAt, absoluteExpiresAt, createdAt } = session;
  if (
    typeof session["id"] !== "string" ||
    typeof expiresAt !== "string" ||
    typeof absoluteExpiresAt !== "string" ||
    typeof createdAt !== "string"
  ) {
    return null;
  }
  return {
    user: { id, email, name, preferredName, isAdmin, isPrimaryAdmin },
    positions: picked,
    session: { id: session["id"], expiresAt, absoluteExpiresAt, createdAt },
  };
}
