"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { DisputeItem, DisputeListKind, DisputePage } from "@/lib/admin/dispute-types";
import ResolveDisputeDialog from "./resolve-dispute-dialog";

const WHEN = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

const TABS: ReadonlyArray<{ kind: DisputeListKind; label: string }> = [
  { kind: "open", label: "Open" },
  { kind: "resolved", label: "Resolved" },
];

async function fetchPage(kind: DisputeListKind, cursor: string | null, signal: AbortSignal): Promise<DisputePage> {
  const query = new URLSearchParams({ kind });
  if (cursor) query.set("cursor", cursor);
  const response = await fetch(`/api/admin/disputes?${query.toString()}`, { headers: { Accept: "application/json" }, cache: "no-store", signal });
  if (response.status === 401) {
    window.location.assign("/admin/login?expired=1");
    return { items: [], nextCursor: null };
  }
  const body = (await response.json().catch(() => ({}))) as Partial<DisputePage> & { error?: string };
  if (!response.ok || !Array.isArray(body.items)) throw new Error(body.error || "Unable to load sessions.");
  return { items: body.items, nextCursor: body.nextCursor ?? null };
}

function DisputeCard({ item, kind, canResolve, onResolve }: { item: DisputeItem; kind: DisputeListKind; canResolve: boolean; onResolve: () => void }) {
  const start = new Date(item.scheduledStart);
  const end = new Date(item.scheduledEnd);
  return (
    <li className="rounded-2xl border border-[#ece5de] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-[#282321]"><span className="text-[#7d1f2a]">{item.course.code}</span> · {item.course.name}</h3>
          <p className="mt-0.5 text-[13px] text-[#6d6260]">{WHEN.format(start)} – {TIME.format(end)} · {item.location}</p>
        </div>
        <div className="flex gap-1.5">
          <span className="rounded-full bg-[#f3efeb] px-2.5 py-1 text-[11px] font-semibold text-[#6d6260]">{item.university}</span>
          {item.groupId ? <span className="rounded-full bg-[#f3efeb] px-2.5 py-1 text-[11px] font-semibold text-[#6d6260]">Group session</span> : null}
          {item.arrangementType === "ONE_TIME" ? <span className="rounded-full bg-[#f3efeb] px-2.5 py-1 text-[11px] font-semibold text-[#6d6260]">One-time</span> : null}
        </div>
      </div>

      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-xl bg-[#f6f2ee] p-3">
          <dt className="text-xs text-[#7a6f6a]">Student</dt>
          <dd className="font-medium">{item.student.name} <span className="font-normal text-[#7a6f6a]">· {item.student.studentId}</span></dd>
          <dd className="mt-1 text-[13px]">Said: <strong>{item.studentAnswer}</strong></dd>
        </div>
        <div className="rounded-xl bg-[#f6f2ee] p-3">
          <dt className="text-xs text-[#7a6f6a]">Academic Mate</dt>
          <dd className="font-medium">{item.mate.name}</dd>
          <dd className="mt-1 text-[13px]">Said the student: <strong>{item.mateAnswer}</strong></dd>
        </div>
      </dl>

      {item.reasons.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {item.reasons.map((reason) => (
            <li key={reason} className="flex items-start gap-2 text-[13px] leading-5 text-[#514844]">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-[#7d1f2a]" />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {kind === "open" && canResolve ? (
        <div className="mt-4 flex justify-end border-t border-[#efe8e1] pt-3">
          <button type="button" onClick={onResolve} className="h-10 rounded-xl bg-[#7d1f2a] px-5 text-sm font-semibold text-white transition hover:bg-[#691923] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 focus-visible:ring-offset-2">
            Review and decide
          </button>
        </div>
      ) : null}
      {kind === "resolved" && item.resolvedAt ? (
        <p className="mt-3 border-t border-[#efe8e1] pt-3 text-xs text-[#7a6f6a]">Resolved by {item.resolvedBy ?? "an admin"} on {WHEN.format(new Date(item.resolvedAt))}. The reason is in the audit log.</p>
      ) : null}
    </li>
  );
}

export default function DisputesQueue({ canResolve }: { canResolve: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<DisputeListKind>("open");
  const [items, setItems] = useState<DisputeItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [resolving, setResolving] = useState<DisputeItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    setError(null);
    fetchPage(kind, null, controller.signal)
      .then((page) => {
        setItems(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setItems([]);
        setNextCursor(null);
        setError(err instanceof Error ? err.message : "Unable to load sessions.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind, reloadKey]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(kind, nextCursor, new AbortController().signal);
      setItems((current) => [...current, ...page.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load more.");
    } finally {
      setLoadingMore(false);
    }
  }

  const handleResolved = useCallback((sessionId: string, message: string) => {
    setItems((current) => current.filter((item) => item.id !== sessionId));
    setResolving(null);
    setToast(message);
    router.refresh(); // keeps the sidebar count in step
  }, [router]);

  const closeDialog = useCallback(() => setResolving(null), []);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl border border-[#e2d9d0] bg-white p-1" role="tablist" aria-label="Session list">
          {TABS.map((tab) => (
            <button key={tab.kind} type="button" role="tab" aria-selected={kind === tab.kind} onClick={() => setKind(tab.kind)} className={`rounded-lg px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 ${kind === tab.kind ? "bg-[#7d1f2a] text-white" : "text-[#6d6260] hover:bg-[#f6f1ec]"}`}>
              {tab.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setReloadKey((value) => value + 1)} disabled={loading} aria-label="Refresh" title="Refresh" className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#d8cec6] bg-white text-[#4e4541] transition hover:bg-[#faf8f6] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 disabled:opacity-60">
          <Icon name="refresh" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1].map((key) => <div key={key} className="h-44 animate-pulse rounded-2xl border border-[#ece5de] bg-white" />)}
          </div>
        ) : error && items.length === 0 ? (
          <div role="alert" className="rounded-2xl border border-[#e3cfd2] bg-white p-5 text-sm text-[#7d1f2a]">
            {error}
            <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="ml-3 font-semibold underline underline-offset-2">Try again</button>
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-2xl border border-[#ece5de] bg-white p-6 text-center text-sm text-[#7a6f6a]">
            {kind === "open" ? "Nothing needs review right now." : "No decisions recorded yet."}
          </p>
        ) : (
          <>
            <ul className="space-y-3">
              {items.map((item) => <DisputeCard key={item.id} item={item} kind={kind} canResolve={canResolve} onResolve={() => setResolving(item)} />)}
            </ul>
            {error ? <p role="alert" className="mt-3 text-sm text-[#7d1f2a]">{error}</p> : null}
            {nextCursor ? (
              <div className="mt-4 flex justify-center">
                <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="h-10 rounded-xl border border-[#d8cec6] bg-white px-5 text-sm font-semibold text-[#4e4541] hover:bg-[#faf8f6] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 disabled:opacity-60">
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      {resolving ? <ResolveDisputeDialog item={resolving} onClose={closeDialog} onResolved={handleResolved} /> : null}

      {toast ? (
        <div role="status" className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-[#28633b] px-4 py-2.5 text-sm font-medium text-white shadow-lg">
          <Icon name="check" className="h-4 w-4" />
          {toast}
        </div>
      ) : null}
    </div>
  );
}
