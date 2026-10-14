"use client";

import { useEffect, useState } from "react";

/** Dispatch this on `window` after marking a conversation as read so the sidebar updates immediately. */
export const MESSAGES_READ_EVENT = "txmate:messages-read";

export function useUnreadMessageCount(intervalMs = 15_000) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function refresh() {
      try {
        const response = await fetch("/api/student/messages/unread-count", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = (await response.json()) as { count?: number };
        setCount(typeof data.count === "number" ? data.count : 0);
      } catch {
        // Ignore network errors and aborts; the next poll will try again.
      }
    }

    function refreshIfVisible() {
      if (document.visibilityState === "visible") void refresh();
    }

    void refresh();
    const timer = window.setInterval(refreshIfVisible, intervalMs);
    document.addEventListener("visibilitychange", refreshIfVisible);
    window.addEventListener("focus", refreshIfVisible);
    window.addEventListener(MESSAGES_READ_EVENT, refreshIfVisible);

    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.removeEventListener("focus", refreshIfVisible);
      window.removeEventListener(MESSAGES_READ_EVENT, refreshIfVisible);
    };
  }, [intervalMs]);

  return count;
}
