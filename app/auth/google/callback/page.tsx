"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { googleErrorMessage } from "@/lib/auth-policy";

export default function GoogleCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function completeSignIn() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("error");

      if (code || params.get("status") === "error") {
        // For example account_not_linked: an account with this email exists, so Google must be connected from Settings.
        setError(googleErrorMessage(code) ?? "Google sign-in could not be completed. Please try again.");
        return;
      }

      try {
        const response = await fetch("/api/auth/redirect", {
          method: "GET",
          credentials: "include",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            data?.error || "Unable to verify your TXMate account."
          );
        }

        const destinations = [
          "/admin",
          "/student/dashboard",
          "/onboarding/student",
        ];

        if (!destinations.includes(data?.redirectTo)) {
          throw new Error("Invalid account destination.");
        }

        if (!cancelled) {
          router.replace(data.redirectTo);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to complete Google sign-in."
          );
        }
      }
    }

    void completeSignIn();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#faf9f6] px-5">
      <section className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-9 text-center shadow-xl">

        <p className="text-xl font-bold tracking-tight text-[#4d0014]">
          TXMate
        </p>

        {error ? (
          <>
            <div className="mx-auto mt-8 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
              !
            </div>

            <h1 className="mt-5 text-xl font-bold text-gray-900">
              Sign-in unsuccessful
            </h1>

            <p role="alert" className="mt-3 text-sm leading-6 text-gray-600">
              {error}
            </p>

            <Link
              href="/login"
              className="mt-7 inline-flex rounded-xl bg-[#4d0014] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#6b1728]"
            >
              Return to sign in
            </Link>
          </>
        ) : (
          <>
            <div
              className="mx-auto mt-10 h-11 w-11 animate-spin rounded-full border-4 border-[#eadde0] border-t-[#4d0014]"
              aria-hidden="true"
            />

            <h1 className="mt-7 text-xl font-bold text-gray-900">
              Verifying with Google
            </h1>

            <p
              role="status"
              aria-live="polite"
              className="mt-3 text-sm leading-6 text-gray-600"
            >
              We&apos;re confirming your identity and preparing your TXMate account.
              This should only take a moment.
            </p>

            <p className="mt-8 text-xs text-gray-400">
              Please don&apos;t close this page.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
