"use client";

import { Fragment, useEffect, useState } from "react";
import { ARRANGEMENT_STATUSES, REQUEST_STATUSES, statusLabel, type DirectoryKind, type DirectoryPage } from "@/lib/admin/ops-types";
import { ADMIN_SESSION_STATES, ADMIN_SESSION_STATE_LABEL } from "@/lib/admin/session-state";
import ConversationPanel from "./conversation-panel";
import { DateRangeFields, GhostButton, SearchField, SelectField, Tabs, Toolbar } from "./admin-controls";
import { Badge, EmptyState, Panel, TABLE, type BadgeTone } from "./admin-ui";

const KINDS = [
  { id: "requests" as const, label: "Requests and arrangements" },
  { id: "sessions" as const, label: "Sessions" },
];

function tone(label: string): BadgeTone {
  const value = label.toLowerCase();
  if (["accepted", "completed", "active", "upcoming"].includes(value)) return "success";
  if (["requested", "pending", "scheduled", "in progress", "paused", "ended, awaiting confirmation", "needs review", "no response"].includes(value)) return "warning";
  if (["declined", "cancelled", "no show", "disputed", "expired"].includes(value)) return "danger";
  return "neutral";
}

function statusOptions(kind: DirectoryKind) {
  const any = [{ id: "all", label: "Any" }];
  if (kind === "sessions") return [...any, ...ADMIN_SESSION_STATES.map((state) => ({ id: state, label: ADMIN_SESSION_STATE_LABEL[state] }))];
  return [...any, ...REQUEST_STATUSES.map((status) => ({ id: status, label: statusLabel(status) }))];
}

const ARRANGEMENT_OPTIONS = [{ id: "all", label: "Any" }, ...ARRANGEMENT_STATUSES.map((status) => ({ id: status, label: statusLabel(status) }))];

export default function TutoringDirectory({ canReadMessages = false }: { canReadMessages?: boolean }) {
  const [kind, setKind] = useState<DirectoryKind>("requests");
  const [status, setStatus] = useState("all");
  const [arrangement, setArrangement] = useState("all");
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DirectoryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => { setQ(input.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [input]);

  const dateInvalid = Boolean(from && to && from > to);

  useEffect(() => {
    if (dateInvalid) { setData(null); setError(null); setLoading(false); return; } // eslint-disable-line react-hooks/set-state-in-effect
    const controller = new AbortController();
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    setError(null);
    setOpen(null);
    fetch(`/api/admin/tutoring?${new URLSearchParams({ kind, status, arrangement: kind === "requests" ? arrangement : "all", q, from, to, page: String(page) }).toString()}`, { headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) { window.location.assign("/admin/login?expired=1"); return; }
        const body = (await response.json().catch(() => ({}))) as Partial<DirectoryPage> & { error?: string };
        if (!response.ok || !Array.isArray(body.items)) throw new Error(body.error || "Unable to load this list.");
        setData({ items: body.items, page: body.page ?? 1, pageCount: body.pageCount ?? 1, total: body.total ?? body.items.length });
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setData(null);
        setError(err instanceof Error ? err.message : "Unable to load this list.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind, status, arrangement, q, from, to, page, dateInvalid]);

  function changeKind(next: DirectoryKind) { setKind(next); setStatus("all"); setArrangement("all"); setPage(1); }
  const filtered = Boolean(input || status !== "all" || arrangement !== "all" || from || to);
  function resetFilters() { setInput(""); setQ(""); setStatus("all"); setArrangement("all"); setFrom(""); setTo(""); setPage(1); }

  return (
    <div className="space-y-4">
      <Tabs tabs={KINDS} value={kind} onChange={changeKind} label="Choose a list" />
      <Toolbar>
        <SearchField value={input} onChange={setInput} placeholder="Search student, mate, course or student ID" label="Search tutoring" />
        <SelectField label={kind === "sessions" ? "State" : "Request"} value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={statusOptions(kind)} />
        {kind === "requests" ? <SelectField label="Arrangement" value={arrangement} onChange={(value) => { setArrangement(value); setPage(1); }} options={ARRANGEMENT_OPTIONS} /> : null}
        <DateRangeFields from={from} to={to} onFrom={(v) => { setFrom(v); setPage(1); }} onTo={(v) => { setTo(v); setPage(1); }} fromLabel={kind === "sessions" ? "Session starts from" : "Requested from"} toLabel={kind === "sessions" ? "Session starts to" : "Requested to"} />
        {filtered ? <GhostButton onClick={resetFilters}>Reset filters</GhostButton> : null}
      </Toolbar>
      {dateInvalid ? <p role="alert" className="text-sm text-[#a3262a]">The start date is after the end date, so nothing can match.</p> : null}

      {data && !loading && !error ? <p className="text-[13px] text-[#6b635d]" aria-live="polite">{data.total} {data.total === 1 ? "result" : "results"}{filtered ? " match your filters" : ""}</p> : null}
      <Panel>
        {loading ? (
          <div aria-busy="true">{[0, 1, 2, 3, 4].map((n) => <div key={n} className="h-16 animate-pulse border-b border-[#eee9e3] bg-[#faf9f7]" />)}</div>
        ) : error ? (
          <div role="alert" className="p-6 text-center text-sm text-[#a3262a]">{error}</div>
        ) : dateInvalid ? (
          <div className="p-6 text-center text-sm text-[#6b635d]">Fix the date range to see results.</div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon="calendar" title={kind === "sessions" ? "No sessions found" : "No requests found"} hint={filtered ? "Nothing matches these filters. Reset them to see everything." : "Nothing here yet."} />
        ) : (
          <div className={TABLE.wrap}>
            <table className={TABLE.table}>
              <thead>
                <tr>
                  <th className={TABLE.th}>Course</th>
                  <th className={`${TABLE.th} ${TABLE.hideSm}`}>Student</th>
                  <th className={`${TABLE.th} ${TABLE.hide}`}>Academic Mate</th>
                  <th className={`${TABLE.th} ${TABLE.hide}`}>{kind === "sessions" ? "Starts" : "Requested"}</th>
                  <th className={TABLE.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => {
                  const expanded = open === row.id;
                  return (
                    <Fragment key={row.id}>
                      <tr className={`${TABLE.row} cursor-pointer`} onClick={() => setOpen(expanded ? null : row.id)}>
                        <td className={TABLE.td}>
                          <button type="button" aria-expanded={expanded} aria-controls={`details-${row.id}`} onClick={(event) => { event.stopPropagation(); setOpen(expanded ? null : row.id); }} className="text-left font-medium hover:text-[#7d1f2a] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40">
                            {row.title}
                          </button>
                          <p className="mt-0.5 text-[13px] text-[#6b635d] sm:hidden">{row.student} with {row.mate}</p>
                          <p className="mt-0.5 text-[13px] text-[#6b635d]">{row.university} · {row.detail}</p>
                        </td>
                        <td className={`${TABLE.td} ${TABLE.hideSm} text-[#4e4742]`}>{row.student}</td>
                        <td className={`${TABLE.td} ${TABLE.hide} text-[#4e4742]`}>{row.mate}</td>
                        <td className={`${TABLE.td} ${TABLE.hide} whitespace-nowrap text-[13px] text-[#6b635d]`}>{row.when ?? "—"}</td>
                        <td className={TABLE.td}><Badge tone={tone(row.status)}>{row.status}</Badge></td>
                      </tr>
                      {expanded ? (
                        <tr id={`details-${row.id}`} className="bg-[#faf9f7]">
                          <td colSpan={5} className="border-b border-[#eee9e3] px-4 py-4">
                            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                              {row.facts.map((fact) => (
                                <div key={fact.label} className="min-w-0">
                                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-[#7a716a]">{fact.label}</dt>
                                  <dd className="mt-0.5 break-words text-sm text-[#1f1a17]">{fact.value}</dd>
                                </div>
                              ))}
                            </dl>
                            {canReadMessages && kind === "requests" ? <ConversationPanel key={row.id} requestId={row.id} /> : null}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {data && data.pageCount > 1 ? (
        <div className="flex items-center justify-between gap-3 text-[13px] text-[#6b635d]">
          <span>{data.total} total · page {data.page} of {data.pageCount}</span>
          <div className="flex gap-2">
            <GhostButton onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={loading || page <= 1}>Previous</GhostButton>
            <GhostButton onClick={() => setPage((current) => Math.min(data.pageCount, current + 1))} disabled={loading || page >= data.pageCount}>Next</GhostButton>
          </div>
        </div>
      ) : data ? <p className="text-[13px] text-[#6b635d]">{data.total} {data.total === 1 ? "result" : "results"}</p> : null}
    </div>
  );
}
