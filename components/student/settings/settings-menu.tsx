"use client";

import { SETTINGS_SECTIONS, type SettingsSectionId } from "./settings-config";
import { FOCUS, Icon, IconTile } from "./settings-ui";

export default function SettingsMenu({
  activeId,
  onSelect,
}: {
  activeId: SettingsSectionId | null;
  onSelect: (id: SettingsSectionId) => void;
}) {
  return (
    <nav aria-label="Settings sections">
      {/* No borders or divider lines. Phone: each row is its own white card.
          Desktop: plain rows, and the open screen is a raised white pill. */}
      <ul className="space-y-2 lg:space-y-1">
        {SETTINGS_SECTIONS.map((section) => {
          const current = activeId === section.id;

          return (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => onSelect(section.id)}
                aria-current={current ? "page" : undefined}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${FOCUS} ${
                  current
                    ? "bg-white shadow-sm lg:bg-white lg:shadow-sm"
                    : "bg-white shadow-sm hover:bg-[#fbf9f7] lg:bg-transparent lg:shadow-none lg:hover:bg-white/60"
                }`}
              >
                <IconTile name={section.icon} />

                <span className="min-w-0 flex-1">
                  <span className={`block text-[13px] font-semibold ${current ? "lg:text-[#7d1f2a]" : "text-[#282321]"}`}>
                    {section.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-4 text-[#7a6f6a]">
                    {section.description}
                  </span>
                </span>

                <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-[#7d1f2a] lg:hidden" />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}