"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { AUDIT_ACTION_LABEL, auditTone, type AuditEntry, type AuditPage } from "@/lib/admin/audit-types";
import { DateRangeFields, GhostButton, SearchField, SelectField, Toolbar } from "./admin-controls";
import { Badge, EmptyState, FOCUS, Panel, TABLE } from "./admin-ui";

const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const FULL = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium" });
const ACTION_OPTIONS = [{ id: "", label: "All actions" }, ...Object.entries(AUDIT_ACTION_LABEL).map(([id, label]) => ({ id, label }))];

async function fetchAudit(action: string, actor: string, from: string, to: string, cursor: string | null, signal: AbortSignal): Promise<AuditPage> {
  const params = new URLSearchParams();
  if (action) params.set("action", action);
  if (actor) params.set("actor", actor);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
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

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function Details({ entry }: { entry: AuditEntry }) {
  const rows: Array<[string, string]> = [
    ["When", FULL.format(new Date(entry.createdAt))],
    ["Who", `${entry.actorName} (${entry.actorRole.replace("_", " ").toLowerCase()})`],
    ["Target", `${entry.targetType.replace("_", " ").toLowerCase()}${entry.targetId ? ` · ${entry.targetId}` : ""}`],
    ...Object.entries(entry.details).map(([key, value]): [string, string] => [key, String(value ?? "—")]),
  ];
  if (entry.ipAddress) rows.push(["IP address", entry.ipAddress]);
  return (
    <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-[8rem_minmax(0,1fr)]">
      {rows.map(([label, value]) => (
        <Fragment key={label}>
          <dt className="text-[#7a716a]">{label}</dt>
          <dd className="min-w-0 break-words font-medium text-[#1f1a17]">{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

export default function AuditViewer() {
  const [action, setAction] = useState("");
  const [actorInput, setActorInput] = useState("");
  const [actor, setActor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setActor(actorInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [actorInput]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    setError(null);
    fetchAudit(action, actor, from, to, null, controller.signal)
      .then((page) => { setItems(page.items); setNextCursor(page.nextCursor); setOpen(null); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setItems([]);
        setNextCursor(null);
        setError(err instanceof Error ? err.message : "Unable to load the audit log.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [action, actor, from, to, reloadKey]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchAudit(action, actor, from, to, nextCursor, new AbortController().signal);
      setItems((current) => [...current, ...page.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load more.");
    } finally {
      setLoadingMore(false);
    }
  }

  const rows = useMemo(() => {
    const out: Array<{ type: "day"; key: string; label: string } | { type: "entry"; entry: AuditEntry }> = [];
    let last = "";
    for (const entry of items) {
      const key = dayKey(entry.createdAt);
      if (key !== last) {
        out.push({ type: "day", key, label: DAY.format(new Date(entry.createdAt)) });
        last = key;
      }
      out.push({ type: "entry", entry });
    }
    return out;
  }, [items]);

  return (
    <div className="space-y-4">
      <Toolbar>
        <SelectField label="Action" value={action} onChange={setAction} options={ACTION_OPTIONS} />
        <SearchField value={actorInput} onChange={setActorInput} placeholder="Search by admin name" label="Search by admin name" />
        <DateRangeFields from={from} to={to} onFrom={setFrom} onTo={setTo} fromLabel="Recorded from" toLabel="Recorded to" />
        <GhostButton onClick={() => setReloadKey((value) => value + 1)} disabled={loading} aria-label="Refresh" className="sm:ml-auto">
          <Icon name="refresh" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh
        </GhostButton>
      </Toolbar>

      <Panel>
        {loading ? (
          <div aria-busy="true">{[0, 1, 2, 3, 4, 5].map((n) => <div key={n} className="h-14 animate-pulse border-b border-[#eee9e3] bg-[#faf9f7]" />)}</div>
        ) : error ? (
          <div role="alert" className="p-6 text-center text-sm text-[#a3262a]">{error}</div>
        ) : items.length === 0 ? (
          <EmptyState icon="audit" title="No matching entries" hint="Admin actions appear here as they happen. Try clearing the filters." />
        ) : (
          <div className={TABLE.wrap}>
            <table className={TABLE.table}>
              <thead>
                <tr>
                  <th className={`${TABLE.th} w-20`}>Time</th>
                  <th className={TABLE.th}>Action</th>
                  <th className={`${TABLE.th} ${TABLE.hide}`}>Admin</th>
                  <th className={`${TABLE.th} ${TABLE.hide}`}>Details</th>
                  <th className={`${TABLE.th} w-10`}><span className="sr-only">Expand</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  if (row.type === "day") {
                    return <tr key={`day-${row.key}`}><th colSpan={5} scope="colgroup" className="border-b border-[#e4dfd9] bg-[#f6f5f3] px-4 py-2 text-left text-xs font-semibold text-[#6b635d]">{row.label}</th></tr>;
                  }
                  const { entry } = row;
                  const expanded = open === entry.id;
                  return (
                    <Fragment key={entry.id}>
                      <tr className={`${TABLE.row} cursor-pointer`} onClick={() => setOpen(expanded ? null : entry.id)}>
                        <td className={`${TABLE.td} whitespace-nowrap align-top font-mono text-xs tabular-nums text-[#6b635d]`}>{TIME.format(new Date(entry.createdAt))}</td>
                        <td className={`${TABLE.td} align-top`}>
                          <Badge tone={auditTone(entry.action)}>{AUDIT_ACTION_LABEL[entry.action] ?? entry.action}</Badge>
                          <p className="mt-1 text-[13px] leading-5 text-[#6b635d] md:hidden">{entry.actorName}{entry.summary ? ` · ${entry.summary}` : ""}</p>
                        </td>
                        <td className={`${TABLE.td} ${TABLE.hide} align-top`}>
                          <p className="font-medium">{entry.actorName}</p>
                          <p className="text-xs text-[#7a716a]">{entry.actorRole.replace("_", " ").toLowerCase()}</p>
                        </td>
                        <td className={`${TABLE.td} ${TABLE.hide} align-top text-[#4e4742]`}>{entry.summary ?? "—"}</td>
                        <td className={`${TABLE.td} align-top`}>
                          <button type="button" aria-expanded={expanded} aria-label={expanded ? "Hide details" : "Show details"} onClick={(event) => { event.stopPropagation(); setOpen(expanded ? null : entry.id); }} className={`flex h-7 w-7 items-center justify-center rounded text-[#7a716a] hover:bg-[#f1ede8] ${FOCUS}`}>
                            <Icon name="chevronRight" className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`} />
                          </button>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr><td colSpan={5} className="border-b border-[#eee9e3] bg-[#faf9f7] px-4 py-4"><Details entry={entry} /></td></tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {nextCursor && !loading ? (
        <div className="flex justify-center"><GhostButton onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "Loading…" : "Show older entries"}</GhostButton></div>
      ) : null}
    </div>
  );
}
