"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import GroupCard from "@/components/student/group-card";
import GroupSheetDialog from "@/components/student/group-sheet-dialog";
import SessionDetailDialog from "@/components/student/session-detail-dialog";
import SessionCard from "@/components/student/session-card";
import { Glyph, dayLabel, dateKey, isClosed, resolutionOf, tabOf, useNow } from "@/components/student/session-ui";
import { availableActions, type ResolutionStatus, type TimeStatus } from "@/lib/session-lifecycle-rules";
import { snapshotOf } from "@/lib/session-lifecycle-serialize";
import type { SessionLifecycleApiResponse, SessionLifecycleItem } from "@/lib/session-lifecycle-types";

type Entry =
  | { kind: "group"; key: string; groupId: string; sessions: SessionLifecycleItem[]; start: number }
  | { kind: "session"; key: string; session: SessionLifecycleItem; start: number };
type Filter = "ALL" | Exclude<ResolutionStatus, "NONE" | "NO_SHOW">;

const TABS: { id: TimeStatus; label: string }[] = [
  { id: "UPCOMING", label: "Upcoming" },
  { id: "IN_PROGRESS", label: "In progress" },
  { id: "PAST", label: "Past" },
];
const FILTERS: { id: Filter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "AWAITING_CONFIRMATION", label: "Awaiting confirmation" },
  { id: "NEEDS_REVIEW", label: "Needs review" },
  { id: "NO_RESPONSE", label: "No response" },
  { id: "COMPLETED", label: "Completed" },
  { id: "CANCELLED", label: "Cancelled" },
];

function startOf(session: SessionLifecycleItem) {
  const value = new Date(session.scheduledStart).getTime();
  return Number.isFinite(value) ? value : 0;
}

function buildEntries(sessions: SessionLifecycleItem[]): Entry[] {
  const groups = new Map<string, SessionLifecycleItem[]>();
  const entries: Entry[] = [];
  for (const session of sessions) {
    if (session.viewerRole === "ACADEMIC_MATE" && session.groupId && !isClosed(session) && session.arrangementStatus !== "EXPIRED") {
      groups.set(session.groupId, [...(groups.get(session.groupId) ?? []), session]);
    } else {
      entries.push({ kind: "session", key: session.id, session, start: startOf(session) });
    }
  }
  for (const [groupId, members] of groups) {
    entries.push({ kind: "group", key: `group:${groupId}`, groupId, sessions: members, start: startOf(members[0]) });
  }
  return entries;
}
const membersOf = (entry: Entry) => entry.kind === "group" ? entry.sessions : [entry.session];

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a8e86]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.2 4.2" /></svg>;
}

function SessionsView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const now = useNow();
  // Which pop-up is open lives in the URL, so notification links and the back button work.
  const openSessionId = searchParams.get("session");
  const openGroupId = searchParams.get("group");
  const openPopup = useCallback((key: "session" | "group", id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("session"); params.delete("group"); params.set(key, id);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname, searchParams]);
  const closePopup = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("session"); params.delete("group");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [router, pathname, searchParams]);
  const [sessions, setSessions] = useState<SessionLifecycleItem[]>([]);
  const [tab, setTab] = useState<TimeStatus>("UPCOMING");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [filterOpen, setFilterOpen] = useState(false);
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [openLimitReached, setOpenLimitReached] = useState(false);
  const pickedTab = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/student/sessions", { cache: "no-store", signal });
      const body = await response.json() as SessionLifecycleApiResponse;
      if (!response.ok || !body.sessions) throw new Error(body.error || "We couldn't load your sessions.");
      setSessions((current) => {
        const merged = new Map<string, SessionLifecycleItem>();
        // Keep any extra history pages already loaded; replace everything the server just sent.
        for (const item of current) if (isClosed(item)) merged.set(item.id, item);
        for (const item of body.sessions ?? []) merged.set(item.id, item);
        return [...merged.values()];
      });
      setHistoryCursor((current) => current ?? body.nextHistoryCursor ?? null);
      setHasMoreHistory((current) => current || !!body.hasMoreHistory);
      setOpenLimitReached(!!body.openLimitReached);
      setError("");
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : "We couldn't load your sessions.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);

  async function loadMoreHistory() {
    if (!historyCursor || loadingHistory) return;
    setLoadingHistory(true);
    try {
      const response = await fetch(`/api/student/sessions?historyCursor=${encodeURIComponent(historyCursor)}`, { cache: "no-store" });
      const body = await response.json() as SessionLifecycleApiResponse;
      if (!response.ok || !body.sessions) throw new Error(body.error || "We couldn't load older sessions.");
      setSessions((current) => {
        const merged = new Map(current.map((item) => [item.id, item]));
        for (const item of body.sessions ?? []) if (isClosed(item)) merged.set(item.id, item);
        return [...merged.values()];
      });
      setHistoryCursor(body.nextHistoryCursor ?? null);
      setHasMoreHistory(!!body.hasMoreHistory);
    } catch (err) { setError(err instanceof Error ? err.message : "We couldn't load older sessions."); }
    finally { setLoadingHistory(false); }
  }

  const search = query.trim().toLowerCase();
  const entries = useMemo(() => buildEntries(sessions).filter((entry) => {
    if (!search) return true;
    return membersOf(entry).some((s) => [s.course.code, s.course.name, s.otherParticipantName, s.studentName, s.academicMateName, s.meetingLocation].some((value) => value.toLowerCase().includes(search)));
  }), [sessions, search]);

  const tabOfEntry = useCallback((entry: Entry) => tabOf(membersOf(entry)[0], now), [now]);
  const matchesFilter = useCallback((entry: Entry) => {
    if (filter === "ALL") return true;
    return membersOf(entry).some((s) => resolutionOf(s, now) === filter);
  }, [filter, now]);

  const counts = useMemo(() => {
    const result: Record<TimeStatus, number> = { UPCOMING: 0, IN_PROGRESS: 0, PAST: 0 };
    for (const entry of entries) result[tabOfEntry(entry)]++;
    return result;
  }, [entries, tabOfEntry]);

  // People who must answer something right now.
  const needAnswer = useMemo(() => entries.filter((entry) => membersOf(entry).some((s) => {
    const actions = availableActions(snapshotOf(s), s.viewerRole, now);
    return actions.attendance || actions.completion;
  })), [entries, now]);

  // Open on the tab that matters: what is happening now, else what is coming up.
  useEffect(() => {
    if (loading || pickedTab.current) return;
    pickedTab.current = true;
    const live = entries.some((entry) => tabOfEntry(entry) === "IN_PROGRESS");
    const upcoming = entries.some((entry) => tabOfEntry(entry) === "UPCOMING");
    if (needAnswer.length > 0) setTab(tabOfEntry(needAnswer[0]));
    else if (live) setTab("IN_PROGRESS");
    else if (!upcoming) setTab("PAST");
  }, [loading, entries, needAnswer, tabOfEntry]);

  const visible = useMemo(() => entries
    .filter((entry) => tabOfEntry(entry) === tab && matchesFilter(entry))
    .sort((a, b) => tab === "PAST" ? b.start - a.start : a.start - b.start), [entries, tab, matchesFilter, tabOfEntry]);

  const days = useMemo(() => {
    const result: { key: string; label: string; entries: Entry[] }[] = [];
    for (const entry of visible) {
      const iso = new Date(entry.start).toISOString();
      const key = dateKey(iso);
      const last = result[result.length - 1];
      if (last && last.key === key) last.entries.push(entry);
      else result.push({ key, label: dayLabel(iso, now), entries: [entry] });
    }
    return result;
  }, [visible, now]);

  function showAnswers() {
    setFilter("AWAITING_CONFIRMATION");
    if (needAnswer[0]) setTab(tabOfEntry(needAnswer[0]));
  }

  const empty = {
    UPCOMING: ["No upcoming sessions", "When you book a session or an Academic Mate accepts your request, it shows up here."],
    IN_PROGRESS: ["Nothing in progress", "Sessions that are happening right now appear here."],
    PAST: ["No past sessions yet", "Completed, cancelled and finished sessions are kept here."],
  }[tab];

  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-[#f9f8f6] px-4 pb-10 pt-5 text-[#282321] sm:px-6 lg:px-8 lg:pt-8">
      <div className="mx-auto max-w-3xl">
        <header>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Sessions</h1>
          <p className="mt-1 text-sm text-[#756b65]">Your tutoring sessions, and anything waiting on your answer.</p>
        </header>

        <div className="relative mt-4">
          <label htmlFor="session-search" className="sr-only">Search by course, person or place</label>
          <SearchIcon />
          <input id="session-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sessions" className="h-11 w-full rounded-xl border border-[#e2d8d0] bg-white pl-10 pr-10 text-sm outline-none placeholder:text-[#a3978f] focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#81766f] hover:bg-[#f4f0ec]"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12" /></svg></button>}
        </div>

        {needAnswer.length > 0 && filter !== "AWAITING_CONFIRMATION" && (
          <button type="button" onClick={showAnswers} role="status" aria-label={`${needAnswer.length} ${needAnswer.length === 1 ? "session needs" : "sessions need"} your answer. Show`} className="mt-3 inline-flex min-h-8 items-center gap-1.5 rounded-full bg-[#f8efec] px-3 text-[11px] font-medium text-[#6b3b36] transition hover:bg-[#f3e4df] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#7d1f2a]" />
            {needAnswer.length} awaiting your answer
            <Glyph name="chevronRight" className="h-3.5 w-3.5 text-[#9a6a64]" />
          </button>
        )}

        <div role="tablist" aria-label="Session time" className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-[#efeae5] p-1">
          {TABS.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 ${tab === item.id ? "bg-white text-[#7d1f2a] shadow-sm" : "text-[#6f655f] hover:text-[#282321]"}`}>
              {item.label}
              <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${tab === item.id ? "bg-[#f4e5e2] text-[#7d1f2a]" : "bg-[#e3dcd6] text-[#6f655f]"}`}>{counts[item.id]}{item.id === "PAST" && hasMoreHistory ? "+" : ""}</span>
            </button>
          ))}
        </div>

        <div className="mt-3">
          <button type="button" onClick={() => setFilterOpen((open) => !open)} aria-expanded={filterOpen} aria-controls="session-filter-panel" aria-label={`Filter sessions by status. Showing: ${FILTERS.find((item) => item.id === filter)?.label ?? "All"}`} className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 ${filter !== "ALL" ? "border-[#7d1f2a] bg-[#fdf6f3] text-[#7d1f2a]" : "border-[#e2d8d0] bg-white text-[#625954] hover:bg-[#faf7f5]"}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z" /></svg>
            {filter === "ALL" ? "Filter" : FILTERS.find((item) => item.id === filter)?.label}
            <svg viewBox="0 0 24 24" aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${filterOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {filter !== "ALL" && <button type="button" onClick={() => setFilter("ALL")} aria-label="Clear filter" title="Clear filter" className="ml-1 inline-flex h-10 w-10 items-center justify-center rounded-full text-[#81766f] hover:bg-[#f4f0ec]"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12" /></svg></button>}
          {filterOpen && (
            <div id="session-filter-panel" role="group" aria-label="Filter by status" className="mt-2 flex flex-wrap gap-2 rounded-xl border border-[#e8e0d9] bg-white p-3">
              {FILTERS.map((item) => (
                <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => { setFilter(item.id); setFilterOpen(false); }} className={`min-h-9 rounded-full border px-3.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7d1f2a]/40 ${filter === item.id ? "border-[#7d1f2a] bg-[#7d1f2a] text-white" : "border-[#e2d8d0] bg-white text-[#625954] hover:bg-[#faf7f5]"}`}>{item.label}</button>
              ))}
            </div>
          )}
        </div>

        {error && <div role="alert" className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><span>{error}</span><button type="button" onClick={() => void load()} className="shrink-0 font-semibold underline">Try again</button></div>}

        <div className="mt-5">
          {loading ? (
            <div className="space-y-3" role="status" aria-busy="true"><span className="sr-only">Loading your sessions…</span>{[1, 2, 3].map((key) => <div key={key} className="h-36 animate-pulse rounded-2xl border border-[#e8e0d9] bg-white motion-reduce:animate-none" />)}</div>
          ) : visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#d9cec5] bg-white px-5 py-10 text-center">
              <h2 className="text-sm font-semibold">{search || filter !== "ALL" ? "No sessions match" : empty[0]}</h2>
              <p className="mx-auto mt-1.5 max-w-sm text-xs leading-5 text-[#81766f]">{search || filter !== "ALL" ? "Try a different search, or clear the filter to see everything in this tab." : empty[1]}</p>
              {(search || filter !== "ALL") && <button type="button" onClick={() => { setQuery(""); setFilter("ALL"); }} className="mt-4 min-h-10 rounded-lg border border-[#ded4cd] bg-white px-4 text-xs font-semibold text-[#584c45] hover:bg-[#faf7f5]">Clear search and filter</button>}
              {!search && filter === "ALL" && tab === "UPCOMING" && <Link href="/student/find-academic-mate" className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-[#7d1f2a] px-4 text-xs font-semibold text-white hover:bg-[#681923]">Find an Academic Mate</Link>}
            </div>
          ) : (
            <div className="space-y-6">
              {days.map((day) => (
                <section key={day.key} aria-label={day.label}>
                  <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.1em] text-[#8a7d74]">{day.label}</h2>
                  <div className="space-y-3">
                    {day.entries.map((entry) => entry.kind === "group"
                      ? <GroupCard key={entry.key} groupId={entry.groupId} sessions={entry.sessions} now={now} onOpen={(id) => openPopup("group", id)} />
                      : <SessionCard key={entry.key} session={entry.session} now={now} onOpen={(id) => openPopup("session", id)} onChanged={() => load()} />)}
                  </div>
                </section>
              ))}
            </div>
          )}

          {tab === "PAST" && hasMoreHistory && <button type="button" onClick={() => void loadMoreHistory()} disabled={loadingHistory} className="mt-5 min-h-11 w-full rounded-xl border border-[#e2d8d0] bg-white px-4 text-sm font-semibold text-[#625954] hover:bg-[#faf7f5] disabled:opacity-50">{loadingHistory ? "Loading…" : "Show older sessions"}</button>}
          {openLimitReached && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">You have a lot of active sessions, so only the next 250 are shown. Use search to find a specific one.</p>}
        </div>
      </div>
      {openGroupId ? <GroupSheetDialog key={openGroupId} groupId={openGroupId} onClose={closePopup} onChanged={() => load()} />
        : openSessionId ? <SessionDetailDialog key={openSessionId} sessionId={openSessionId} onClose={closePopup} onChanged={() => load()} /> : null}
    </main>
  );
}

export default function SessionsPage() {
  return <Suspense fallback={<main className="min-h-[calc(100dvh-3.5rem)] bg-[#f9f8f6] px-4 py-8"><div className="mx-auto max-w-3xl"><div className="h-8 w-40 animate-pulse rounded bg-[#e8e0d9]" /></div></main>}><SessionsView /></Suspense>;
}