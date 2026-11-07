import { createHash } from "node:crypto";

/** Remembers verification links that have been opened, so each works once. */
export interface UsedTokenStore {
  /** Records the hash. Returns false, without changing anything, when it was already recorded. */
  insert(tokenHash: string, expiresAt: Date): Promise<boolean>;
  /** Removes records that can no longer matter. */
  prune(now: Date): Promise<void>;
}

/** Links expire after an hour, so the record only needs to outlive that. */
export const USED_TOKEN_RETENTION_MS = 2 * 60 * 60 * 1000;

/** Only the hash is stored, so the table cannot be used to rebuild a link. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** True the first time a token is presented, false every time after. Atomic in the store. */
export async function consumeToken(store: UsedTokenStore, token: string, now: Date = new Date()): Promise<boolean> {
  const first = await store.insert(hashToken(token), new Date(now.getTime() + USED_TOKEN_RETENTION_MS));
  if (first) await store.prune(now).catch(() => undefined);
  return first;
}

/** Creates an in-memory store, used by tests. */
export function memoryTokenStore(): UsedTokenStore & { size: () => number } {
  const rows = new Map<string, Date>();
  return {
    async insert(hash, expiresAt) {
      if (rows.has(hash)) return false;
      rows.set(hash, expiresAt);
      return true;
    },
    async prune(now) {
      for (const [hash, expiresAt] of rows) if (expiresAt <= now) rows.delete(hash);
    },
    size: () => rows.size,
  };
}
