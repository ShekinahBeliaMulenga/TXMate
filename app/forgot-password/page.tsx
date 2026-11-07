"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { RESEND_COOLDOWN_SECONDS } from "@/lib/auth-policy";

const INPUT = "w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-[#6b1728] focus:ring-4 focus:ring-[#6b1728]/10 disabled:cursor-not-allowed disabled:bg-gray-50 sm:text-sm";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || wait > 0) return;
    const target = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(target)) {
      setError("Enter the email address you signed up with.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error: failure } = await authClient.requestPasswordReset({ email: target, redirectTo: "/reset-password" });
      if (failure) {
        setError(failure.status === 429 ? "Too many requests. Please wait a minute and try again." : "We couldn’t send the email. Please try again shortly.");
        if (failure.status === 429) setWait(RESEND_COOLDOWN_SECONDS);
        return;
      }
      // The same answer whether or not an account exists, so this form cannot be used to find out who is registered.
      setSentTo(target);
      setWait(RESEND_COOLDOWN_SECONDS);
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#faf9f6] px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-xl font-bold tracking-tight text-[#4d0014]">TXMate</div>
        <div className="rounded-3xl border border-gray-200/80 bg-white p-6 shadow-xl shadow-gray-200/50 sm:p-8">
          <h1 className="text-xl font-extrabold tracking-tight text-[#282321]">Forgot your password?</h1>
          {sentTo ? (
            <div role="status" aria-live="polite" className="mt-3 space-y-4">
              <p className="break-words text-sm text-gray-600">If an account exists for <span className="font-semibold text-gray-900">{sentTo}</span>, we’ve sent a link to choose a new password. It works once and expires in 1 hour. Check your spam folder too.</p>
              <button type="button" onClick={() => setSentTo(null)} disabled={wait > 0} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[#4d0014] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#6b1728] disabled:cursor-not-allowed disabled:opacity-60">
                {wait > 0 ? `Send another link in ${wait}s` : "Send another link"}
              </button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="mt-3 space-y-4">
              <p className="text-sm text-gray-600">Enter your email address and we’ll send you a link to choose a new one.</p>
              <div>
                <label htmlFor="forgot-email" className="mb-1.5 block text-sm font-medium text-gray-800">Email address</label>
                <input id="forgot-email" type="email" inputMode="email" autoCapitalize="none" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} disabled={busy} placeholder="name@example.com" className={INPUT} />
              </div>
              {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700">{error}</p> : null}
              <button type="submit" disabled={busy || wait > 0} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[#4d0014] px-4 py-3 text-sm font-semibold text-white shadow-md shadow-[#4d0014]/15 transition hover:bg-[#6b1728] disabled:cursor-not-allowed disabled:opacity-60">
                {busy ? "Sending…" : wait > 0 ? `Try again in ${wait}s` : "Send reset link"}
              </button>
            </form>
          )}
          <p className="mt-6 border-t border-gray-100 pt-6 text-center text-sm text-gray-600">
            Remembered it? <Link href="/login" className="font-semibold text-[#4d0014] hover:underline">Back to sign in</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
