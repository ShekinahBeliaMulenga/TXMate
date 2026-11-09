"use client";

import { useState, type FormEvent } from "react";
import { PASSWORD_MIN_LENGTH, validateSetPassword, type SetPasswordErrors } from "@/lib/password-policy";
import { FOCUS, HINT, INPUT, LABEL } from "./settings-ui";

/** For accounts that sign in with Google only. Adds a password so Google can be disconnected safely. */
export default function SetPasswordForm({ onDone }: { onDone: () => void }) {
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<SetPasswordErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const found = validateSetPassword({ next, confirm });
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      const response = await fetch("/api/account/password/set", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ newPassword: next, confirmPassword: confirm }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setFormError(data.error || "We couldn’t set your password. Please try again.");
        return;
      }
      setNext("");
      setConfirm("");
      onDone();
    } catch {
      setFormError("Couldn’t reach TXMate. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-[13px] leading-5 text-[#6d6260]">You sign in with Google and have no password yet. Add one to also sign in with your email, and to be able to disconnect Google.</p>
      <div>
        <label htmlFor="set-password-new" className={LABEL}>New password</label>
        <input id="set-password-new" type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} disabled={busy} className={`mt-2 ${INPUT}`} />
        {errors.next ? <p role="alert" className="mt-1 text-xs text-red-700">{errors.next}</p> : <p className={HINT}>At least {PASSWORD_MIN_LENGTH} characters.</p>}
      </div>
      <div>
        <label htmlFor="set-password-confirm" className={LABEL}>Confirm new password</label>
        <input id="set-password-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} disabled={busy} className={`mt-2 ${INPUT}`} />
        {errors.confirm ? <p role="alert" className="mt-1 text-xs text-red-700">{errors.confirm}</p> : null}
      </div>
      {formError ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-xs leading-4 text-red-700">{formError}</p> : null}
      <button type="submit" disabled={busy} className={`flex h-11 w-full items-center justify-center rounded-xl bg-[#7d1f2a] px-4 text-sm font-semibold text-white transition hover:bg-[#681923] disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`}>
        {busy ? "Saving…" : "Set password"}
      </button>
    </form>
  );
}
