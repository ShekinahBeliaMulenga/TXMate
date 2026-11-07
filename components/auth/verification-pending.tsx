"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { RESEND_COOLDOWN_SECONDS } from "@/lib/auth-policy";

type Props = {
  email: string;
  /** Shown above the instructions, for example "Your account is created." */
  lead?: string;
  /** Where the emailed link brings the person back to. */
  callbackURL: string;
  /** Label and action for leaving this screen (back to the form). */
  backLabel: string;
  onBack: () => void;
  /** The email was just sent by the sign-up or sign-in that led here, so the first resend waits. */
  justSent?: boolean;
};

/** Shown after sign-up, and when sign-in is refused because the email is not verified yet. */
export default function VerificationPending({ email, lead, callbackURL, backLabel, onBack, justSent = true }: Props) {
  const [wait, setWait] = useState(justSent ? RESEND_COOLDOWN_SECONDS : 0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function resend() {
    if (busy || wait > 0) return;
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await authClient.sendVerificationEmail({ email, callbackURL });
      if (error) {
        if (error.status === 429) {
          setWait(RESEND_COOLDOWN_SECONDS);
          setNotice({ tone: "error", text: "Too many requests. Please wait a minute before asking for another email." });
        } else {
          setNotice({ tone: "error", text: error.message || "We couldn’t send the email. Please try again shortly." });
        }
        return;
      }
      setWait(RESEND_COOLDOWN_SECONDS);
      setNotice({ tone: "ok", text: "If this address still needs verifying, a new link is on its way. Older links stop working once you use a newer one." });
    } catch {
      setNotice({ tone: "error", text: "Something went wrong. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5" role="status" aria-live="polite">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-[#282321]">Check your email</h2>
        {lead ? <p className="mt-1.5 text-sm text-gray-600">{lead}</p> : null}
        <p className="mt-1.5 break-words text-sm text-gray-600">
          We sent a verification link to <span className="font-semibold text-gray-900">{email}</span>. Open it to continue. The link works once and expires in 1 hour.
        </p>
        <p className="mt-1.5 text-sm text-gray-600">Can’t see it? Check your spam folder. Typed the wrong address? Go back, correct it and create the account again.</p>
      </div>

      {notice ? (
        <p role={notice.tone === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ${notice.tone === "error" ? "border border-red-200 bg-red-50/80 text-red-700" : "border border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {notice.text}
        </p>
      ) : null}

      <button
        type="button"
        onClick={resend}
        disabled={busy || wait > 0}
        className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[#4d0014] px-4 py-3 text-sm font-semibold text-white shadow-md shadow-[#4d0014]/15 transition hover:bg-[#6b1728] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#6b1728]/25 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Sending…" : wait > 0 ? `Send another email in ${wait}s` : "Send another email"}
      </button>

      <button type="button" onClick={onBack} className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-[#4d0014] transition hover:bg-[#4d0014]/5 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#6b1728]/15">
        {backLabel}
      </button>
    </div>
  );
}