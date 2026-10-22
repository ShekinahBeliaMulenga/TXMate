"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { useParams, useRouter } from "next/navigation";
import { io } from "socket.io-client";

/* ---------- types ---------- */
type ParticipantRole = "STUDENT" | "ACADEMIC_MATE";
type RescheduleProposal = { id: string; proposedByUserId: string; respondingUserId: string; proposedByName: string | null; proposedStart: string; proposedEnd: string; reason: string | null; status: string; createdAt: string };
type RescheduleSlot = { start: string; end: string; timezone: string; localDate: string; localStart: string | null; localEnd: string | null };
type RescheduleSlotsResponse = { slots?: RescheduleSlot[]; error?: string };
type ConversationDetails = {
  id: string;
  studentMessagingEnabled: boolean;
  arrangementType: "ONE_TIME" | "RECURRING";
  arrangementStatus: "PENDING" | "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
  otherUserName?: string;
  otherUserImage?: string | null;
  courseName?: string | null;
  session: { id: string; scheduledStart: string; scheduledEnd: string; status?: string; rescheduleProposals?: RescheduleProposal[] } | null;
};
type ChatMessage = { id: string; conversationId: string; senderUserId: string; body: string; createdAt: string; readAt?: string | null };
type ConversationResponse = { conversation?: ConversationDetails; participantRole?: ParticipantRole; error?: string };
type MessagesResponse = { currentUserId?: string; messages?: ChatMessage[]; error?: string };
type ReadReceiptEvent = { conversationId: string; readerUserId: string; messageIds: string[]; readAt: string };
type ListItem = { kind: "day"; key: string; label: string } | { kind: "message"; message: ChatMessage; own: boolean; startsGroup: boolean; endsGroup: boolean };
type SlotGroup = { key: string; slots: RescheduleSlot[] };
type ZoneKind = "weekday" | "dayNum" | "month" | "time" | "full";
/** A user-facing failure. `retry` re-runs the action that failed; `auth` adds a "Log in" link. */
type Problem = { message: string; auth: boolean; retry?: () => void };

/* ---------- constants & formatters ---------- */
const TIME_ZONE = "Africa/Lusaka";
const LOCALE = "en-ZM";
const MAX_LENGTH = 4000;
const DAY_MS = 86_400_000;
/** Matches Tailwind's `sm` breakpoint (640px). Below this we use the full-screen "app" layout. */
const DESKTOP_QUERY = "(min-width: 640px)";
const SESSION_EXPIRED = "Your session has expired. Log in again to continue.";
const NETWORK_ERROR = "Network problem. Check your connection and try again.";

const fmt = (options: Intl.DateTimeFormatOptions, locale = LOCALE) => new Intl.DateTimeFormat(locale, { ...options, timeZone: TIME_ZONE });
const sessionDateFormatter = fmt({ weekday: "long", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const clockFormatter = fmt({ hour: "2-digit", minute: "2-digit" });
const dayKeyFormatter = fmt({ year: "numeric", month: "2-digit", day: "2-digit" }, "en-CA");
const dayLabelFormatter = fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" });

const ZONE_OPTIONS: Record<ZoneKind, Intl.DateTimeFormatOptions> = {
  weekday: { weekday: "short" },
  dayNum: { day: "numeric" },
  month: { month: "short" },
  time: { hour: "2-digit", minute: "2-digit" },
  full: { weekday: "short", day: "numeric", month: "short" },
};
const zoneFormatterCache = new Map<string, Intl.DateTimeFormat>();

/** Formats a timestamp in any time zone. Unknown zones fall back to Lusaka instead of throwing. */
function zoneFormat(value: string, timeZone: string, kind: ZoneKind) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const zone = timeZone || TIME_ZONE;
  const key = `${kind}|${zone}`;
  let formatter = zoneFormatterCache.get(key);
  if (!formatter) {
    try { formatter = new Intl.DateTimeFormat(LOCALE, { ...ZONE_OPTIONS[kind], timeZone: zone }); }
    catch { formatter = new Intl.DateTimeFormat(LOCALE, { ...ZONE_OPTIONS[kind], timeZone: TIME_ZONE }); }
    zoneFormatterCache.set(key, formatter);
  }
  return formatter.format(date);
}

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };
const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

/** Wall-clock parts of `date` in `timeZone` (throws RangeError for an unknown zone). */
function zonedParts(date: Date, timeZone: string): ZonedParts {
  let formatter = partsFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    partsFormatterCache.set(timeZone, formatter);
  }
  const parts: Record<string, number> = {};
  for (const { type, value } of formatter.formatToParts(date)) parts[type] = Number(value);
  return parts as ZonedParts;
}

function toDateTimeLocalValue(value: Date, timeZone = TIME_ZONE): string {
  const p = zonedParts(value, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Converts a datetime-local wall-clock value in the selected time zone to UTC safely (null if invalid or nonexistent). */
function parseDateTimeLocal(value: string, timeZone = TIME_ZONE): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wallClockUtc;
  try {
    for (let i = 0; i < 6; i++) {
      const p = zonedParts(new Date(guess), timeZone);
      const corrected = guess + wallClockUtc - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
      if (corrected === guess) break;
      guess = corrected;
    }
    const p = zonedParts(new Date(guess), timeZone);
    return p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute && p.second === 0 ? new Date(guess) : null;
  } catch {
    return null;
  }
}

function formatSessionDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : sessionDateFormatter.format(date);
}
function formatClock(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : clockFormatter.format(date);
}
const dayKey = (date: Date) => dayKeyFormatter.format(date);
const byTime = (a: ChatMessage, b: ChatMessage) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id);

/* ---------- requests & errors ---------- */
class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
const isAbort = (cause: unknown) => cause instanceof Error && cause.name === "AbortError";
const isAuthError = (cause: unknown) => cause instanceof ApiError && cause.status === 401;
const errorMessage = (cause: unknown, fallback: string) => (cause instanceof TypeError ? NETWORK_ERROR : cause instanceof Error && cause.message ? cause.message : fallback);
const toProblem = (cause: unknown, fallback: string, retry?: () => void): Problem => ({ message: errorMessage(cause, fallback), auth: isAuthError(cause), retry });

/** JSON request helper: parses safely (a non-JSON error page never crashes) and throws an ApiError carrying the status. */
async function requestJson<T extends { error?: string }>(url: string, fallback: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) } });
  const body = ((await response.json().catch((cause) => { if (isAbort(cause)) throw cause; return {}; })) ?? {}) as T;
  if (!response.ok) throw new ApiError(response.status === 401 ? SESSION_EXPIRED : body.error || fallback, response.status);
  return body;
}

function buildListItems(messages: ChatMessage[], currentUserId: string, todayKey: string, yesterdayKey: string): ListItem[] {
  const items: ListItem[] = [];
  let previousDay = "";
  messages.forEach((message, index) => {
    const created = new Date(message.createdAt);
    const validDate = !Number.isNaN(created.getTime());
    const currentDay = validDate ? dayKey(created) : previousDay;
    if (validDate && currentDay !== previousDay) {
      items.push({ kind: "day", key: `day-${currentDay}`, label: currentDay === todayKey ? "Today" : currentDay === yesterdayKey ? "Yesterday" : dayLabelFormatter.format(created) });
    }
    const previous = messages[index - 1];
    const next = messages[index + 1];
    const nextDate = next ? new Date(next.createdAt) : null;
    const nextDay = !nextDate ? "" : Number.isNaN(nextDate.getTime()) ? currentDay : dayKey(nextDate);
    const startsGroup = !previous || previous.senderUserId !== message.senderUserId || currentDay !== previousDay;
    const endsGroup = !next || next.senderUserId !== message.senderUserId || nextDay !== currentDay;
    items.push({ kind: "message", message, own: message.senderUserId === currentUserId, startsGroup, endsGroup });
    previousDay = currentDay;
  });
  return items;
}

/* ---------- reschedule slot helpers ---------- */
const slotDayKey = (slot: RescheduleSlot) => slot.localDate || slot.start.slice(0, 10);

function groupSlots(slots: RescheduleSlot[]): SlotGroup[] {
  const map = new Map<string, RescheduleSlot[]>();
  for (const slot of [...slots].sort((a, b) => (Date.parse(a.start) || 0) - (Date.parse(b.start) || 0))) {
    const key = slotDayKey(slot);
    const list = map.get(key);
    if (list) list.push(slot);
    else map.set(key, [slot]);
  }
  return Array.from(map, ([key, list]) => ({ key, slots: list }));
}

function slotTimeLabel(slot: RescheduleSlot) {
  const zone = slot.timezone || TIME_ZONE;
  const start = slot.localStart || zoneFormat(slot.start, zone, "time");
  const end = slot.localEnd || zoneFormat(slot.end, zone, "time");
  return end ? `${start} – ${end}` : start;
}

/**
 * Layout strategy (how WhatsApp / iMessage / Slack web handle this):
 * MOBILE  – the conversation is a full-screen `position: fixed` view above the site navbar. Its height follows
 *           `window.visualViewport`, which shrinks when the keyboard opens, so the composer stays glued to it.
 * DESKTOP – a normal in-flow card under the navbar, sized to fill the rest of the viewport (no double scrollbar).
 */
type ChatViewport = { height: number; offsetTop: number; chatTop: number };

function useChatViewport(rootRef: RefObject<HTMLElement | null>) {
  const [viewport, setViewport] = useState<ChatViewport | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    const desktopMql = window.matchMedia(DESKTOP_QUERY);
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const isDesktop = desktopMql.matches;
        const root = rootRef.current;
        // On desktop: distance from the top of the document to where the chat begins (i.e. navbar height).
        const chatTop = isDesktop && root ? Math.max(0, root.getBoundingClientRect().top + window.scrollY) : 0;
        const next: ChatViewport = { height: Math.round(vv?.height ?? window.innerHeight), offsetTop: Math.round(vv?.offsetTop ?? 0), chatTop: Math.round(chatTop) };
        // Skip the re-render when nothing changed (visualViewport fires many identical events).
        setViewport((prev) => (prev && prev.height === next.height && prev.offsetTop === next.offsetTop && prev.chatTop === next.chatTop ? prev : next));
        // iOS Safari scrolls the layout viewport when the keyboard opens; undo that on mobile.
        if (!isDesktop && window.scrollY !== 0) window.scrollTo(0, 0);
      });
    };
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    // Lock background page scroll on mobile so the chat feels like a native screen.
    const html = document.documentElement;
    const body = document.body;
    const prev = { html: html.style.overflow, body: body.style.overflow, overscroll: body.style.overscrollBehavior };
    const applyLock = () => {
      const lock = !desktopMql.matches;
      html.style.overflow = lock ? "hidden" : prev.html;
      body.style.overflow = lock ? "hidden" : prev.body;
      body.style.overscrollBehavior = lock ? "none" : prev.overscroll;
    };
    applyLock();
    desktopMql.addEventListener("change", applyLock);
    desktopMql.addEventListener("change", update);
    return () => {
      cancelAnimationFrame(frame);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      desktopMql.removeEventListener("change", applyLock);
      desktopMql.removeEventListener("change", update);
      html.style.overflow = prev.html;
      body.style.overflow = prev.body;
      body.style.overscrollBehavior = prev.overscroll;
    };
  }, [rootRef]);
  return viewport;
}

/* ---------- icons ---------- */
const ic = { "aria-hidden": true, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const BackIcon = () => <svg {...ic} className="h-5 w-5"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>;
const PaperJetIcon = () => <svg {...ic} className="-mr-0.5 h-5 w-5"><path d="M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.843 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904l-18-8.5Z" /><path d="M6 12h15" /></svg>;
const RefreshIcon = () => <svg {...ic} className="h-4 w-4"><path d="M20 11a8 8 0 0 0-14.5-4.5M4 5v4h4M4 13a8 8 0 0 0 14.5 4.5M20 19v-4h-4" /></svg>;
const CalendarIcon = () => <svg {...ic} className="h-3.5 w-3.5 shrink-0"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>;
const LockIcon = () => <svg {...ic} className="h-3.5 w-3.5 shrink-0"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
const ChevronDownIcon = () => <svg {...ic} className="h-3.5 w-3.5"><path d="m6 9 6 6 6-6" /></svg>;
const ChatIcon = () => <svg {...ic} strokeWidth={1.7} className="h-6 w-6"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /></svg>;
const Ticks = ({ seen }: { seen: boolean }) =>
  seen ? (
    <svg aria-hidden="true" viewBox="0 0 16 12" fill="none" className="h-3 w-4"><path d="M1 6.5 4.2 9.5 10 2.5M6 6.5 9.2 9.5 15 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 12 12" fill="none" className="h-3 w-3"><path d="m2 6.5 2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
  );

/* ---------- small components ---------- */
const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Shared overlay for every dialog on this page: backdrop click and Escape close it, focus moves in,
 * Tab stays inside, and focus returns to whatever opened it. On phones the overlay sits inside the chat
 * layer so it follows the visual viewport (keyboard-safe).
 */
function Dialog({ labelledBy, describedBy, role = "dialog", placement = "center", zClass, panelClassName, onClose, children }: {
  labelledBy: string; describedBy?: string; role?: "dialog" | "alertdialog"; placement?: "center" | "sheet";
  zClass: string; panelClassName: string; onClose: () => void; children: ReactNode;
}) {
  const panelRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); closeRef.current(); return; }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!focusable.length) { event.preventDefault(); panel.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); previouslyFocused?.focus?.(); };
  }, []);
  return (
    <div
      className={`absolute inset-0 sm:fixed ${zClass} flex justify-center bg-black/40 ${placement === "sheet" ? "items-end sm:items-center sm:px-4" : "items-center px-4"}`}
      onMouseDown={(event) => { if (event.target === event.currentTarget) closeRef.current(); }}
    >
      <section ref={panelRef} tabIndex={-1} role={role} aria-modal="true" aria-labelledby={labelledBy} aria-describedby={describedBy} className={`w-full bg-white shadow-2xl outline-none ${panelClassName}`}>
        {children}
      </section>
    </div>
  );
}

/** "Tue, 4 Nov · 10:00 – 11:00" */
const formatWhen = (start: string, end: string) => `${zoneFormat(start, TIME_ZONE, "full")} · ${formatClock(start)} – ${formatClock(end)}`;

/* ---------- page ---------- */
function SessionConversation({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [conversation, setConversation] = useState<ConversationDetails | null>(null);
  const [role, setRole] = useState<ParticipantRole | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [sending, setSending] = useState(false);
  const [changingMessaging, setChangingMessaging] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [notice, setNotice] = useState("");
  const [showJump, setShowJump] = useState(false);
  // A ticking clock (every 30s and on tab focus) so "Today", "Yesterday" and "is this session still in the future" never go stale.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [realtimeConversationId, setRealtimeConversationId] = useState("");
  const realtimeReady = Boolean(conversation?.id && realtimeConversationId === conversation.id);

  const [showBookingMenu, setShowBookingMenu] = useState(false);
  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
  const [proposedStart, setProposedStart] = useState("");
  const [manualProposedStart, setManualProposedStart] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [rescheduleBusy, setRescheduleBusy] = useState(false);
  const [rescheduleError, setRescheduleError] = useState("");
  const [rescheduleSlots, setRescheduleSlots] = useState<RescheduleSlot[]>([]);
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState(false);
  const [rescheduleSlotsError, setRescheduleSlotsError] = useState("");
  const [respondingProposalId, setRespondingProposalId] = useState("");

  const [confirmCancelBooking, setConfirmCancelBooking] = useState(false);
  const [cancellingBooking, setCancellingBooking] = useState(false);
  const [confirmCancelArrangement, setConfirmCancelArrangement] = useState(false);
  const [cancellingArrangement, setCancellingArrangement] = useState(false);
  const [cancelArrangementReason, setCancelArrangementReason] = useState("");
  const [arrangementError, setArrangementError] = useState("");

  const rootRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const slotsAbortRef = useRef<AbortController | null>(null);
  const stickToBottomRef = useRef(true);
  const sendingRef = useRef(false);
  // Adaptive polling state: when anything last happened in this chat, and the newest message we've seen.
  // Starts at 0 and is set once on mount (below), so Date.now() is never called during render.
  const lastActivityRef = useRef(0);
  const lastSeenIdRef = useRef("");
  // The newest message id we have told the server is read, so we only call the read endpoint when something new arrives.
  const lastMarkedIdRef = useRef("");
  // Prevent a late response from a previous route from leaking its messages into a new conversation.
  const activeConversationIdRef = useRef("");
  // Latest signed-in user id for socket handlers (kept in a ref so the socket is not rebuilt when it first arrives).
  const userIdRef = useRef("");
  // Ticket for conversation-detail requests: only the newest one may overwrite state (keeps optimistic updates from flickering back).
  const detailsSeqRef = useRef(0);

  const viewport = useChatViewport(rootRef);

  // Runs before the polling effect below (effects run in declaration order), so the first poll delay is correct.
  useEffect(() => { lastActivityRef.current = Date.now(); }, []);
  // Reset the composer height after a send (or any time the draft becomes empty).
  useEffect(() => { if (!draft && textareaRef.current) textareaRef.current.style.height = "auto"; }, [draft]);
  // Abort an in-flight slots request when the page unmounts.
  useEffect(() => () => slotsAbortRef.current?.abort(), []);

  /** Tells the server the newest message is read (clears the inbox/sidebar badge) once the person can actually see it. */
  const markRead = useCallback((conversationId: string, messageId: string) => {
    if (!messageId || messageId === lastMarkedIdRef.current || document.visibilityState !== "visible") return;
    lastMarkedIdRef.current = messageId;
    fetch(`/api/student/messages/${encodeURIComponent(conversationId)}/read`, { method: "POST" })
      .then((response) => {
        // Allow a retry on the next poll if the server rejected it.
        if (!response.ok) { lastMarkedIdRef.current = ""; return; }
        window.dispatchEvent(new Event("txmate:messages-read"));
      })
      .catch(() => { lastMarkedIdRef.current = ""; });
  }, []);

  const loadMessages = useCallback(async (conversationId: string, signal?: AbortSignal) => {
    const body = await requestJson<MessagesResponse>(`/api/student/conversations/${encodeURIComponent(conversationId)}/messages`, "Unable to load messages.", { signal });
    // A request from an old conversation may finish after navigation. Ignore it.
    if (activeConversationIdRef.current !== conversationId) return;
    // Keep the last known id: a response without one must never flip every bubble to "not mine".
    if (body.currentUserId) { userIdRef.current = body.currentUserId; setCurrentUserId(body.currentUserId); }
    const next = Array.isArray(body.messages) ? body.messages : [];
    const newestId = next[next.length - 1]?.id ?? "";
    if (newestId !== lastSeenIdRef.current) { lastSeenIdRef.current = newestId; lastActivityRef.current = Date.now(); }
    markRead(conversationId, newestId);
    // Merge rather than replace: a poll that started before a socket event holds an older snapshot. Messages are
    // append-only and "seen" never reverts, so keep unseen ids and any read time we already know about.
    setMessages((current) => {
      const byId = new Map<string, ChatMessage>(next.map((message) => [message.id, message]));
      for (const message of current) {
        const server = byId.get(message.id);
        if (!server) byId.set(message.id, message);
        else if (!server.readAt && message.readAt) byId.set(message.id, { ...server, readAt: message.readAt });
      }
      const merged = [...byId.values()].sort(byTime);
      return current.length === merged.length && current.every((message, i) => message.id === merged[i].id && (message.readAt ?? null) === (merged[i].readAt ?? null)) ? current : merged;
    });
  }, [markRead]);

  /** Fetches the conversation + session details. Skips the state update when nothing changed so polling doesn't re-render. */
  const refreshConversationDetails = useCallback(async (signal?: AbortSignal) => {
    const seq = ++detailsSeqRef.current;
    const body = await requestJson<ConversationResponse>(`/api/student/sessions/${encodeURIComponent(sessionId)}/conversation`, "Unable to load this session conversation.", { signal });
    if (!body.conversation || !body.participantRole) throw new ApiError(body.error || "Unable to load this session conversation.", 0);
    const next = body.conversation;
    if (activeConversationIdRef.current !== next.id) {
      activeConversationIdRef.current = next.id;
      lastSeenIdRef.current = "";
      lastMarkedIdRef.current = "";
      lastActivityRef.current = Date.now();
      setMessages([]);
    }
    if (seq === detailsSeqRef.current) {
      setConversation((current) => (current && JSON.stringify(current) === JSON.stringify(next) ? current : next));
      setRole(body.participantRole);
    }
    return next;
  }, [sessionId]);

  const loadConversation = useCallback(async (signal?: AbortSignal) => {
    const details = await refreshConversationDetails(signal);
    await loadMessages(details.id, signal);
  }, [refreshConversationDetails, loadMessages]);

  /** Refreshes everything after a successful action. A failed refresh must not make a successful action look failed. */
  const syncAll = useCallback(() => loadConversation().catch(() => {}), [loadConversation]);

  // Initial load. `loading` starts true and the page is remounted per session (see the wrapper), so nothing is reset here.
  useEffect(() => {
    const controller = new AbortController();
    loadConversation(controller.signal)
      .catch((cause) => { if (!controller.signal.aborted) setProblem(toProblem(cause, "Unable to load this conversation.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [loadConversation]);

  // Clock tick: keeps day labels and "session is in the future" checks current without relying on polling.
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    const interval = window.setInterval(tick, 30_000);
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  // Adaptive polling. Without realtime: messages + details, fast while the chat is active and slower as it goes quiet.
  // With realtime: only details (session status, reschedule proposals) at a relaxed pace, so the other participant's
  // accept/decline shows up without a refresh. Paused while the tab is hidden, backs off after errors, wakes on focus/online.
  useEffect(() => {
    if (!conversation?.id) return;
    const conversationId = conversation.id;
    const controller = new AbortController();
    let timer: number | undefined;
    let failures = 0;
    let inFlight = false;
    let stopped = false;
    const nextDelay = () => {
      const idleMs = Date.now() - lastActivityRef.current;
      const base = realtimeReady ? 10_000 : idleMs < 60_000 ? 2_000 : idleMs < 5 * 60_000 ? 5_000 : 15_000;
      return Math.min(base * 2 ** failures, 30_000);
    };
    const schedule = () => {
      window.clearTimeout(timer);
      if (stopped || document.visibilityState === "hidden") return;
      timer = window.setTimeout(() => void tick(), nextDelay());
    };
    const tick = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      try {
        await Promise.all([realtimeReady ? null : loadMessages(conversationId, controller.signal), refreshConversationDetails(controller.signal)]);
        failures = 0;
        setProblem((current) => (current?.auth ? null : current));
      } catch (cause) {
        failures = Math.min(failures + 1, 4);
        // A background poll that finds the person logged out should say so instead of failing silently.
        if (!stopped && isAuthError(cause)) setProblem((current) => (current?.auth ? current : toProblem(cause, SESSION_EXPIRED)));
      } finally {
        inFlight = false;
        schedule();
      }
    };
    const wake = () => {
      if (document.visibilityState !== "visible") return;
      lastActivityRef.current = Date.now();
      window.clearTimeout(timer);
      void tick();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    schedule();
    return () => {
      stopped = true;
      controller.abort();
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
    };
  }, [conversation?.id, realtimeReady, loadMessages, refreshConversationDetails]);

  // Socket.IO is the primary delivery path for messages and read receipts; the polling effect above is the
  // recovery path while realtime is unavailable.
  useEffect(() => {
    if (!conversation?.id) return;
    const conversationId = conversation.id;
    let joined = false;
    let disposed = false;
    const socket = io({ path: "/socket.io", withCredentials: true, reconnection: true, reconnectionAttempts: Infinity });
    const setReady = (ready: boolean) => { joined = ready; setRealtimeConversationId(ready ? conversationId : ""); };
    const join = () => {
      setReady(false);
      socket.emit("conversation:join", { conversationId }, (result: { ok: boolean; error?: string }) => {
        if (disposed) return;
        if (!result?.ok) { setReady(false); console.warn("TXMate realtime conversation join failed:", result?.error ?? "unknown error"); return; }
        // Recover messages missed while disconnected before the fallback poller is relaxed.
        loadMessages(conversationId).then(() => { if (!disposed && socket.connected) setReady(true); }).catch(() => setReady(false));
      });
    };
    const onDown = () => setReady(false);
    const onNewMessage = (message: ChatMessage) => {
      if (!message || message.conversationId !== conversationId) return;
      lastActivityRef.current = Date.now();
      lastSeenIdRef.current = message.id;
      setMessages((current) => (current.some((item) => item.id === message.id) ? current : [...current, message].sort(byTime)));
      // Don't refetch the whole history per event; just mark the conversation read while it is visible.
      if (message.senderUserId !== userIdRef.current) markRead(conversationId, message.id);
    };
    const onReadReceipt = (receipt: ReadReceiptEvent) => {
      const me = userIdRef.current;
      if (!receipt || receipt.conversationId !== conversationId || receipt.readerUserId === me || !Array.isArray(receipt.messageIds) || !receipt.messageIds.length) return;
      const readIds = new Set(receipt.messageIds);
      setMessages((current) => current.map((message) => (message.senderUserId === me && readIds.has(message.id) ? { ...message, readAt: receipt.readAt } : message)));
    };
    // Reconcile when the person returns to the conversation.
    const onVisible = () => { if (document.visibilityState === "visible" && joined && socket.connected) void loadMessages(conversationId).catch(() => {}); };
    socket.on("connect", join);
    socket.on("disconnect", onDown);
    socket.on("connect_error", onDown);
    socket.on("message:new", onNewMessage);
    socket.on("messages:read", onReadReceipt);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      joined = false;
      socket.emit("conversation:leave", { conversationId });
      socket.off("connect", join);
      socket.off("disconnect", onDown);
      socket.off("connect_error", onDown);
      socket.off("message:new", onNewMessage);
      socket.off("messages:read", onReadReceipt);
      document.removeEventListener("visibilitychange", onVisible);
      socket.disconnect();
    };
  }, [conversation?.id, loadMessages, markRead]);

  // Keep the newest message in view when messages arrive OR the keyboard changes the viewport height.
  useEffect(() => {
    const element = listRef.current;
    if (element && stickToBottomRef.current) element.scrollTop = element.scrollHeight;
  }, [messages, loading, viewport?.height]);

  // Close the session options menu on outside tap or Escape.
  useEffect(() => {
    if (!showBookingMenu) return;
    const onPointerDown = (event: PointerEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node)) setShowBookingMenu(false); };
    const onKeyDown = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setShowBookingMenu(false); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [showBookingMenu]);

  /* ---------- derived session state ---------- */
  const session = conversation?.session ?? null;
  const arrangementStatus = conversation?.arrangementStatus;
  const arrangementCancelled = arrangementStatus === "CANCELLED";
  const isRecurring = conversation?.arrangementType === "RECURRING";
  const sessionStatus = session?.status ?? "";
  const currentSessionIsFuture = session !== null && Date.parse(session.scheduledStart) > nowMs;
  const canRescheduleCurrentSession =
    session !== null && currentSessionIsFuture &&
    ((arrangementStatus === "ACTIVE" && (sessionStatus === "SCHEDULED" || sessionStatus === "CANCELLED")) ||
      (conversation?.arrangementType === "ONE_TIME" && arrangementCancelled && sessionStatus === "CANCELLED"));
  const canCancelCurrentSession = session !== null && arrangementStatus === "ACTIVE" && sessionStatus === "SCHEDULED" && currentSessionIsFuture;
  const canCancelArrangement = session !== null && isRecurring && (arrangementStatus === "ACTIVE" || arrangementStatus === "PAUSED");
  const hasSessionActions = canRescheduleCurrentSession || canCancelCurrentSession || canCancelArrangement;
  const messagingPaused = conversation !== null && (arrangementCancelled || !conversation.studentMessagingEnabled);
  const fallbackCounterpart = role === "STUDENT" ? "Academic Mate" : role === "ACADEMIC_MATE" ? "Student" : "Session conversation";
  const displayName = conversation?.otherUserName || fallbackCounterpart;
  const avatarText = role === "STUDENT" ? "AM" : role === "ACADEMIC_MATE" ? "ST" : "TX";
  const messagingOpen = conversation?.studentMessagingEnabled ?? true;
  const pendingProposals = session && canRescheduleCurrentSession ? (session.rescheduleProposals ?? []).filter((proposal) => proposal.status === "PENDING") : [];

  // Only changes when the calendar day changes, so the message list isn't rebuilt on every clock tick.
  const todayKey = dayKey(new Date(nowMs));
  const yesterdayKey = dayKey(new Date(nowMs - DAY_MS));
  const items = useMemo(() => buildListItems(messages, currentUserId, todayKey, yesterdayKey), [messages, currentUserId, todayKey, yesterdayKey]);

  const slotGroups = useMemo(() => groupSlots(rescheduleSlots), [rescheduleSlots]);
  const activeGroup = slotGroups.find((group) => group.key === selectedDay) ?? slotGroups[0];
  const selectedSlot = rescheduleSlots.find((slot) => slot.start === proposedStart) ?? null;

  /* ---------- reschedule form ---------- */
  /** Loads published slots. Runs from click handlers (open / "Try again"), so it can reset the form up front. */
  function loadSlots() {
    slotsAbortRef.current?.abort();
    const controller = new AbortController();
    slotsAbortRef.current = controller;
    setRescheduleSlotsLoading(true);
    setRescheduleSlotsError("");
    setRescheduleSlots([]);
    setProposedStart("");
    setManualProposedStart("");
    setSelectedDay("");
    requestJson<RescheduleSlotsResponse>(`/api/student/sessions/${encodeURIComponent(sessionId)}/reschedule`, "Unable to load available times.", { signal: controller.signal })
      .then((body) => setRescheduleSlots(Array.isArray(body.slots) ? body.slots : []))
      .catch((cause) => { if (!controller.signal.aborted) setRescheduleSlotsError(errorMessage(cause, "Unable to load available times.")); })
      .finally(() => { if (!controller.signal.aborted) setRescheduleSlotsLoading(false); });
  }

  function openReschedule() {
    setShowBookingMenu(false);
    setRescheduleError("");
    setShowRescheduleForm(true);
    loadSlots();
  }

  function closeReschedule() {
    slotsAbortRef.current?.abort();
    setShowRescheduleForm(false);
    setProposedStart("");
    setManualProposedStart("");
    setSelectedDay("");
    setRescheduleReason("");
    setRescheduleError("");
    setRescheduleSlotsError("");
  }

  function selectDay(key: string) {
    if (key === activeGroup?.key) return;
    setSelectedDay(key);
    setProposedStart("");
    setRescheduleError("");
  }

  /* ---------- scrolling / navigation ---------- */
  function handleScroll() {
    const element = listRef.current;
    if (!element) return;
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
    stickToBottomRef.current = nearBottom;
    setShowJump(!nearBottom);
  }

  function jumpToLatest() {
    const element = listRef.current;
    if (!element) return;
    stickToBottomRef.current = true;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }

  function goBack() {
    // If there's in-app history, go back; otherwise (opened from a link, new tab, refresh) fall back to the inbox.
    if (window.history.length > 1) router.back();
    else router.push("/student/messages");
  }

  /** Default retry: reload the whole conversation. */
  function reload() {
    setProblem(null);
    setLoading(true);
    loadConversation()
      .catch((cause) => setProblem(toProblem(cause, "Unable to reload the conversation.", reload)))
      .finally(() => setLoading(false));
  }

  function refreshMessages() {
    if (!conversation) return;
    setProblem(null);
    loadMessages(conversation.id).catch((cause) => setProblem(toProblem(cause, "Unable to refresh messages.", refreshMessages)));
  }

  /* ---------- messaging ---------- */
  async function sendMessage(text = draft.trim()) {
    if (!conversation || conversation.arrangementStatus === "CANCELLED" || !conversation.studentMessagingEnabled || !text || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    lastActivityRef.current = Date.now();
    setProblem(null);
    setNotice("");
    try {
      const result = await requestJson<{ message?: ChatMessage; error?: string }>(`/api/student/conversations/${encodeURIComponent(conversation.id)}/messages`, "Unable to send this message.", { method: "POST", body: JSON.stringify({ body: text }) });
      // Clear the box only if it still holds what was sent (the person may have started typing something else).
      setDraft((current) => (current.trim() === text ? "" : current));
      stickToBottomRef.current = true;
      if (result.message) {
        const sent = result.message;
        setMessages((current) => (current.some((item) => item.id === sent.id) ? current : [...current, sent]));
      }
      // The message is already sent; a failed refresh here must not be reported as a failed send.
      void loadMessages(conversation.id).catch(() => {});
    } catch (cause) {
      // The draft stays in the box; "Retry" resends exactly this text instead of reloading the page.
      setProblem(toProblem(cause, "Unable to send this message.", () => void sendMessage(text)));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    if (window.matchMedia("(pointer: fine)").matches) { event.preventDefault(); void sendMessage(); }
  }

  async function toggleStudentMessaging() {
    if (!conversation || changingMessaging) return;
    setChangingMessaging(true);
    setProblem(null);
    setNotice("");
    try {
      const body = await requestJson<{ message?: string; conversation?: { id: string; studentMessagingEnabled: boolean; updatedAt: string }; error?: string }>(
        `/api/student/sessions/${encodeURIComponent(sessionId)}/conversation`, "Unable to update messaging.",
        { method: "PATCH", body: JSON.stringify({ studentMessagingEnabled: !conversation.studentMessagingEnabled }) },
      );
      if (!body.conversation) throw new ApiError(body.error || "Unable to update messaging.", 0);
      const updated = body.conversation;
      setConversation((current) => (current ? { ...current, studentMessagingEnabled: updated.studentMessagingEnabled } : current));
      setNotice(body.message || "Messaging settings updated.");
    } catch (cause) {
      setProblem(toProblem(cause, "Unable to update messaging settings.", () => void toggleStudentMessaging()));
    } finally {
      setChangingMessaging(false);
    }
  }

  /* ---------- rescheduling ---------- */
  async function submitReschedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || rescheduleBusy) return;
    const selectedDate = rescheduleSlots.length === 0 ? parseDateTimeLocal(manualProposedStart, TIME_ZONE) : proposedStart ? new Date(proposedStart) : null;
    if (!selectedDate || Number.isNaN(selectedDate.getTime())) { setRescheduleError("Choose a valid date and time."); return; }
    if (selectedDate.getTime() <= Date.now()) { setRescheduleError("Choose a future date and time."); return; }
    setRescheduleBusy(true);
    setRescheduleError("");
    setProblem(null);
    setNotice("");
    try {
      const body = await requestJson<{ message?: string; error?: string }>(`/api/student/sessions/${encodeURIComponent(sessionId)}/reschedule`, "Unable to propose a new session time.",
        { method: "POST", body: JSON.stringify({ proposedStart: selectedDate.toISOString(), reason: rescheduleReason.trim() }) });
      closeReschedule();
      setNotice(body.message || "Rescheduling proposal sent.");
      void syncAll();
    } catch (cause) {
      setRescheduleError(errorMessage(cause, "Unable to submit the rescheduling proposal."));
    } finally {
      setRescheduleBusy(false);
    }
  }

  async function respondToReschedule(proposal: RescheduleProposal, action: "ACCEPTED" | "DECLINED") {
    if (respondingProposalId) return;
    setRespondingProposalId(proposal.id);
    setProblem(null);
    setNotice("");
    try {
      const body = await requestJson<{ message?: string; error?: string }>(`/api/student/sessions/${encodeURIComponent(sessionId)}/reschedule/${encodeURIComponent(proposal.id)}`, "Unable to respond to this proposal.",
        { method: "PATCH", body: JSON.stringify({ action }) });
      // Reflect the decision right away (card disappears; an accepted time replaces the current one). The sync below confirms it.
      setConversation((current) => {
        if (!current?.session) return current;
        const proposals = (current.session.rescheduleProposals ?? []).map((item) => (item.id === proposal.id ? { ...item, status: action } : item));
        const times = action === "ACCEPTED" ? { scheduledStart: proposal.proposedStart, scheduledEnd: proposal.proposedEnd } : {};
        return { ...current, session: { ...current.session, ...times, rescheduleProposals: proposals } };
      });
      setNotice(body.message || (action === "ACCEPTED" ? "Proposal accepted. The session time has been updated." : "Proposal declined."));
      void syncAll();
    } catch (cause) {
      setProblem(toProblem(cause, "Unable to respond to this proposal.", () => void respondToReschedule(proposal, action)));
      // The server may have expired this proposal while rejecting a late response; refresh so stale controls disappear.
      void syncAll();
    } finally {
      setRespondingProposalId("");
    }
  }

  /* ---------- cancelling ---------- */
  async function cancelBooking() {
    if (!session || cancellingBooking) return;
    setCancellingBooking(true);
    setProblem(null);
    setNotice("");
    setShowBookingMenu(false);
    closeReschedule();
    try {
      const body = await requestJson<{ message?: string; error?: string }>(`/api/student/sessions/${encodeURIComponent(sessionId)}/cancel`, "Unable to cancel this booking.",
        { method: "POST", body: JSON.stringify({ reason: "Cancelled from the session conversation." }) });
      setConversation((current) => (current?.session ? { ...current, session: { ...current.session, status: "CANCELLED" } } : current));
      setNotice(body.message || "Booking cancelled. Both participants have been notified.");
      void syncAll();
    } catch (cause) {
      setProblem(toProblem(cause, "Unable to cancel this booking.", () => void cancelBooking()));
    } finally {
      setCancellingBooking(false);
      setConfirmCancelBooking(false);
    }
  }

  function openCancelArrangement() {
    setShowBookingMenu(false);
    setArrangementError("");
    setConfirmCancelArrangement(true);
  }

  function closeCancelArrangement() {
    setConfirmCancelArrangement(false);
    setArrangementError("");
  }

  async function cancelArrangement() {
    if (!session || cancellingArrangement) return;
    setCancellingArrangement(true);
    setArrangementError("");
    setProblem(null);
    setNotice("");
    try {
      const body = await requestJson<{ message?: string; error?: string }>(`/api/student/sessions/${encodeURIComponent(sessionId)}/cancel-arrangement`, "Unable to cancel the tutoring arrangement.",
        { method: "POST", body: JSON.stringify({ reason: cancelArrangementReason.trim() }) });
      closeCancelArrangement();
      setCancelArrangementReason("");
      setShowBookingMenu(false);
      closeReschedule();
      setNotice(body.message || "The recurring tutoring arrangement has been cancelled.");
      await syncAll();
    } catch (cause) {
      // Shown inside the dialog, because the page banner sits behind the overlay.
      setArrangementError(errorMessage(cause, "Unable to cancel the tutoring arrangement."));
    } finally {
      setCancellingArrangement(false);
    }
  }

  // CSS variables feed the responsive classes below (mobile uses the visual viewport; desktop uses the measured top offset).
  const rootStyle = { "--chat-vh": viewport ? `${viewport.height}px` : "100dvh", "--chat-vt": viewport ? `${viewport.offsetTop}px` : "0px", "--chat-top": viewport ? `${viewport.chatTop}px` : "4rem" } as CSSProperties;

  return (
    <main
      ref={rootRef}
      style={rootStyle}
      className={[
        // MOBILE: full-screen layer pinned to the visual viewport, above the site navbar.
        "fixed inset-x-0 top-[var(--chat-vt)] z-50 h-[var(--chat-vh)] bg-white",
        // DESKTOP: normal flow, centred card filling the space below the navbar.
        "sm:static sm:z-auto sm:flex sm:h-[calc(100dvh-var(--chat-top))] sm:items-stretch sm:justify-center sm:bg-[#f7f3ef] sm:p-4 lg:p-6",
        "text-stone-900",
      ].join(" ")}
    >
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white sm:max-w-4xl sm:rounded-2xl sm:border sm:border-[#eadfd9] sm:shadow-[0_24px_80px_-32px_rgba(74,30,30,0.28)]">
        {/* ---------- header ---------- */}
        <header className="flex shrink-0 items-center gap-3 border-b border-[#eee5e0] bg-white px-2.5 pb-3.5 pt-[max(0.875rem,env(safe-area-inset-top))] sm:px-6 sm:py-5">
          <button type="button" onClick={goBack} aria-label="Go back" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 focus-visible:outline-2 focus-visible:outline-[#7d1f2a] active:scale-95">
            <BackIcon />
          </button>
          <div className="relative shrink-0">
            {conversation?.otherUserImage ? (
              <Image src={conversation.otherUserImage} alt="" width={96} height={96} unoptimized className="h-11 w-11 rounded-full border border-[#eadfd9] object-cover sm:h-12 sm:w-12" />
            ) : (
              <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-[#7d1f2a]/10 text-sm font-bold text-[#7d1f2a] sm:h-12 sm:w-12 sm:text-base">{avatarText}</span>
            )}
            <span aria-hidden="true" className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${messagingOpen ? "bg-emerald-500" : "bg-amber-500"}`} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold tracking-tight text-stone-900 sm:text-lg">{displayName}</h1>
            <p className="truncate text-xs font-medium text-stone-500 sm:text-[13px]">
              {conversation?.courseName || "TXMate conversation"}
              {conversation && <span className="hidden text-stone-400 min-[400px]:inline"> · {conversation.arrangementType === "RECURRING" ? "Recurring arrangement" : "One-time arrangement"} · {messagingOpen ? "Messaging available" : "Messaging paused"}</span>}
            </p>
          </div>
          {role === "ACADEMIC_MATE" && conversation && (
            <button
              type="button"
              disabled={changingMessaging}
              onClick={() => void toggleStudentMessaging()}
              className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${conversation.studentMessagingEnabled ? "border border-stone-300 text-stone-700 hover:bg-stone-50" : "bg-[#7d1f2a] text-white hover:bg-[#651822]"}`}
            >
              {changingMessaging ? "Updating..." : conversation.studentMessagingEnabled ? "Pause" : "Reopen"}
            </button>
          )}
          <button type="button" disabled={loading || !conversation} onClick={refreshMessages} aria-label="Refresh messages" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 focus-visible:outline-2 focus-visible:outline-[#7d1f2a] active:scale-95 disabled:opacity-40">
            <RefreshIcon />
          </button>
        </header>

        {/* ---------- session strip ---------- */}
        {session && (
          <div className="flex shrink-0 items-center gap-2 border-b border-[#eee5e0] bg-[#fbf8f6] px-4 py-2.5 text-xs text-stone-600 sm:px-6">
            <span className="text-[#7d1f2a]"><CalendarIcon /></span>
            <p className="min-w-0 flex-1 truncate text-[11px] sm:text-xs">
              <span className="font-semibold text-stone-800">{formatSessionDate(session.scheduledStart)}</span>
              <span className="text-stone-500"> · ends {formatClock(session.scheduledEnd)}</span>
            </p>
            <div className="flex shrink-0 items-center gap-1">
              {/cancel/i.test(sessionStatus) && <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-semibold text-stone-600">Cancelled</span>}
              {hasSessionActions && (
                <div ref={menuRef} className="relative">
                  <button type="button" aria-label="Session options" aria-haspopup="menu" aria-expanded={showBookingMenu} onClick={() => setShowBookingMenu((open) => !open)} className="flex h-8 w-8 items-center justify-center rounded-full text-stone-600 hover:bg-stone-200/70 focus-visible:outline-2 focus-visible:outline-[#7d1f2a]">
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
                  </button>
                  {showBookingMenu && (
                    <div role="menu" aria-label="Session options" className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-xl border border-[#eadfd9] bg-white py-1 shadow-lg">
                      {canRescheduleCurrentSession && <button type="button" role="menuitem" onClick={openReschedule} className="block w-full px-3 py-2.5 text-left text-xs font-medium text-stone-700 hover:bg-stone-50">Reschedule session</button>}
                      {canCancelCurrentSession && <button type="button" role="menuitem" onClick={() => { setShowBookingMenu(false); setConfirmCancelBooking(true); }} className="block w-full px-3 py-2.5 text-left text-xs font-medium text-red-700 hover:bg-red-50">Cancel this session</button>}
                      {canCancelArrangement && (
                        <>
                          {(canRescheduleCurrentSession || canCancelCurrentSession) && <div role="separator" className="my-1 border-t border-stone-100" />}
                          <button type="button" role="menuitem" onClick={openCancelArrangement} className="block w-full px-3 py-2.5 text-left hover:bg-red-50">
                            <span className="block text-xs font-medium text-red-700">Cancel entire arrangement</span>
                            <span className="mt-0.5 block text-[10px] leading-snug text-stone-500">Ends the recurring arrangement and all upcoming sessions</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---------- pending reschedule proposals ---------- */}
        {pendingProposals.length > 0 && (
          <div className="max-h-[40%] shrink-0 divide-y divide-[#eee5e0] overflow-y-auto border-b border-[#eee5e0] bg-white">
            {pendingProposals.map((proposal) => {
              const mustRespond = proposal.respondingUserId === currentUserId;
              const saving = respondingProposalId === proposal.id;
              return (
                <section key={proposal.id} aria-label="Rescheduling proposal" className="border-l-2 border-l-[#7d1f2a] px-4 py-2.5 sm:px-6">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="min-w-0 truncate text-xs font-semibold text-stone-900">Reschedule request<span className="font-normal text-stone-500"> · from {proposal.proposedByName || "a participant"}</span></h2>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${mustRespond ? "bg-[#f4eceb] text-[#7d1f2a]" : "bg-stone-100 text-stone-600"}`}>{mustRespond ? "Needs your response" : "Awaiting response"}</span>
                  </div>
                  <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
                    <dl className="grid min-w-0 grid-cols-[4rem_1fr] gap-x-2 gap-y-0.5 text-xs leading-5">
                      <dt className="text-stone-500">Proposed</dt>
                      <dd className="font-semibold tabular-nums text-stone-900">{formatWhen(proposal.proposedStart, proposal.proposedEnd)}</dd>
                      <dt className="text-stone-500">Current</dt>
                      <dd className="tabular-nums text-stone-500 line-through decoration-stone-300">{session ? formatWhen(session.scheduledStart, session.scheduledEnd) : ""}</dd>
                      {proposal.reason && (
                        <>
                          <dt className="text-stone-500">Reason</dt>
                          <dd title={proposal.reason} className="line-clamp-2 break-words text-stone-700">{proposal.reason}</dd>
                        </>
                      )}
                    </dl>
                    {mustRespond && (
                      <div className="flex shrink-0 gap-2">
                        <button type="button" disabled={saving} onClick={() => void respondToReschedule(proposal, "DECLINED")} className="flex-1 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50 sm:flex-none">Decline</button>
                        <button type="button" disabled={saving} onClick={() => void respondToReschedule(proposal, "ACCEPTED")} title="Accepting confirms the new time for both of you" className="flex-1 rounded-md bg-[#7d1f2a] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#651822] disabled:opacity-50 sm:flex-none">{saving ? "Saving..." : "Accept new time"}</button>
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {/* ---------- banners ---------- */}
        {problem && (
          <div role="alert" className="flex shrink-0 items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-800 sm:px-6">
            <span className="min-w-0">{problem.message}</span>
            <span className="flex shrink-0 items-center gap-3 font-bold">
              <button type="button" onClick={problem.retry ?? reload} className="underline">Retry</button>
              {problem.auth && <Link href="/login" className="underline">Log in</Link>}
              <button type="button" onClick={() => setProblem(null)} aria-label="Dismiss" className="text-base leading-none">×</button>
            </span>
          </div>
        )}
        {notice && <p role="status" className="shrink-0 border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-800 sm:px-6">{notice}</p>}

        {/* ---------- messages ---------- */}
        <div className="relative min-h-0 flex-1 bg-stone-50/50">
          <div ref={listRef} onScroll={handleScroll} role="log" aria-live="polite" aria-label="Conversation messages" className="h-full space-y-1 overflow-y-auto overscroll-contain px-3 py-4 [-webkit-overflow-scrolling:touch] sm:px-6 sm:py-6">
            {loading ? (
              <div className="flex flex-col gap-3 py-4" aria-busy="true">
                <p className="sr-only">Loading conversation...</p>
                {["w-2/3 self-start", "w-1/2 self-end", "w-3/5 self-start", "w-2/5 self-end"].map((classes) => <div key={classes} className={`h-10 animate-pulse rounded-xl bg-stone-200/60 ${classes}`} />)}
              </div>
            ) : items.length === 0 ? (
              conversation && (
                <div className="flex h-full min-h-48 flex-col items-center justify-center px-4 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-stone-400 shadow-sm ring-1 ring-stone-200"><ChatIcon /></span>
                  <p className="mt-3 text-xs font-bold text-stone-800 sm:text-sm">No messages yet</p>
                  <p className="mt-0.5 max-w-xs text-[11px] leading-relaxed text-stone-500 sm:text-xs">Start the conversation by discussing meeting locations and session prep.</p>
                </div>
              )
            ) : (
              items.map((item) => {
                if (item.kind === "day") {
                  return (
                    <div key={item.key} className="my-4 flex justify-center first:mt-0">
                      <span className="rounded-full border border-[#eee5e0] bg-white px-3 py-1 text-[11px] font-semibold text-stone-500 shadow-sm">{item.label}</span>
                    </div>
                  );
                }
                const { message, own, startsGroup, endsGroup } = item;
                const seen = Boolean(message.readAt);
                return (
                  <div key={message.id} className={`flex ${own ? "justify-end" : "justify-start"} ${startsGroup ? "mt-3 first:mt-0" : "mt-1"}`}>
                    <div className={`max-w-[85%] px-3 py-1.5 shadow-sm sm:max-w-[70%] sm:px-3.5 sm:py-2 ${own ? `bg-[#7d1f2a] text-white ${endsGroup ? "rounded-2xl rounded-br-md" : "rounded-2xl"}` : `border border-stone-200/80 bg-white text-stone-900 ${endsGroup ? "rounded-2xl rounded-bl-md" : "rounded-2xl"}`}`}>
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.body}</p>
                      <div className="mt-1 flex items-center justify-end gap-1.5">
                        <time dateTime={message.createdAt} className={`text-[9.5px] tabular-nums ${own ? "text-white/70" : "text-stone-400"}`}>{formatClock(message.createdAt)}</time>
                        {own && (
                          <span aria-label={seen ? "Seen" : "Sent"} title={seen && message.readAt ? `Seen ${formatClock(message.readAt)}` : "Sent"} className={`inline-flex items-center gap-0.5 text-[9px] font-medium ${seen ? "text-sky-200" : "text-white/70"}`}>
                            <Ticks seen={seen} />
                            <span>{seen ? "Seen" : "Sent"}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {showJump && !loading && (
            <button type="button" onClick={jumpToLatest} className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-stone-700 shadow-lg transition-colors hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-[#7d1f2a] active:scale-95">
              <ChevronDownIcon /> Latest
            </button>
          )}
        </div>

        {/* ---------- composer ---------- */}
        <form onSubmit={handleSubmit} className="shrink-0 border-t border-[#eee5e0] bg-white px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 sm:px-6 sm:pb-3 sm:pt-3">
          {messagingPaused ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900 sm:text-sm">
              <span className="mt-0.5 text-amber-600"><LockIcon /></span>
              <p>
                {arrangementCancelled
                  ? "This tutoring arrangement has been cancelled. Messaging is closed."
                  : role === "ACADEMIC_MATE"
                    ? "You've paused messaging. You can still read the conversation history."
                    : "Messaging has been paused by the Academic Mate. You can still read the conversation history."}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-end gap-2">
                <label htmlFor="message-body" className="sr-only">Write a message</label>
                <textarea
                  ref={textareaRef}
                  id="message-body"
                  value={draft}
                  onFocus={() => {
                    // Keyboard is opening: keep the latest message visible once the viewport has resized.
                    window.setTimeout(() => { if (listRef.current && stickToBottomRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, 300);
                  }}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    lastActivityRef.current = Date.now();
                    const el = event.target;
                    el.style.height = "auto";
                    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
                  }}
                  onKeyDown={handleKeyDown}
                  maxLength={MAX_LENGTH}
                  rows={1}
                  placeholder="Type a message..."
                  // readOnly (not disabled) while sending so the keyboard doesn't collapse after every message.
                  readOnly={sending}
                  disabled={loading || !conversation}
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                  enterKeyHint="send"
                  autoComplete="off"
                  // text-base (16px) on mobile stops iOS Safari zooming the page when the input is focused.
                  className="max-h-32 min-h-11 w-full resize-none rounded-2xl border border-stone-300 bg-[#faf8f7] px-3.5 py-2.5 text-base leading-5 text-stone-900 outline-none transition [-ms-overflow-style:none] [scrollbar-width:none] placeholder:text-stone-400 focus:border-[#7d1f2a] focus:bg-white focus:ring-2 focus:ring-[#7d1f2a]/10 disabled:cursor-not-allowed disabled:bg-stone-100 sm:py-2.5 sm:text-sm [&::-webkit-scrollbar]:hidden"
                />
                <button
                  type="submit"
                  // Prevent the button from stealing focus, so the keyboard stays open after tapping send.
                  onMouseDown={(event) => event.preventDefault()}
                  disabled={sending || loading || !conversation || !draft.trim()}
                  aria-label={sending ? "Sending" : "Send message"}
                  className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full bg-[#7d1f2a] text-white shadow-sm transition-colors hover:bg-[#651822] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7d1f2a] active:scale-95 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400"
                >
                  {sending ? <svg {...ic} className="h-5 w-5 animate-spin"><path d="M12 3a9 9 0 1 0 9 9" /></svg> : <PaperJetIcon />}
                </button>
              </div>
              <div className="mt-1.5 hidden min-h-4 items-center justify-between gap-2 px-1 text-[11px] text-stone-400 sm:flex">
                <span>Enter to send &middot; Shift + Enter for newline</span>
                {draft.length > MAX_LENGTH - 500 && <span className={`ml-auto font-medium tabular-nums ${draft.length >= MAX_LENGTH ? "text-red-600" : "text-stone-400"}`}>{draft.length}/{MAX_LENGTH}</span>}
              </div>
              {draft.length > MAX_LENGTH - 500 && <p className={`mt-1 px-1 text-right text-[11px] font-medium tabular-nums sm:hidden ${draft.length >= MAX_LENGTH ? "text-red-600" : "text-stone-400"}`}>{draft.length}/{MAX_LENGTH}</p>}
            </>
          )}
        </form>
      </div>

      {/* ---------- reschedule dialog (bottom sheet on phones) ---------- */}
      {showRescheduleForm && canRescheduleCurrentSession && session && (
        <Dialog
          labelledBy="reschedule-title"
          describedBy="reschedule-description"
          placement="sheet"
          zClass="z-[70]"
          panelClassName="max-h-[92%] max-w-lg overflow-y-auto rounded-t-2xl border border-[#eadfd9] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-h-[90dvh] sm:rounded-2xl sm:p-5"
          onClose={() => { if (!rescheduleBusy) closeReschedule(); }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="reschedule-title" className="text-base font-semibold text-stone-900">Reschedule session</h2>
              <p id="reschedule-description" className="mt-0.5 truncate text-xs text-stone-500">Currently {formatSessionDate(session.scheduledStart)}</p>
            </div>
            <button type="button" onClick={closeReschedule} disabled={rescheduleBusy} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xl leading-none text-stone-500 hover:bg-stone-100 hover:text-stone-800 disabled:opacity-50">×</button>
          </div>

          <form onSubmit={submitReschedule} className="mt-4 space-y-4">
            {rescheduleSlotsLoading ? (
              <div aria-busy="true" className="space-y-3">
                <p className="sr-only">Loading available times...</p>
                <div className="flex gap-2 overflow-hidden">{[0, 1, 2, 3, 4].map((n) => <div key={n} className="h-[68px] w-14 shrink-0 animate-pulse rounded-xl bg-stone-200/60" />)}</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((n) => <div key={n} className="h-10 animate-pulse rounded-lg bg-stone-200/60" />)}</div>
              </div>
            ) : rescheduleSlotsError ? (
              <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-3">
                <p className="text-xs text-red-700">{rescheduleSlotsError}</p>
                <button type="button" onClick={loadSlots} className="mt-2 text-xs font-semibold text-[#7d1f2a] hover:underline">Try again</button>
              </div>
            ) : slotGroups.length === 0 || !activeGroup ? (
              <div className="space-y-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-4">
                <p className="text-xs font-medium text-stone-800">No published slots were found for the next 30 days.</p>
                <p className="text-xs leading-relaxed text-stone-600">You can still propose a specific future date and time for this existing session. This does not change the booking automatically; the other participant must accept the proposal.</p>
                <div>
                  <label htmlFor="reschedule-manual-time" className="mb-1 block text-xs font-medium text-stone-700">Proposed date and time ({TIME_ZONE})</label>
                  <input
                    id="reschedule-manual-time"
                    type="datetime-local"
                    value={manualProposedStart}
                    min={toDateTimeLocalValue(new Date(nowMs), TIME_ZONE)}
                    onChange={(event) => { setManualProposedStart(event.target.value); setRescheduleError(""); }}
                    required
                    className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10"
                  />
                </div>
                <p className="text-[11px] leading-relaxed text-stone-500">The recipient&apos;s acceptance confirms they agree to the proposed time. TXMate will still reject past times, duplicate session times, and conflicts with this student&apos;s other sessions.</p>
              </div>
            ) : (
              <>
                <div>
                  <p id="reschedule-day-label" className="mb-2 text-xs font-semibold text-stone-700">Day</p>
                  <div role="group" aria-labelledby="reschedule-day-label" className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {slotGroups.map((group) => {
                      const first = group.slots[0];
                      const zone = first.timezone || TIME_ZONE;
                      const active = group.key === activeGroup.key;
                      return (
                        <button
                          key={group.key}
                          type="button"
                          aria-pressed={active}
                          onClick={() => selectDay(group.key)}
                          className={`flex w-14 shrink-0 snap-start flex-col items-center rounded-xl border px-1 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7d1f2a] ${active ? "border-[#7d1f2a] bg-[#7d1f2a] text-white" : "border-stone-200 bg-white text-stone-700 hover:border-stone-400"}`}
                        >
                          <span className="text-[10px] font-medium opacity-80">{zoneFormat(first.start, zone, "weekday")}</span>
                          <span className="text-lg font-semibold leading-6 tabular-nums">{zoneFormat(first.start, zone, "dayNum") || group.key}</span>
                          <span className="text-[10px] opacity-80">{zoneFormat(first.start, zone, "month")}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p id="reschedule-time-label" className="mb-2 text-xs font-semibold text-stone-700">Start time</p>
                  <div role="group" aria-labelledby="reschedule-time-label" className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                    {activeGroup.slots.map((slot) => {
                      const selected = slot.start === proposedStart;
                      return (
                        <button
                          key={slot.start}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => { setProposedStart(slot.start); setRescheduleError(""); }}
                          className={`min-h-10 rounded-lg border px-2 py-2 text-xs font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7d1f2a] ${selected ? "border-[#7d1f2a] bg-[#7d1f2a] text-white" : "border-stone-200 bg-white text-stone-700 hover:border-stone-400"}`}
                        >
                          {slotTimeLabel(slot)}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[11px] text-stone-500">Times shown in {activeGroup.slots[0].timezone || TIME_ZONE}.</p>
                </div>
                <p aria-live="polite" className={`rounded-lg px-3 py-2 text-xs ${selectedSlot ? "bg-[#7d1f2a]/5 font-medium text-[#7d1f2a]" : "bg-stone-50 text-stone-500"}`}>
                  {selectedSlot ? `New time: ${zoneFormat(selectedSlot.start, selectedSlot.timezone || TIME_ZONE, "full")}, ${slotTimeLabel(selectedSlot)}` : "Pick a time to continue."}
                </p>
              </>
            )}

            <div>
              <label htmlFor="reschedule-reason" className="mb-1 block text-xs font-medium text-stone-700">Reason (optional)</label>
              <textarea
                id="reschedule-reason"
                value={rescheduleReason}
                onChange={(event) => setRescheduleReason(event.target.value)}
                maxLength={500}
                rows={2}
                placeholder="Why does the session need to move?"
                className="w-full resize-y rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 outline-none focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10 sm:text-sm"
              />
              <p className="mt-1.5 text-[11px] leading-snug text-stone-500">Listed slots are suggestions. If none are available, you can propose a specific future time. The session changes only after the other participant accepts.</p>
            </div>

            {rescheduleError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{rescheduleError}</p>}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeReschedule} disabled={rescheduleBusy} className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50">Cancel</button>
              <button
                type="submit"
                disabled={rescheduleBusy || rescheduleSlotsLoading || !!rescheduleSlotsError || (rescheduleSlots.length > 0 ? !proposedStart : !manualProposedStart)}
                className="rounded-lg bg-[#7d1f2a] px-4 py-2 text-xs font-semibold text-white hover:bg-[#651822] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {rescheduleBusy ? "Sending proposal..." : "Send proposal"}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {/* ---------- cancel booking confirmation ---------- */}
      {confirmCancelBooking && session && (
        <Dialog role="alertdialog" labelledBy="cancel-booking-title" describedBy="cancel-booking-description" zClass="z-[70]" panelClassName="max-w-sm rounded-2xl border border-[#eadfd9] p-5" onClose={() => { if (!cancellingBooking) setConfirmCancelBooking(false); }}>
          <h2 id="cancel-booking-title" className="text-base font-semibold text-stone-900">Cancel this session?</h2>
          <p id="cancel-booking-description" className="mt-2 text-sm leading-relaxed text-stone-600">
            {isRecurring
              ? "Only this occurrence will be cancelled. The recurring tutoring arrangement and its other scheduled sessions will remain in place. Both participants will be notified."
              : "This will cancel the session and the one-time tutoring arrangement. Both participants will be notified. Submit a new request if you need another session."}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" disabled={cancellingBooking} onClick={() => setConfirmCancelBooking(false)} className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50">Keep booking</button>
            <button type="button" disabled={cancellingBooking} onClick={() => void cancelBooking()} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50">{cancellingBooking ? "Cancelling..." : "Cancel session"}</button>
          </div>
        </Dialog>
      )}

      {/* ---------- recurring arrangement cancellation confirmation ---------- */}
      {confirmCancelArrangement && isRecurring && (
        <Dialog role="alertdialog" labelledBy="cancel-arrangement-title" describedBy="cancel-arrangement-description" zClass="z-[75]" panelClassName="max-w-md rounded-2xl border border-red-100 p-5" onClose={() => { if (!cancellingArrangement) closeCancelArrangement(); }}>
          <h2 id="cancel-arrangement-title" className="text-base font-semibold text-stone-900">Cancel the entire recurring arrangement?</h2>
          <p id="cancel-arrangement-description" className="mt-2 text-sm leading-relaxed text-stone-600">
            This will end the arrangement and cancel all upcoming sessions that have not started. Completed sessions and the shared conversation history will be kept. This cannot be undone through the session reschedule action.
          </p>
          <div className="mt-4">
            <label htmlFor="cancel-arrangement-reason" className="mb-1 block text-xs font-medium text-stone-700">Reason (optional)</label>
            <textarea
              id="cancel-arrangement-reason"
              value={cancelArrangementReason}
              onChange={(event) => setCancelArrangementReason(event.target.value)}
              maxLength={500}
              rows={3}
              disabled={cancellingArrangement}
              placeholder="Why is the arrangement ending?"
              className="w-full resize-y rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 outline-none focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10 sm:text-sm"
            />
          </div>
          {arrangementError && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{arrangementError}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" disabled={cancellingArrangement} onClick={closeCancelArrangement} className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50">Keep arrangement</button>
            <button type="button" disabled={cancellingArrangement} onClick={() => void cancelArrangement()} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50">{cancellingArrangement ? "Cancelling..." : "Cancel arrangement"}</button>
          </div>
        </Dialog>
      )}
    </main>
  );
}

/** Remount per session so every piece of state starts fresh when the route param changes. */
export default function SessionConversationPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  return <SessionConversation key={sessionId} sessionId={sessionId} />;
}