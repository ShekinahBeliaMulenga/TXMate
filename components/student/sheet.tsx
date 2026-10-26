"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Glyph } from "./session-ui";

/**
 * A pop-up that slides up from the bottom on phones and sits centred on larger screens.
 * Closes on the X, the backdrop or Escape; locks page scroll and returns focus when closed.
 */
export default function Sheet({ label, onClose, children, footer }: { label: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onCloseRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-[#1f1715]/50 animate-in fade-in duration-200" />
      <div role="dialog" aria-modal="true" aria-label={label} className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-[#f9f8f6] shadow-2xl animate-in slide-in-from-bottom-8 fade-in duration-300 sm:max-h-[86dvh] sm:rounded-3xl">
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" title="Close" className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#625954] shadow-sm ring-1 ring-[#e8e0d9] transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/50">
          <Glyph name="x" className="h-5 w-5" />
        </button>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer ? <div className="border-t border-[#e8e0d9] bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{footer}</div> : null}
      </div>
    </div>
  );
}
