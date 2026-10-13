"use client";

import { useEffect, useRef, type ReactNode } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  cancelLabel?: string;
  /** "danger" is red (deleting). "warning" uses the TXMate maroon (editing). */
  tone?: "danger" | "warning";
  /** True while the action is running. Locks the dialog so it can't be dismissed mid-save. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  busyLabel = "Working...",
  cancelLabel = "Cancel",
  tone = "warning",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Open and close the native <dialog> to match the `open` prop.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const danger = tone === "danger";

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      // Escape key: let the parent decide, and never dismiss while a request is running.
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      // Click on the dark backdrop closes the dialog.
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-[#e2d9d0] bg-white p-0 text-[#241f1c] shadow-2xl backdrop:bg-black/50"
    >
      {open && (
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3.5">
            <span
              aria-hidden="true"
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                danger ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              </svg>
            </span>

            <div className="min-w-0">
              <h2 id="confirm-dialog-title" className="text-base font-bold tracking-tight">
                {title}
              </h2>
              <p id="confirm-dialog-message" className="mt-1.5 text-sm leading-6 text-[#625b55]">
                {message}
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {/* Cancel is focused first so pressing Enter by accident never confirms. */}
            <button
              type="button"
              autoFocus
              disabled={busy}
              onClick={onCancel}
              className="min-h-11 rounded-xl border border-[#d8cec5] bg-white px-5 py-2.5 text-sm font-semibold text-[#4e4742] transition hover:bg-[#f6f1ec] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cancelLabel}
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                danger
                  ? "bg-red-600 hover:bg-red-700 focus-visible:ring-red-400"
                  : "bg-[#7d1f2a] hover:bg-[#681923] focus-visible:ring-[#7d1f2a]/50"
              }`}
            >
              {busy && (
                <svg aria-hidden="true" className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              )}
              {busy ? busyLabel : confirmLabel}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}