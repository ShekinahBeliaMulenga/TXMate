"use client";

import { useCallback, useEffect, useState } from "react";

// The My Requests page dispatches this event (same string) after it marks accepted requests as seen.
const SEEN_EVENT = "txmate:accepted-requests-seen";
const POLL_MS = 30_000;


 // Polls while the tab is visible and clears immediately when the My Requests page marks them as seen.
 
export function useAcceptedRequestCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/student/my-requests/unseen-count", {
        cache: "no-store",
        signal,
      });
      if (!response.ok) return;
      const data = (await response.json()) as { count?: number };
      setCount(typeof data.count === "number" ? data.count : 0);
    } catch {
      // Keep the last known count on network errors and aborts.
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void refresh(controller.signal); // eslint-disable-line react-hooks/set-state-in-effect

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void refresh(controller.signal);
    };
    const onSeen = () => {
      setCount(0);
      void refresh(controller.signal);
    };

    const timer = window.setInterval(refreshIfVisible, POLL_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);
    window.addEventListener("focus", refreshIfVisible);
    window.addEventListener(SEEN_EVENT, onSeen);

    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.removeEventListener("focus", refreshIfVisible);
      window.removeEventListener(SEEN_EVENT, onSeen);
    };
  }, [refresh]);

  return count;
}
