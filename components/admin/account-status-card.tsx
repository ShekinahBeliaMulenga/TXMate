"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ACCOUNT_STATUS_LABEL, REASON_MAX, REASON_MIN, type AccountAction, type AccountScope } from "@/lib/admin/user-types";
import { Badge } from "./admin-ui";

const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40";

type Props = {
  userId: string;
  scope: AccountScope;
  title: string;
  status: string;
  detail?: string | null;
  canChange: boolean;
  /** What suspending does, shown before the admin confirms. */
  suspendEffect: string;
};

/** Status of one account scope with a confirm-with-reason flow for suspend / reactivate. */
export default function AccountStatusCard({ userId, scope, title, status, detail, canChange, suspendEffect }: Props) {
  const router = useRouter();
  const [action, setAction] = useState<AccountAction | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next: AccountAction | null = status === "ACTIVE" ? "SUSPEND" : status === "SUSPENDED" ? "REACTIVATE" : null;
  const reasonOk = reason.trim().length >= REASON_MIN && reason.trim().length <= REASON_MAX;

  async function submit() {
    if (!action || !reasonOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ scope, action, reason: reason.trim() }),
      });
      if (response.status === 401) {
        window.location.assign("/admin/login?expired=1");
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to update the account.");
      setAction(null);
      setReason("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update the account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#282321]">{title}</p>
          {detail ? <p className="truncate text-[13px] text-[#6d6260]">{detail}</p> : null}
        </div>
        <Badge tone={status === "ACTIVE" ? "success" : status === "SUSPENDED" ? "danger" : "neutral"}>{ACCOUNT_STATUS_LABEL[status] ?? status}</Badge>
      </div>

      {canChange && next && !action ? (
        <button type="button" onClick={() => setAction(next)} className={`mt-3 h-10 rounded-xl px-4 text-sm font-semibold ${FOCUS} ${next === "SUSPEND" ? "border border-[#e3b5b7] text-[#a3262a] hover:bg-[#fdf1f1]" : "bg-[#7d1f2a] text-white hover:bg-[#691923]"}`}>
          {next === "SUSPEND" ? "Suspend…" : "Reactivate…"}
        </button>
      ) : null}
      {!canChange && next ? <p className="mt-3 text-xs text-[#7a6f6a]">Your role can view this account but not change its status.</p> : null}
      {status !== "ACTIVE" && status !== "SUSPENDED" ? <p className="mt-3 text-xs text-[#7a6f6a]">Only active or suspended accounts can be changed here.</p> : null}

      {action ? (
        <div className="mt-3 rounded-xl bg-[#f6f2ee] p-3">
          {action === "SUSPEND" ? <p className="text-[13px] leading-5 text-[#514844]">{suspendEffect}</p> : <p className="text-[13px] leading-5 text-[#514844]">The account becomes active again and the person is told.</p>}
          <label className="mt-3 block text-xs font-semibold text-[#514844]" htmlFor={`reason-${scope}`}>Reason (shown to the person and kept in the audit log)</label>
          <textarea
            id={`reason-${scope}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={REASON_MAX}
            rows={3}
            className={`mt-1 w-full rounded-xl border border-[#e2d9d0] bg-white p-3 text-sm ${FOCUS}`}
          />
          {error ? <p role="alert" className="mt-2 text-[13px] text-[#a3262a]">{error}</p> : null}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => { setAction(null); setReason(""); setError(null); }} disabled={busy} className={`h-10 rounded-xl px-4 text-sm font-semibold text-[#4e4742] hover:bg-white ${FOCUS}`}>Cancel</button>
            <button type="button" onClick={() => void submit()} disabled={!reasonOk || busy} className={`h-10 rounded-xl bg-[#7d1f2a] px-5 text-sm font-semibold text-white hover:bg-[#691923] disabled:opacity-50 ${FOCUS}`}>
              {busy ? "Saving…" : action === "SUSPEND" ? "Confirm suspension" : "Confirm reactivation"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
