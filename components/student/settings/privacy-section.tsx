"use client";

import type { ProfileVisibility, SettingsFormValues } from "./settings-types";
import { Panel, Toggle } from "./settings-ui";

const VISIBILITY_OPTIONS: ReadonlyArray<{ value: ProfileVisibility; label: string; description: string }> = [
  { value: "PUBLIC", label: "Public", description: "Your profile can be discovered by TXMate members." },
  { value: "MEMBERS_ONLY", label: "TXMate members", description: "Visible only to signed-in TXMate members." },
  { value: "PRIVATE", label: "Private", description: "Not available for member discovery." },
];

type Props = {
  values: Pick<SettingsFormValues, "profileVisibility" | "showStudentId" | "showPhoneNumber">;
  onChange: (patch: Partial<SettingsFormValues>) => void;
};

/** Profile visibility and which contact details are shown. Pure presentation. */
export default function PrivacySection({ values, onChange }: Props) {
  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="text-sm font-semibold text-[#282321]">Profile visibility</legend>
        <div className="mt-3 space-y-2.5">
          {VISIBILITY_OPTIONS.map((option) => {
            const selected = values.profileVisibility === option.value;
            return (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3.5 rounded-xl border px-4 py-3.5 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#7d1f2a]/40 ${selected ? "border-[#7d1f2a] bg-[#fdf6f7]" : "border-[#e2d9d0] bg-white hover:bg-[#faf8f6]"}`}
              >
                <input type="radio" name="profileVisibility" value={option.value} checked={selected} onChange={() => onChange({ profileVisibility: option.value })} className="sr-only" />
                <span aria-hidden="true" className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-[#7d1f2a]" : "border-[#c9bdb4]"}`}>
                  {selected ? <span className="h-2.5 w-2.5 rounded-full bg-[#7d1f2a]" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[#282321]">{option.label}</span>
                  <span className="mt-0.5 block text-[13px] leading-5 text-[#7a6f6a]">{option.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <Panel className="divide-y divide-[#efe8e1]">
        <Toggle checked={values.showStudentId} onChange={(value) => onChange({ showStudentId: value })} label="Show my student ID" description="Display your student ID on your profile." />
        <Toggle checked={values.showPhoneNumber} onChange={(value) => onChange({ showPhoneNumber: value })} label="Show my phone number" description="Display your phone number on your profile." />
      </Panel>
    </div>
  );
}
