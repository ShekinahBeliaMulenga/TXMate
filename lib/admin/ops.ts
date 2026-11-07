import { dayRangeFilter } from "./date-range";
import { ADMIN_SESSION_STATES, adminSessionState, isAdminSessionState, sessionStateWhere } from "./session-state";
import { prisma } from "@/lib/prisma";
import { countOpenDisputes, sessionScope } from "./disputes";
import type { AdminContext } from "./guard";
import { isPlatformWide, roleHasPermission, universityScopeFilter } from "./permissions";
import {
  ARRANGEMENT_STATUSES,
  DIRECTORY_PAGE_SIZE,
  REQUEST_STATUSES,
  statusLabel,
  type CountMap,
  type DashboardMetrics,
  type DirectoryKind,
  type DirectoryPage,
  type DirectoryRow,
  type HealthReport,
  type IntegrityCheck,
} from "./ops-types";

const WHEN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lusaka" });
const fmt = (date: Date | null | undefined) => (date ? WHEN.format(date) : null);

/** One count per status. Small fixed enums, so this stays simple and fully typed. */
async function countEach<T extends string>(statuses: readonly T[], count: (status: T) => Promise<number>): Promise<CountMap> {
  const values = await Promise.all(statuses.map((status) => count(status)));
  return Object.fromEntries(statuses.map((status, index) => [status, values[index]]));
}

/** Sessions whose time has passed and whose attendance has not been settled. */
function attendanceOutstandingWhere(now: Date) {
  return {
    scheduledEnd: { lt: now },
    status: { in: ["SCHEDULED" as const, "IN_PROGRESS" as const] },
    OR: [{ attendance: { is: null } }, { attendance: { is: { status: { in: ["PENDING" as const, "STUDENT_CHECKED_IN" as const] } } } }],
  };
}

/** Sessions with confirmed attendance that nobody has marked complete yet. */
function completionOutstandingWhere(now: Date) {
  return {
    scheduledEnd: { lt: now },
    completedAt: null,
    status: { in: ["SCHEDULED" as const, "IN_PROGRESS" as const] },
    attendance: { is: { status: "CONFIRMED" as const } },
  };
}

/** Every figure here is a real count, limited to the universities this admin may see. */
export async function getDashboardMetrics(admin: AdminContext): Promise<DashboardMetrics> {
  const now = new Date();
  const week = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const day = new Date(now.getTime() - 24 * 3600 * 1000);
  const scope = universityScopeFilter(admin.scope);
  const sScope = sessionScope(admin);
  const platform = isPlatformWide(admin.scope);

  const [studentStatus, mateStatus, verification, offerings, requests, sessions, arrangementsActive, attendance, completion, disputes, newStudents, newMates, admins, adminActions, failed, health] = await Promise.all([
    countEach(["ACTIVE", "SUSPENDED", "GRADUATED", "WITHDRAWN"] as const, (status) => prisma.studentProfile.count({ where: { status, ...scope } })),
    countEach(["ACTIVE", "SUSPENDED", "INACTIVE"] as const, (status) => prisma.academicMateProfile.count({ where: { status, ...scope } })),
    countEach(["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"] as const, (verificationStatus) => prisma.academicMateProfile.count({ where: { verificationStatus, ...scope } })),
    countEach(["ACTIVE", "INACTIVE", "SUSPENDED"] as const, (status) => prisma.mateOffering.count({ where: { status, ...scope } })),
    countEach(REQUEST_STATUSES, (status) => prisma.mateRequest.count({ where: { status, ...scope } })),
    countEach(ADMIN_SESSION_STATES, (state) => prisma.tutoringSession.count({ where: { AND: [sessionStateWhere(state, now) as never, sScope] } })),
    prisma.mateRequest.count({ where: { arrangementStatus: "ACTIVE", ...scope } }),
    prisma.tutoringSession.count({ where: { AND: [attendanceOutstandingWhere(now), sScope] } }),
    prisma.tutoringSession.count({ where: { AND: [completionOutstandingWhere(now), sScope] } }),
    countOpenDisputes(admin),
    prisma.studentProfile.count({ where: { createdAt: { gte: week }, ...scope } }),
    prisma.academicMateProfile.count({ where: { createdAt: { gte: week }, ...scope } }),
    platform ? prisma.adminProfile.count() : Promise.resolve(null),
    roleHasPermission(admin.role, "audit:view")
      ? prisma.adminAuditLog.count({ where: { createdAt: { gte: day }, ...(platform ? {} : { universityId: { in: admin.universityIds } }) } })
      : Promise.resolve(null),
    platform && roleHasPermission(admin.role, "system:view") ? prisma.notificationDelivery.count({ where: { status: "FAILED" } }) : Promise.resolve(null),
    roleHasPermission(admin.role, "system:view") ? getIntegrityChecks(admin) : Promise.resolve([] as IntegrityCheck[]),
  ]);

  const sum = (map: CountMap) => Object.values(map).reduce((a, b) => a + b, 0);
  return {
    users: { total: sum(studentStatus) + sum(mateStatus), students: sum(studentStatus), mates: sum(mateStatus), admins, newStudents7d: newStudents, newMates7d: newMates },
    studentStatus,
    mateStatus,
    verification,
    offerings,
    requests,
    sessions,
    arrangementsActive,
    outstanding: { attendance, completion, disputes },
    adminActions24h: adminActions,
    failedDeliveries: failed,
    integrityIssues: health.filter((check) => check.count > 0).length,
  };
}

// ---------------------------------------------------------------- directories

const NAME_SELECT = { select: { user: { select: { name: true } } } } as const;

export type DirectoryInput = { kind: DirectoryKind; status: string; q: string; page: number; from?: string; to?: string };

/** Search + status filter + numbered pages for requests and sessions, always scoped to the admin's universities. */
export async function listDirectory(admin: AdminContext, input: DirectoryInput): Promise<DirectoryPage> {
  const page = Math.max(1, Math.min(10000, Math.floor(input.page) || 1));
  const q = input.q.trim().slice(0, 100);
  const skip = (page - 1) * DIRECTORY_PAGE_SIZE;

  const textFilter = q
    ? {
        OR: [
          { studentProfile: { is: { user: { is: { name: { contains: q, mode: "insensitive" as const } } } } } },
          { studentProfile: { is: { studentId: { contains: q, mode: "insensitive" as const } } } },
          { offering: { is: { academicMateProfile: { is: { user: { is: { name: { contains: q, mode: "insensitive" as const } } } } } } } },
          { offering: { is: { course: { is: { OR: [{ code: { contains: q, mode: "insensitive" as const } }, { name: { contains: q, mode: "insensitive" as const } }] } } } } },
        ],
      }
    : {};

  // Requests are dated by when they were made; sessions by when they start.
  const dateRange = dayRangeFilter(input.from, input.to);

  const requestSelect = {
    id: true,
    status: true,
    arrangementType: true,
    arrangementStatus: true,
    message: true,
    createdAt: true,
    respondedAt: true,
    requestedStart: true,
    recurrenceEveryWeeks: true,
    arrangementCancellationReason: true,
    university: { select: { code: true } },
    studentProfile: { select: { studentId: true, user: { select: { name: true } } } },
    offering: { select: { course: { select: { code: true, name: true } }, academicMateProfile: NAME_SELECT } },
  } as const;

  if (input.kind === "requests") {
    const statusOk = (REQUEST_STATUSES as readonly string[]).includes(input.status);
    const arrangementOk = (ARRANGEMENT_STATUSES as readonly string[]).includes(input.status.replace(/^ARR_/, ""));
    const where = {
      ...universityScopeFilter(admin.scope),
      ...textFilter,
      ...(dateRange ? { createdAt: dateRange } : {}),
      ...(statusOk ? { status: input.status as (typeof REQUEST_STATUSES)[number] } : {}),
      ...(input.status.startsWith("ARR_") && arrangementOk ? { arrangementStatus: input.status.replace(/^ARR_/, "") as (typeof ARRANGEMENT_STATUSES)[number] } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.mateRequest.count({ where }),
      prisma.mateRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: DIRECTORY_PAGE_SIZE, select: requestSelect }),
    ]);
    const items: DirectoryRow[] = rows.map((row) => ({
      id: row.id,
      title: `${row.offering.course.code} ${row.offering.course.name}`,
      student: row.studentProfile.user.name,
      mate: row.offering.academicMateProfile.user.name,
      university: row.university.code,
      status: statusLabel(row.status),
      detail: `${statusLabel(row.arrangementType)} · arrangement ${statusLabel(row.arrangementStatus).toLowerCase()}`,
      when: fmt(row.createdAt),
      facts: [
        { label: "Student ID", value: row.studentProfile.studentId },
        { label: "Requested", value: fmt(row.createdAt) ?? "—" },
        { label: "Answered", value: fmt(row.respondedAt) ?? "Not answered yet" },
        { label: "Requested start", value: fmt(row.requestedStart) ?? "Not specified" },
        ...(row.recurrenceEveryWeeks ? [{ label: "Repeats", value: `Every ${row.recurrenceEveryWeeks} ${row.recurrenceEveryWeeks === 1 ? "week" : "weeks"}` }] : []),
        ...(row.message ? [{ label: "Student’s message", value: row.message }] : []),
        ...(row.arrangementCancellationReason ? [{ label: "Cancellation reason", value: row.arrangementCancellationReason }] : []),
      ],
    }));
    return { items, page, pageCount: Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE)), total };
  }

  const sessionWhere = {
    AND: [
      sessionScope(admin),
      ...(q ? [{ request: { is: textFilter } }] : []),
      ...(isAdminSessionState(input.status) ? [sessionStateWhere(input.status, new Date()) as never] : []),
      ...(dateRange ? [{ scheduledStart: dateRange }] : []),
    ],
  };
  const [total, rows] = await Promise.all([
    prisma.tutoringSession.count({ where: sessionWhere }),
    prisma.tutoringSession.findMany({
      where: sessionWhere,
      orderBy: { scheduledStart: "desc" },
      skip,
      take: DIRECTORY_PAGE_SIZE,
      select: {
        id: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        meetingLocation: true,
        completedAt: true,
        cancelledAt: true,
        cancellationReason: true,
        completionDisputeReason: true,
        studentCompletionConfirmedAt: true,
        mateCompletionConfirmedAt: true,
        completionDisputedAt: true,
        completionReviewRequiredAt: true,
        attendance: { select: { status: true, studentAttended: true, mateConfirmedStudentAttended: true, disputeReason: true, resolvedAt: true } },
        review: { select: { rating: true } },
        request: { select: { status: true, arrangementStatus: true, arrangementType: true, university: { select: { code: true } }, studentProfile: { select: { studentId: true, user: { select: { name: true } } } }, offering: { select: { course: { select: { code: true, name: true } }, academicMateProfile: NAME_SELECT } } } },
      },
    }),
  ]);
  const nowMs = Date.now();
  const yesNo = (value: boolean | null | undefined) => (value === null || value === undefined ? "No answer yet" : value ? "Attended" : "Did not attend");
  const items: DirectoryRow[] = rows.map((row) => {
    const stateLabel = adminSessionState({
      status: row.status,
      scheduledStart: row.scheduledStart,
      scheduledEnd: row.scheduledEnd,
      requestStatus: row.request.status,
      arrangementStatus: row.request.arrangementStatus,
      completedAt: row.completedAt,
      studentCompletionConfirmedAt: row.studentCompletionConfirmedAt,
      mateCompletionConfirmedAt: row.mateCompletionConfirmedAt,
      completionDisputedAt: row.completionDisputedAt,
      completionReviewRequiredAt: row.completionReviewRequiredAt,
      attendance: row.attendance,
    }, nowMs);
    return {
    id: row.id,
    title: `${row.request.offering.course.code} ${row.request.offering.course.name}`,
    student: row.request.studentProfile.user.name,
    mate: row.request.offering.academicMateProfile.user.name,
    university: row.request.university.code,
    status: stateLabel,
    detail: row.meetingLocation,
    when: fmt(row.scheduledStart),
    facts: [
      { label: "Student ID", value: row.request.studentProfile.studentId },
      { label: "Starts", value: fmt(row.scheduledStart) ?? "—" },
      { label: "Ends", value: fmt(row.scheduledEnd) ?? "—" },
      { label: "Type", value: statusLabel(row.request.arrangementType) },
      { label: "Attendance", value: row.attendance ? statusLabel(row.attendance.status) : "No record yet" },
      { label: "Student says", value: yesNo(row.attendance?.studentAttended) },
      { label: "Mate says", value: yesNo(row.attendance?.mateConfirmedStudentAttended) },
      ...(row.attendance?.disputeReason ? [{ label: "Attendance problem", value: row.attendance.disputeReason }] : []),
      ...(row.completionDisputeReason ? [{ label: "Completion problem", value: row.completionDisputeReason }] : []),
      ...(row.completedAt ? [{ label: "Completed", value: fmt(row.completedAt) ?? "" }] : []),
      ...(row.cancelledAt ? [{ label: "Cancelled", value: `${fmt(row.cancelledAt)}${row.cancellationReason ? ` · ${row.cancellationReason}` : ""}` }] : []),
      ...(row.review ? [{ label: "Review", value: `${row.review.rating} out of 5` }] : []),
    ],
    };
  });
  return { items, page, pageCount: Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE)), total };
}

// ---------------------------------------------------------------- integrity & health

const EXAMPLE_LIMIT = 5;

/**
 * Real consistency checks over the data an admin can see. Each one explains the problem, counts it,
 * lists a few readable examples and says what to do. Nothing here is a placeholder: a check that
 * finds nothing reports zero.
 */
export async function getIntegrityChecks(admin: AdminContext): Promise<IntegrityCheck[]> {
  const now = new Date();
  const scope = universityScopeFilter(admin.scope);
  const sScope = sessionScope(admin);

  const noDepartment = { departmentId: null, ...scope };
  const noYears = { years: { none: {} }, ...scope };
  const acceptedNoSessions = { status: "ACCEPTED" as const, arrangementStatus: { in: ["ACTIVE" as const, "PENDING" as const] }, sessions: { none: {} }, ...scope };
  const staleScheduled = { AND: [{ status: "SCHEDULED" as const, scheduledEnd: { lt: new Date(now.getTime() - 48 * 3600 * 1000) } }, sScope] };
  const cancelledWithFuture = { arrangementStatus: "CANCELLED" as const, sessions: { some: { status: "SCHEDULED" as const, scheduledStart: { gt: now } } }, ...scope };
  const verifiedNoOffering = { verificationStatus: "VERIFIED" as const, status: "ACTIVE" as const, offerings: { none: {} }, ...scope };

  const [a, b, c, d, e, f] = await Promise.all([
    prisma.programme.count({ where: noDepartment }),
    prisma.programme.count({ where: noYears }),
    prisma.mateRequest.count({ where: acceptedNoSessions }),
    prisma.tutoringSession.count({ where: staleScheduled }),
    prisma.mateRequest.count({ where: cancelledWithFuture }),
    prisma.academicMateProfile.count({ where: verifiedNoOffering }),
  ]);

  const [exA, exB, exC, exD, exE, exF] = await Promise.all([
    a ? prisma.programme.findMany({ where: noDepartment, take: EXAMPLE_LIMIT, orderBy: { name: "asc" }, select: { name: true, university: { select: { code: true } } } }) : [],
    b ? prisma.programme.findMany({ where: noYears, take: EXAMPLE_LIMIT, orderBy: { name: "asc" }, select: { name: true, university: { select: { code: true } } } }) : [],
    c ? prisma.mateRequest.findMany({ where: acceptedNoSessions, take: EXAMPLE_LIMIT, orderBy: { createdAt: "desc" }, select: { studentProfile: { select: { user: { select: { name: true } } } }, offering: { select: { course: { select: { code: true } } } } } }) : [],
    d ? prisma.tutoringSession.findMany({ where: staleScheduled, take: EXAMPLE_LIMIT, orderBy: { scheduledEnd: "asc" }, select: { scheduledEnd: true, request: { select: { offering: { select: { course: { select: { code: true } } } } } } } }) : [],
    e ? prisma.mateRequest.findMany({ where: cancelledWithFuture, take: EXAMPLE_LIMIT, select: { studentProfile: { select: { user: { select: { name: true } } } }, offering: { select: { course: { select: { code: true } } } } } }) : [],
    f ? prisma.academicMateProfile.findMany({ where: verifiedNoOffering, take: EXAMPLE_LIMIT, select: { user: { select: { name: true } } } }) : [],
  ]);

  return [
    {
      id: "programmes-without-department",
      title: "Programmes with no department",
      explanation: "Students choose school, then department, then programme when they sign up. A programme without a department cannot be picked.",
      count: a,
      action: "Open Academic structure and assign each one a department.",
      href: "/admin/structure",
      examples: exA.map((row) => `${row.university.code} · ${row.name}`),
    },
    {
      id: "programmes-without-years",
      title: "Programmes with no years",
      explanation: "A programme needs at least one year of study before a student can finish choosing it.",
      count: b,
      action: "Open Academic structure and set the programme’s length.",
      href: "/admin/structure",
      examples: exB.map((row) => `${row.university.code} · ${row.name}`),
    },
    {
      id: "accepted-without-sessions",
      title: "Accepted requests with no sessions",
      explanation: "The Academic Mate accepted, but no session was ever created, so the student has nothing booked.",
      count: c,
      action: "Open Tutoring, find the request and contact both people.",
      href: "/admin/tutoring",
      examples: exC.map((row) => `${row.studentProfile.user.name} · ${row.offering.course.code}`),
    },
    {
      id: "stale-scheduled-sessions",
      title: "Sessions still “Scheduled” two days after they ended",
      explanation: "Nobody confirmed attendance or completion, so the session never reached a final state.",
      count: d,
      action: "Open Tutoring, filter by Scheduled and look at the oldest.",
      href: "/admin/tutoring",
      examples: exD.map((row) => `${row.request.offering.course.code} · ended ${fmt(row.scheduledEnd)}`),
    },
    {
      id: "cancelled-with-future-sessions",
      title: "Cancelled arrangements that still have upcoming sessions",
      explanation: "The arrangement was cancelled, but sessions in the future are still scheduled.",
      count: e,
      action: "Open Tutoring and check these sessions with the people involved.",
      href: "/admin/tutoring",
      examples: exE.map((row) => `${row.studentProfile.user.name} · ${row.offering.course.code}`),
    },
    {
      id: "verified-without-offering",
      title: "Verified Academic Mates with no offering",
      explanation: "They are verified but teach nothing, so students will never find them.",
      count: f,
      action: "No action needed unless the mate asks for help; they can add an offering from their profile.",
      examples: exF.map((row) => row.user.name),
    },
  ];
}

export async function getHealthReport(admin: AdminContext): Promise<HealthReport> {
  const started = Date.now();
  let ok = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    ok = false;
  }
  const latency = ok ? Date.now() - started : null;
  const checks = await getIntegrityChecks(admin);

  let deliveries: HealthReport["deliveries"] = null;
  if (isPlatformWide(admin.scope)) {
    const channels = await prisma.notificationDelivery.findMany({ where: { status: { in: ["FAILED", "PENDING"] } }, distinct: ["channel"], select: { channel: true } });
    deliveries = await Promise.all(
      channels.map(async ({ channel }) => {
        const [failed, pending, recent] = await Promise.all([
          prisma.notificationDelivery.count({ where: { channel, status: "FAILED" } }),
          prisma.notificationDelivery.count({ where: { channel, status: "PENDING" } }),
          prisma.notificationDelivery.findMany({ where: { channel, status: "FAILED" }, orderBy: { updatedAt: "desc" }, take: 3, select: { updatedAt: true, failureReason: true } }),
        ]);
        return { channel: statusLabel(channel), failed, pending, examples: recent.map((row) => ({ when: fmt(row.updatedAt) ?? "", reason: row.failureReason ?? "No reason recorded" })) };
      }),
    );
  }
  return { database: { ok, latencyMs: latency }, checks, deliveries, generatedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------- lists used by the console

export type OutstandingKind = "attendance" | "completion";

/** Sessions that ended but are not settled, oldest first, so the longest-waiting come up first. */
export async function listOutstanding(admin: AdminContext, kind: OutstandingKind, take = 10) {
  const now = new Date();
  const where = { AND: [kind === "attendance" ? attendanceOutstandingWhere(now) : completionOutstandingWhere(now), sessionScope(admin)] };
  const [total, rows] = await Promise.all([
    prisma.tutoringSession.count({ where }),
    prisma.tutoringSession.findMany({
      where,
      orderBy: { scheduledEnd: "asc" },
      take,
      select: {
        scheduledEnd: true,
        request: { select: { university: { select: { code: true } }, studentProfile: { select: { user: { select: { name: true } } } }, offering: { select: { course: { select: { code: true } }, academicMateProfile: NAME_SELECT } } } },
      },
    }),
  ]);
  return {
    total,
    items: rows.map((row) => ({
      course: row.request.offering.course.code,
      student: row.request.studentProfile.user.name,
      mate: row.request.offering.academicMateProfile.user.name,
      university: row.request.university.code,
      ended: fmt(row.scheduledEnd) ?? "",
    })),
  };
}

export async function listRecentReviews(admin: AdminContext, take = 10) {
  const where = { session: { is: sessionScope(admin) } };
  const [total, rows] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      select: { rating: true, comment: true, createdAt: true, reviewerUser: { select: { name: true } }, mateProfile: { select: { user: { select: { name: true } } } } },
    }),
  ]);
  return { total, items: rows.map((row) => ({ rating: row.rating, comment: row.comment, reviewer: row.reviewerUser.name, mate: row.mateProfile.user.name, when: fmt(row.createdAt) ?? "" })) };
}
