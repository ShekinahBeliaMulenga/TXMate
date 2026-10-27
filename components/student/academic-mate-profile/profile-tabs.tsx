"use client";

import type { KeyboardEvent } from "react";
import { FOCUS } from "./profile-ui";
import type { TabId } from "./types";

export type TabItem = { id: TabId; label: string };

export const tabButtonId = (id: TabId) => `profile-tab-${id}`;
export const tabPanelId = (id: TabId) => `profile-panel-${id}`;

/** Four evenly spaced tabs (no horizontal scrolling). Arrow keys, Home and End move between them. */
export default function ProfileTabs({ tabs, active, onChange }: { tabs: readonly TabItem[]; active: TabId; onChange: (id: TabId) => void }) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.id === active);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    onChange(tabs[next].id);
    document.getElementById(tabButtonId(tabs[next].id))?.focus();
  }

  return (
    <div role="tablist" aria-label="Academic Mate profile sections" onKeyDown={handleKeyDown} className="grid border-b border-[#e2d9d0]" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            id={tabButtonId(tab.id)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={tabPanelId(tab.id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`relative px-1 py-2.5 text-[13px] font-semibold transition focus-visible:ring-inset ${FOCUS} ${selected ? "text-[#7d1f2a]" : "text-[#6d6260] hover:text-[#282321]"}`}
          >
            {tab.label}
            <span aria-hidden="true" className={`absolute inset-x-3 bottom-0 h-0.5 rounded-full transition ${selected ? "bg-[#7d1f2a]" : "bg-transparent"}`} />
          </button>
        );
      })}
    </div>
  );
}