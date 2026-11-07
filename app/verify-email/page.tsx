"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import VerificationPending from "@/components/auth/verification-pending";
import { authClient } from "@/lib/auth-client";
import { verificationErrorMessage } from "@/lib/auth-policy";

const CALLBACK = "/verify-email";

function VerifyEmailContent() {
  const router = useRouter();
  const params = useSearchParams();
  const errorCode = params.get("error");
  const message = verificationErrorMessage(errorCode);
  const [email, setEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [destinationError, setDestinationError] = useState<string | null>(null);

  // No error means Better Auth verified the address and signed the person in. Send them where they belong.
  useEffect(() => {
    if (errorCode) return;
    let cancelled = false;
    (async () => {
      try {
        const redirect = await fetch("/api/auth/redirect", { credentials: "include", headers: { Accept: "application/json" }, cache: "no-store" });
        if (redirect.status === 401) {
          if (!cancelled) router.replace("/login?verified=1");
          return;
        }
        if (redirect.status === 403) {
          const blocked = (await redirect.json().catch(() => ({}))) as { error?: string };
          if (!cancelled) setDestinationError(blocked.error || "This account can’t sign in right now.");
          return;
        }
        if (!redirect.ok) throw new Error("redirect");
        const { redirectTo } = (await redirect.json()) as { redirectTo?: string };
        if (!redirectTo) throw new Error("redirect");
        // A student who has not finished onboarding still needs a profile.
        let target = redirectTo;
        if (redirectTo.startsWith("/student")) {
          const me = await fetch("/api/student/me", { credentials: "include", headers: { Accept: "application/json" }, cache: "no-store" });
          const body = me.ok ? ((await me.json().catch(() => null)) as { studentProfile?: unknown } | null) : null;
          if (!body?.studentProfile) target = "/onboarding/student";
        }
        if (!cancelled) router.replace(target);
      } catch {
        if (!cancelled) setDestinationError("Your email is verified, but we couldn’t take you to your account. Please sign in.");
      }
    })();
    return () => { cancelled = true; };
  }, [errorCode, router]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#faf9f6] px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-xl font-bold tracking-tight text-[#4d0014]">TXMate</div>
        <div className="rounded-3xl border border-gray-200/80 bg-white p-6 shadow-xl shadow-gray-200/50 sm:p-8">
          {!errorCode ? (
            destinationError ? (
              <div className="space-y-4" role="alert">
                <h1 className="text-xl font-extrabold tracking-tight text-[#282321]">Email verified</h1>
                <p className="text-sm text-gray-600">{destinationError}</p>
                <Link href="/login" className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[#4d0014] px-4 py-3 text-sm font-semibold text-white">Go to sign in</Link>
              </div>
            ) : (
              <div role="status" aria-live="polite">
                <h1 className="text-xl font-extrabold tracking-tight text-[#282321]">Email verified</h1>
                <p className="mt-1.5 text-sm text-gray-600">Taking you to your account…</p>
              </div>
            )
          ) : resending && email ? (
            <VerificationPending email={email} callbackURL={CALLBACK} backLabel="Use a different email" onBack={() => setResending(false)} justSent />
          ) : (
            <div className="space-y-5">
              <div role="alert">
                <h1 className="text-xl font-extrabold tracking-tight text-[#282321]">We couldn’t verify that link</h1>
                <p className="mt-1.5 text-sm text-gray-600">{message}</p>
              </div>
              <form
                className="space-y-3"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!email.trim() || sending) return;
                  setSending(true);
                  setSendError(null);
                  try {
                    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: CALLBACK });
                    if (error) setSendError(error.status === 429 ? "Too many requests. Please wait a minute and try again." : error.message || "We couldn’t send the email. Please try again shortly.");
                    else setResending(true);
                  } catch {
                    setSendError("Something went wrong. Check your connection and try again.");
                  } finally {
                    setSending(false);
                  }
                }}
              >
                <label htmlFor="verify-email-address" className="block text-sm font-medium text-gray-800">Your email address</label>
                <input
                  id="verify-email-address"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value.trim().toLowerCase())}
                  placeholder="name@example.com"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 outline-none transition focus:border-[#6b1728] focus:ring-4 focus:ring-[#6b1728]/10 sm:text-sm"
                />
                {sendError ? <p role="alert" className="text-sm font-medium text-red-700">{sendError}</p> : null}
                <button type="submit" disabled={sending} className="flex min-h-12 disabled:cursor-not-allowed disabled:opacity-60 w-full items-center justify-center rounded-xl bg-[#4d0014] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#6b1728] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#6b1728]/25">
                  {sending ? "Sending…" : "Send a new link"}
                </button>
              </form>
              <p className="text-center text-sm text-gray-600">
                Already verified?{" "}
                <Link href="/login" className="font-semibold text-[#4d0014] hover:underline">Sign in</Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}
