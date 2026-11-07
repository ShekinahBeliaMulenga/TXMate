"use client";

import { useCallback, useEffect, useState } from "react";
import { REASON_MAX, REASON_MIN, type ReviewPage, type ReviewRow } from "@/lib/admin/moderation-types";
import { getJson, sendJson, type ApiResult } from "./api-client";
import { DateRangeFields, GhostButton, PrimaryButton, SearchField, SelectField, Toolbar } from "./admin-controls";
import { Badge, EmptyState, FOCUS, Panel } from "./admin-ui";

const STATES = [
  { id: "all", label: "All reviews" },
  { id: "visible", label: "Shown" },
  { id: "hidden", label: "Hidden" },
];
const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lusaka" });

function ReviewItem({ row, onChanged }: { row: ReviewRow; onChanged: () => void }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const valid = reason.trim().length >= REASON_MIN;

  async function submit() {
    setBusy(true);
    const outcome = await sendJson(`/api/admin/reviews/${encodeURIComponent(row.id)}`, "PATCH", { hidden: !row.hidden, reason });
    setBusy(false);
    setResult(outcome);
    if (outcome.ok) { setAsking(false); setReason(""); onChanged(); }
  }

  return (
    <li className="px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#1f1a17]">{row.rating} out of 5 <span className="font-normal text-[#6b635d]">· {row.reviewer} about {row.mate}</span></p>
          <p className="mt-0.5 text-[13px] text-[#6b635d]">{row.course} · {row.university} · {when(row.createdAt)}</p>
        </div>
        <Badge tone={row.hidden ? "danger" : "success"}>{row.hidden ? "Hidden from students" : "Shown to students"}</Badge>
      </div>
      <p className="mt-2 max-w-3xl whitespace-pre-wrap break-words text-sm leading-6 text-[#1f1a17]">{row.comment ?? <span className="text-[#7a716a]">No written comment.</span>}</p>
      {row.hidden && row.hiddenReason ? <p className="mt-1 break-words text-[13px] text-[#6b635d]">Hidden because: {row.hiddenReason}</p> : null}
      {asking ? (
        <div role="note" className="mt-3 max-w-3xl rounded-md border border-[#ecd9a5] bg-[#fdf8e8] p-3 text-[13px] text-[#6a4b00]">
          <p className="font-semibold">{row.hidden ? "Show this review to students again?" : "Hide this review?"}</p>
          <p className="mt-1 leading-5">{row.hidden ? "It will appear on the Academic Mate’s profile and count in their rating again." : "It stays on record, but students will no longer see it and it stops counting in the Academic Mate’s rating."} Your name and reason are saved in the audit log.</p>
          <label className="mt-2 block"><span className="font-medium">Reason</span>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={REASON_MAX} rows={2} className={`mt-1 w-full rounded-md border border-[#d9d3cc] bg-white p-2 text-sm text-[#1f1a17] ${FOCUS}`} />
          </label>
          <div className="mt-2 flex gap-2"><PrimaryButton disabled={!valid || busy} onClick={() => void submit()}>{busy ? "Saving…" : row.hidden ? "Show review" : "Hide review"}</PrimaryButton><GhostButton disabled={busy} onClick={() => setAsking(false)}>Cancel</GhostButton></div>
        </div>
      ) : (
        <div className="mt-2"><GhostButton onClick={() => { setAsking(true); setResult(null); }}>{row.hidden ? "Show again" : "Hide…"}</GhostButton></div>
      )}
      {result ? <p role={result.ok ? "status" : "alert"} className={`mt-2 text-[13px] ${result.ok ? "text-[#28633b]" : "text-[#a3262a]"}`}>{result.message}</p> : null}
    </li>
  );
}

export default function ReviewsModeration() {
  const [state, setState] = useState("all");
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ReviewPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
    getJson<ReviewPage>(`/api/admin/reviews?${new URLSearchParams({ state, q, from, to, page: String(page) }).toString()}`, controller.signal)
      .then((body) => setData(body))
      .catch((err) => { if (!(err instanceof DOMException && err.name === "AbortError")) { setData(null); setError(err instanceof Error ? err.message : "Unable to load reviews."); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [state, q, from, to, page, tick]);

  return (
    <div className="space-y-4">
      <Toolbar>
        <SearchField value={input} onChange={setInput} placeholder="Search comment, reviewer or mate" label="Search reviews" />
        <SelectField label="Show" value={state} onChange={(value) => { setState(value); setPage(1); }} options={STATES} />
        <DateRangeFields from={from} to={to} onFrom={(v) => { setFrom(v); setPage(1); }} onTo={(v) => { setTo(v); setPage(1); }} fromLabel="Written from" toLabel="Written to" />
      </Toolbar>
      <Panel>
        {loading && !data ? <div aria-busy="true">{[0, 1, 2].map((n) => <div key={n} className="h-20 animate-pulse border-b border-[#eee9e3] bg-[#faf9f7]" />)}</div>
        : error ? <div role="alert" className="p-6 text-center text-sm text-[#a3262a]">{error}</div>
        : !data || data.items.length === 0 ? <EmptyState icon="star" title="No reviews found" hint="Reviews appear here after students rate completed sessions." />
        : <ul className="divide-y divide-[#eee9e3]">{data.items.map((row) => <ReviewItem key={`${row.id}-${row.hidden}`} row={row} onChanged={reload} />)}</ul>}
      </Panel>
      {data && data.pageCount > 1 ? (
        <div className="flex items-center justify-between gap-3 text-[13px] text-[#6b635d]"><span>{data.total} total, page {data.page} of {data.pageCount}</span>
          <div className="flex gap-2"><GhostButton onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={loading || page <= 1}>Previous</GhostButton><GhostButton onClick={() => setPage((value) => Math.min(data.pageCount, value + 1))} disabled={loading || page >= data.pageCount}>Next</GhostButton></div>
        </div>
      ) : null}
    </div>
  );
}
