"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { resetErrorMessage } from "@/lib/auth-policy";
import { PASSWORD_MIN_LENGTH, validateSetPassword, type SetPasswordErrors } from "@/lib/password-policy";

const INPUT = "w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-[#6b1728] focus:ring-4 focus:ring-[#6b1728]/10 disabled:cursor-not-allowed disabled:bg-gray-50 sm:text-sm";

export default function ResetPasswordForm({ variant }: { variant: "reset" | "invite" }) {
  const invite = variant === "invite";
  const params = useSearchParams();
  const token = params.get("token");
  const linkProblem = resetErrorMessage(params.get("error")) ?? (token ? null : "This page needs the link from your email. Ask for a new one.");

  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<SetPasswordErrors>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !token) return;
    const found = validateSetPassword({ next, confirm });
    setErrors(found);
    setFormError("");
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      const { error } = await authClient.resetPassword({ newPassword: next, token });
      if (error) {
        setFormError(error.status === 429 ? "Too many attempts. Please wait a minute and try again." : error.code === "INVALID_TOKEN" ? "This reset link is invalid, has expired or has already been used. Ask for a new one." : error.message || "We couldn’t change your password. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setFormError("Something went wrong. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border border-gray-200/80 bg-white p-6 shadow-xl shadow-gray-200/50 sm:p-8">
      {done ? (
        <div role="status" aria-live="polite" className="space-y-4">
          <h1 className="text-xl font-extrabold tracking-tight text-[#282321]">{invite ? "Your account is ready" : "Password changed"}</h1>
          <p className="text-sm text-gray-600">{invite ? "Your password is set and your email is confirmed. Sign in to the admin portal." : "You’ve been signed out on your other devices. Sign in with your new password."}</p>
          <Link href={invite ? "/admin/login" : "/login"} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[#4d0014] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#6b1728]">{invite ? "Go to admin sign in" : "Go to sign in"}</Link>
        </div>
      ) : linkProblem ? (
        <div role="alert" className="space-y-4">
          <h1 className="text-xl font-extrabold tracking-tight text-[#282321]">We couldn’t use that link</h1>
          <p className="text-sm text-gray-600">{linkProblem}</p>
          {invite ? <p className="text-sm text-gray-600">Ask the person who invited you to send a new invitation.</p> : <Link href="/forgot-password" className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[#4d0014] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#6b1728]">Ask for a new link</Link>}
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <h1 className="text-xl font-extrabold tracking-tight text-[#282321]">{invite ? "Choose your password" : "Choose a new password"}</h1>
          <div>
            <label htmlFor="reset-new" className="mb-1.5 block text-sm font-medium text-gray-800">New password</label>
            <input id="reset-new" type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} disabled={busy} className={INPUT} />
            {errors.next ? <p role="alert" className="mt-1 text-xs text-red-700">{errors.next}</p> : <p className="mt-1 text-xs text-gray-500">At least {PASSWORD_MIN_LENGTH} characters.</p>}
          </div>
          <div>
            <label htmlFor="reset-confirm" className="mb-1.5 block text-sm font-medium text-gray-800">Confirm new password</label>
            <input id="reset-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} disabled={busy} className={INPUT} />
            {errors.confirm ? <p role="alert" className="mt-1 text-xs text-red-700">{errors.confirm}</p> : null}
          </div>
          {formError ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700">{formError}</p> : null}
          <button type="submit" disabled={busy} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[#4d0014] px-4 py-3 text-sm font-semibold text-white shadow-md shadow-[#4d0014]/15 transition hover:bg-[#6b1728] disabled:cursor-not-allowed disabled:opacity-60">
            {busy ? "Saving…" : invite ? "Set password" : "Change password"}
          </button>
        </form>
      )}
    </div>
  );
}
