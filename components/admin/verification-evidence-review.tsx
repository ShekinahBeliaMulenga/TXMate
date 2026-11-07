"use client";
import { useState } from "react";
import { EVIDENCE_LABEL, REJECTION_REASONS, type EvidenceKind, type EvidenceReview } from "@/lib/verification-evidence";

export type AdminEvidence = { id: string; kind: EvidenceKind; contentType: string; sizeBytes: number; reviewStatus: EvidenceReview; rejectionReason: string | null; reviewedAt: string | null; reviewedBy: string | null; uploadedAt: string };

const TONE: Record<EvidenceReview, string> = {
  PENDING: "bg-stone-100 text-stone-700 ring-stone-200",
  ACCEPTED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  REJECTED: "bg-red-50 text-red-800 ring-red-200",
};
const LABEL: Record<EvidenceReview, string> = { PENDING: "Not reviewed", ACCEPTED: "Accepted", REJECTED: "Rejected" };
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40";
const BTN = `inline-flex h-9 items-center justify-center rounded-lg px-3 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
const size = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const when = (value: string) => { const d = new Date(value); return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d); };

/** The identity documents of one application: open each one, then accept it or reject it with a reason. */
export default function VerificationEvidenceReview({ academicMateId, items, blockers, reviewable, onChanged }: { academicMateId: string; items: AdminEvidence[]; blockers: string[]; reviewable: boolean; onChanged: () => void | Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const base = `/api/admin/academic-mates/verification/${encodeURIComponent(academicMateId)}/evidence`;

  async function open(item: AdminEvidence) {
    if (busy) return;
    setBusy(`open-${item.id}`); setError("");
    // Open the tab first, in response to the click, so the browser does not block it.
    const tab = window.open("about:blank", "_blank");
    try {
      const response = await fetch(`${base}/${encodeURIComponent(item.id)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as { url?: string; error?: string };
      if (!response.ok || !body.url) throw new Error(body.error || "Unable to open this document.");
      if (!tab) throw new Error("Your browser blocked the new tab. Allow pop-ups for this site and try again.");
      tab.opener = null;
      tab.location.href = body.url;
    } catch (err) {
      tab?.close();
      setError(err instanceof Error ? err.message : "Unable to open this document.");
    } finally { setBusy(null); }
  }

  async function decide(item: AdminEvidence, decision: "ACCEPTED" | "REJECTED") {
    if (busy) return;
    setBusy(`decide-${item.id}`); setError("");
    try {
      const response = await fetch(`${base}/${encodeURIComponent(item.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, reason: decision === "REJECTED" ? reason : undefined }) });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to save this decision.");
      setRejecting(null); setReason("");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save this decision.");
    } finally { setBusy(null); }
  }

  if (items.length === 0) return <p className="rounded-lg border border-dashed border-stone-300 bg-white px-4 py-6 text-sm text-stone-500">No identity documents have been uploaded. {reviewable ? "Reject the application and ask the applicant to upload them." : ""}</p>;

  return (
    <div className="space-y-3">
      {reviewable && blockers.length > 0 && (
        <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Before this can be approved</p>
          <ul className="mt-1 list-inside list-disc">{blockers.map((text) => <li key={text}>{text}</li>)}</ul>
        </div>
      )}
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">{error}</p>}
      <p className="text-xs text-stone-500">Each time you open a document it is recorded in the audit log. Links stop working after a minute.</p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl border border-stone-200 bg-white p-3.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <p className="text-sm font-semibold text-stone-900">{EVIDENCE_LABEL[item.kind]}</p>
              <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TONE[item.reviewStatus]}`}>{LABEL[item.reviewStatus]}</span>
              <span className="text-xs text-stone-500">{item.contentType === "application/pdf" ? "PDF" : item.contentType.replace("image/", "").toUpperCase()} · {size(item.sizeBytes)} · uploaded {when(item.uploadedAt)}</span>
            </div>
            {item.reviewStatus !== "PENDING" && <p className="mt-1 text-xs text-stone-500">{LABEL[item.reviewStatus]}{item.reviewedBy ? ` by ${item.reviewedBy}` : ""}{item.reviewedAt ? ` on ${when(item.reviewedAt)}` : ""}{item.rejectionReason ? `. Reason: ${item.rejectionReason}` : ""}</p>}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void open(item)} disabled={busy !== null} className={`${BTN} border border-stone-300 bg-white text-stone-800 hover:bg-stone-50`}>{busy === `open-${item.id}` ? "Opening…" : "Open document"}</button>
              {reviewable && item.reviewStatus !== "ACCEPTED" && <button type="button" onClick={() => void decide(item, "ACCEPTED")} disabled={busy !== null} className={`${BTN} bg-emerald-700 text-white hover:bg-emerald-800`}>Accept</button>}
              {reviewable && item.reviewStatus !== "REJECTED" && rejecting !== item.id && <button type="button" onClick={() => { setRejecting(item.id); setReason(""); }} disabled={busy !== null} className={`${BTN} text-red-800 hover:bg-red-50`}>Reject…</button>}
            </div>
            {reviewable && rejecting === item.id && (
              <div className="mt-3 rounded-lg bg-stone-50 p-3">
                <p className="text-xs font-semibold text-stone-700">Why is this being rejected?</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {REJECTION_REASONS.map((text) => <button key={text} type="button" onClick={() => setReason(text)} aria-pressed={reason === text} className={`rounded-full px-2.5 py-1 text-xs ${FOCUS} ${reason === text ? "bg-[#7d1f2a] text-white" : "bg-white text-stone-700 ring-1 ring-stone-300 hover:bg-stone-100"}`}>{text}</button>)}
                </div>
                <label htmlFor={`reason-${item.id}`} className="sr-only">Reason</label>
                <input id={`reason-${item.id}`} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder="Or write your own reason" className="mt-2 h-9 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm focus:border-[#7d1f2a] focus:outline-none focus:ring-2 focus:ring-[#7d1f2a]/15" />
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => void decide(item, "REJECTED")} disabled={busy !== null || reason.trim().length < 3} className={`${BTN} bg-red-700 text-white hover:bg-red-800`}>Reject document</button>
                  <button type="button" onClick={() => { setRejecting(null); setReason(""); }} className={`${BTN} text-stone-700 hover:bg-stone-100`}>Cancel</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
