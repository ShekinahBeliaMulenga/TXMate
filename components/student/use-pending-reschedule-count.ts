"use client";

import { useEffect, useState } from "react";

const ENDPOINT = "/api/student/academic-mate/reschedule-requests/count";
const INTERVAL_MS = 30_000;

export function usePendingRescheduleCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function refresh() {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch(ENDPOINT, {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) return;
        const body = (await response.json()) as { count?: unknown };
        if (typeof body.count === "number" && Number.isFinite(body.count)) {
          setCount(Math.max(0, Math.floor(body.count)));
        }
      } catch {
        // Keep the last known count if temporarily offline.
      }
    }

    void refresh();
    const interval = window.setInterval(() => void refresh(), INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return count;
}
