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
      <ul className="divide-y divide-[#efe8e1] overflow-hidden rounded-xl border border-[#ece5de] bg-white">
        {SETTINGS_SECTIONS.map((section) => {
          const current = activeId === section.id;

          return (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => onSelect(section.id)}
                aria-current={current ? "page" : undefined}
                className={`flex w-full items-center gap-3 px-3 py-3 text-left transition focus-visible:ring-inset ${FOCUS} ${
                  current ? "lg:bg-[#fbf4f5]" : "hover:bg-[#fbf9f7]"
                }`}
              >
                <IconTile name={section.icon} />

                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-[#282321]">
                    {section.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-4 text-[#7a6f6a]">
                    {section.description}
                  </span>
                </span>

                <Icon
                  name="chevronRight"
                  className="h-4 w-4 shrink-0 text-[#7d1f2a]"
                />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}