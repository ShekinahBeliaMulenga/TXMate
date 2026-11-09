"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { canDisconnectAccount } from "@/lib/auth-policy";
import { FOCUS, HINT, INPUT, INPUT_READONLY, InfoNote, LABEL, Panel } from "./settings-ui";

type LinkedAccount = { id: string; providerId: string };

const PROVIDER_LABEL: Record<string, string> = { credential: "Email and password", google: "Google" };

const BUTTON = `flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`;

/** Email address (changes need both the old and new address to confirm) and connected sign-in methods. */
export default function EmailSection({ email }: { email: string }) {
  const { data: session } = authClient.useSession();
  const verified = session?.user?.emailVerified;

  const [newEmail, setNewEmail] = useState("");
  const [changing, setChanging] = useState(false);
  const [changeNotice, setChangeNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const [accounts, setAccounts] = useState<LinkedAccount[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [accountBusy, setAccountBusy] = useState<string | null>(null);
  const [accountNotice, setAccountNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    try {
      const { data, error } = await authClient.listAccounts();
      if (error || !data) throw new Error(error?.message);
      setAccounts(data.map((account) => ({ id: account.id, providerId: account.providerId })));
      setAccountsError(null);
    } catch {
      setAccountsError("We couldn’t load your sign-in methods. Refresh to try again.");
    }
  }, []);

  useEffect(() => {
    void loadAccounts(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [loadAccounts]);

  async function handleChangeEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (changing) return;
    const target = newEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(target)) {
      setChangeNotice({ tone: "error", text: "Enter a valid email address." });
      return;
    }
    if (target === email.toLowerCase()) {
      setChangeNotice({ tone: "error", text: "That is already your email address." });
      return;
    }
    setChanging(true);
    setChangeNotice(null);
    try {
      const { error } = await authClient.changeEmail({ newEmail: target, callbackURL: "/verify-email" });
      if (error) {
        setChangeNotice({ tone: "error", text: error.status === 429 ? "Too many requests. Please wait a minute and try again." : error.message || "We couldn’t start the change. Please try again." });
        return;
      }
      setNewEmail("");
      setChangeNotice({
        tone: "ok",
        text: verified === false
          ? `We sent a verification link to ${target}. Your email changes once you open it.`
          : `We sent an approval link to ${email}. Open it, then confirm the link we send to ${target}. Your email changes only after both.`,
      });
    } catch {
      setChangeNotice({ tone: "error", text: "Something went wrong. Check your connection and try again." });
    } finally {
      setChanging(false);
    }
  }

  async function connectGoogle() {
    setAccountBusy("google");
    setAccountNotice(null);
    try {
      const { error } = await authClient.linkSocial({ provider: "google", callbackURL: "/student/settings#email", errorCallbackURL: "/student/settings#email" });
      if (error) {
        setAccountNotice({ tone: "error", text: error.message || "We couldn’t connect Google. Please try again." });
        setAccountBusy(null);
      }
    } catch {
      setAccountNotice({ tone: "error", text: "We couldn’t connect Google. Please try again." });
      setAccountBusy(null);
    }
  }

  async function disconnect(account: LinkedAccount) {
    setAccountBusy(account.id);
    setAccountNotice(null);
    try {
      const { error } = await authClient.unlinkAccount({ accountId: account.id });
      if (error) {
        setAccountNotice({ tone: "error", text: error.message || "We couldn’t disconnect that sign-in method." });
      } else {
        setAccountNotice({ tone: "ok", text: `${PROVIDER_LABEL[account.providerId] ?? account.providerId} disconnected.` });
        setConfirmUnlink(null);
        await loadAccounts();
      }
    } catch {
      setAccountNotice({ tone: "error", text: "We couldn’t disconnect that sign-in method." });
    } finally {
      setAccountBusy(null);
    }
  }

  const hasGoogle = accounts?.some((account) => account.providerId === "google") ?? false;
  const hasPassword = accounts?.some((account) => account.providerId === "credential") ?? false;

  return (
    <div className="space-y-5">
      <Panel>
        <p className={LABEL}>Email address</p>
        <p className={`mt-2 break-words ${INPUT_READONLY}`}>{email}</p>
        {verified !== undefined ? (
          <p className={`mt-2 text-xs font-semibold ${verified ? "text-emerald-700" : "text-amber-700"}`}>{verified ? "Verified" : "Not verified"}</p>
        ) : null}

        <form onSubmit={handleChangeEmail} className="mt-5 space-y-3" noValidate>
          <div>
            <label htmlFor="settings-new-email" className={LABEL}>New email address</label>
            <input id="settings-new-email" type="email" autoComplete="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} disabled={changing} className={`mt-2 ${INPUT}`} />
            <p className={HINT}>We email both your current and new address. Nothing changes until you open both links.</p>
          </div>
          {changeNotice ? (
            <p role={changeNotice.tone === "error" ? "alert" : "status"} className={`rounded-lg px-3 py-2.5 text-xs leading-4 ${changeNotice.tone === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{changeNotice.text}</p>
          ) : null}
          <button type="submit" disabled={changing || !newEmail.trim()} className={`${BUTTON} w-full bg-[#7d1f2a] text-white hover:bg-[#681923]`}>
            {changing ? "Sending…" : "Change email address"}
          </button>
        </form>
      </Panel>

      <Panel>
        <p className={LABEL}>Sign-in methods</p>
        <p className={HINT}>Google is only connected from here, while you are signed in. It is never connected automatically.</p>

        {accountsError ? <p role="alert" className="mt-3 text-xs text-red-700">{accountsError}</p> : null}
        {!accounts && !accountsError ? <p className="mt-3 text-xs text-[#7a6f6a]">Loading…</p> : null}

        <ul className="mt-3 space-y-2">
          {accounts?.map((account) => (
            <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#f7f4f1] px-3 py-2.5">
              <span className="min-w-0 break-words text-[13px] font-semibold text-[#282321]">{PROVIDER_LABEL[account.providerId] ?? account.providerId}</span>
              {account.providerId === "credential" ? (
                <span className="text-xs text-[#7a6f6a]">Always on</span>
              ) : confirmUnlink === account.id ? (
                <span className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => disconnect(account)} disabled={accountBusy === account.id} className={`${BUTTON} h-9 bg-[#7d1f2a] text-white hover:bg-[#681923]`}>{accountBusy === account.id ? "Disconnecting…" : "Yes, disconnect"}</button>
                  <button type="button" onClick={() => setConfirmUnlink(null)} className={`${BUTTON} h-9 bg-white text-[#282321] shadow-sm`}>Keep it</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmUnlink(account.id)} disabled={!canDisconnectAccount(accounts ?? [], account.id)} className={`${BUTTON} h-9 bg-white text-[#282321] shadow-sm`}>Disconnect</button>
              )}
            </li>
          ))}
        </ul>

        {accounts && hasGoogle && !hasPassword ? (
          <p className="mt-3 rounded-lg bg-[#f3efeb] px-3 py-2.5 text-xs leading-4 text-[#6d6260]">
            You sign in with Google only. <a href="#security" className="font-semibold text-[#7d1f2a] underline">Set a password</a> first, then you can disconnect Google.
          </p>
        ) : null}

        {accounts && !hasGoogle ? (
          <button type="button" onClick={connectGoogle} disabled={accountBusy === "google"} className={`${BUTTON} mt-3 w-full bg-white text-[#282321] shadow-sm hover:bg-[#fbf9f7]`}>
            {accountBusy === "google" ? "Opening Google…" : "Connect Google"}
          </button>
        ) : null}

        {accountNotice ? (
          <p role={accountNotice.tone === "error" ? "alert" : "status"} className={`mt-3 rounded-lg px-3 py-2.5 text-xs leading-4 ${accountNotice.tone === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{accountNotice.text}</p>
        ) : null}
      </Panel>

      <InfoNote>You always keep a way to sign in. Google can only be disconnected once you have a password, and your password can’t be removed.</InfoNote>
    </div>
  );
}
