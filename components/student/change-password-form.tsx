"use client";

import { useRef, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { Glyph } from "./session-ui";
import { changePasswordErrorMessage, PASSWORD_MIN_LENGTH, validateChangePassword, type ChangePasswordErrors, type ChangePasswordInput } from "@/lib/password-policy";

const INPUT =
  "w-full rounded-lg border bg-white px-3.5 py-2.5 pr-12 text-sm text-[#282321] outline-none transition placeholder:text-[#a79b95] focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10";
const EMPTY: ChangePasswordInput = { current: "", next: "", confirm: "" };

type FieldProps = {
  id: keyof ChangePasswordInput;
  label: string;
  value: string;
  autoComplete: "current-password" | "new-password";
  error?: string;
  hint?: string;
  disabled: boolean;
  onChange: (value: string) => void;
};

function PasswordField({ id, label, value, autoComplete, error, hint, disabled, onChange }: FieldProps) {
  const [visible, setVisible] = useState(false);
  const inputId = `change-password-${id}`;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-[#282321]">{label}</label>
      <div className="relative">
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
          className={`${INPUT} ${error ? "border-[#7d1f2a]" : "border-[#d9cec5]"} disabled:opacity-60`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          title={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-[#7a6f6a] hover:text-[#7d1f2a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40"
        >
          <Glyph name={visible ? "eyeOff" : "eye"} className="h-[18px] w-[18px]" />
        </button>
      </div>
      {error ? <p id={`${inputId}-error`} role="alert" className="mt-1.5 text-xs text-[#7d1f2a]">{error}</p> : hint ? <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-[#7a6f6a]">{hint}</p> : null}
    </div>
  );
}

/** Self-contained change-password form. Lives outside the settings page's own <form>. */
export default function ChangePasswordForm() {
  const [values, setValues] = useState<ChangePasswordInput>(EMPTY);
  const [errors, setErrors] = useState<ChangePasswordErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  function update(field: keyof ChangePasswordInput, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
    setFormError(null);
    setDone(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const found = validateChangePassword(values);
    setErrors(found);
    setFormError(null);
    setDone(false);
    if (Object.keys(found).length > 0) return;

    inFlight.current = true;
    setBusy(true);
    try {
      // Signs out every other device and keeps this one signed in.
      const { error } = await authClient.changePassword({
        currentPassword: values.current,
        newPassword: values.next,
        revokeOtherSessions: true,
      });
      if (error) {
        if (error.code === "INVALID_PASSWORD") setErrors({ current: changePasswordErrorMessage(error) });
        else setFormError(changePasswordErrorMessage(error));
        return;
      }
      setValues(EMPTY);
      setDone(true);
    } catch {
      setFormError("Couldn't reach TXMate. Check your connection and try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <PasswordField id="current" label="Current password" value={values.current} autoComplete="current-password" error={errors.current} disabled={busy} onChange={(v) => update("current", v)} />
      <PasswordField id="next" label="New password" value={values.next} autoComplete="new-password" error={errors.next} hint={`At least ${PASSWORD_MIN_LENGTH} characters.`} disabled={busy} onChange={(v) => update("next", v)} />
      <PasswordField id="confirm" label="Confirm new password" value={values.confirm} autoComplete="new-password" error={errors.confirm} disabled={busy} onChange={(v) => update("confirm", v)} />
      {formError ? <p role="alert" className="text-sm text-[#7d1f2a]">{formError}</p> : null}
      {done ? <p role="status" className="text-sm text-[#28633b]">Password changed. You've been signed out of your other devices.</p> : null}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-[#7d1f2a] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#681923] disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-2"
        >
          {busy ? "Changing…" : "Change password"}
        </button>
      </div>
    </form>
  );
}
