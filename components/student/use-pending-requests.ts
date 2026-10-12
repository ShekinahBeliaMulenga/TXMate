"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const ENDPOINT = "/api/student/academic-mate/requests/pending-count";
const CHANGED_EVENT = "txmate:pending-requests-changed";

const POLL_INTERVAL_MS = 60_000; // background refresh while the tab is visible
const MIN_GAP_MS = 5_000; // ignore focus/visibility refreshes closer than this

/** Call after accepting/declining (or otherwise changing) a request. */
export function notifyPendingRequestsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function usePendingRequestCount() {
  const [count, setCount] = useState(0);

  const controllerRef = useRef<AbortController | null>(null);
  const lastFetchRef = useRef(0);

  const refresh = useCallback(async (force = false) => {
    if (!force) {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastFetchRef.current < MIN_GAP_MS) return;
    }

    // Cancel any request still in flight so responses can never arrive out of order.
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    lastFetchRef.current = Date.now();

    try {
      const response = await fetch(ENDPOINT, {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      if (response.status === 401 || response.status === 403) {
        setCount(0);
        return;
      }

      if (!response.ok) return; // keep the last known count

      const body = (await response.json()) as { count?: unknown };

      if (
        !controller.signal.aborted &&
        typeof body.count === "number" &&
        Number.isFinite(body.count)
      ) {
        setCount(Math.max(0, Math.floor(body.count)));
      }
    } catch {
      // Aborted or offline: keep the last known count.
    }
  }, []);

  useEffect(() => {
    void refresh(true);

    const onChanged = () => void refresh(true);
    const onFocus = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    const interval = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);

    window.addEventListener(CHANGED_EVENT, onChanged);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener(CHANGED_EVENT, onChanged);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      controllerRef.current?.abort();
    };
  }, [refresh]);

  return count;
}