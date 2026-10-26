"use client";

import { useEffect, useState } from "react";

/**
 * Reports whether an element is currently on screen. Returns a callback ref plus the flag.
 * Defaults to `true` (visible) until the browser says otherwise, so nothing flashes in on load,
 * and stays `true` where IntersectionObserver is unavailable.
 */
export function useInView<T extends Element>(): [(node: T | null) => void, boolean] {
  const [node, setNode] = useState<T | null>(null);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [setNode, inView];
}
