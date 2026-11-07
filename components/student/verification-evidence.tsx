"use client";
import { useRef, useState } from "react";
import { EVIDENCE_HINT, EVIDENCE_KINDS, EVIDENCE_LABEL, MAX_FILE_BYTES, MAX_PER_KIND, MAX_TOTAL, type EvidenceKind, type EvidenceReview } from "@/lib/verification-evidence";

export type EvidenceItem = { id: string; kind: EvidenceKind; contentType: string; sizeBytes: number; reviewStatus: EvidenceReview; rejectionReason: string | null; createdAt: string };

const STATUS: Record<EvidenceReview, { label: string; className: string }> = {
  PENDING: { label: "Not reviewed yet", className: "bg-stone-100 text-stone-700 ring-stone-200" },
  ACCEPTED: { label: "Accepted", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  REJECTED: { label: "Rejected", className: "bg-red-50 text-red-800 ring-red-200" },
};
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40";
const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const typeName = (type: string) => (type === "application/pdf" ? "PDF" : type.replace("image/", "").toUpperCase());

/** Upload slots for the identity documents. `locked` while the application is being reviewed or already approved. */
export default function VerificationEvidence({ items, locked, onChanged }: { items: EvidenceItem[]; locked: boolean; onChanged: () => void | Promise<void> }) {
  const [busyKind, setBusyKind] = useState<EvidenceKind | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<{ kind: EvidenceKind | "all"; text: string } | null>(null);
  const inputs = useRef<Partial<Record<EvidenceKind, HTMLInputElement | null>>>({});

  async function upload(kind: EvidenceKind, file: File | undefined) {
    if (!file || busyKind) return;
    setError(null);
    if (file.size > MAX_FILE_BYTES) { setError({ kind, text: "That file is too large. The limit is 5 MB." }); return; }
    setBusyKind(kind);
    try {
      const form = new FormData();
      form.set("kind", kind);
      form.set("file", file);
      const response = await fetch("/api/student/academic-mate/verification/evidence", { method: "POST", body: form });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "We could not upload that document.");
      await onChanged();
    } catch (err) {
      setError({ kind, text: err instanceof Error ? err.message : "We could not upload that document." });
    } finally {
      setBusyKind(null);
      const input = inputs.current[kind];
      if (input) input.value = "";
    }
  }

  async function remove(item: EvidenceItem) {
    if (removing) return;
    setRemoving(item.id);
    setError(null);
    try {
      const response = await fetch(`/api/student/academic-mate/verification/evidence/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "We could not remove that document.");
      await onChanged();
    } catch (err) {
      setError({ kind: item.kind, text: err instanceof Error ? err.message : "We could not remove that document." });
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div>
      <p className="text-xs leading-5 text-[#6d6260]">Upload a clear photo or PDF (JPG, PNG, WebP or PDF, up to 5 MB each). You need your student ID and either proof of enrolment or your results. Only TXMate reviewers can open these files, and they are deleted after your application is decided.</p>
      <ul className="mt-3 divide-y divide-[#eee7df] rounded-xl border border-[#eee7df]">
        {EVIDENCE_KINDS.map((kind) => {
          const mine = items.filter((item) => item.kind === kind);
          const full = mine.length >= MAX_PER_KIND || items.length >= MAX_TOTAL;
          const required = kind === "STUDENT_ID";
          return (
            <li key={kind} className="px-3.5 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#282321]">{EVIDENCE_LABEL[kind]} <span className="text-[11px] font-medium text-[#8a7f7a]">{required ? "Required" : "One of these two is required"}</span></p>
                  <p className="text-xs text-[#6d6260]">{EVIDENCE_HINT[kind]}</p>
                </div>
                {!locked && (
                  <>
                    <input ref={(node) => { inputs.current[kind] = node; }} id={`evidence-${kind}`} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" disabled={full || busyKind !== null} onChange={(event) => void upload(kind, event.target.files?.[0])} />
                    <label htmlFor={`evidence-${kind}`} className={`inline-flex h-9 shrink-0 cursor-pointer items-center rounded-lg border border-[#d8cec5] bg-white px-3 text-xs font-semibold text-[#7d1f2a] hover:bg-[#f8efed] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 ${FOCUS}`}>{busyKind === kind ? "Uploading…" : mine.length > 0 ? "Add another" : "Choose file"}</label>
                  </>
                )}
              </div>
              {mine.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {mine.map((item) => (
                    <li key={item.id} className="rounded-lg bg-[#faf8f6] px-3 py-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-xs font-medium text-[#4d4541]">{typeName(item.contentType)} · {size(item.sizeBytes)}</span>
                        <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${STATUS[item.reviewStatus].className}`}>{STATUS[item.reviewStatus].label}</span>
                        {!locked && <button type="button" onClick={() => void remove(item)} disabled={removing !== null} className={`ml-auto rounded px-1.5 py-0.5 text-xs font-medium text-[#8b3335] hover:bg-red-50 disabled:opacity-50 ${FOCUS}`}>{removing === item.id ? "Removing…" : "Remove"}</button>}
                      </div>
                      {item.reviewStatus === "REJECTED" && item.rejectionReason && <p className="mt-1 text-xs text-red-800">Reason: {item.rejectionReason}. Remove this file and upload a better one.</p>}
                    </li>
                  ))}
                </ul>
              )}
              {error && error.kind === kind && <p role="alert" className="mt-2 text-xs text-red-700">{error.text}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
