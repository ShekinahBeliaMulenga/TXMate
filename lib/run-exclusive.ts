/**
 * Runs tasks that share a key one after another instead of at the same time, within this server process.
 *
 * Used for the two-step code checks: each check reads the failed-attempt count and lock from the database, so
 * checks for one admin must not overlap, or a burst of parallel guesses could all pass the lock check before any
 * of them is counted. Tasks for different keys still run in parallel.
 */

const globalChains = globalThis as typeof globalThis & { txmateExclusiveTails?: Map<string, Promise<void>> };

function tails(): Map<string, Promise<void>> {
  if (!globalChains.txmateExclusiveTails) globalChains.txmateExclusiveTails = new Map();
  return globalChains.txmateExclusiveTails;
}

/** Runs `task` once every earlier task with the same `key` has finished (whether it succeeded or failed). */
export function runExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
  const map = tails();
  // Every stored tail swallows its own failure, so `previous` never rejects and a failed task cannot block the next one.
  const previous = map.get(key) ?? Promise.resolve();
  const result = previous.then(task);
  const tail = result.then(() => undefined, () => undefined);
  map.set(key, tail);
  void tail.then(() => {
    if (map.get(key) === tail) map.delete(key);
  });
  return result;
}
