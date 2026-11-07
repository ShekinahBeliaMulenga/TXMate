"use client";

import { Fragment, useCallback, useEffect, useState, type FormEvent } from "react";
import { CASE_CATEGORIES, CASE_PRIORITIES, CASE_STATUSES, CASE_TEXT_MAX, CASE_TITLE_MAX, needsResolution, type CasePage, type CaseRow, type CaseStatus } from "@/lib/admin/support-types";
import { statusLabel } from "@/lib/admin/ops-types";
import { getJson, sendJson, type ApiResult } from "./api-client";
import { DateRangeFields, GhostButton, PrimaryButton, SearchField, SelectField, TextField, Toolbar } from "./admin-controls";
import { Badge, EmptyState, FOCUS, Panel, TABLE, type BadgeTone } from "./admin-ui";

const FILTERS = [
  { id: "active", label: "Open and in progress" },
  { id: "RESOLVED", label: "Resolved" },
  { id: "CLOSED", label: "Closed" },
  { id: "all", label: "Everything" },
];
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lusaka" });
const statusTone = (status: CaseStatus): BadgeTone => (status === "OPEN" ? "warning" : status === "IN_PROGRESS" ? "brand" : status === "RESOLVED" ? "success" : "neutral");

function Notice({ result }: { result: ApiResult | null }) {
  return result ? <p role={result.ok ? "status" : "alert"} className={`text-[13px] ${result.ok ? "text-[#28633b]" : "text-[#a3262a]"}`}>{result.message}</p> : null;
}

function NewCase({ universities, platform, onDone }: { universities: Array<{ id: string; name: string }>; platform: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("OTHER");
  const [priority, setPriority] = useState("NORMAL");
  const [email, setEmail] = useState("");
  const [universityId, setUniversityId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const outcome = await sendJson("/api/admin/support", "POST", { title, description, category, priority, subjectEmail: email, universityId });
    setBusy(false);
    setResult(outcome);
    if (outcome.ok) { setTitle(""); setDescription(""); setEmail(""); setOpen(false); onDone(); }
  }

  if (!open) return <PrimaryButton onClick={() => setOpen(true)}>New case</PrimaryButton>;
  const select = `mt-1 h-10 w-full rounded-md border border-[#d9d3cc] bg-white px-2.5 text-sm ${FOCUS}`;
  return (
    <Panel title="New case" className="w-full">
      <form onSubmit={(event) => void submit(event)} className="space-y-3 p-4">
        <TextField label="Title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={CASE_TITLE_MAX} required />
        <label className="block">
          <span className="text-[13px] font-medium text-[#3a332f]">What happened</span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={CASE_TEXT_MAX} rows={4} required className={`mt-1 w-full rounded-md border border-[#d9d3cc] bg-white p-3 text-sm ${FOCUS}`} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-[13px] font-medium text-[#3a332f]">Category<select value={category} onChange={(event) => setCategory(event.target.value)} className={select}>{CASE_CATEGORIES.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}</select></label>
          <label className="block text-[13px] font-medium text-[#3a332f]">Priority<select value={priority} onChange={(event) => setPriority(event.target.value)} className={select}>{CASE_PRIORITIES.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}</select></label>
          <TextField label="Person it is about (email, optional)" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <label className="block text-[13px] font-medium text-[#3a332f]">University{!email.trim() && !platform ? "" : " (optional)"}
            <select value={universityId} onChange={(event) => setUniversityId(event.target.value)} className={select}>
              <option value="">{email.trim() ? "From the person’s account" : platform ? "Not tied to one university" : "Choose a university"}</option>
              {universities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PrimaryButton type="submit" disabled={busy || title.trim().length < 3 || description.trim().length < 5}>{busy ? "Opening…" : "Open case"}</PrimaryButton>
          <GhostButton onClick={() => setOpen(false)}>Cancel</GhostButton>
          <Notice result={result} />
        </div>
      </form>
    </Panel>
  );
}

function CaseDetail({ row, onChanged }: { row: CaseRow; onChanged: () => void }) {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<CaseStatus>(row.status);
  const [resolution, setResolution] = useState(row.resolution ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);

  async function save(change: Record<string, string>) {
    setBusy(true);
    const outcome = await sendJson(`/api/admin/support/${encodeURIComponent(row.id)}`, "PATCH", change);
    setBusy(false);
    setResult(outcome);
    if (outcome.ok) { setNote(""); onChanged(); }
  }

  const closing = needsResolution(status) && !needsResolution(row.status);
  const statusDirty = status !== row.status || (needsResolution(status) && resolution.trim() !== (row.resolution ?? ""));
  return (
    <div className="space-y-4">
      <p className="max-w-3xl whitespace-pre-wrap break-words text-sm leading-6 text-[#1f1a17]">{row.description}</p>
      <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-4 text-[13px]">
        <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-[#7a716a]">About</dt><dd className="break-words">{row.subject ? `${row.subject.name} (${row.subject.email})` : "No one in particular"}</dd></div>
        <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-[#7a716a]">University</dt><dd>{row.university ?? "Not tied to one"}</dd></div>
        <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-[#7a716a]">Opened by</dt><dd className="break-words">{row.createdByName}, {when(row.createdAt)}</dd></div>
        <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-[#7a716a]">Owner</dt><dd>{row.assignedTo ?? "Nobody yet"}</dd></div>
      </dl>
      {row.resolution ? <p className="break-words rounded-md border border-[#e4dfd9] bg-white p-3 text-[13px]"><span className="font-semibold">Outcome: </span>{row.resolution}</p> : null}

      <div className="flex flex-wrap items-end gap-3">
        {row.assignedToMe ? <GhostButton disabled={busy} onClick={() => void save({ assign: "none" })}>Give up this case</GhostButton> : <GhostButton disabled={busy} onClick={() => void save({ assign: "me" })}>Take this case</GhostButton>}
        <label className="text-[13px] text-[#3a332f]"><span className="block font-medium">Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as CaseStatus)} className={`mt-1 h-10 rounded-md border border-[#d9d3cc] bg-white px-2.5 text-sm ${FOCUS}`}>{CASE_STATUSES.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}</select>
        </label>
        <label className="text-[13px] text-[#3a332f]"><span className="block font-medium">Priority</span>
          <select defaultValue={row.priority} onChange={(event) => void save({ priority: event.target.value })} disabled={busy} className={`mt-1 h-10 rounded-md border border-[#d9d3cc] bg-white px-2.5 text-sm ${FOCUS}`}>{CASE_PRIORITIES.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}</select>
        </label>
      </div>
      {needsResolution(status) ? (
        <label className="block">
          <span className="text-[13px] font-medium text-[#3a332f]">What was decided</span>
          <textarea value={resolution} onChange={(event) => setResolution(event.target.value)} maxLength={CASE_TEXT_MAX} rows={3} className={`mt-1 w-full rounded-md border border-[#d9d3cc] bg-white p-3 text-sm ${FOCUS}`} />
        </label>
      ) : null}
      {closing ? <p role="note" className="rounded-md border border-[#ecd9a5] bg-[#fdf8e8] p-3 text-[13px] text-[#6a4b00]">Resolving or closing records your decision in the audit log. You can reopen the case later by changing its status.</p> : null}
      {statusDirty ? <PrimaryButton disabled={busy || (needsResolution(status) && resolution.trim().length < 5)} onClick={() => void save({ status, ...(needsResolution(status) ? { resolution } : {}) })}>{busy ? "Saving…" : "Save status"}</PrimaryButton> : null}

      <div>
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[#7a716a]">Notes</h4>
        {row.notes.length === 0 ? <p className="mt-1 text-[13px] text-[#6b635d]">No notes yet.</p> : (
          <ul className="mt-2 space-y-2">{row.notes.map((item) => <li key={item.id} className="rounded-md border border-[#e4dfd9] bg-white p-3 text-[13px]"><p className="break-words whitespace-pre-wrap">{item.body}</p><p className="mt-1 text-xs text-[#7a716a]">{item.authorName}, {when(item.createdAt)}</p></li>)}</ul>
        )}
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={CASE_TEXT_MAX} rows={2} aria-label="Add a note" placeholder="Add a note. Notes cannot be edited later." className={`min-w-0 flex-1 rounded-md border border-[#d9d3cc] bg-white p-3 text-sm ${FOCUS}`} />
          <GhostButton disabled={busy || note.trim() === ""} onClick={() => void save({ note })}>Add note</GhostButton>
        </div>
      </div>
      <Notice result={result} />
    </div>
  );
}

export default function SupportCases({ universities, platform }: { universities: Array<{ id: string; name: string }>; platform: boolean }) {
  const [status, setStatus] = useState("active");
  const [mine, setMine] = useState(false);
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CasePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    const timer = window.setTimeout(() => { setQ(input.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    setError(null);
    getJson<CasePage>(`/api/admin/support?${new URLSearchParams({ status, q, from, to, page: String(page), ...(mine ? { mine: "1" } : {}) }).toString()}`, controller.signal)
      .then((body) => setData(body))
      .catch((err) => { if (!(err instanceof DOMException && err.name === "AbortError")) { setData(null); setError(err instanceof Error ? err.message : "Unable to load cases."); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [status, q, from, to, page, mine, tick]);

  return (
    <div className="space-y-4">
      <NewCase universities={universities} platform={platform} onDone={reload} />
      <Toolbar>
        <SearchField value={input} onChange={setInput} placeholder="Search title, name or email" label="Search cases" />
        <SelectField label="Show" value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={FILTERS} />
        <label className="flex items-center gap-2 text-[13px] text-[#4e4742]"><input type="checkbox" checked={mine} onChange={(event) => { setMine(event.target.checked); setPage(1); }} className="h-4 w-4" />Mine only</label>
        <DateRangeFields from={from} to={to} onFrom={(v) => { setFrom(v); setPage(1); }} onTo={(v) => { setTo(v); setPage(1); }} fromLabel="Opened from" toLabel="Opened to" />
      </Toolbar>
      <Panel>
        {loading && !data ? <div aria-busy="true">{[0, 1, 2].map((n) => <div key={n} className="h-16 animate-pulse border-b border-[#eee9e3] bg-[#faf9f7]" />)}</div>
        : error ? <div role="alert" className="p-6 text-center text-sm text-[#a3262a]">{error}</div>
        : !data || data.items.length === 0 ? <EmptyState icon="inbox" title="No cases here" hint="Open a case to track a problem from first report to decision." />
        : (
          <div className={TABLE.wrap}>
            <table className={TABLE.table}>
              <thead><tr><th className={TABLE.th}>Case</th><th className={`${TABLE.th} ${TABLE.hideSm}`}>About</th><th className={`${TABLE.th} ${TABLE.hide}`}>Owner</th><th className={`${TABLE.th} ${TABLE.hide}`}>Opened</th><th className={TABLE.th}>Status</th></tr></thead>
              <tbody>
                {data.items.map((row) => {
                  const expanded = open === row.id;
                  return (
                    <Fragment key={row.id}>
                      <tr className={`${TABLE.row} cursor-pointer`} onClick={() => setOpen(expanded ? null : row.id)}>
                        <td className={TABLE.td}>
                          <button type="button" aria-expanded={expanded} onClick={(event) => { event.stopPropagation(); setOpen(expanded ? null : row.id); }} className={`break-words text-left font-medium hover:text-[#7d1f2a] hover:underline ${FOCUS}`}>{row.title}</button>
                          <p className="mt-0.5 text-[13px] text-[#6b635d]">{statusLabel(row.category)} · {statusLabel(row.priority)} priority{row.university ? ` · ${row.university}` : ""}</p>
                        </td>
                        <td className={`${TABLE.td} ${TABLE.hideSm} text-[#4e4742]`}>{row.subject?.name ?? "—"}</td>
                        <td className={`${TABLE.td} ${TABLE.hide} text-[#4e4742]`}>{row.assignedTo ?? "Nobody"}</td>
                        <td className={`${TABLE.td} ${TABLE.hide} whitespace-nowrap text-[13px] text-[#6b635d]`}>{when(row.createdAt)}</td>
                        <td className={TABLE.td}><Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge></td>
                      </tr>
                      {expanded ? <tr className="bg-[#faf9f7]"><td colSpan={5} className="border-b border-[#eee9e3] px-4 py-4"><CaseDetail key={`${row.id}-${row.status}-${row.notes.length}-${row.assignedTo}`} row={row} onChanged={reload} /></td></tr> : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {data && data.pageCount > 1 ? (
        <div className="flex items-center justify-between gap-3 text-[13px] text-[#6b635d]"><span>{data.total} total, page {data.page} of {data.pageCount}</span>
          <div className="flex gap-2"><GhostButton onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={loading || page <= 1}>Previous</GhostButton><GhostButton onClick={() => setPage((value) => Math.min(data.pageCount, value + 1))} disabled={loading || page >= data.pageCount}>Next</GhostButton></div>
        </div>
      ) : null}
    </div>
  );
}
