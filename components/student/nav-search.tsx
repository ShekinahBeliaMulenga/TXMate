"use client";

import { useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { rankItems } from "@/lib/nav-search";

export type NavSearchItem = { label: string; href: string; keywords?: string };

/**
 * Jump-to search for the student shell. Matches page names (and a few synonyms) and,
 * for anything else, offers to search the user's sessions.
 */
export default function NavSearch({ items, onNavigate, placeholder = "Search TXMate", autoFocus = false }: { items: NavSearchItem[]; onNavigate?: () => void; placeholder?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    const text = query.trim().slice(0, 100);
    const pages = rankItems(items, text, 5).map((item) => ({ key: item.href, label: item.label, hint: "Go to page", href: item.href }));
    const encoded = encodeURIComponent(text);
    // Searches inside the app always come after the pages, so a page name is one keypress away.
    return [
      ...pages,
      { key: "find-search", label: `Find Academic Mates for “${text}”`, hint: "Find a Mate", href: `/student/find-academic-mate?q=${encoded}` },
      { key: "sessions-search", label: `Search sessions for “${text}”`, hint: "Sessions", href: `/student/sessions?q=${encoded}` },
      { key: "messages-search", label: `Search messages for “${text}”`, hint: "Messages", href: `/student/messages?q=${encoded}` },
    ];
  }, [items, query]);

  function go(index: number) {
    const target = results[index];
    if (!target) return;
    setQuery(""); setActive(0);
    onNavigate?.();
    router.push(target.href);
  }

  return (
    <div className="relative">
      <label htmlFor={`${listId}-input`} className="sr-only">Search TXMate</label>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a8e86]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.2 4.2" /></svg>
      <input
        ref={inputRef}
        id={`${listId}-input`}
        type="search"
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls={listId}
        aria-activedescendant={results.length > 0 ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        autoFocus={autoFocus}
        value={query}
        placeholder={placeholder}
        onChange={(event) => { setQuery(event.target.value); setActive(0); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => Math.min(value + 1, results.length - 1)); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => Math.max(value - 1, 0)); }
          else if (event.key === "Enter") { event.preventDefault(); go(active); }
          else if (event.key === "Escape") { setQuery(""); }
        }}
        className="h-10 w-full rounded-lg border border-[#e2d8d0] bg-[#fcfbfa] pl-9 pr-3 text-sm text-[#282321] outline-none placeholder:text-[#a3978f] focus:border-[#7d1f2a] focus:bg-white focus:ring-2 focus:ring-[#7d1f2a]/10"
      />
      {results.length > 0 && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-11 z-40 overflow-hidden rounded-lg border border-[#e2d9d0] bg-white py-1 shadow-lg">
          {results.map((result, index) => (
            <li key={result.key} id={`${listId}-${index}`} role="option" aria-selected={index === active}>
              <button type="button" tabIndex={-1} onMouseEnter={() => setActive(index)} onClick={() => go(index)} className={`flex min-h-10 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${index === active ? "bg-[#f4eceb] text-[#7d1f2a]" : "text-[#3f3734]"}`}>
                <span className="min-w-0 truncate">{result.label}</span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-[#a0958d]">{result.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
