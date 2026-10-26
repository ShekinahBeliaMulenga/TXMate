/**
 * Who cancelled a session or arrangement, and when/why — one pure helper shared by the
 * server serializers and the UI so every screen tells the same, transparent story.
 */
export type CancellationActor = "STUDENT" | "ACADEMIC_MATE" | "UNKNOWN";

export type CancellationInfo = {
  /** "SESSION": one occurrence was cancelled. "ARRANGEMENT": the whole arrangement was. */
  scope: "SESSION" | "ARRANGEMENT";
  by: CancellationActor;
  /** Display name of whoever cancelled; null when it was not recorded (older records). */
  byName: string | null;
  /** True when the person looking at it is the one who cancelled. */
  byViewer: boolean;
  at: string | null;
  reason: string | null;
};

export type CancellationInput = {
  viewerUserId: string;
  studentUserId: string;
  studentName: string | null;
  mateUserId: string;
  mateName: string | null;
  arrangementType: "ONE_TIME" | "RECURRING";
  arrangementStatus: string;
  /** The occurrence being shown, if any. */
  session?: {
    status: string;
    cancelledAt: Date | string | null;
    cancelledByUserId: string | null;
    cancellationReason: string | null;
  } | null;
  arrangement: {
    cancelledAt: Date | string | null;
    cancelledByUserId: string | null;
    cancellationReason: string | null;
  };
};

/** Placeholder reasons that were stored automatically and say nothing to the reader. */
const GENERIC_REASONS = new Set(["cancelled from the session conversation."]);
const ARRANGEMENT_REASON_PREFIX = /^arrangement cancelled by [^:]*(?::\s*)?/i;

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function cleanReason(reason: string | null | undefined): string | null {
  const text = (reason ?? "").replace(ARRANGEMENT_REASON_PREFIX, "").trim().replace(/\.$/, "");
  if (!text || GENERIC_REASONS.has(`${text.toLowerCase()}.`) || GENERIC_REASONS.has(text.toLowerCase())) return null;
  return text;
}

/** Returns null unless the session (or its whole arrangement) is actually cancelled. */
export function buildCancellation(input: CancellationInput): CancellationInfo | null {
  const arrangementCancelled = input.arrangementStatus === "CANCELLED";
  const session = input.session ?? null;
  const sessionCancelled = session?.status === "CANCELLED";
  if (!arrangementCancelled && !sessionCancelled) return null;

  const sessionAt = toIso(session?.cancelledAt);
  const arrangementAt = toIso(input.arrangement.cancelledAt);
  // A recurring arrangement that was cancelled as a whole reads as an arrangement
  // cancellation, unless this occurrence had already been cancelled on its own earlier.
  const ownSessionCancel = sessionCancelled && sessionAt !== null && sessionAt !== arrangementAt
    && !/^arrangement cancelled by/i.test(session?.cancellationReason ?? "");
  const scope: CancellationInfo["scope"] =
    arrangementCancelled && input.arrangementType === "RECURRING" && !ownSessionCancel ? "ARRANGEMENT" : "SESSION";

  const useSession = scope === "SESSION" && sessionCancelled;
  const actorId = (useSession ? session?.cancelledByUserId : null) ?? input.arrangement.cancelledByUserId
    ?? (useSession ? null : session?.cancelledByUserId ?? null);
  const by: CancellationActor =
    actorId === input.studentUserId ? "STUDENT" : actorId === input.mateUserId ? "ACADEMIC_MATE" : "UNKNOWN";

  return {
    scope,
    by,
    byName: by === "STUDENT" ? input.studentName : by === "ACADEMIC_MATE" ? input.mateName : null,
    byViewer: actorId !== null && actorId === input.viewerUserId,
    at: (useSession ? sessionAt : arrangementAt) ?? sessionAt ?? arrangementAt,
    reason: cleanReason(useSession ? session?.cancellationReason : input.arrangement.cancellationReason)
      ?? cleanReason(input.arrangement.cancellationReason),
  };
}

const ROLE_LABEL: Record<CancellationActor, string> = {
  STUDENT: "Student",
  ACADEMIC_MATE: "Academic Mate",
  UNKNOWN: "",
};

/** "Cancelled by you" / "Cancelled by Jane (Academic Mate)" / "Cancelled". */
export function cancellationHeadline(info: CancellationInfo, subject: "session" | "arrangement" | "" = ""): string {
  const what = subject ? ` ${subject}` : "";
  if (info.byViewer) return `You cancelled this${what || " session"}`;
  if (info.by === "UNKNOWN") return subject ? `This ${subject} was cancelled` : "Cancelled";
  const who = info.byName ? `${info.byName} (${ROLE_LABEL[info.by]})` : `the ${ROLE_LABEL[info.by]}`;
  return subject ? `${who} cancelled this ${subject}` : `Cancelled by ${who}`;
}

/** Short form for chips and list rows: "Cancelled by you", "Cancelled by Jane". */
export function cancellationShort(info: CancellationInfo): string {
  if (info.byViewer) return "Cancelled by you";
  if (info.by === "UNKNOWN") return "Cancelled";
  return `Cancelled by ${info.byName ?? ROLE_LABEL[info.by]}`;
}

/** Full sentence for detail views, with scope, date and reason. */
export function cancellationDetail(info: CancellationInfo, formatDate: (iso: string) => string): string {
  const subject = info.scope === "ARRANGEMENT" ? "arrangement" : "session";
  const parts = [cancellationHeadline(info, subject)];
  if (info.at) parts[0] += ` on ${formatDate(info.at)}`;
  parts[0] += ".";
  if (info.reason) parts.push(`Reason: ${info.reason}.`);
  return parts.join(" ");
}
