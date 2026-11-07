"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { authClient } from "@/lib/auth-client";
import { isEmailNotVerified } from "@/lib/auth-policy";

/** One message for every failure (wrong password, unknown email, not an admin) so the form cannot be used to probe accounts. */
const GENERIC_ERROR = "Incorrect email or password.";
const INPUT = "w-full rounded-xl border border-[#ded3ca] bg-white px-4 py-3 text-sm text-[#282321] outline-none transition placeholder:text-[#a79b95] focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10";

export default function AdminLoginForm({ expired }: { expired: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      const result = await authClient.signIn.email({ email: normalizedEmail, password });
      if (result.error) {
        // Only reachable with the right password, so it does not reveal which emails exist.
        if (isEmailNotVerified(result.error)) {
          setError("Your email address isn’t verified. We’ve sent a verification link; open it, then sign in again.");
          setPassword("");
          return;
        }
        setError(result.error.status === 429 ? "Too many attempts. Wait a minute and try again." : GENERIC_ERROR);
        setPassword("");
        return;
      }

      // Signed in as a user. Now the server decides whether that user may enter the admin portal.
      const check = await fetch("/api/admin/session", { method: "POST", credentials: "include", headers: { Accept: "application/json" }, cache: "no-store" });
      if (!check.ok) {
        // Not an admin: end the session we just created so this page cannot be used to sign in as a student.
        await authClient.signOut().catch(() => undefined);
        setError(GENERIC_ERROR);
        setPassword("");
        return;
      }

      // The password was right; the second step (or its first-time setup) comes next.
      const info = (await check.json().catch(() => ({}))) as { twoStep?: string };
      router.replace(info.twoStep === "done" ? "/admin" : "/admin/two-step");
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {expired ? <p role="status" className="rounded-xl bg-[#f3efeb] px-4 py-3 text-sm text-[#6d6260]">Your session ended. Sign in again to continue.</p> : null}
      <div>
        <label htmlFor="admin-email" className="block text-sm font-semibold">Email</label>
        <input id="admin-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className={`mt-2 ${INPUT}`} />
      </div>
      <div>
        <label htmlFor="admin-password" className="block text-sm font-semibold">Password</label>
        <div className="relative mt-2">
          <input id="admin-password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className={`${INPUT} pr-12`} />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#8a7f7a] hover:text-[#282321] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40"
          >
            <Icon name="eye" className="h-5 w-5" />
          </button>
        </div>
      </div>
      <p className="text-right"><a href="/forgot-password" className="text-sm font-semibold text-[#7d1f2a] hover:underline">Forgot password?</a></p>
      {error ? <p role="alert" className="text-sm font-medium text-[#7d1f2a]">{error}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="h-12 w-full rounded-xl bg-[#7d1f2a] text-sm font-semibold text-white shadow-sm transition hover:bg-[#691923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
