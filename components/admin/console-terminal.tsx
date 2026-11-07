"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CONSOLE_MAX_LINE, type ConsoleLine, type ConsoleReply } from "@/lib/admin/console-parse";

type Entry = { id: number; kind: "echo" | "out"; prompt?: string; text?: string; lines?: ConsoleLine[] };
type Pending = { line: string; token: string; prompt: string };

const TONE: Record<ConsoleLine["kind"], string> = {
  out: "text-[#d6d0c8]",
  err: "text-[#ff6b60]",
  muted: "text-[#7f776f]",
  head: "pt-2 font-bold text-[#f5b324]",
  warn: "font-bold text-[#ffd166]",
};

/** Consecutive column lines become one aligned table, like command output in a real terminal. Text still wraps, never cut off. */
function Output({ lines }: { lines: ConsoleLine[] }) {
  const blocks: ReactNode[] = [];
  let group: ConsoleLine[] = [];
  const flush = (key: number) => {
    if (group.length === 0) return;
    const rows = group;
    group = [];
    blocks.push(
      <table key={`t${key}`} className="my-0.5 w-full border-separate border-spacing-x-0 border-spacing-y-0 text-left align-top">
        <tbody>
          {rows.map((line, rowIndex) => (
            <tr key={rowIndex} className={`${TONE[line.kind]} align-top hover:bg-white/5`}>
              {line.cells!.map((cell, cellIndex) => {
                const inner = line.href && cellIndex === 0 ? <Link href={line.href} className="underline decoration-dotted underline-offset-2 hover:text-[#f5b324]">{cell}</Link> : cell;
                return <td key={cellIndex} className={`break-words py-px pr-6 align-top ${cellIndex === 0 ? "font-semibold text-[#e9e2da]" : ""} ${cellIndex === (line.cells!.length - 1) ? "pr-0" : ""}`}>{inner}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>,
    );
  };
  lines.forEach((line, index) => {
    if (line.cells) { group.push(line); return; }
    flush(index);
    blocks.push(
      <div key={index} className={`whitespace-pre-wrap break-words ${TONE[line.kind]}`}>
        {line.href ? <Link href={line.href} className="underline decoration-dotted underline-offset-2 hover:text-[#f5b324]">{line.text}</Link> : line.text}
      </div>,
    );
  });
  flush(lines.length);
  return <>{blocks.map((block, index) => <Fragment key={index}>{block}</Fragment>)}</>;
}

/**
 * The console. It behaves like a terminal: one scrolling log, the prompt on the last line, history with
 * the arrow keys, Tab completion, Ctrl+L to clear and Ctrl+C to cancel. Commands run on the server, which
 * re-checks permission for each; anything that changes data asks for y or n first.
 */
export default function ConsoleTerminal({ commands, identity }: { commands: ReadonlyArray<{ name: string; usage: string }>; identity: { name: string; role: string } }) {
  const router = useRouter();
  const user = identity.name.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9._-]/g, "") || "admin";
  const basePrompt = `${user}@txmate:~$`;
  const banner: ConsoleLine[] = [
    { kind: "head", text: "TXMate admin console" },
    { kind: "out", text: `Signed in as ${identity.name}, ${identity.role}.` },
    { kind: "muted", text: "Type ? for the commands you can run. Anything that changes data asks you to confirm first." },
  ];
  const [entries, setEntries] = useState<Entry[]>([{ id: 0, kind: "out", lines: banner }]);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const history = useRef<string[]>([]);
  const cursor = useRef(-1);
  const nextId = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [entries, pending, busy, value]);
  useEffect(() => { if (!busy) inputRef.current?.focus(); }, [busy]);

  const push = (entry: Omit<Entry, "id">) => setEntries((current) => [...current, { ...entry, id: nextId.current++ }]);
  const say = (kind: ConsoleLine["kind"], text: string) => push({ kind: "out", lines: [{ kind, text }] });

  async function send(line: string, confirmToken?: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/console", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ line, confirmToken: confirmToken ?? null }) });
      if (response.status === 401) { window.location.assign("/admin/login?expired=1"); return; }
      const data = (await response.json().catch(() => ({}))) as Partial<ConsoleReply> & { error?: string };
      if (!response.ok || !Array.isArray(data.lines)) { say("err", data.error || "The console could not run that command."); return; }
      if (data.lines.length > 0) push({ kind: "out", lines: data.lines });
      if (data.confirm) setPending({ line, token: data.confirm.token, prompt: data.confirm.prompt });
      if (data.navigate) router.push(data.navigate);
    } catch {
      say("err", "Network problem. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function run(raw: string) {
    const line = raw.trim();
    const shownPrompt = pending ? `${pending.prompt} [y/N]` : basePrompt;
    push({ kind: "echo", prompt: shownPrompt, text: raw });
    setValue("");
    cursor.current = -1;
    if (!line || busy) return;
    if (line.length > CONSOLE_MAX_LINE) { say("err", `That command is too long (the limit is ${CONSOLE_MAX_LINE} characters).`); return; }
    if (pending) {
      const current = pending;
      setPending(null);
      if (/^y(es)?$/i.test(line)) await send(current.line, current.token);
      else say("muted", "Cancelled. Nothing was changed.");
      return;
    }
    if (history.current[history.current.length - 1] !== line) history.current.push(line);
    const lower = line.toLowerCase();
    if (lower === "clear") { setEntries([]); return; }
    if (lower === "exit") { say("muted", "Leaving the console."); router.push("/admin"); return; }
    if (lower === "history") {
      push({ kind: "out", lines: history.current.length === 0 ? [{ kind: "muted", text: "No commands yet." }] : history.current.map((item, index) => ({ kind: "out" as const, text: `${index + 1}  ${item}`, cells: [String(index + 1), item] })) });
      return;
    }
    await send(line);
  }

  function complete() {
    const typed = value.replace(/^\s+/, "").toLowerCase();
    if (!typed) return;
    const names = [...new Set(commands.map((command) => command.name).concat(["clear", "exit", "history", "stats"]))].filter((name) => name.startsWith(typed));
    if (names.length === 1) setValue(`${names[0]} `);
    else if (names.length > 1) {
      push({ kind: "echo", prompt: basePrompt, text: value });
      say("muted", names.join("    "));
      let common = names[0];
      for (const name of names) while (!name.startsWith(common)) common = common.slice(0, -1);
      if (common.length > typed.length) setValue(common);
    }
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") { event.preventDefault(); void run(value); }
    else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (history.current.length === 0) return;
      cursor.current = cursor.current < 0 ? history.current.length - 1 : Math.max(0, cursor.current - 1);
      setValue(history.current[cursor.current]);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      if (cursor.current < 0) return;
      cursor.current += 1;
      if (cursor.current >= history.current.length) { cursor.current = -1; setValue(""); } else setValue(history.current[cursor.current]);
    } else if (event.key === "Tab") { event.preventDefault(); if (!pending) complete(); }
    else if (event.ctrlKey && event.key.toLowerCase() === "l") { event.preventDefault(); setEntries([]); }
    else if (event.ctrlKey && event.key.toLowerCase() === "c") {
      event.preventDefault();
      push({ kind: "echo", prompt: pending ? `${pending.prompt} [y/N]` : basePrompt, text: `${value}^C` });
      setValue("");
      if (pending) { setPending(null); say("muted", "Cancelled. Nothing was changed."); }
    } else if (event.key === "Escape" && pending) { setPending(null); say("muted", "Cancelled. Nothing was changed."); }
  }

  return (
    <div className="flex h-[calc(100dvh-13rem)] min-h-[24rem] flex-col overflow-hidden rounded-lg border border-[#2a2623] bg-[#0d0c0b] font-mono text-[13px] leading-[1.55] shadow-lg" onClick={() => { if (!window.getSelection()?.toString()) inputRef.current?.focus(); }}>
      <div className="flex items-center gap-3 border-b border-white/10 bg-[#171412] px-3 py-2 text-xs text-[#8f867d]">
        <span aria-hidden="true" className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" /><span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" /><span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" /></span>
        <span className="min-w-0 flex-1 break-words text-center">{user}@txmate — admin console</span>
        <span className="hidden sm:inline">Tab complete · ↑ history · Ctrl+L clear</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" role="log" aria-live="polite" aria-label="Console output">
        {entries.map((entry) =>
          entry.kind === "echo" ? (
            <div key={entry.id} className="whitespace-pre-wrap break-words"><span className="text-[#4ade80]">{entry.prompt}</span> <span className="text-[#f4eee7]">{entry.text}</span></div>
          ) : (
            <div key={entry.id} className="mb-1"><Output lines={entry.lines ?? []} /></div>
          ),
        )}
        {busy ? <div className="text-[#7f776f]">working<span className="animate-pulse">...</span></div> : (
          <div className="flex items-baseline gap-2">
            <label htmlFor="console-input" className="shrink-0 whitespace-nowrap text-[#4ade80]">{pending ? `${pending.prompt} [y/N]` : basePrompt}</label>
            <input
              id="console-input"
              ref={inputRef}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={onKey}
              maxLength={CONSOLE_MAX_LINE}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              aria-label="Console command"
              className="min-w-0 flex-1 bg-transparent text-[16px] text-[#f4eee7] caret-[#f5b324] [caret-shape:block] focus:outline-none sm:text-[13px]"
            />
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
