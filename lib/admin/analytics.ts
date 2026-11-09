import { prisma } from "@/lib/prisma";
import type { AdminContext } from "./guard";
import { canAccessUniversity, isPlatformWide, universityScopeFilter } from "./permissions";
import { bucketByWeek, share } from "./analytics-math";
import type { AnalyticsReport, Kpi, RangeWeeks, Slice, WeekPoint } from "./analytics-types";

const DAY = 24 * 3600 * 1000;
const LABEL = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lusaka" });
const REQUEST_STATUSES = ["REQUESTED", "ACCEPTED", "DECLINED", "CANCELLED", "EXPIRED"] as const;
import { ADMIN_SESSION_STATES, ADMIN_SESSION_STATE_LABEL, sessionStateWhere } from "./session-state";
const words = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");

/** The session states that count when working out the completion rate: everything that has ended and is settled or overdue. */
export const COMPLETION_STATES = ["COMPLETED", "NO_SHOW", "CANCELLED", "NEEDS_REVIEW", "NO_RESPONSE"] as const;

/**
 * Real counts only, for a chosen number of weeks and, optionally, one university. Every figure is
 * compared with the equal period before it. Rolling seven-day windows ending now; nothing is estimated.
 */
export async function getAnalytics(admin: AdminContext, input: { weeks: RangeWeeks; universityId: string | null }): Promise<AnalyticsReport> {
  const universityId = input.universityId && canAccessUniversity(admin.scope, input.universityId) ? input.universityId : null;
  const scope = universityId ? { universityId } : universityScopeFilter(admin.scope);
  const sScope = { request: { is: scope } };
  const now = Date.now();
  const span = input.weeks * 7 * DAY;
  const start = new Date(now - span);
  const prevStart = new Date(now - 2 * span);
  const current = { gte: start, lt: new Date(now) };
  const previous = { gte: prevStart, lt: start };

  const [universityOptions, universities] = await Promise.all([
    prisma.university.findMany({ where: isPlatformWide(admin.scope) ? {} : { id: { in: [...admin.universityIds] } }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.university.findMany({
      where: universityId ? { id: universityId } : isPlatformWide(admin.scope) ? {} : { id: { in: [...admin.universityIds] } },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, _count: { select: { studentProfiles: true, academicMateProfiles: true } } },
    }),
  ]);

  const period = (range: { gte: Date; lt: Date }) =>
    Promise.all([
      prisma.studentProfile.count({ where: { createdAt: range, ...scope } }),
      prisma.academicMateProfile.count({ where: { createdAt: range, ...scope } }),
      prisma.mateRequest.count({ where: { createdAt: range, ...scope } }),
      prisma.tutoringSession.count({ where: { status: "COMPLETED", completedAt: range, ...sScope } }),
      prisma.mateRequest.count({ where: { status: "ACCEPTED", createdAt: range, ...scope } }),
      prisma.mateRequest.count({ where: { status: { in: ["DECLINED", "EXPIRED"] }, createdAt: range, ...scope } }),
      // Sessions whose scheduled end fell in the period, sorted by the same states the Tutoring page shows.
      ...COMPLETION_STATES.map((state) => prisma.tutoringSession.count({ where: { AND: [sessionStateWhere(state, new Date(now)) as never, { scheduledEnd: range }, sScope] } })),
    ]);
  const [cur, prev] = await Promise.all([period(current), period(previous)]);
  const rate = share;
  const ended = (row: number[]) => row.slice(6).reduce((sum, value) => sum + value, 0);

  const kpis: Kpi[] = [
    { key: "students", label: "New students", current: cur[0], previous: prev[0] },
    { key: "mates", label: "New Academic Mates", current: cur[1], previous: prev[1] },
    { key: "requests", label: "Requests made", current: cur[2], previous: prev[2] },
    { key: "completed", label: "Sessions completed", current: cur[3], previous: prev[3] },
  ];

  // Four queries for the whole chart instead of four per week: fetch only the dates, then count them per week.
  const [studentDates, mateDates, requestDates, completedDates] = await Promise.all([
    prisma.studentProfile.findMany({ where: { createdAt: current, ...scope }, select: { createdAt: true } }),
    prisma.academicMateProfile.findMany({ where: { createdAt: current, ...scope }, select: { createdAt: true } }),
    prisma.mateRequest.findMany({ where: { createdAt: current, ...scope }, select: { createdAt: true } }),
    prisma.tutoringSession.findMany({ where: { status: "COMPLETED", completedAt: current, ...sScope }, select: { completedAt: true } }),
  ]);
  const bucket = (dates: Array<Date | null>) => bucketByWeek(dates, start, input.weeks);
  const [studentWeeks, mateWeeks, requestWeeks, completedWeeks] = [
    bucket(studentDates.map((row: { createdAt: Date }) => row.createdAt)),
    bucket(mateDates.map((row: { createdAt: Date }) => row.createdAt)),
    bucket(requestDates.map((row: { createdAt: Date }) => row.createdAt)),
    bucket(completedDates.map((row: { completedAt: Date | null }) => row.completedAt)),
  ];
  const weeks: WeekPoint[] = studentWeeks.map((students, index) => ({
    label: LABEL.format(new Date(start.getTime() + index * 7 * DAY)),
    students,
    mates: mateWeeks[index],
    requests: requestWeeks[index],
    completed: completedWeeks[index],
  }));

  const [requestCounts, sessionCounts, ratingRows, ratingAvg, courseGroups, requestsByUniversity] = await Promise.all([
    Promise.all(REQUEST_STATUSES.map((status) => prisma.mateRequest.count({ where: { status, createdAt: current, ...scope } }))),
    Promise.all(ADMIN_SESSION_STATES.map((state) => prisma.tutoringSession.count({ where: { AND: [sessionStateWhere(state, new Date()) as never, { scheduledStart: current }, sScope] } }))),
    Promise.all([1, 2, 3, 4, 5].map((rating) => prisma.review.count({ where: { rating, hiddenAt: null, createdAt: current, session: { is: sScope } } }))),
    prisma.review.aggregate({ where: { hiddenAt: null, createdAt: current, session: { is: sScope } }, _avg: { rating: true } }),
    prisma.mateRequest.groupBy({ by: ["offeringId"], where: { createdAt: current, ...scope }, _count: { _all: true } }),
    Promise.all(universities.map((university: { id: string }) => prisma.mateRequest.count({ where: { universityId: university.id, createdAt: current } }))),
  ]);

  const offerings = courseGroups.length
    ? await prisma.mateOffering.findMany({ where: { id: { in: courseGroups.map((group: { offeringId: string }) => group.offeringId) } }, select: { id: true, course: { select: { code: true, name: true } } } })
    : [];
  const byOffering = new Map<string, { code: string; name: string }>(offerings.map((offering: { id: string; course: { code: string; name: string } }) => [offering.id, offering.course]));
  const perCourse = new Map<string, { course: string; name: string; requests: number }>();
  for (const group of courseGroups) {
    const course = byOffering.get(group.offeringId);
    if (!course) continue;
    const entry = perCourse.get(course.code) ?? { course: course.code, name: course.name, requests: 0 };
    entry.requests += group._count._all;
    perCourse.set(course.code, entry);
  }
  const slices = (names: readonly string[], values: number[]): Slice[] => names.map((name, index) => ({ label: words(name), value: values[index] }));

  return {
    weeksShown: input.weeks,
    universityId,
    universityOptions,
    kpis,
    weeks,
    acceptance: { current: rate(cur[4], cur[5]), previous: rate(prev[4], prev[5]), answered: cur[4] + cur[5] },
    completion: {
      current: rate(cur[6], ended(cur) - cur[6]),
      previous: rate(prev[6], ended(prev) - prev[6]),
      ended: ended(cur),
      parts: COMPLETION_STATES.map((state, index) => ({ label: ADMIN_SESSION_STATE_LABEL[state], value: cur[6 + index] })),
    },
    rating: { average: ratingAvg._avg.rating === null ? null : Number(ratingAvg._avg.rating.toFixed(2)), count: ratingRows.reduce((sum: number, value: number) => sum + value, 0), distribution: ratingRows },
    requestMix: slices(REQUEST_STATUSES, requestCounts),
    sessionMix: ADMIN_SESSION_STATES.map((state, index) => ({ label: ADMIN_SESSION_STATE_LABEL[state], value: sessionCounts[index] })),
    topCourses: [...perCourse.values()].sort((a, b) => b.requests - a.requests).slice(0, 8),
    byUniversity: universities.map((university: { code: string; name: string; _count: { studentProfiles: number; academicMateProfiles: number } }, index: number) => ({ code: university.code, name: university.name, students: university._count.studentProfiles, mates: university._count.academicMateProfiles, requests: requestsByUniversity[index] })),
  };
}
