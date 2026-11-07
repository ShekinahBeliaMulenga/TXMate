/** Client-safe command line parsing and the command catalogue shown by `help`. */
import type { AdminPermission } from "./permissions";

export const CONSOLE_MAX_LINE = 200;

export type ConsoleCommandInfo = { name: string; usage: string; summary: string; permission: AdminPermission; danger?: boolean };

export const CONSOLE_COMMANDS: readonly ConsoleCommandInfo[] = [
  { name: "help", usage: "help  (or ?)", summary: "List the commands you can run", permission: "dashboard:view" },
  { name: "whoami", usage: "whoami", summary: "Show your role and university access", permission: "dashboard:view" },
  { name: "dashboard", usage: "dashboard  (or stats)", summary: "Headline numbers for your universities", permission: "dashboard:view" },
  { name: "queue", usage: "queue", summary: "What is waiting for a person", permission: "dashboard:view" },
  { name: "goto", usage: "goto <page>", summary: "Open a page, for example: goto audit", permission: "dashboard:view" },
  { name: "health", usage: "health", summary: "Database and notification delivery status", permission: "system:view" },
  { name: "integrity", usage: "integrity", summary: "Data consistency problems found right now", permission: "system:view" },
  { name: "users", usage: "users <name | email | student ID>", summary: "Search students and Academic Mates", permission: "users:view" },
  { name: "users all", usage: "users all [page]", summary: "List every user with no filter, 25 per page", permission: "users:view" },
  { name: "user", usage: "user <email>", summary: "Show one account and open it", permission: "users:view" },
  { name: "user suspend", usage: "user suspend <email> \"reason\"", summary: "Suspend an account (asks you to confirm)", permission: "users:suspend", danger: true },
  { name: "user activate", usage: "user activate <email> \"reason\"", summary: "Reactivate a suspended account (asks you to confirm)", permission: "users:suspend", danger: true },
  { name: "mates", usage: "mates [unverified | pending | verified | rejected | suspended]", summary: "List Academic Mates, optionally by state", permission: "users:view" },
  { name: "verification", usage: "verification", summary: "Academic Mate applications waiting for review", permission: "verification:review" },
  { name: "requests", usage: "requests [requested | accepted | declined | cancelled | expired]", summary: "Latest tutoring requests", permission: "tutoring:view" },
  { name: "arrangements", usage: "arrangements [pending | active | paused | completed | cancelled | expired]", summary: "Latest tutoring arrangements", permission: "tutoring:view" },
  { name: "sessions", usage: "sessions [upcoming | in_progress | awaiting_confirmation | no_response | needs_review | completed | no_show | cancelled]", summary: "Latest sessions", permission: "tutoring:view" },
  { name: "attendance", usage: "attendance", summary: "Ended sessions whose attendance is not settled", permission: "tutoring:view" },
  { name: "completion", usage: "completion", summary: "Attended sessions nobody has marked complete", permission: "tutoring:view" },
  { name: "disputes", usage: "disputes", summary: "Sessions that need a decision, numbered", permission: "disputes:view" },
  { name: "dispute resolve", usage: "dispute resolve <number> completed | no-show \"reason\"", summary: "Decide a session from the disputes list (asks you to confirm)", permission: "disputes:resolve", danger: true },
  { name: "reviews", usage: "reviews", summary: "Latest session reviews", permission: "tutoring:view" },
  { name: "cases", usage: "cases", summary: "Open and in-progress support cases", permission: "support:manage" },
  { name: "analytics", usage: "analytics", summary: "Acceptance, completion and rating rates, last 30 to 90 days", permission: "analytics:view" },
  { name: "notifications", usage: "notifications", summary: "Failed and waiting notification deliveries", permission: "system:view" },
  { name: "audit", usage: "audit [count]", summary: "Latest admin actions (default 10, up to 20)", permission: "audit:view" },
  { name: "universities", usage: "universities", summary: "List universities and their ID rules", permission: "universities:manage" },
  { name: "admins", usage: "admins", summary: "List admins and roles", permission: "admins:manage" },
  { name: "history", usage: "history", summary: "Show the commands you have typed this session", permission: "dashboard:view" },
  { name: "clear", usage: "clear  (or Ctrl+L)", summary: "Clear the screen", permission: "dashboard:view" },
  { name: "exit", usage: "exit", summary: "Leave the console and return to the dashboard", permission: "dashboard:view" },
];

export type ParsedCommand = { name: string; args: string[] };

/** Splits a line into a command and arguments. Double or single quotes keep spaces together. */
export function parseCommand(line: string): ParsedCommand | null {
  const text = line.trim();
  if (!text) return null;
  if (text === "?") return { name: "help", args: [] };
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let started = false;
  for (const char of text) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      started = true;
    } else if (/\s/.test(char)) {
      if (started || current) tokens.push(current);
      current = "";
      started = false;
    } else {
      current += char;
      started = true;
    }
  }
  if (started || current) tokens.push(current);
  if (tokens.length === 0) return null;
  const [name, ...args] = tokens;
  return { name: name.toLowerCase(), args };
}

/** `cells` render as columns that wrap on narrow screens, so nothing is ever cut off. */
export type ConsoleLine = { kind: "out" | "err" | "muted" | "head" | "warn"; text: string; href?: string; cells?: string[] };
/** A consequential command first returns `confirm`; the browser sends the same line again with the token after the person says yes. */
export type ConsoleReply = { lines: ConsoleLine[]; navigate?: string; confirm?: { prompt: string; token: string } };

/**
 * Turns a parsed line into the catalogue key it runs. Two-word commands (`user suspend`,
 * `dispute resolve`) and the `stats` alias are resolved here so the server and tests agree.
 */
export function commandKey(parsed: ParsedCommand): { key: string; args: string[] } {
  const [first, ...rest] = parsed.args;
  if (parsed.name === "stats") return { key: "dashboard", args: parsed.args };
  if (parsed.name === "users" && first === "all") return { key: "users all", args: rest };
  if (parsed.name === "user" && (first === "suspend" || first === "activate")) return { key: `user ${first}`, args: rest };
  if (parsed.name === "dispute" && first === "resolve") return { key: "dispute resolve", args: rest };
  return { key: parsed.name, args: parsed.args };
}
