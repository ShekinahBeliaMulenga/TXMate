import { prisma } from "@/lib/prisma";
import { listAudit } from "./audit-log";
import { AUDIT_ACTION_LABEL } from "./audit-types";
import { listAdmins } from "./admins";
import { CONSOLE_COMMANDS, CONSOLE_MAX_LINE, commandKey, parseCommand, type ConsoleLine, type ConsoleReply } from "./console-parse";
import { listDisputes, resolveDispute } from "./disputes";
import type { AdminContext } from "./guard";
import { getNavBadges } from "./nav-badges";
import { ADMIN_NAV, navItemsFor } from "./nav";
import { ADMIN_SESSION_STATES } from "./session-state";
import { getDashboardMetrics, getHealthReport, listDirectory, listOutstanding, listRecentReviews } from "./ops";
import { ARRANGEMENT_STATUSES, REQUEST_STATUSES, statusLabel } from "./ops-types";
import { ADMIN_ROLE_LABEL, isPlatformWide, roleHasPermission, universityScopeFilter } from "./permissions";
import type { RequestContext } from "./request-context";
import { getAnalytics } from "./analytics";
import { listCases } from "./support";
import { listUniversities } from "./universities";
import { changeAccountStatus, listUsers } from "./users";
import { NOTE_MAX, NOTE_MIN } from "./dispute-types";

const out = (text: string, href?: string): ConsoleLine => ({ kind: "out", text, href });
const row = (cells: string[], href?: string): ConsoleLine => ({ kind: "out", text: cells.join("  "), cells, href });
const err = (text: string): ConsoleLine => ({ kind: "err", text });
const muted = (text: string): ConsoleLine => ({ kind: "muted", text });
const head = (text: string): ConsoleLine => ({ kind: "head", text });
const warn = (text: string): ConsoleLine => ({ kind: "warn", text });

const WHEN = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lusaka" });

/** Shows a count map as one line per status, e.g. "Active 12". */
const counts = (title: string, map: Record<string, number>): ConsoleLine[] => [head(title), ...Object.entries(map).map(([key, value]) => row([statusLabel(key), String(value)]))];

function pickStatus(arg: string | undefined, allowed: readonly string[]): { ok: true; value: string | null } | { ok: false; line: ConsoleLine } {
  if (!arg) return { ok: true, value: null };
  const value = arg.toUpperCase().replace(/-/g, "_");
  if (allowed.includes(value)) return { ok: true, value };
  return { ok: false, line: err(`"${arg}" is not a status. Use one of: ${allowed.map((item) => item.toLowerCase()).join(", ")}.`) };
}

/** Takes the last quoted or trailing text as the reason: everything after the fixed arguments. */
function reasonFrom(args: string[], fixed: number): string {
  return args.slice(fixed).join(" ").trim();
}

/**
 * Runs one console command for an admin. Every command re-checks the permission it needs on the
 * server, so the catalogue shown in the browser is only a convenience.
 *
 * Reading commands run straight away. The three that change data (user suspend, user activate,
 * dispute resolve) need a written reason and a second step: the first call returns a plain-language
 * description and a token, and nothing changes until the same line is sent again with that token.
 * They then use the same functions, permission checks, transactions and audit entries as the pages.
 */
export async function runConsoleCommand(admin: AdminContext, line: string, options: { confirmToken?: string | null; context: RequestContext }): Promise<ConsoleReply> {
  if (line.length > CONSOLE_MAX_LINE) return { lines: [err(`That command is too long (the limit is ${CONSOLE_MAX_LINE} characters).`)] };
  const parsed = parseCommand(line);
  if (!parsed) return { lines: [] };
  const { key, args } = commandKey(parsed);
  const info = CONSOLE_COMMANDS.find((command) => command.name === key);
  if (!info) {
    const hint = parsed.name === "user" || parsed.name === "dispute" ? `Did you mean one of these? ${CONSOLE_COMMANDS.filter((command) => command.name.startsWith(parsed.name)).map((command) => command.usage).join("  |  ")}` : "Type ? to see what you can run.";
    return { lines: [err(`Unknown command: ${parsed.name}`), muted(hint)] };
  }
  if (!roleHasPermission(admin.role, info.permission)) return { lines: [err(`Your role (${ADMIN_ROLE_LABEL[admin.role]}) is not allowed to run ${key}.`)] };

  const scope = universityScopeFilter(admin.scope);

  switch (key) {
    case "help":
      return {
        lines: [
          head("Commands you can run"),
          ...CONSOLE_COMMANDS.filter((command) => roleHasPermission(admin.role, command.permission)).map((command) => ({ kind: "out" as const, text: `${command.usage}  ${command.summary}`, cells: [command.usage, command.summary] })),
          muted("Up and down arrows recall earlier commands. Tab completes. Ctrl+L clears. Anything that changes data asks you to confirm first."),
        ],
      };

    case "whoami": {
      const where = isPlatformWide(admin.scope) ? "all universities" : admin.universityIds.length ? `${admin.universityIds.length} ${admin.universityIds.length === 1 ? "university" : "universities"}` : "no universities";
      return { lines: [out(`${admin.name} <${admin.email}>`), out(`${ADMIN_ROLE_LABEL[admin.role]} with access to ${where}`)] };
    }

    case "dashboard": {
      const m = await getDashboardMetrics(admin);
      return {
        lines: [
          head("People"),
          row(["Students", String(m.users.students)]),
          row(["Academic Mates", String(m.users.mates)]),
          ...(m.users.admins !== null ? [row(["Admins", String(m.users.admins)])] : []),
          row(["New students, 7 days", String(m.users.newStudents7d)]),
          row(["New mates, 7 days", String(m.users.newMates7d)]),
          ...counts("Students by status", m.studentStatus),
          ...counts("Mates by status", m.mateStatus),
          ...counts("Mate verification", m.verification),
          ...counts("Offerings", m.offerings),
          ...counts("Requests", m.requests),
          row(["Active arrangements", String(m.arrangementsActive)]),
          ...counts("Sessions", m.sessions),
          head("Outstanding"),
          row(["Attendance not settled", String(m.outstanding.attendance)]),
          row(["Completion not confirmed", String(m.outstanding.completion)]),
          row(["Sessions needing a decision", String(m.outstanding.disputes)]),
        ],
      };
    }

    case "queue": {
      const badges = await getNavBadges(admin);
      const lines: ConsoleLine[] = [];
      if (roleHasPermission(admin.role, "verification:review")) lines.push(row(["Pending verifications", String(badges.verification)], "/admin/academic-mates"));
      if (roleHasPermission(admin.role, "disputes:view")) lines.push(row(["Sessions needing a decision", String(badges.disputes)], "/admin/disputes"));
      return { lines: lines.length ? lines : [muted("Nothing to show for your role.")] };
    }

    case "goto": {
      const target = (args.join(" ") || "").toLowerCase();
      const items = navItemsFor(admin.role);
      if (!target) return { lines: [err("Say which page: goto <page>"), muted(`Pages you can open: ${items.map((item) => item.id).join(", ")}`)] };
      const match = items.find((item) => item.id === target || item.label.toLowerCase() === target) ?? items.find((item) => item.id.startsWith(target) || item.label.toLowerCase().startsWith(target));
      if (!match) {
        const exists = ADMIN_NAV.some((item) => item.id.startsWith(target));
        return { lines: [err(exists ? "Your role cannot open that page." : `There is no page called "${target}".`), muted(`Pages you can open: ${items.map((item) => item.id).join(", ")}`)] };
      }
      return { lines: [muted(`Opening ${match.label}`)], navigate: match.href };
    }

    case "health": {
      const report = await getHealthReport(admin);
      return {
        lines: [
          row(["Database", report.database.ok ? `reachable${report.database.latencyMs !== null ? `, ${report.database.latencyMs} ms` : ""}` : "NOT reachable"]),
          ...(report.deliveries === null ? [muted("Notification delivery is shown to platform admins only.")] : report.deliveries.length === 0 ? [row(["Notification delivery", "no failed or waiting deliveries"])] : report.deliveries.map((channel) => row([`${channel.channel} delivery`, `${channel.failed} failed, ${channel.pending} waiting`], "/admin/health"))),
          row(["Data checks needing attention", String(report.checks.filter((check) => check.count > 0).length)], "/admin/health"),
        ],
      };
    }

    case "integrity": {
      const report = await getHealthReport(admin);
      return { lines: report.checks.map((check) => row([check.title, check.count === 0 ? "all clear" : `${check.count} found`], check.href)) };
    }

    case "users all": {
      const size = 25;
      const requested = Number.parseInt(args[0] ?? "1", 10);
      if (args[0] !== undefined && (!Number.isInteger(requested) || requested < 1)) return { lines: [err("The page must be a whole number from 1."), muted("Example: users all 2")] };
      const where = { OR: [{ studentProfile: { is: scope } }, { academicMate: { is: scope } }] };
      const total = await prisma.user.count({ where });
      const pages = Math.max(1, Math.ceil(total / size));
      if (total === 0) return { lines: [muted("There are no users in your universities.")] };
      if (requested > pages) return { lines: [err(`There are only ${pages} ${pages === 1 ? "page" : "pages"}.`)] };
      const people = await prisma.user.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (requested - 1) * size,
        take: size,
        select: { id: true, name: true, email: true, studentProfile: { select: { status: true, university: { select: { code: true } } } }, academicMate: { select: { status: true, verificationStatus: true, university: { select: { code: true } } } } },
      });
      return {
        lines: [
          head(`${total} users, page ${requested} of ${pages}, newest first`),
          ...people.map((person) => row([person.name, person.email, person.studentProfile?.university.code ?? person.academicMate?.university.code ?? "", [person.studentProfile ? `student ${person.studentProfile.status.toLowerCase()}` : null, person.academicMate ? `mate ${person.academicMate.status.toLowerCase()}, ${person.academicMate.verificationStatus.toLowerCase()}` : null].filter(Boolean).join(" and ")], `/admin/users/${person.id}`)),
          ...(requested < pages ? [muted(`Next page: users all ${requested + 1}`)] : []),
        ],
      };
    }

    case "users": {
      const query = args.join(" ").trim();
      if (query.length < 2) return { lines: [err("Give at least 2 characters to search for."), muted("Example: users mulenga")] };
      const page = await listUsers(admin, { q: query });
      if (page.items.length === 0) return { lines: [muted("No matches in your universities.")] };
      return {
        lines: [
          ...page.items.slice(0, 10).map((user) => row([user.name, user.email, [user.student ? `student ${user.student.status.toLowerCase()}` : null, user.mate ? `mate ${user.mate.status.toLowerCase()}` : null].filter(Boolean).join(", ")], `/admin/users/${user.id}`)),
          ...(page.items.length > 10 || page.nextCursor ? [muted("There are more matches. Narrow the search or use the Users page.")] : []),
        ],
      };
    }

    case "user": {
      const email = (args[0] ?? "").toLowerCase();
      if (!email.includes("@")) return { lines: [err("Give the account’s email address."), muted("Example: user someone@example.com")] };
      const found = await findUserByEmail(admin, email);
      if (!found) return { lines: [muted("No account with that email in your universities.")] };
      return {
        lines: [
          out(`${found.name} <${found.email}>`),
          out(`${found.university}${found.student ? `, student ID ${found.student.studentId}` : ""}`),
          ...(found.student ? [out(`Student account: ${found.student.status.toLowerCase()}`)] : []),
          ...(found.mate ? [out(`Academic Mate: ${found.mate.status.toLowerCase()}, verification ${found.mate.verification.toLowerCase()}`)] : []),
        ],
        navigate: `/admin/users/${found.id}`,
      };
    }

    case "user suspend":
    case "user activate": {
      const suspend = key === "user suspend";
      const email = (args[0] ?? "").toLowerCase();
      const reason = reasonFrom(args, 1);
      if (!email.includes("@") || !reason) return { lines: [err("Give the email and a reason."), muted(`Example: ${suspend ? "user suspend" : "user activate"} someone@example.com "reason for the change"`)] };
      const found = await findUserByEmail(admin, email);
      if (!found) return { lines: [muted("No account with that email in your universities.")] };
      const targets = (["STUDENT", "MATE"] as const).filter((scopeName) => {
        const status = scopeName === "STUDENT" ? found.student?.status : found.mate?.status;
        return status === (suspend ? "ACTIVE" : "SUSPENDED");
      });
      if (targets.length === 0) return { lines: [err(`${found.name} has no ${suspend ? "active" : "suspended"} account to ${suspend ? "suspend" : "reactivate"}.`)] };
      const token = `${key}:${found.id}:${targets.join(",")}`;
      if (options.confirmToken !== token) {
        return {
          lines: [
            warn(`${suspend ? "Suspend" : "Reactivate"} ${found.name} <${found.email}>`),
            out(`Affects: ${targets.map((target) => (target === "STUDENT" ? "student account" : "Academic Mate account")).join(" and ")}`),
            out(`Reason on record: ${reason}`),
            ...(suspend && targets.includes("STUDENT") ? [warn("They will be signed out everywhere straight away.")] : []),
            out("The person is notified and this is written to the audit log."),
          ],
          confirm: { prompt: `${suspend ? "Suspend" : "Reactivate"} this account?`, token },
        };
      }
      const lines: ConsoleLine[] = [];
      for (const target of targets) {
        const result = await changeAccountStatus(admin, { userId: found.id, scope: target, action: suspend ? "SUSPEND" : "REACTIVATE", reason, context: options.context });
        lines.push(result.ok ? out(`${target === "STUDENT" ? "Student account" : "Academic Mate account"}: ${result.message}`) : err(`${target === "STUDENT" ? "Student account" : "Academic Mate account"}: ${result.error}`));
      }
      return { lines };
    }

    case "mates": {
      const filter = (args[0] ?? "").toLowerCase();
      const allowed = ["unverified", "pending", "verified", "rejected", "suspended"];
      if (filter && !allowed.includes(filter)) return { lines: [err(`"${filter}" is not a filter. Use one of: ${allowed.join(", ")}.`)] };
      const where = { ...scope, ...(filter === "suspended" ? { status: "SUSPENDED" as const } : filter ? { verificationStatus: filter.toUpperCase() as "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED" } : {}) };
      const [total, rows] = await Promise.all([
        prisma.academicMateProfile.count({ where }),
        prisma.academicMateProfile.findMany({ where, orderBy: { updatedAt: "desc" }, take: 15, select: { id: true, status: true, verificationStatus: true, user: { select: { id: true, name: true, email: true } }, university: { select: { code: true } } } }),
      ]);
      if (rows.length === 0) return { lines: [muted("No Academic Mates match.")] };
      return { lines: [head(`${total} Academic ${total === 1 ? "Mate" : "Mates"}${total > rows.length ? `, showing the ${rows.length} most recently changed` : ""}`), ...rows.map((mate) => row([mate.user.name, mate.user.email, mate.university.code, `${mate.status.toLowerCase()}, ${mate.verificationStatus.toLowerCase()}`], `/admin/users/${mate.user.id}`))] };
    }

    case "verification": {
      const where = { verificationStatus: "PENDING" as const, ...scope };
      const [total, rows] = await Promise.all([
        prisma.academicMateProfile.count({ where }),
        prisma.academicMateProfile.findMany({ where, orderBy: { updatedAt: "asc" }, take: 15, select: { id: true, updatedAt: true, user: { select: { name: true } }, university: { select: { code: true } } } }),
      ]);
      if (total === 0) return { lines: [muted("No applications are waiting.")] };
      return { lines: [head(`${total} waiting, longest first`), ...rows.map((mate) => row([mate.user.name, mate.university.code, `waiting since ${WHEN.format(mate.updatedAt)}`], `/admin/academic-mates/${mate.id}`)), muted("Approve or reject from the Verification page, where you can read the evidence.")] };
    }

    case "requests":
    case "arrangements":
    case "sessions": {
      const allowed = key === "requests" ? REQUEST_STATUSES : key === "arrangements" ? ARRANGEMENT_STATUSES : ADMIN_SESSION_STATES;
      // Older words people already type still work for sessions.
      const alias = key === "sessions" ? ({ scheduled: "upcoming", disputed: "needs_review" } as Record<string, string>)[(args[0] ?? "").toLowerCase()] : undefined;
      const picked = pickStatus(alias ?? args[0], allowed);
      if (!picked.ok) return { lines: [picked.line] };
      const status = picked.value ? (key === "arrangements" ? `ARR_${picked.value}` : picked.value) : "all";
      const result = await listDirectory(admin, { kind: key === "sessions" ? "sessions" : "requests", status, q: "", page: 1 });
      if (result.items.length === 0) return { lines: [muted("Nothing matches.")] };
      return { lines: [head(`${result.total} found, showing the latest ${Math.min(10, result.items.length)}`), ...result.items.slice(0, 10).map((item) => row([item.title, `${item.student} with ${item.mate}`, item.university, item.status, item.when ?? ""], "/admin/tutoring")), muted("Open the Tutoring page for search, paging and full details.")] };
    }

    case "attendance":
    case "completion": {
      const result = await listOutstanding(admin, key);
      if (result.total === 0) return { lines: [muted(key === "attendance" ? "Every ended session has its attendance settled." : "Every attended session has been marked complete.")] };
      return { lines: [head(`${result.total} waiting, longest first`), ...result.items.map((item) => row([item.course, `${item.student} with ${item.mate}`, item.university, `ended ${item.ended}`], "/admin/tutoring"))] };
    }

    case "disputes": {
      const open = await listDisputes(admin, "open", null, 15);
      if (open.items.length === 0) return { lines: [muted("No sessions need a decision.")] };
      return {
        lines: [
          head(`${open.items.length} shown, numbered for dispute resolve`),
          ...open.items.map((item, index) => row([`${index + 1}.`, item.course.code, `${item.student.name} with ${item.mate.name}`, WHEN.format(new Date(item.scheduledStart))], "/admin/disputes")),
          muted("Decide one with: dispute resolve <number> completed | no-show \"reason\""),
        ],
      };
    }

    case "dispute resolve": {
      const number = Number.parseInt(args[0] ?? "", 10);
      const outcomeText = (args[1] ?? "").toLowerCase();
      const outcome = outcomeText === "completed" ? "COMPLETED" : outcomeText === "no-show" || outcomeText === "no_show" ? "NO_SHOW" : null;
      const reason = reasonFrom(args, 2);
      if (!Number.isInteger(number) || number < 1 || !outcome) return { lines: [err("Give the number from the disputes list and the outcome."), muted("Example: dispute resolve 2 no-show \"mate never arrived\"")] };
      if (reason.length < NOTE_MIN || reason.length > NOTE_MAX) return { lines: [err(`The reason must be ${NOTE_MIN} to ${NOTE_MAX} characters.`)] };
      // The token carries the exact session the person confirmed, so the list shifting in between cannot change the target.
      const tokenPrefix = `dispute resolve:${outcome}:`;
      if (options.confirmToken?.startsWith(tokenPrefix)) {
        const sessionId = options.confirmToken.slice(tokenPrefix.length);
        if (!sessionId || sessionId.length > 100) return { lines: [err("That confirmation is not valid. Run the command again.")] };
        const result = await resolveDispute(admin, { sessionId, outcome, note: reason, context: options.context });
        return { lines: [result.ok ? out(result.message) : err(result.error)] };
      }
      const open = await listDisputes(admin, "open", null, 15);
      const item = open.items[number - 1];
      if (!item) return { lines: [err(`There is no number ${number} on the disputes list.`), muted("Run disputes to see the current list.")] };
      const summaryLine = `${item.course.code}, ${item.student.name} with ${item.mate.name}, ${WHEN.format(new Date(item.scheduledStart))}`;
      return {
        lines: [
          warn(`Record this session as ${outcome === "COMPLETED" ? "COMPLETED" : "a NO-SHOW"}`),
          out(summaryLine),
          out(`Reason on record: ${reason}`),
          out("Both people are notified, the original answers stay on record, and this is written to the audit log. It cannot be reversed from the console."),
        ],
        confirm: { prompt: "Record this decision?", token: `${tokenPrefix}${item.id}` },
      };
    }

    case "reviews": {
      const result = await listRecentReviews(admin);
      if (result.items.length === 0) return { lines: [muted("No reviews yet.")] };
      return { lines: [head(`${result.total} reviews, newest first`), ...result.items.map((review) => row([`${review.rating} out of 5`, `${review.reviewer} about ${review.mate}`, review.when, review.comment ?? ""]))] };
    }

    case "cases": {
      const page = await listCases(admin, { status: "active", q: "", mine: false, page: 1 });
      if (page.items.length === 0) return { lines: [muted("No open support cases.")] };
      return { lines: [head(`${page.total} open or in progress, showing ${Math.min(10, page.items.length)}`), ...page.items.slice(0, 10).map((item) => row([item.title, `${statusLabel(item.priority)} priority`, statusLabel(item.status), item.assignedTo ?? "nobody yet"], "/admin/support"))] };
    }

    case "analytics": {
      const report = await getAnalytics(admin, { weeks: 8, universityId: null });
      const percent = (value: number | null) => (value === null ? "no data" : `${Math.round(value * 100)}%`);
      return {
        lines: [
          head("Last eight weeks"),
          ...report.kpis.map((kpi) => row([kpi.label, String(kpi.current), `before: ${kpi.previous}`], "/admin/analytics")),
          row(["Requests accepted", percent(report.acceptance.current), `of ${report.acceptance.answered} answered`], "/admin/analytics"),
          row(["Sessions completed", percent(report.completion.current), `of ${report.completion.ended} ended`], "/admin/analytics"),
          row(["Average rating", report.rating.average === null ? "no data" : `${report.rating.average} of 5`, `${report.rating.count} reviews`], "/admin/analytics"),
          muted("Open the Analytics page for charts, other time ranges and a university filter."),
        ],
      };
    }

    case "notifications": {
      const report = await getHealthReport(admin);
      if (report.deliveries === null) return { lines: [muted("Notification delivery is shown to platform admins only.")] };
      if (report.deliveries.length === 0) return { lines: [muted("No failed or waiting deliveries.")] };
      return { lines: report.deliveries.flatMap((channel) => [head(`${channel.channel}: ${channel.failed} failed, ${channel.pending} waiting`), ...channel.examples.map((example) => out(`${example.when}  ${example.reason}`))]) };
    }

    case "audit": {
      const count = Math.min(20, Math.max(1, Number.parseInt(args[0] ?? "10", 10) || 10));
      const page = await listAudit(admin, {});
      const items = page.items.slice(0, count);
      if (items.length === 0) return { lines: [muted("Nothing has been recorded yet.")] };
      return { lines: items.map((entry) => row([WHEN.format(new Date(entry.createdAt)), entry.actorName, AUDIT_ACTION_LABEL[entry.action] ?? entry.action, entry.summary ?? ""], "/admin/audit")) };
    }

    case "universities": {
      const rows = await listUniversities();
      if (rows.length === 0) return { lines: [muted("No universities yet.")] };
      return { lines: rows.map((item) => row([item.code, item.name, item.status.toLowerCase(), `${item.students} students`, `ID length ${item.settings.studentIdMinLength} to ${item.settings.studentIdMaxLength}${item.settings.studentIdPattern ? `, pattern ${item.settings.studentIdPattern}` : ""}`], "/admin/universities")) };
    }

    case "admins": {
      const rows = await listAdmins();
      return { lines: rows.map((item) => row([item.name, ADMIN_ROLE_LABEL[item.role], item.role === "PLATFORM_ADMIN" ? "all universities" : item.universities.map((u) => u.code).join(", ") || "no universities"], "/admin/admins")) };
    }

    default:
      return { lines: [] };
  }
}

async function findUserByEmail(admin: AdminContext, email: string) {
  const page = await listUsers(admin, { q: email });
  return page.items.find((item) => item.email.toLowerCase() === email) ?? null;
}
