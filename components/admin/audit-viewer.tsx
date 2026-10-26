"use client";

import { useEffect, useState } from "react";
import { AUDIT_ACTION_LABEL, type AuditEntry, type AuditPage } from "@/lib/admin/audit-types";
import { Badge, Card, EmptyState } from "./admin-ui";

const WHEN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40";
const ACTIONS = Object.keys(AUDIT_ACTION_LABEL);

async function fetchAudit(action: string, cursor: string | null, signal: AbortSignal): Promise<AuditPage> {
  const params = new URLSearchParams();
  if (action) params.set("action", action);
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(`/api/admin/audit?${params.toString()}`, { headers: { Accept: "application/json" }, cache: "no-store", signal });
  if (response.status === 401) {
    window.location.assign("/admin/login?expired=1");
    return { items: [], nextCursor: null };
  }
  const body = (await response.json().catch(() => ({}))) as Partial<AuditPage> & { error?: string };
  if (!response.ok || !Array.isArray(body.items)) throw new Error(body.error || "Unable to load the audit log.");
  return { items: body.items, nextCursor: body.nextCursor ?? null };
}

export default function AuditViewer() {
  const [action, setAction] = useState("");
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    setError(null);
    fetchAudit(action, null, controller.signal)
      .then((page) => { setItems(page.items); setNextCursor(page.nextCursor); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setItems([]);
        setNextCursor(null);
        setError(err instanceof Error ? err.message : "Unable to load the audit log.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [action]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchAudit(action, nextCursor, new AbortController().signal);
      setItems((current) => [...current, ...page.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load more.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="audit-action" className="sr-only">Filter by action</label>
        <select id="audit-action" value={action} onChange={(event) => setAction(event.target.value)} className={`h-11 w-full rounded-xl border border-[#e2d9d0] bg-white px-3 text-sm sm:w-72 ${FOCUS}`}>
          <option value="">All actions</option>
          {ACTIONS.map((id) => <option key={id} value={id}>{AUDIT_ACTION_LABEL[id]}</option>)}
        </select>
      </div>
      <Card>
        {loading ? (
          <div aria-busy="true">{[0, 1, 2, 3, 4].map((n) => <div key={n} className="h-16 animate-pulse border-b border-[#f0e9e2] bg-[#f6f1ec]/70" />)}</div>
        ) : error ? (
          <div role="alert" className="p-6 text-center text-sm text-[#a3262a]">{error}</div>
        ) : items.length === 0 ? (
          <EmptyState icon="audit" title="Nothing recorded yet" hint="Admin actions appear here as they happen." />
        ) : (
          <ul className="divide-y divide-[#f0e9e2]">
            {items.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#282321]">{AUDIT_ACTION_LABEL[entry.action] ?? entry.action}<Badge>{entry.actorRole.replace("_", " ").toLowerCase()}</Badge></p>
                  <p className="mt-0.5 text-[13px] text-[#6d6260]">{entry.actorName}{entry.summary ? ` · ${entry.summary}` : ""}</p>
                </div>
                <time dateTime={entry.createdAt} className="shrink-0 text-xs text-[#7a6f6a]">{WHEN.format(new Date(entry.createdAt))}</time>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {nextCursor && !loading ? (
        <div className="flex justify-center">
          <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className={`h-10 rounded-xl border border-[#e2d9d0] bg-white px-5 text-sm font-semibold text-[#4e4742] hover:bg-[#f6f1ec] disabled:opacity-60 ${FOCUS}`}>
            {loadingMore ? "Loading…" : "Show more"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
