"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { qrMatrix, qrSvgPath } from "@/lib/qr";

type Mode = "setup" | "verify";

const INPUT = "w-full rounded-xl border border-[#ded3ca] bg-white px-4 py-3 text-center font-mono text-lg tracking-[0.25em] text-[#282321] outline-none transition placeholder:text-[#a79b95] focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10";
const BUTTON = "h-12 w-full rounded-xl bg-[#7d1f2a] text-sm font-semibold text-white shadow-sm transition hover:bg-[#681923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";
const SECONDARY = "h-11 rounded-xl border border-[#d9d3cc] bg-white px-4 text-sm font-medium text-[#3a332f] hover:bg-[#faf8f6] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40";

/** The setup QR code, drawn here from the setup link. Nothing is sent anywhere to make it. */
function SetupQr({ uri }: { uri: string }) {
  const code = useMemo(() => {
    try { return qrSvgPath(qrMatrix(uri)); } catch { return null; }
  }, [uri]);
  if (!code) return null;
  return (
    <div className="flex justify-center">
      <svg viewBox={`0 0 ${code.size} ${code.size}`} role="img" aria-label="QR code to scan with your authenticator app" shapeRendering="crispEdges" className="h-52 w-52 rounded-xl border border-[#e4dbd3] bg-white">
        <rect width={code.size} height={code.size} fill="#ffffff" />
        <path d={code.path} fill="#000000" />
      </svg>
    </div>
  );
}

type Reply<T> = { ok: true; data: T } | { ok: false; error: string };

async function post<T>(url: string, body?: unknown): Promise<Reply<T>> {
  try {
    const response = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Accept: "application/json" }, cache: "no-store", body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.status === 401) {
      window.location.assign("/admin/login?expired=1");
      return { ok: false, error: "Your session ended. Sign in again." };
    }
    const data = (await response.json().catch(() => ({}))) as T & { error?: string };
    return response.ok ? { ok: true, data } : { ok: false, error: data.error || "Something went wrong. Try again." };
  } catch {
    return { ok: false, error: "Network problem. Check your connection and try again." };
  }
}

function SignOut() {
  const router = useRouter();
  async function leave() {
    await authClient.signOut().catch(() => undefined);
    router.replace("/admin/login");
  }
  return <button type="button" onClick={() => void leave()} className="mt-4 w-full text-center text-sm font-semibold text-[#7d1f2a] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40">Sign out and use a different account</button>;
}

function Setup({ email }: { email: string }) {
  const router = useRouter();
  const [key, setKey] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const reply = await post<{ secret: string; uri: string }>("/api/admin/two-step/setup");
    setBusy(false);
    if (reply.ok) setKey(reply.data);
    else setError(reply.error);
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(code.replace(/\s/g, ""))) {
      setError("Enter the 6-digit code shown in your authenticator app.");
      return;
    }
    setBusy(true);
    setError(null);
    const reply = await post<{ backupCodes: string[] }>("/api/admin/two-step/confirm", { code });
    setBusy(false);
    if (reply.ok) setCodes(reply.data.backupCodes);
    else {
      setError(reply.error);
      setCode("");
    }
  }

  async function copy() {
    if (!codes) return;
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      setError("Copying isn’t available here. Select the codes and copy them by hand.");
    }
  }

  function download() {
    if (!codes) return;
    const text = `TXMate admin backup codes for ${email}\nEach code works once.\n\n${codes.join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "txmate-backup-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (codes) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-[#282321]">Save your backup codes</h1>
        <p className="text-sm text-[#6d6260]">Two-step sign-in is on. If you lose your phone, each of these codes lets you sign in once. They are shown only now, so keep them somewhere safe and private, such as a password manager.</p>
        <ul className="grid grid-cols-2 gap-2 rounded-xl bg-[#f7f4f1] p-4 font-mono text-sm text-[#282321]">
          {codes.map((value) => <li key={value} className="break-all">{value}</li>)}
        </ul>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void copy()} className={SECONDARY}>{copied ? "Copied" : "Copy codes"}</button>
          <button type="button" onClick={download} className={SECONDARY}>Download as a file</button>
        </div>
        {error ? <p role="alert" className="text-sm font-medium text-[#7d1f2a]">{error}</p> : null}
        <label className="flex items-start gap-2 text-sm text-[#3a332f]">
          <input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#7d1f2a]" />
          <span>I have saved these codes somewhere safe.</span>
        </label>
        <button type="button" disabled={!saved} onClick={() => router.replace("/admin")} className={BUTTON}>Continue to the admin portal</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[#282321]">Set up two-step sign-in</h1>
      <p className="text-sm text-[#6d6260]">Admin accounts need a second step, so a stolen password alone cannot open the portal. It takes about two minutes.</p>
      <ol className="space-y-4 text-sm text-[#3a332f]">
        <li>
          <p className="font-semibold">1. Install an authenticator app</p>
          <p className="mt-1 text-[#6d6260]">For example Google Authenticator, Microsoft Authenticator, Authy or 1Password, on your phone.</p>
        </li>
        <li>
          <p className="font-semibold">2. Add your TXMate account to it</p>
          {key ? (
            <div className="mt-2 space-y-2">
              <p className="text-[#6d6260]">In the app choose to add an account, then <strong>scan this QR code</strong> with your phone camera:</p>
              <SetupQr uri={key.uri} />
              <p className="text-[#6d6260]">Cannot scan it? Choose to enter a setup key instead and type this key (time-based):</p>
              <p className="select-all break-all rounded-xl bg-[#f7f4f1] px-4 py-3 font-mono text-base tracking-wider text-[#282321]">{key.secret}</p>
              <a href={key.uri} className="inline-block text-sm font-semibold text-[#7d1f2a] hover:underline">On this phone? Open it in your authenticator app</a>
            </div>
          ) : (
            <div className="mt-2">
              <button type="button" onClick={() => void start()} disabled={busy} className={BUTTON}>{busy ? "Preparing…" : "Show my setup key"}</button>
            </div>
          )}
        </li>
        {key ? (
          <li>
            <form onSubmit={(event) => void confirm(event)} noValidate className="space-y-3">
              <label htmlFor="setup-code" className="block font-semibold">3. Enter the 6-digit code it shows</label>
              <input id="setup-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(event) => setCode(event.target.value)} placeholder="123456" className={INPUT} />
              <button type="submit" disabled={busy} className={BUTTON}>{busy ? "Checking…" : "Confirm and turn on"}</button>
            </form>
          </li>
        ) : null}
      </ol>
      {error ? <p role="alert" className="text-sm font-medium text-[#7d1f2a]">{error}</p> : null}
      <SignOut />
    </div>
  );
}

function Verify() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!code.trim()) {
      setError("Enter your code.");
      return;
    }
    setBusy(true);
    setError(null);
    const reply = await post<{ usedBackupCode: boolean; backupCodesLeft: number | null }>("/api/admin/two-step/verify", { code });
    setBusy(false);
    if (!reply.ok) {
      setError(reply.error);
      setCode("");
      return;
    }
    if (reply.data.usedBackupCode) {
      const left = reply.data.backupCodesLeft ?? 0;
      setNotice(left === 0 ? "That was your last backup code. Ask a platform admin to reset your two-step sign-in so you can make new ones." : `You used a backup code. ${left} ${left === 1 ? "is" : "are"} left.`);
      return;
    }
    router.replace("/admin");
  }

  if (notice) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-[#282321]">You are signed in</h1>
        <p role="status" className="text-sm text-[#6d6260]">{notice}</p>
        <button type="button" onClick={() => router.replace("/admin")} className={BUTTON}>Continue to the admin portal</button>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
      <h1 className="text-xl font-semibold text-[#282321]">Two-step verification</h1>
      <p className="text-sm text-[#6d6260]">Open your authenticator app and enter the 6-digit code for TXMate. Lost your phone? Enter one of your backup codes instead.</p>
      <div>
        <label htmlFor="verify-code" className="block text-sm font-semibold">Code</label>
        <input id="verify-code" autoFocus inputMode="text" autoComplete="one-time-code" maxLength={14} value={code} onChange={(event) => setCode(event.target.value)} placeholder="123456" className={`mt-2 ${INPUT}`} />
      </div>
      {error ? <p role="alert" className="text-sm font-medium text-[#7d1f2a]">{error}</p> : null}
      <button type="submit" disabled={busy} className={BUTTON}>{busy ? "Checking…" : "Verify and continue"}</button>
      <SignOut />
    </form>
  );
}

export default function TwoStepForm({ mode, email }: { mode: Mode; email: string }) {
  return mode === "setup" ? <Setup email={email} /> : <Verify />;
}
