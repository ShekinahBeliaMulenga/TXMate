"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { useParams, useRouter } from "next/navigation";

type ParticipantRole = "STUDENT" | "ACADEMIC_MATE";


type RescheduleProposal = {
  id: string;
  proposedByUserId: string;
  respondingUserId: string;
  proposedByName: string | null;
  proposedStart: string;
  proposedEnd: string;
  reason: string | null;
  status: string;
  createdAt: string;
};
type RescheduleSlot = {
  start: string;
  end: string;
  timezone: string;
  localDate: string;
  localStart: string | null;
  localEnd: string | null;
};

type RescheduleSlotsResponse = {
  slots?: RescheduleSlot[];
  error?: string;
};

type ConversationDetails = {
  id: string;
  studentMessagingEnabled: boolean;
  otherUserName?: string;
  otherUserImage?: string | null;
  courseName?: string | null;
  session: {
  id: string;
  scheduledStart: string;
  scheduledEnd: string;
  status?: string;
  rescheduleProposals?: RescheduleProposal[];
} | null;

};

type ChatMessage = {
  id: string;
  conversationId: string;
  senderUserId: string;
  body: string;
  createdAt: string;
};

type ConversationResponse = {
  conversation?: ConversationDetails;
  participantRole?: ParticipantRole;
  error?: string;
};

type MessagesResponse = {
  currentUserId?: string;
  messages?: ChatMessage[];
  error?: string;
};

type ListItem =
  | { kind: "day"; key: string; label: string }
  | { kind: "message"; message: ChatMessage; own: boolean; startsGroup: boolean; endsGroup: boolean };

const TIME_ZONE = "Africa/Lusaka";
const MAX_LENGTH = 4000;
/** Matches Tailwind's `sm` breakpoint (640px). Below this we use the full-screen "app" layout. */
const DESKTOP_QUERY = "(min-width: 640px)";

const sessionDateFormatter = new Intl.DateTimeFormat("en-ZM", { weekday: "long", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE });
const clockFormatter = new Intl.DateTimeFormat("en-ZM", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE });
const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TIME_ZONE });
const dayLabelFormatter = new Intl.DateTimeFormat("en-ZM", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TIME_ZONE });

function formatSessionDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : sessionDateFormatter.format(date);
}

function formatClock(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : clockFormatter.format(date);
}

function dayKey(date: Date) {
  return dayKeyFormatter.format(date);
}

function buildListItems(messages: ChatMessage[], currentUserId: string, nowMs: number): ListItem[] {
  const todayKey = dayKey(new Date(nowMs));
  const yesterdayKey = dayKey(new Date(nowMs - 24 * 60 * 60 * 1000));
  const items: ListItem[] = [];
  let previousDay = "";

  messages.forEach((message, index) => {
    const created = new Date(message.createdAt);
    const validDate = !Number.isNaN(created.getTime());
    const currentDay = validDate ? dayKey(created) : previousDay;

    if (validDate && currentDay !== previousDay) {
      items.push({
        kind: "day",
        key: `day-${currentDay}`,
        label: currentDay === todayKey ? "Today" : currentDay === yesterdayKey ? "Yesterday" : dayLabelFormatter.format(created),
      });
    }

    const previous = messages[index - 1];
    const next = messages[index + 1];
    const nextDay = (() => {
      if (!next) return "";
      const nextDate = new Date(next.createdAt);
      return Number.isNaN(nextDate.getTime()) ? currentDay : dayKey(nextDate);
    })();

    const startsGroup = !previous || previous.senderUserId !== message.senderUserId || currentDay !== previousDay;
    const endsGroup = !next || next.senderUserId !== message.senderUserId || nextDay !== currentDay;

    items.push({ kind: "message", message, own: message.senderUserId === currentUserId, startsGroup, endsGroup });
    previousDay = currentDay;
  });

  return items;
}

/**
 * Layout strategy (how WhatsApp / iMessage / Slack web handle this):
 *
 * MOBILE  – the conversation is its own full-screen "view". It is `position: fixed` and sits
 *           above the site navbar (the chat header has its own back button, so the global nav
 *           is redundant). Its height is driven by `window.visualViewport`, which shrinks when
 *           the on-screen keyboard opens, so the composer always stays glued to the keyboard
 *           and the browser never scrolls the page "up into the navbar".
 *
 * DESKTOP – the conversation is a normal in-flow card under the navbar. We measure where the
 *           card starts and size it to fill the rest of the viewport, so there is no gap and
 *           no double scrollbar, regardless of how tall your navbar is.
 */
function useChatViewport(rootRef: React.RefObject<HTMLElement | null>) {
  const [viewport, setViewport] = useState<{ height: number; offsetTop: number; chatTop: number } | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    const desktopMql = window.matchMedia(DESKTOP_QUERY);
    let frame = 0;

    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const isDesktop = desktopMql.matches;
        const root = rootRef.current;
        // On desktop, distance from top of the document to where the chat begins (i.e. navbar height).
        const chatTop = isDesktop && root ? Math.max(0, root.getBoundingClientRect().top + window.scrollY) : 0;
        setViewport({
          height: Math.round(vv?.height ?? window.innerHeight),
          offsetTop: Math.round(vv?.offsetTop ?? 0),
          chatTop: Math.round(chatTop),
        });
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
    const prev = { htmlOverflow: html.style.overflow, bodyOverflow: body.style.overflow, bodyOverscroll: body.style.overscrollBehavior };
    const applyLock = () => {
      const lock = !desktopMql.matches;
      html.style.overflow = lock ? "hidden" : prev.htmlOverflow;
      body.style.overflow = lock ? "hidden" : prev.bodyOverflow;
      body.style.overscrollBehavior = lock ? "none" : prev.bodyOverscroll;
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
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      body.style.overscrollBehavior = prev.bodyOverscroll;
    };
  }, [rootRef]);

  return viewport;
}

/* ---------- icons ---------- */
function BackIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>;
}

function PaperJetIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 -mr-0.5">
      <path d="M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.843 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904l-18-8.5Z" />
      <path d="M6 12h15" />
    </svg>
  );
}

function RefreshIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M20 11a8 8 0 0 0-14.5-4.5M4 5v4h4M4 13a8 8 0 0 0 14.5 4.5M20 19v-4h-4"/></svg>;
}

function CalendarIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>;
}

function LockIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>;
}

function ChevronDownIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="m6 9 6 6 6-6"/></svg>;
}

function ChatIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/></svg>;
}

export default function SessionConversationPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const sessionId = params.sessionId;

  const [conversation, setConversation] = useState<ConversationDetails | null>(null);
  const [role, setRole] = useState<ParticipantRole | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [sending, setSending] = useState(false);
  const [changingMessaging, setChangingMessaging] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showJump, setShowJump] = useState(false);
  const [nowMs] = useState(() => Date.now());
  const [proposedStart, setProposedStart] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [rescheduleBusy, setRescheduleBusy] = useState(false);
  const [respondingProposalId, setRespondingProposalId] = useState("");
  const [showBookingMenu, setShowBookingMenu] = useState(false);
  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
  const [rescheduleSlots, setRescheduleSlots] = useState<RescheduleSlot[]>([]);
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState(false);
  const [rescheduleSlotsError, setRescheduleSlotsError] = useState("");
  const [confirmCancelBooking, setConfirmCancelBooking] = useState(false);
  const [cancellingBooking, setCancellingBooking] = useState(false);

  const rootRef = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const stickToBottomRef = useRef(true);
  // Adaptive polling state: when anything last happened in this chat, and the newest message we've seen.
  const lastActivityRef = useRef(Date.now());
  const lastSeenIdRef = useRef("");
  // The newest message id we have told the server is read, so we only call the read endpoint when something new arrives.
  const lastMarkedIdRef = useRef("");

  const viewport = useChatViewport(rootRef);

  const loadMessages = useCallback(async (conversationId: string, signal?: AbortSignal) => {
    const response = await fetch(`/api/student/conversations/${encodeURIComponent(conversationId)}/messages`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    });
    const body = (await response.json()) as MessagesResponse;
    setCurrentUserId(body.currentUserId ?? "");
    if (!response.ok) throw new Error(body.error || "Unable to load messages.");
    const next = Array.isArray(body.messages) ? body.messages : [];
    const newestId = next[next.length - 1]?.id ?? "";
    if (newestId !== lastSeenIdRef.current) {
      lastSeenIdRef.current = newestId;
      lastActivityRef.current = Date.now();
    }

    // Mark the conversation as read once the person can actually see the newest message
    // (tab is visible). This clears the unread badge in the inbox and sidebar.
    if (newestId && newestId !== lastMarkedIdRef.current && document.visibilityState === "visible") {
      lastMarkedIdRef.current = newestId;
      void fetch(`/api/student/messages/${encodeURIComponent(conversationId)}/read`, { method: "POST" })
        .then((readResponse) => {
          // Allow a retry on the next poll if the server rejected it.
          if (!readResponse.ok) {
            lastMarkedIdRef.current = "";
            return;
          }
          // Tell the sidebar to refresh its unread count immediately.
          window.dispatchEvent(new Event("txmate:messages-read"));
        })
        .catch(() => {
          lastMarkedIdRef.current = "";
        });
    }

    setMessages((current) => (current.length === next.length && current[current.length - 1]?.id === next[next.length - 1]?.id ? current : next));
  }, []);

  const loadConversation = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/student/sessions/${encodeURIComponent(sessionId)}/conversation`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    });
    const body = (await response.json()) as ConversationResponse;
    if (!response.ok || !body.conversation || !body.participantRole) {
      throw new Error(body.error || "Unable to load this session conversation.");
    }
    setConversation(body.conversation);
    setRole(body.participantRole);
    await loadMessages(body.conversation.id, signal);
  }, [sessionId, loadMessages]);


const refreshConversationDetails = useCallback(async () => {
  const response = await fetch(
    `/api/student/sessions/${encodeURIComponent(sessionId)}/conversation`,
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
  );

  const body = (await response.json()) as ConversationResponse;

  if (!response.ok || !body.conversation || !body.participantRole) {
    throw new Error(
      body.error || "Unable to refresh session details.",
    );
  }

  setConversation(body.conversation);
  setRole(body.participantRole);
}, [sessionId]);


  useEffect(() => {
    const controller = new AbortController();
    async function initialise() {
      setLoading(true);
      setError("");
      try {
        await loadConversation(controller.signal);
      } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Unable to load this conversation.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void initialise();
    return () => controller.abort();
  }, [loadConversation]);

  // Adaptive polling: fast while the chat is active, slower as it goes quiet, paused when the tab is hidden,
  // backs off after errors, and refreshes instantly when the person returns to the tab or comes back online.
  useEffect(() => {
    if (!conversation?.id) return;
    const conversationId = conversation.id;
    let timer: number | undefined;
    let failures = 0;
    let inFlight = false;
    let stopped = false;

    const nextDelay = () => {
      const idleMs = Date.now() - lastActivityRef.current;
      const base = idleMs < 60_000 ? 2_000 : idleMs < 5 * 60_000 ? 5_000 : 15_000;
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
        await Promise.all([
          loadMessages(conversationId),
          refreshConversationDetails(),
        ]);
        failures = 0;
      } catch {
        failures = Math.min(failures + 1, 4);
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
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
    };
  }, [conversation?.id, loadMessages, refreshConversationDetails]);

  // Keep the newest message in view when messages arrive OR the keyboard changes the viewport height.
  useEffect(() => {
    const element = listRef.current;
    if (element && stickToBottomRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages, loading, viewport?.height]);

  const items = useMemo(() => buildListItems(messages, currentUserId, nowMs), [messages, currentUserId, nowMs]);

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
    // If there's in-app history, go back; otherwise (opened from a link, new tab, refresh) fall back to the dashboard.
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/student/messages");
    }
  }

  function reload() {
    setError("");
    setLoading(true);
    void loadConversation()
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to reload the conversation."))
      .finally(() => setLoading(false));
  }

  async function sendMessage() {
    if (!conversation || sessionCancelled || !conversation.studentMessagingEnabled || !draft.trim() || sending) return;
    setSending(true);
    lastActivityRef.current = Date.now();
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/student/conversations/${encodeURIComponent(conversation.id)}/messages`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      const result = (await response.json()) as { message?: ChatMessage; error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to send this message.");
      setDraft("");
      stickToBottomRef.current = true;
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      if (result.message) {
        const sent = result.message;
        setMessages((current) => (current.some((item) => item.id === sent.id) ? current : [...current, sent]));
      }
      await loadMessages(conversation.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to send this message.");
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    if (window.matchMedia("(pointer: fine)").matches) {
      event.preventDefault();
      void sendMessage();
    }
  }

  async function toggleStudentMessaging() {
    if (!conversation || changingMessaging) return;
    const nextValue = !conversation.studentMessagingEnabled;
    setChangingMessaging(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/student/sessions/${encodeURIComponent(sessionId)}/conversation`, {
        method: "PATCH",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ studentMessagingEnabled: nextValue }),
      });
      const body = (await response.json()) as { message?: string; conversation?: { id: string; studentMessagingEnabled: boolean; updatedAt: string }; error?: string };
      if (!response.ok || !body.conversation) throw new Error(body.error || "Unable to update messaging.");
      const updated = body.conversation;
      setConversation((current) => (current ? { ...current, studentMessagingEnabled: updated.studentMessagingEnabled } : current));
      setNotice(body.message || "Messaging settings updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update messaging settings.");
    } finally {
      setChangingMessaging(false);
    }
  }

  async function submitReschedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  
    if (!conversation?.session || rescheduleBusy || !proposedStart) return;
  
    const selectedDate = new Date(proposedStart);
  
    if (Number.isNaN(selectedDate.getTime())) {
      setError("Choose a valid date and time.");
      return;
    }
  
    setRescheduleBusy(true);
    setError("");
    setNotice("");
  
    try {
      const response = await fetch(
        `/api/student/sessions/${encodeURIComponent(sessionId)}/reschedule`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            proposedStart: selectedDate.toISOString(),
            reason: rescheduleReason.trim(),
          }),
        },
      );
  
      const body = (await response.json()) as {
        message?: string;
        error?: string;
      };
  
      if (!response.ok) {
        throw new Error(body.error || "Unable to propose a new session time.");
      }
  
      setShowRescheduleForm(false);
      setProposedStart("");
      setRescheduleReason("");
      setNotice(body.message || "Rescheduling proposal sent.");
      await loadConversation();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to submit the rescheduling proposal.",
      );
    } finally {
      setRescheduleBusy(false);
    }
  }
  
  async function respondToReschedule(
    proposal: RescheduleProposal,
    action: "ACCEPTED" | "DECLINED",
  ) {
    if (respondingProposalId) return;
  
    setRespondingProposalId(proposal.id);
    setError("");
    setNotice("");
  
    try {
      const response = await fetch(
        `/api/student/sessions/${encodeURIComponent(sessionId)}/reschedule/${encodeURIComponent(proposal.id)}`,
        {
          method: "PATCH",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action }),
        },
      );
  
      const body = (await response.json()) as {
        message?: string;
        error?: string;
      };
  
      if (!response.ok) {
        throw new Error(body.error || "Unable to respond to this proposal.");
      }
  
      setNotice(body.message || "Your response has been recorded.");
      await loadConversation();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to respond to this proposal.",
      );
    } finally {
      setRespondingProposalId("");
    }
  }

  async function cancelBooking() {
    if (!conversation?.session || cancellingBooking) return;
  
    setCancellingBooking(true);
    setError("");
    setNotice("");
    setConfirmCancelBooking(false);
    setShowBookingMenu(false);
    setShowRescheduleForm(false);
  
    try {
      const response = await fetch(
        `/api/student/sessions/${encodeURIComponent(sessionId)}/cancel`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reason: "Cancelled from the session conversation.",
          }),
        },
      );
  
      const body = (await response.json()) as {
        message?: string;
        error?: string;
      };
  
      if (!response.ok) {
        throw new Error(body.error || "Unable to cancel this booking.");
      }
  
      setConversation((current) =>
        current?.session
          ? {
              ...current,
              session: {
                ...current.session,
                status: "CANCELLED",
              },
            }
          : current,
      );
  
      setNotice(
        body.message ||
          "Booking cancelled. Both participants have been notified.",
      );
  
      void loadConversation().catch(() => {});
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to cancel this booking.",
      );
    } finally {
      setCancellingBooking(false);
    }
  }

  useEffect(() => {
    if (!showRescheduleForm || !conversation?.session) return;
  
    const controller = new AbortController();
  
    async function loadRescheduleSlots() {
      setRescheduleSlotsLoading(true);
      setRescheduleSlotsError("");
      setRescheduleSlots([]);
      setProposedStart("");
  
      try {
        const response = await fetch(
          `/api/student/sessions/${encodeURIComponent(sessionId)}/reschedule`,
          {
            headers: { Accept: "application/json" },
            cache: "no-store",
            signal: controller.signal,
          },
        );
  
        const body = (await response.json()) as RescheduleSlotsResponse;
  
        if (!response.ok) {
          throw new Error(body.error || "Unable to load available times.");
        }
  
        setRescheduleSlots(Array.isArray(body.slots) ? body.slots : []);
      } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") return;
  
        setRescheduleSlotsError(
          cause instanceof Error
            ? cause.message
            : "Unable to load available times.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setRescheduleSlotsLoading(false);
        }
      }
    }
  
    void loadRescheduleSlots();
  
    return () => controller.abort();
  }, [showRescheduleForm, sessionId, conversation?.session?.id]);

  const sessionCancelled = /cancel/i.test(conversation?.session?.status ?? "");
  const messagingPaused = conversation !== null && (sessionCancelled || !conversation.studentMessagingEnabled);
  const fallbackCounterpart = role === "STUDENT" ? "Academic Mate" : role === "ACADEMIC_MATE" ? "Student" : "Session conversation";
  const displayName = conversation?.otherUserName || fallbackCounterpart;
  const avatarText = role === "STUDENT" ? "AM" : role === "ACADEMIC_MATE" ? "ST" : "TX";
  const messagingOpen = conversation?.studentMessagingEnabled ?? true;

  // CSS variables feed the responsive classes below (mobile uses the visual viewport; desktop uses the measured top offset).
  const rootStyle = {
    "--chat-vh": viewport ? `${viewport.height}px` : "100dvh",
    "--chat-vt": viewport ? `${viewport.offsetTop}px` : "0px",
    "--chat-top": viewport ? `${viewport.chatTop}px` : "4rem",
  } as CSSProperties;

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
      <div className="flex h-full w-full min-h-0 flex-col overflow-hidden bg-white sm:max-w-4xl sm:rounded-2xl sm:border sm:border-[#eadfd9] sm:shadow-[0_24px_80px_-32px_rgba(74,30,30,0.28)]">

        {/* ---------- header ---------- */}
        <header className="flex shrink-0 items-center gap-2.5 border-b border-[#eee5e0] bg-white px-2 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] sm:px-6 sm:py-4">
          <button
            type="button"
            onClick={goBack}
            aria-label="Go back"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 active:scale-95 focus-visible:outline-2 focus-visible:outline-[#7d1f2a]"
          >
            <BackIcon />
          </button>

          <div className="relative shrink-0">
            {conversation?.otherUserImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={conversation.otherUserImage} alt="" className="h-9 w-9 rounded-full border border-[#eadfd9] object-cover sm:h-10 sm:w-10" />
            ) : (
              <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7d1f2a]/10 text-xs font-bold text-[#7d1f2a] sm:h-10 sm:w-10 sm:text-sm">{avatarText}</span>
            )}
            <span aria-hidden="true" className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white ${messagingOpen ? "bg-emerald-500" : "bg-amber-500"}`} />
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold tracking-tight text-stone-900 sm:text-base">{displayName}</h1>
            <p className="truncate text-[11px] font-medium text-stone-500 sm:text-xs">
              {conversation?.courseName || "TXMate conversation"}
              {conversation && <span className="hidden text-stone-400 min-[400px]:inline"> · {messagingOpen ? "Messaging available" : "Messaging paused"}</span>}
            </p>
          </div>

          {role === "ACADEMIC_MATE" && conversation && (
            <button
              type="button"
              disabled={changingMessaging}
              onClick={() => void toggleStudentMessaging()}
              className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 sm:px-3 sm:py-2 ${
                conversation.studentMessagingEnabled ? "border border-stone-300 text-stone-700 hover:bg-stone-50" : "bg-[#7d1f2a] text-white hover:bg-[#651822]"
              }`}
            >
              {changingMessaging ? "Updating..." : conversation.studentMessagingEnabled ? "Pause" : "Reopen"}
            </button>
          )}

          <button
            type="button"
            disabled={loading || !conversation}
            onClick={() => conversation && void loadMessages(conversation.id).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to refresh messages."))}
            aria-label="Refresh messages"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 active:scale-95 focus-visible:outline-2 focus-visible:outline-[#7d1f2a] disabled:opacity-40"
          >
            <RefreshIcon />
          </button>
        </header>

       
        {/* ---------- session strip ---------- */}
        {conversation?.session && (
          <div className="flex shrink-0 items-center gap-2 border-b border-[#eee5e0] bg-[#fbf8f6] px-4 py-2 text-xs text-stone-600 sm:px-6">
            <span className="text-[#7d1f2a]">
              <CalendarIcon />
            </span>

            <p className="min-w-0 flex-1 truncate text-[11px] sm:text-xs">
              <span className="font-semibold text-stone-800">
                {formatSessionDate(conversation.session.scheduledStart)}
              </span>
              <span className="text-stone-500">
                {" "}· ends {formatClock(conversation.session.scheduledEnd)}
              </span>
            </p>

            {/cancel/i.test(conversation.session.status ?? "") ? (
              <span className="shrink-0 rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-semibold text-stone-600">
                Cancelled
              </span>
            ) : conversation.session.status === "SCHEDULED" &&
              new Date(conversation.session.scheduledStart).getTime() > nowMs ? (
              <div className="relative shrink-0">
                <button
                  type="button"
                  aria-label="Booking options"
                  aria-haspopup="menu"
                  aria-expanded={showBookingMenu}
                  onClick={() => setShowBookingMenu((open) => !open)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-stone-600 hover:bg-stone-200/70 focus-visible:outline-2 focus-visible:outline-[#7d1f2a]"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-5 w-5"
                  >
                    <circle cx="5" cy="12" r="1.8" />
                    <circle cx="12" cy="12" r="1.8" />
                    <circle cx="19" cy="12" r="1.8" />
                  </svg>
                </button>

                {showBookingMenu && (
                  <div
                    role="menu"
                    aria-label="Booking options"
                    className="absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-xl border border-[#eadfd9] bg-white py-1 shadow-lg"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setShowBookingMenu(false);
                        setShowRescheduleForm(true);
                      }}
                      className="block w-full px-3 py-2.5 text-left text-xs font-medium text-stone-700 hover:bg-stone-50"
                    >
                      Reschedule session
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setShowBookingMenu(false);
                        setConfirmCancelBooking(true);
                      }}
                      className="block w-full px-3 py-2.5 text-left text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      Cancel booking
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* ---------- rescheduling UI ---------- */}
        {conversation?.session && conversation.session.status === "SCHEDULED" && !/cancel/i.test(conversation.session.status ?? "") && (
     <>
        {conversation.session.rescheduleProposals?.filter((proposal) => proposal.status === "PENDING").map((proposal) => (
          <div key={proposal.id} className="shrink-0 border-b border-[#eee5e0] bg-white px-4 py-3 sm:px-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-stone-800">Rescheduling proposal</p>
                <p className="mt-1 text-xs text-stone-600">{proposal.proposedByName || "A participant"} proposed {formatSessionDate(proposal.proposedStart)}</p>
                {proposal.reason && <p className="mt-1 break-words text-xs text-stone-500">{proposal.reason}</p>}
                <p className="mt-1 text-[11px] text-stone-500">Ends {formatClock(proposal.proposedEnd)}</p>
              </div>
              {proposal.respondingUserId === currentUserId && (
                <div className="flex shrink-0 flex-col gap-1.5">
                  <button type="button" disabled={respondingProposalId === proposal.id} onClick={() => void respondToReschedule(proposal, "ACCEPTED")} className="rounded-lg bg-[#7d1f2a] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#651822] disabled:opacity-50">
                    {respondingProposalId === proposal.id ? "Saving..." : "Accept"}
                  </button>
                  <button type="button" disabled={respondingProposalId === proposal.id} onClick={() => void respondToReschedule(proposal, "DECLINED")} className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50">Decline</button>
                </div>
              )}
            </div>
          </div>
        ))}

        {showRescheduleForm && (
          <div className="shrink-0 border-b border-[#eee5e0] bg-[#fbf8f6] px-4 py-3 sm:px-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-stone-900">Propose a new session time</h2>
              <button type="button" onClick={() => { setShowRescheduleForm(false); setProposedStart(""); setRescheduleReason(""); setRescheduleSlotsError(""); setError(""); }} className="rounded-lg px-2 py-1 text-xs font-medium text-stone-500 hover:bg-stone-200/70 hover:text-stone-800">Close</button>
            </div>

            <form onSubmit={submitReschedule} className="space-y-3">
              <div>
                <p className="mb-2 text-xs font-medium text-stone-700">Choose an available start time</p>
                {rescheduleSlotsLoading ? (
                  <p className="rounded-lg border border-stone-200 bg-white px-3 py-4 text-xs text-stone-500">Loading available slots...</p>
                ) : rescheduleSlotsError ? (
                  <div className="rounded-lg border border-red-200 bg-white px-3 py-3">
                    <p className="text-xs text-red-700">{rescheduleSlotsError}</p>
                    <button type="button" onClick={() => { setShowRescheduleForm(false); setProposedStart(""); setTimeout(() => setShowRescheduleForm(true), 0); }} className="mt-2 text-xs font-semibold text-[#7d1f2a] hover:underline">Try again</button>
                  </div>
                ) : rescheduleSlots.length === 0 ? (
                  <p className="rounded-lg border border-stone-200 bg-white px-3 py-4 text-xs text-stone-500">No available slots were found for the next 30 days.</p>
                ) : (
                  <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-stone-200 bg-white p-2">
                    {rescheduleSlots.map((slot) => (
                      <label key={slot.start} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 transition ${proposedStart === slot.start ? "border-[#7d1f2a] bg-[#7d1f2a]/5" : "border-stone-200 hover:border-stone-400"}`}>
                        <input type="radio" name="reschedule-start" value={slot.start} checked={proposedStart === slot.start} onChange={() => setProposedStart(slot.start)} className="mt-0.5 accent-[#7d1f2a]" />
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-stone-800">{slot.localDate}</span>
                          <span className="mt-0.5 block text-xs text-stone-600">{slot.localStart} - {slot.localEnd}</span>
                          <span className="mt-0.5 block text-[10px] text-stone-400">{slot.timezone}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-[11px] text-stone-500">Only available slots matching the Academic Mate's schedule are listed. The existing booking changes only after the other participant accepts.</p>
              </div>

              <div>
                <label htmlFor="reschedule-reason" className="mb-1 block text-xs font-medium text-stone-700">Reason (optional)</label>
                <textarea id="reschedule-reason" value={rescheduleReason} onChange={(event) => setRescheduleReason(event.target.value)} maxLength={500} rows={2} placeholder="Why does the session need to move?" className="w-full resize-y rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-[#7d1f2a] focus:ring-2 focus:ring-[#7d1f2a]/10" />
              </div>

              <div className="flex justify-end">
                <button type="submit" disabled={rescheduleBusy || rescheduleSlotsLoading || !proposedStart || !!rescheduleSlotsError || rescheduleSlots.length === 0} className="rounded-lg bg-[#7d1f2a] px-4 py-2 text-xs font-semibold text-white hover:bg-[#651822] disabled:cursor-not-allowed disabled:opacity-50">
                  {rescheduleBusy ? "Sending proposal..." : "Send proposal"}
                </button>
              </div>
            </form>
          </div>
        )}
      </>
    )}

        {/* ---------- cancel booking confirmation ---------- */}
        {confirmCancelBooking && conversation?.session && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setConfirmCancelBooking(false);
              }
            }}
          >
            <section
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="cancel-booking-title"
              aria-describedby="cancel-booking-description"
              className="w-full max-w-sm rounded-2xl border border-[#eadfd9] bg-white p-5 shadow-2xl"
            >
              <h2
                id="cancel-booking-title"
                className="text-base font-semibold text-stone-900"
              >
                Cancel this booking?
              </h2>

              <p
                id="cancel-booking-description"
                className="mt-2 text-sm leading-relaxed text-stone-600"
              >
                This will cancel the session and its original request.
                Both participants will be notified. You will need to submit
                a new request to arrange another session.
              </p>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={cancellingBooking}
                  onClick={() => setConfirmCancelBooking(false)}
                  className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                >
                  Keep booking
                </button>

                <button
                  type="button"
                  disabled={cancellingBooking}
                  onClick={() => void cancelBooking()}
                  className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {cancellingBooking ? "Cancelling..." : "Cancel booking"}
                </button>
              </div>
            </section>
          </div>
        )}
        
        {/* ---------- banners ---------- */}
        {error && (
          <div role="alert" className="flex shrink-0 items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
            <span>{error}</span>
            <button type="button" onClick={reload} className="shrink-0 font-bold underline">Retry</button>
          </div>
        )}
        {notice && <p role="status" className="shrink-0 border-b border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">{notice}</p>}

        {/* ---------- messages ---------- */}
        <div className="relative min-h-0 flex-1 bg-stone-50/50">
          <div
            ref={listRef}
            onScroll={handleScroll}
            role="log"
            aria-live="polite"
            aria-label="Conversation messages"
            className="h-full space-y-1 overflow-y-auto overscroll-contain px-3 py-4 [-webkit-overflow-scrolling:touch] sm:px-6 sm:py-6"
          >
            {loading ? (
              <div className="flex flex-col gap-3 py-4" aria-busy="true">
                <p className="sr-only">Loading conversation...</p>
                {["w-2/3 self-start", "w-1/2 self-end", "w-3/5 self-start", "w-2/5 self-end"].map((classes, index) => (
                  <div key={index} className={`h-10 animate-pulse rounded-xl bg-stone-200/60 ${classes}`} />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="flex h-full min-h-48 flex-col items-center justify-center px-4 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-stone-400 shadow-sm ring-1 ring-stone-200"><ChatIcon /></span>
                <p className="mt-3 text-xs font-bold text-stone-800 sm:text-sm">No messages yet</p>
                <p className="mt-0.5 max-w-xs text-[11px] leading-relaxed text-stone-500 sm:text-xs">Start the conversation by discussing meeting locations and session prep.</p>
              </div>
            ) : (
              items.map((item) => {
                if (item.kind === "day") {
                  return (
                    <div key={item.key} className="my-4 flex justify-center first:mt-0">
                      <span className="rounded-full border border-[#eee5e0] bg-white px-3 py-1 text-[11px] font-semibold text-stone-500 shadow-sm">
                        {item.label}
                      </span>
                    </div>
                  );
                }
                const { message, own, startsGroup, endsGroup } = item;
                return (
                  <div key={message.id} className={`flex ${own ? "justify-end" : "justify-start"} ${startsGroup ? "mt-3 first:mt-0" : "mt-1"}`}>
                    <div
                      className={`max-w-[85%] px-3 py-1.5 shadow-sm sm:max-w-[70%] sm:px-3.5 sm:py-2 ${
                        own
                          ? `bg-[#7d1f2a] text-white ${endsGroup ? "rounded-2xl rounded-br-md" : "rounded-2xl"}`
                          : `border border-stone-200/80 bg-white text-stone-900 ${endsGroup ? "rounded-2xl rounded-bl-md" : "rounded-2xl"}`
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[13.5px] leading-snug sm:text-[13px]">{message.body}</p>
                      <time dateTime={message.createdAt} className={`mt-0.5 block text-right text-[9.5px] tabular-nums ${own ? "text-white/70" : "text-stone-400"}`}>
                        {formatClock(message.createdAt)}
                      </time>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {showJump && !loading && (
            <button
              type="button"
              onClick={jumpToLatest}
              className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-stone-700 shadow-lg transition-colors hover:bg-stone-50 active:scale-95 focus-visible:outline-2 focus-visible:outline-[#7d1f2a]"
            >
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
                {sessionCancelled
                  ? "This session has been cancelled. Messaging is closed. Submit a new session request to arrange another session."
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
                    window.setTimeout(() => {
                      if (listRef.current && stickToBottomRef.current) {
                        listRef.current.scrollTop = listRef.current.scrollHeight;
                      }
                    }, 300);
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
                  className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full bg-[#7d1f2a] text-white shadow-sm transition-colors hover:bg-[#651822] active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7d1f2a] disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400"
                >
                  {sending ? (
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5 animate-spin"><path d="M12 3a9 9 0 1 0 9 9"/></svg>
                  ) : (
                    <PaperJetIcon />
                  )}
                </button>
              </div>
              <div className="mt-1.5 hidden min-h-4 items-center justify-between gap-2 px-1 text-[11px] text-stone-400 sm:flex">
                <span>Enter to send &middot; Shift + Enter for newline</span>
                {draft.length > MAX_LENGTH - 500 && (
                  <span className={`ml-auto font-medium tabular-nums ${draft.length >= MAX_LENGTH ? "text-red-600" : "text-stone-400"}`}>
                    {draft.length}/{MAX_LENGTH}
                  </span>
                )}
              </div>
              {draft.length > MAX_LENGTH - 500 && (
                <p className={`mt-1 px-1 text-right text-[11px] font-medium tabular-nums sm:hidden ${draft.length >= MAX_LENGTH ? "text-red-600" : "text-stone-400"}`}>
                  {draft.length}/{MAX_LENGTH}
                </p>
              )}
            </>
          )}
        </form>
      </div>
    </main>
  );
}