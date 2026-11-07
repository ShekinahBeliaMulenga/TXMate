"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { DisputeItem, DisputeListKind, DisputePage } from "@/lib/admin/dispute-types";
import { DateRangeFields, GhostButton, PrimaryButton, SearchField, Tabs, Toolbar } from "./admin-controls";
import { EmptyState, Panel } from "./admin-ui";
import ResolveDisputeDialog from "./resolve-dispute-dialog";

const WHEN = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

const TABS: ReadonlyArray<{ kind: DisputeListKind; label: string }> = [
  { kind: "open", label: "Open" },
  { kind: "resolved", label: "Resolved" },
];

async function fetchPage(kind: DisputeListKind, filter: { q: string; from: string; to: string }, cursor: string | null, signal: AbortSignal): Promise<DisputePage> {
  const query = new URLSearchParams({ kind });
  if (filter.q) query.set("q", filter.q);
  if (filter.from) query.set("from", filter.from);
  if (filter.to) query.set("to", filter.to);
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
    <li className="px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[#1f1a17]"><span className="text-[#7d1f2a]">{item.course.code}</span> · {item.course.name}</h3>
          <p className="mt-0.5 text-[13px] text-[#6b635d]">{WHEN.format(start)} – {TIME.format(end)} · {item.location}</p>
        </div>
        <p className="text-xs text-[#7a716a]">{[item.university, item.groupId ? "Group session" : null, item.arrangementType === "ONE_TIME" ? "One-time" : null].filter(Boolean).join(" · ")}</p>
      </div>

      <dl className="mt-3 grid divide-y divide-[#eee9e3] overflow-hidden rounded-md border border-[#eee9e3] text-sm sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <div className="px-3 py-2.5">
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-[#7a716a]">Student</dt>
          <dd className="mt-0.5 font-medium">{item.student.name} <span className="font-normal text-[#7a716a]">· {item.student.studentId}</span></dd>
          <dd className="text-[13px] text-[#4e4742]">Said: <strong>{item.studentAnswer}</strong></dd>
        </div>
        <div className="px-3 py-2.5">
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-[#7a716a]">Academic Mate</dt>
          <dd className="mt-0.5 font-medium">{item.mate.name}</dd>
          <dd className="text-[13px] text-[#4e4742]">Said the student: <strong>{item.mateAnswer}</strong></dd>
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
        <div className="mt-3 flex justify-end">
          <PrimaryButton onClick={onResolve} className="w-full sm:w-auto">Review and decide</PrimaryButton>
        </div>
      ) : null}
      {kind === "resolved" && item.resolvedAt ? (
        <p className="mt-3 text-xs text-[#7a716a]">Resolved by {item.resolvedBy ?? "an admin"} on {WHEN.format(new Date(item.resolvedAt))}. The reason is in the audit log.</p>
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
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filtered = Boolean(q || from || to);
  const [resolving, setResolving] = useState<DisputeItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    setError(null);
    fetchPage(kind, { q, from, to }, null, controller.signal)
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
  }, [kind, q, from, to, reloadKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(input.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(kind, { q, from, to }, nextCursor, new AbortController().signal);
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
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Tabs tabs={TABS.map((tab) => ({ id: tab.kind, label: tab.label }))} value={kind} onChange={setKind} label="Session list" />
        </div>
        <GhostButton onClick={() => setReloadKey((value) => value + 1)} disabled={loading} className="mb-1">
          <Icon name="refresh" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh
        </GhostButton>
      </div>

      <div className="mt-4">
        <Toolbar>
          <SearchField value={input} onChange={setInput} placeholder="Search student, mate, course or student ID" label="Search sessions" />
          <DateRangeFields from={from} to={to} onFrom={setFrom} onTo={setTo} fromLabel="Session starts from" toLabel="Session starts to" />
        </Toolbar>
      </div>

      <Panel className="mt-4">
        {loading ? (
          <div aria-busy="true">{[0, 1].map((key) => <div key={key} className="h-40 animate-pulse border-b border-[#eee9e3] bg-[#faf9f7]" />)}</div>
        ) : error && items.length === 0 ? (
          <div role="alert" className="p-5 text-sm text-[#a3262a]">
            {error}
            <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="ml-3 font-semibold underline underline-offset-2">Try again</button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon="alert" title={filtered ? "No sessions match" : kind === "open" ? "Nothing needs review right now" : "No decisions recorded yet"} hint={filtered ? "Try a different search or clear the dates." : kind === "open" ? "Sessions with mismatched answers or reported problems appear here." : undefined} />
        ) : (
          <ul className="divide-y divide-[#eee9e3]">
            {items.map((item) => <DisputeCard key={item.id} item={item} kind={kind} canResolve={canResolve} onResolve={() => setResolving(item)} />)}
          </ul>
        )}
      </Panel>
      {error && items.length > 0 ? <p role="alert" className="mt-3 text-sm text-[#a3262a]">{error}</p> : null}
      {nextCursor && !loading ? (
        <div className="mt-4 flex justify-center"><GhostButton onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more"}</GhostButton></div>
      ) : null}

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
