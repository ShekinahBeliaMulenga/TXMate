"use client";

import { useState } from "react";
import { REASON_MAX, REASON_MIN, type ConversationView } from "@/lib/admin/moderation-types";
import { sendJson, type ApiResult } from "./api-client";
import { GhostButton, PrimaryButton } from "./admin-controls";
import { FOCUS } from "./admin-ui";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lusaka" });

/** Reading private messages needs a reason and is recorded. Turning the student’s messaging off or on needs one too. */
export default function ConversationPanel({ requestId }: { requestId: string }) {
  const [mode, setMode] = useState<"idle" | "reading" | "toggling">("idle");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<ConversationView | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const valid = reason.trim().length >= REASON_MIN;

  async function read() {
    setBusy(true);
    const outcome = await sendJson<ConversationView>(`/api/admin/conversations/${encodeURIComponent(requestId)}`, "POST", { reason });
    setBusy(false);
    if (outcome.ok && outcome.data) { setView(outcome.data); setMode("idle"); setResult(null); } else setResult(outcome);
  }

  async function toggle(enabled: boolean) {
    setBusy(true);
    const outcome = await sendJson(`/api/admin/conversations/${encodeURIComponent(requestId)}`, "PATCH", { enabled, reason });
    setBusy(false);
    setResult(outcome);
    if (outcome.ok) { setView((current) => (current ? { ...current, messagingEnabled: enabled } : current)); setMode("idle"); setReason(""); }
  }

  const reasonBox = (
    <label className="mt-2 block"><span className="font-medium">Reason</span>
      <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={REASON_MAX} rows={2} className={`mt-1 w-full rounded-md border border-[#d9d3cc] bg-white p-2 text-sm text-[#1f1a17] ${FOCUS}`} />
    </label>
  );

  return (
    <div className="mt-4 border-t border-[#e4dfd9] pt-4">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[#7a716a]">Messages between these two people</h4>
      {view ? (
        <div className="mt-2 space-y-2">
          <p className="text-[13px] text-[#4e4742]">Student messaging is <span className="font-semibold">{view.messagingEnabled ? "on" : "off"}</span>.</p>
          {view.messages.length === 0 ? <p className="text-[13px] text-[#6b635d]">No messages have been sent.</p> : (
            <ul className="max-h-80 space-y-2 overflow-y-auto rounded-md border border-[#e4dfd9] bg-white p-3">
              {view.more ? <li className="text-xs text-[#7a716a]">Older messages are not shown. Only the latest 200 are loaded.</li> : null}
              {view.messages.map((message) => <li key={message.id} className="text-[13px]"><span className="font-semibold">{message.sender}</span> <span className="text-xs text-[#7a716a]">{when(message.createdAt)}</span><p className="whitespace-pre-wrap break-words">{message.body}</p></li>)}
            </ul>
          )}
        </div>
      ) : null}
      {mode === "idle" ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {!view ? <GhostButton onClick={() => { setMode("reading"); setResult(null); }}>Read messages…</GhostButton> : null}
          {view ? <GhostButton onClick={() => { setMode("toggling"); setResult(null); }}>{view.messagingEnabled ? "Turn off student messaging…" : "Turn on student messaging…"}</GhostButton> : null}
        </div>
      ) : (
        <div role="note" className="mt-2 max-w-3xl rounded-md border border-[#ecd9a5] bg-[#fdf8e8] p-3 text-[13px] text-[#6a4b00]">
          {mode === "reading" ? (
            <><p className="font-semibold">These are private messages.</p><p className="mt-1 leading-5">Only read them when you need to resolve a problem. That you read this conversation, and your reason, are saved in the audit log.</p></>
          ) : (
            <><p className="font-semibold">{view?.messagingEnabled ? "Stop the student sending messages here?" : "Let the student send messages here again?"}</p><p className="mt-1 leading-5">This affects only this conversation. Your reason is saved in the audit log.</p></>
          )}
          {reasonBox}
          <div className="mt-2 flex gap-2">
            <PrimaryButton disabled={!valid || busy} onClick={() => void (mode === "reading" ? read() : toggle(!(view?.messagingEnabled ?? true)))}>{busy ? "Working…" : mode === "reading" ? "Read messages" : "Confirm"}</PrimaryButton>
            <GhostButton disabled={busy} onClick={() => setMode("idle")}>Cancel</GhostButton>
          </div>
        </div>
      )}
      {result ? <p role={result.ok ? "status" : "alert"} className={`mt-2 text-[13px] ${result.ok ? "text-[#28633b]" : "text-[#a3262a]"}`}>{result.message}</p> : null}
    </div>
  );
}
