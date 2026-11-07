"use client";

import { useCallback, useEffect, useState } from "react";
import ChangePasswordForm from "@/components/student/change-password-form";
import { authClient } from "@/lib/auth-client";
import SetPasswordForm from "./set-password-form";
import { InfoNote, Panel } from "./settings-ui";

/** Change password for people who have one; set one for people who signed up with Google only. */
export default function PasswordSection() {
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [justSet, setJustSet] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data, error } = await authClient.listAccounts();
      if (error || !data) throw new Error(error?.message);
      setHasPassword(data.some((account) => account.providerId === "credential"));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [load]);

  if (loadError) return <InfoNote>We couldn’t load your sign-in methods. Refresh to try again.</InfoNote>;
  if (hasPassword === null) return <p className="text-xs text-[#7a6f6a]">Loading…</p>;

  return (
    <Panel>
      {justSet ? <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-3 py-2.5 text-xs leading-4 text-emerald-800">Your password is set. You can now sign in with your email and password too.</p> : null}
      {hasPassword ? <ChangePasswordForm /> : <SetPasswordForm onDone={() => { setJustSet(true); void load(); }} />}
    </Panel>
  );
}
