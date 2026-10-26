/**
 * Decides which sessions should pop a prompt in front of the user right now.
 * Pure: no database, no clock. The server feeds it sessions, the rules decide.
 */
import { availableActions, toMs, type LifecycleSnapshot, type Role } from "@/lib/session-lifecycle-rules";
import { reviewPromptOpen } from "@/lib/reviews";

/** Stop prompting this long after the scheduled end, so an ignored session cannot nag forever. */
export const PROMPT_WINDOW_MS = 48 * 60 * 60 * 1000;

export type SessionPromptKind = "STUDENT_ATTENDANCE" | "STUDENT_COMPLETION" | "STUDENT_REVIEW" | "MATE_ATTENDANCE" | "MATE_COMPLETION";

export type SessionPrompt = {
  /** Stable identity: the same prompt keeps the same key between refreshes. */
  key: string;
  kind: SessionPromptKind;
  /** Student prompts, and an Academic Mate session that is not in a group. */
  sessionId: string | null;
  groupId: string | null;
  courseCode: string;
  courseName: string;
  /** The Academic Mate's name (student prompts) or the student's name (single-student prompts). */
  otherName: string;
  /** How many students the prompt covers (always 1 for students). */
  count: number;
  scheduledStart: string;
  scheduledEnd: string;
  /** Where "Open" goes. */
  url: string;
};

export type PromptInput = {
  id: string;
  groupId: string | null;
  role: Role;
  snapshot: LifecycleSnapshot;
  courseCode: string;
  courseName: string;
  otherName: string;
  scheduledStart: string;
  scheduledEnd: string;
  /** Set for a completed session the student has not reviewed yet. */
  reviewOf?: { completedAt: string };
};

const sessionUrl = (id: string) => `/student/sessions?session=${encodeURIComponent(id)}`;
const groupUrl = (id: string) => `/student/sessions?group=${encodeURIComponent(id)}`;

export function buildPrompts(inputs: PromptInput[], now: number): SessionPrompt[] {
  const prompts: SessionPrompt[] = [];
  const buckets = new Map<string, PromptInput[]>();

  for (const input of inputs) {
    if (input.reviewOf) {
      if (input.role === "STUDENT" && reviewPromptOpen(input.reviewOf.completedAt, now)) {
        prompts.push({
          key: `STUDENT_REVIEW:${input.id}`, kind: "STUDENT_REVIEW", sessionId: input.id, groupId: null,
          courseCode: input.courseCode, courseName: input.courseName, otherName: input.otherName,
          count: 1, scheduledStart: input.scheduledStart, scheduledEnd: input.scheduledEnd, url: sessionUrl(input.id),
        });
      }
      continue;
    }
    const end = toMs(input.scheduledEnd);
    if (end === null || now > end + PROMPT_WINDOW_MS) continue;
    if (input.role === "STUDENT") {
      const actions = availableActions(input.snapshot, "STUDENT", now);
      const kind = actions.attendance ? "STUDENT_ATTENDANCE" : actions.completion ? "STUDENT_COMPLETION" : null;
      if (kind) {
        prompts.push({
          key: `${kind}:${input.id}`, kind, sessionId: input.id, groupId: null,
          courseCode: input.courseCode, courseName: input.courseName, otherName: input.otherName,
          count: 1, scheduledStart: input.scheduledStart, scheduledEnd: input.scheduledEnd, url: sessionUrl(input.id),
        });
      }
    } else {
      const bucketKey = input.groupId ?? `solo:${input.id}`;
      buckets.set(bucketKey, [...(buckets.get(bucketKey) ?? []), input]);
    }
  }

  for (const [bucketKey, members] of buckets) {
    const attendance = members.filter((m) => availableActions(m.snapshot, "ACADEMIC_MATE", now).attendance);
    const completion = members.filter((m) => availableActions(m.snapshot, "ACADEMIC_MATE", now).completion);
    const first = members[0];
    const grouped = first.groupId !== null;
    const kind = attendance.length > 0 ? "MATE_ATTENDANCE" : completion.length > 0 ? "MATE_COMPLETION" : null;
    if (!kind) continue;
    const covered = kind === "MATE_ATTENDANCE" ? attendance : completion;
    prompts.push({
      key: `${kind}:${bucketKey}`, kind,
      sessionId: grouped ? null : first.id, groupId: first.groupId,
      courseCode: first.courseCode, courseName: first.courseName,
      otherName: covered.length === 1 ? covered[0].otherName : "",
      count: covered.length, scheduledStart: first.scheduledStart, scheduledEnd: first.scheduledEnd,
      url: grouped ? groupUrl(first.groupId as string) : sessionUrl(first.id),
    });
  }

  // Questions about a live session come before a request to review a finished one.
  const rank = (p: SessionPrompt) => (p.kind === "STUDENT_REVIEW" ? 1 : 0);
  return prompts.sort((a, b) => rank(a) - rank(b) || (toMs(a.scheduledStart) ?? 0) - (toMs(b.scheduledStart) ?? 0) || a.key.localeCompare(b.key));
}
