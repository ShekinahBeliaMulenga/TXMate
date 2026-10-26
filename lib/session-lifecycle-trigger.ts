import { after } from "next/server";
import { flushRecentPushNotifications } from "@/lib/prisma";
import { runScheduledJobs } from "@/lib/scheduled-jobs";

/**
 * Runs the background jobs (5-minute session reminders, attendance and completion prompts, review
 * flags, expiry, recurring-session creation) from ordinary app activity, so none of it depends on
 * an external scheduler being configured.
 * Prompts it creates are delivered as browser/push notifications by the Prisma extension.
 *
 * Safe to call from anywhere, as often as you like: the work is idempotent (every prompt is
 * claimed with a conditional update and a unique dedupe key), runs at most once at a time per
 * server process, and is throttled. It runs after the response is sent, so it never slows the
 * request that triggered it, and it never throws. A real scheduler hitting the cron route
 * still works alongside it.
 */
const MIN_INTERVAL_MS = 30_000;
/** The broader scans (recurring sessions, proposal expiry) run at most this often. */
const HEAVY_INTERVAL_MS = 5 * 60_000;

let lastStartedAt = 0;
let lastHeavyAt = 0;
let running = false;
let rerunQueued = false;

async function execute(): Promise<void> {
  try {
    const includeHeavy = Date.now() - lastHeavyAt >= HEAVY_INTERVAL_MS;
    if (includeHeavy) lastHeavyAt = Date.now();
    await runScheduledJobs(new Date(), { includeHeavy });
    // Now that everything is committed, make sure each new prompt reaches the person's browser.
    await flushRecentPushNotifications();
  } catch (error) {
    console.error("Session lifecycle trigger failed:", error);
  } finally {
    running = false;
    if (rerunQueued) {
      rerunQueued = false;
      running = true;
      lastStartedAt = Date.now();
      void execute();
    }
  }
}

/**
 * `force` is for moments something just changed (someone answered attendance or confirmed
 * completion), so the next prompt goes out immediately instead of at the next throttle window.
 */
export function triggerSessionLifecycle(options: { force?: boolean } = {}): void {
  if (running) {
    if (options.force) rerunQueued = true;
    return;
  }
  if (!options.force && Date.now() - lastStartedAt < MIN_INTERVAL_MS) return;
  running = true;
  lastStartedAt = Date.now();
  try {
    after(execute);
  } catch {
    // Not inside a request (or `after` unavailable): just run it in the background.
    void execute();
  }
}
