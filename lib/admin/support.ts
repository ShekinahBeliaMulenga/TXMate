import { dayRangeFilter } from "./date-range";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "./audit";
import type { AdminContext } from "./guard";
import { canAccessUniversity, isPlatformWide } from "./permissions";
import type { RequestContext } from "./request-context";
import {
  CASE_CATEGORIES,
  CASE_PAGE_SIZE,
  CASE_PRIORITIES,
  CASE_STATUSES,
  CASE_TEXT_MAX,
  CASE_TITLE_MAX,
  needsResolution,
  type CaseCategory,
  type CasePage,
  type CasePriority,
  type CaseRow,
  type CaseStatus,
} from "./support-types";

type Fail = { ok: false; status: 400 | 403 | 404 | 409; error: string };
const fail = (status: 400 | 403 | 404 | 409, error: string): Fail => ({ ok: false, status, error });

/** Cases with no university belong to platform admins; everyone else sees their universities' cases. */
function scopeWhere(admin: AdminContext) {
  return isPlatformWide(admin.scope) ? {} : { universityId: { in: [...admin.universityIds] } };
}

const SELECT = {
  id: true,
  title: true,
  description: true,
  category: true,
  priority: true,
  status: true,
  resolution: true,
  createdByName: true,
  createdAt: true,
  resolvedAt: true,
  assignedAdminId: true,
  university: { select: { code: true } },
  subjectUser: { select: { name: true, email: true } },
  assignedAdmin: { select: { user: { select: { name: true } } } },
  notes: { orderBy: { createdAt: "asc" as const }, select: { id: true, authorName: true, body: true, createdAt: true } },
} as const;

type CaseRecord = {
  id: string; title: string; description: string; category: CaseCategory; priority: CasePriority; status: CaseStatus;
  resolution: string | null; createdByName: string; createdAt: Date; resolvedAt: Date | null; assignedAdminId: string | null;
  university: { code: string } | null; subjectUser: { name: string; email: string } | null;
  assignedAdmin: { user: { name: string } } | null;
  notes: Array<{ id: string; authorName: string; body: string; createdAt: Date }>;
};

function toRow(admin: AdminContext, record: CaseRecord): CaseRow {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    category: record.category,
    priority: record.priority,
    status: record.status,
    university: record.university?.code ?? null,
    subject: record.subjectUser,
    assignedTo: record.assignedAdmin?.user.name ?? null,
    assignedToMe: record.assignedAdminId === admin.adminId,
    resolution: record.resolution,
    createdByName: record.createdByName,
    createdAt: record.createdAt.toISOString(),
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
    notes: record.notes.map((note) => ({ ...note, createdAt: note.createdAt.toISOString() })),
  };
}

export async function listCases(admin: AdminContext, input: { status: string; q: string; mine: boolean; page: number; from?: string; to?: string }): Promise<CasePage> {
  const page = Math.max(1, Math.min(10000, Math.floor(input.page) || 1));
  const q = input.q.trim().slice(0, 100);
  const status = (CASE_STATUSES as readonly string[]).includes(input.status) ? (input.status as CaseStatus) : null;
  const opened = dayRangeFilter(input.from, input.to);
  const where = {
    ...scopeWhere(admin),
    ...(opened ? { createdAt: opened } : {}),
    ...(status ? { status } : input.status === "active" ? { status: { in: ["OPEN" as const, "IN_PROGRESS" as const] } } : {}),
    ...(input.mine ? { assignedAdminId: admin.adminId } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { subjectUser: { is: { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }] } } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.supportCase.count({ where }),
    prisma.supportCase.findMany({ where, orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }], skip: (page - 1) * CASE_PAGE_SIZE, take: CASE_PAGE_SIZE, select: SELECT }),
  ]);
  return { items: rows.map((row: CaseRecord) => toRow(admin, row)), page, pageCount: Math.max(1, Math.ceil(total / CASE_PAGE_SIZE)), total };
}

export async function countActiveCases(admin: AdminContext): Promise<number> {
  return prisma.supportCase.count({ where: { ...scopeWhere(admin), status: { in: ["OPEN", "IN_PROGRESS"] } } });
}

export async function createCase(
  admin: AdminContext,
  input: { title: string; description: string; category: string; priority: string; subjectEmail: string; universityId: string; context: RequestContext },
): Promise<{ ok: true; message: string } | Fail> {
  const title = input.title.replace(/\s+/g, " ").trim();
  const description = input.description.trim();
  if (title.length < 3 || title.length > CASE_TITLE_MAX) return fail(400, `The title must be 3 to ${CASE_TITLE_MAX} characters.`);
  if (description.length < 5 || description.length > CASE_TEXT_MAX) return fail(400, `The description must be 5 to ${CASE_TEXT_MAX} characters.`);
  if (!(CASE_CATEGORIES as readonly string[]).includes(input.category)) return fail(400, "Choose a category.");
  if (!(CASE_PRIORITIES as readonly string[]).includes(input.priority)) return fail(400, "Choose a priority.");

  return prisma.$transaction(async (tx) => {
    let universityId: string | null = input.universityId || null;
    let subjectUserId: string | null = null;
    const email = input.subjectEmail.trim().toLowerCase();
    if (email) {
      const subject = await tx.user.findUnique({ where: { email }, select: { id: true, adminProfile: { select: { id: true } }, studentProfile: { select: { universityId: true } }, academicMate: { select: { universityId: true } } } });
      const subjectUniversity = subject?.studentProfile?.universityId ?? subject?.academicMate?.universityId ?? null;
      if (!subject || subject.adminProfile || !subjectUniversity || !canAccessUniversity(admin.scope, subjectUniversity)) return fail(404, "No student or Academic Mate with that email in your universities.");
      subjectUserId = subject.id;
      universityId = subjectUniversity;
    }
    if (!universityId && !isPlatformWide(admin.scope)) return fail(400, "Choose the university this case belongs to, or give the person’s email.");
    if (universityId) {
      if (!canAccessUniversity(admin.scope, universityId)) return fail(403, "You do not have access to that university.");
      const exists = await tx.university.findUnique({ where: { id: universityId }, select: { id: true } });
      if (!exists) return fail(404, "University not found.");
    }
    const created = await tx.supportCase.create({
      data: { title, description, category: input.category as CaseCategory, priority: input.priority as CasePriority, universityId, subjectUserId, createdByName: admin.name },
      select: { id: true },
    });
    await recordAudit(tx, { actor: admin, action: "SUPPORT_CASE_CREATED", targetType: "SUPPORT_CASE", targetId: created.id, universityId, summary: `Opened case: ${title}`, metadata: { category: input.category, priority: input.priority }, context: input.context });
    return { ok: true as const, message: "Case opened." };
  });
}

export type CaseChange = { status?: string; priority?: string; assign?: "me" | "none"; resolution?: string; note?: string };

/** Changes one case. Resolving or closing needs a written outcome; every change is audited and notes are append-only. */
export async function updateCase(admin: AdminContext, input: { caseId: string; change: CaseChange; context: RequestContext }): Promise<{ ok: true; message: string } | Fail> {
  const { change } = input;
  if (change.status !== undefined && !(CASE_STATUSES as readonly string[]).includes(change.status)) return fail(400, "Unknown status.");
  if (change.priority !== undefined && !(CASE_PRIORITIES as readonly string[]).includes(change.priority)) return fail(400, "Unknown priority.");
  const note = change.note?.trim();
  if (note !== undefined && (note.length < 1 || note.length > CASE_TEXT_MAX)) return fail(400, `A note must be 1 to ${CASE_TEXT_MAX} characters.`);
  const resolution = change.resolution?.trim();
  if (resolution !== undefined && resolution.length > CASE_TEXT_MAX) return fail(400, `The outcome can be at most ${CASE_TEXT_MAX} characters.`);

  return prisma.$transaction(async (tx) => {
    const current = await tx.supportCase.findUnique({ where: { id: input.caseId }, select: { id: true, title: true, status: true, universityId: true, resolution: true } });
    if (!current || (current.universityId ? !canAccessUniversity(admin.scope, current.universityId) : !isPlatformWide(admin.scope))) return fail(404, "Case not found.");

    const nextStatus = (change.status as CaseStatus | undefined) ?? current.status;
    const outcome = resolution ?? current.resolution ?? "";
    if (needsResolution(nextStatus) && !needsResolution(current.status) && outcome.length < 5) return fail(400, "Write what was decided (at least 5 characters) before resolving or closing a case.");

    const reopening = needsResolution(current.status) && !needsResolution(nextStatus);
    await tx.supportCase.update({
      where: { id: current.id },
      data: {
        ...(change.status !== undefined ? { status: nextStatus, resolvedAt: needsResolution(nextStatus) ? new Date() : null } : {}),
        ...(change.priority !== undefined ? { priority: change.priority as CasePriority } : {}),
        ...(change.assign === "me" ? { assignedAdminId: admin.adminId } : change.assign === "none" ? { assignedAdminId: null } : {}),
        ...(resolution !== undefined ? { resolution: resolution || null } : {}),
        ...(reopening ? { resolution: null } : {}),
      },
    });
    if (note) await tx.supportCaseNote.create({ data: { caseId: current.id, authorName: admin.name, body: note } });

    const parts = [
      change.status !== undefined && change.status !== current.status ? `status ${nextStatus.toLowerCase().replace("_", " ")}` : null,
      change.priority !== undefined ? `priority ${change.priority.toLowerCase()}` : null,
      change.assign === "me" ? "assigned to themselves" : change.assign === "none" ? "unassigned" : null,
      note ? "added a note" : null,
    ].filter(Boolean);
    await recordAudit(tx, { actor: admin, action: "SUPPORT_CASE_UPDATED", targetType: "SUPPORT_CASE", targetId: current.id, universityId: current.universityId, summary: `Case “${current.title}”: ${parts.join(", ") || "updated"}`, metadata: { status: nextStatus }, context: input.context });
    return { ok: true as const, message: "Saved." };
  });
}
