"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { REASON_MAX, REASON_MIN } from "@/lib/admin/moderation-types";
import { sendJson, type ApiResult } from "./api-client";
import { GhostButton } from "./admin-controls";
import { FOCUS } from "./admin-ui";

/** Irreversible. The person must type the account's email, give a reason, and tick that they understand. */
export default function AnonymiseCard({ userId, email, name }: { userId: string; email: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const ready = typed.trim().toLowerCase() === email.toLowerCase() && reason.trim().length >= REASON_MIN && understood;

  async function submit() {
    setBusy(true);
    const outcome = await sendJson(`/api/admin/users/${encodeURIComponent(userId)}/anonymise`, "POST", { confirmEmail: typed, reason });
    setBusy(false);
    setResult(outcome);
    if (outcome.ok) router.refresh();
  }

  return (
    <div className="border-t border-[#f0c9c9] bg-[#fdf6f6] p-4">
      <h3 className="text-sm font-semibold text-[#8f2323]">Anonymise this account</h3>
      <p className="mt-1 text-[13px] leading-5 text-[#6d4a4a]">For a person who has asked to be forgotten. It cannot be undone.</p>
      {!open ? <div className="mt-3"><button type="button" onClick={() => setOpen(true)} className={`h-10 rounded-md border border-[#e3b5b7] bg-white px-4 text-sm font-medium text-[#a3262a] hover:bg-[#fdf1f1] ${FOCUS}`}>Anonymise…</button></div> : (
        <div className="mt-3 space-y-3 text-[13px] text-[#3a332f]">
          <div role="alert" className="rounded-md border border-[#e3b5b7] bg-white p-3 leading-5">
            <p className="font-semibold text-[#8f2323]">What this does to {name}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>Replaces their name and email, removes their photo, username, phone number, bio and student ID.</li>
              <li>Signs them out everywhere, removes their sign-in methods, notifications and devices.</li>
              <li>Removes the text of messages they sent and the comments on reviews they wrote.</li>
              <li>Keeps ratings, sessions and requests, so the other people’s records stay intact.</li>
              <li>Refused while they still have sessions that have not finished.</li>
              <li>Older audit log lines may still mention their name. They are not rewritten.</li>
            </ul>
          </div>
          <label className="block"><span className="font-medium">Type {email} to confirm</span>
            <input value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" spellCheck={false} className={`mt-1 h-10 w-full rounded-md border border-[#d9d3cc] bg-white px-3 text-sm ${FOCUS}`} />
          </label>
          <label className="block"><span className="font-medium">Reason</span>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={REASON_MAX} rows={2} className={`mt-1 w-full rounded-md border border-[#d9d3cc] bg-white p-2 text-sm ${FOCUS}`} />
          </label>
          <label className="flex items-start gap-2"><input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} className="mt-0.5 h-4 w-4" /><span>I understand this cannot be undone.</span></label>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!ready || busy} onClick={() => void submit()} className={`h-10 rounded-md bg-[#a3262a] px-4 text-sm font-semibold text-white disabled:opacity-50 ${FOCUS}`}>{busy ? "Anonymising…" : "Anonymise permanently"}</button>
            <GhostButton disabled={busy} onClick={() => setOpen(false)}>Cancel</GhostButton>
          </div>
        </div>
      )}
      {result ? <p role={result.ok ? "status" : "alert"} className={`mt-2 text-[13px] ${result.ok ? "text-[#28633b]" : "text-[#a3262a]"}`}>{result.message}</p> : null}
    </div>
  );
}
