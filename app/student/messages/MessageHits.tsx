"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export type MessageHit = {
  messageId: string;
  conversationId: string;
  fromMe: boolean;
  body: string;
  createdAt: string;
};

/** The subset of ConversationItem the hit list needs (structurally compatible). */
export type HitConversation = {
  id: string;
  otherUserName: string;
  otherUserImage: string | null;
  courseName: string;
  conversationUrl: string | null;
};

const MIN_LEN = 3;
const DEBOUNCE_MS = 300;

/**
 * Debounced server search. Returns:
 *  - hits: null when no search is active (show the normal list)
 *  - searching: true while a request is in flight
 *  - failed: true if the last request errored
 */
export function useMessageSearch(query: string) {
  const [hits, setHits] = useState<MessageHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_LEN) {
      setHits(null); // eslint-disable-line react-hooks/set-state-in-effect
      setSearching(false);
      setFailed(false);
      return;
    }

    const controller = new AbortController();
    setSearching(true);

    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/student/messages/search?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Search failed.");
        setHits(data.results ?? []);
        setFailed(false);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setHits([]);
        setFailed(true);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return { hits, searching, failed };
}

/* ---------- snippet + highlight ---------- */

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Trim a long body to a window around the first match. */
function snippetAround(body: string, query: string, radius = 60) {
  const text = body.replace(/\s+/g, " ").trim();
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1 || text.length <= radius * 2 + query.length) return text;
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  return `${start > 0 ? "\u2026" : ""}${text.slice(start, end)}${end < text.length ? "\u2026" : ""}`;
}

function Highlighted({ text, query }: { text: string; query: string }) {
  // Splitting on a capturing group puts the matches at the odd indexes.
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded bg-amber-100 px-0.5 font-semibold text-[#282321]">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/* ---------- presentation ---------- */

const hitDateFmt = new Intl.DateTimeFormat("en-ZM", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Lusaka",
});

function hitHref(url: string, messageId: string) {
  return `${url}${url.includes("?") ? "&" : "?"}m=${encodeURIComponent(messageId)}`;
}

export function MessageHits({
  hits,
  query,
  conversations,
  searching,
  failed,
  showEmpty = true,
}: {
  hits: MessageHit[];
  query: string;
  conversations: HitConversation[];
  searching: boolean;
  failed: boolean;
  /** Show the "no results" message when there are no hits. Turn off when other results are already on screen. */
  showEmpty?: boolean;
}) {
  const q = query.trim();
  const byId = new Map(conversations.map((c) => [c.id, c]));

  // Drop hits whose conversation isn't in the loaded list (e.g. it was just removed).
  const rows = hits.flatMap((hit) => {
    const convo = byId.get(hit.conversationId);
    return convo ? [{ hit, convo }] : [];
  });

  if (failed) {
    return (
      <div role="alert" className="px-6 py-12 text-center">
        <p className="text-sm font-semibold text-red-700">Search is unavailable right now. Try again in a moment.</p>
      </div>
    );
  }

  if (rows.length === 0) {
    if (!showEmpty) return null;
    return (
      <div className="px-6 py-12 text-center" aria-live="polite">
        <p className="text-sm font-semibold text-[#282321]">
          {searching ? "Searching..." : `No results for \u201C${q}\u201D`}
        </p>
      </div>
    );
  }

  return (
    <div aria-busy={searching} className={searching ? "opacity-60 transition-opacity" : "transition-opacity"}>
      <p className="border-b border-[#f0eae5] px-5 py-2.5 text-xs font-semibold text-[#756a63]" aria-live="polite">
        {rows.length} {rows.length === 1 ? "message" : "messages"} found
      </p>
      <ul className="divide-y divide-[#f0eae5]">
        {rows.map(({ hit, convo }) => {
          const inner = (
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="truncate text-[15px] font-semibold text-[#282321]">{convo.otherUserName}</h2>
                <time dateTime={hit.createdAt} className="shrink-0 text-xs tabular-nums text-[#94877e]">
                  {hitDateFmt.format(new Date(hit.createdAt))}
                </time>
              </div>
              <p className="mt-0.5 line-clamp-2 text-sm leading-6 text-[#6d6260]">
                {hit.fromMe && <span className="text-[#94877e]">You: </span>}
                <Highlighted text={snippetAround(hit.body, q)} query={q} />
              </p>
              <span className="mt-2 inline-block rounded-md bg-[#f4eceb] px-2 py-0.5 text-[11px] font-semibold text-[#7d1f2a]">
                {convo.courseName}
              </span>
            </div>
          );

          return (
            <li key={hit.messageId}>
              {convo.conversationUrl ? (
                <Link
                  href={hitHref(convo.conversationUrl, hit.messageId)}
                  className="flex items-start gap-4 px-4 py-4 transition-colors hover:bg-[#fbf8f6] active:bg-[#f6f0ec] focus-visible:bg-[#fbf8f6] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#7d1f2a] sm:px-5"
                >
                  {inner}
                </Link>
              ) : (
                <div className="flex items-start gap-4 px-4 py-4 opacity-70 sm:px-5">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}