import { describe, expect, test } from "bun:test";
import { CONSOLE_COMMANDS, parseCommand } from "../lib/admin/console-parse";
import { ADMIN_PERMISSIONS, roleHasPermission } from "../lib/admin/permissions";

describe("console parsing", () => {
  test("? is help and blank is nothing", () => {
    expect(parseCommand("?")).toEqual({ name: "help", args: [] });
    expect(parseCommand("   ")).toBeNull();
  });
  test("splits words and honours quotes", () => {
    expect(parseCommand("users  john smith")).toEqual({ name: "users", args: ["john", "smith"] });
    expect(parseCommand('users "john smith"')).toEqual({ name: "users", args: ["john smith"] });
    expect(parseCommand("GOTO Audit")).toEqual({ name: "goto", args: ["Audit"] });
    expect(parseCommand("users ''")).toEqual({ name: "users", args: [""] });
  });
  test("unterminated quote keeps the rest as one argument", () => {
    expect(parseCommand('users "john smith')).toEqual({ name: "users", args: ["john smith"] });
  });
  test("every command is gated by a real permission, and support sees fewer commands than platform admin", () => {
    const support = CONSOLE_COMMANDS.filter((c) => roleHasPermission("SUPPORT", c.permission)).map((c) => c.name);
    const platform = CONSOLE_COMMANDS.filter((c) => roleHasPermission("PLATFORM_ADMIN", c.permission)).map((c) => c.name);
    expect(platform).toHaveLength(CONSOLE_COMMANDS.length);
    expect(support).toContain("users");
    expect(support).not.toContain("admins");
    expect(support).not.toContain("audit");
  });
});

import { commandKey } from "../lib/admin/console-parse";

describe("command keys", () => {
  test("two-word commands and aliases resolve", () => {
    expect(commandKey(parseCommand('user suspend a@b.co "bad behaviour"')!)).toEqual({ key: "user suspend", args: ["a@b.co", "bad behaviour"] });
    expect(commandKey(parseCommand("dispute resolve 2 no-show why")!)).toEqual({ key: "dispute resolve", args: ["2", "no-show", "why"] });
    expect(commandKey(parseCommand("stats")!).key).toBe("dashboard");
    expect(commandKey(parseCommand("user a@b.co")!).key).toBe("user");
  });
  test("every command a role may run has a catalogue entry with a real permission", () => {
    for (const command of CONSOLE_COMMANDS) expect(ADMIN_PERMISSIONS).toContain(command.permission);
    expect(CONSOLE_COMMANDS.filter((command) => command.danger).map((command) => command.name).sort()).toEqual(["dispute resolve", "user activate", "user suspend"]);
  });
});
