"use client";

import { FOCUS } from "./settings-ui";

/**
 * Save and Discard for the form screens. Pinned just above the mobile tab bar so it is always
 * reachable, and sits in the normal flow on desktop. Save is disabled until something changed.
 */
export default function SettingsSaveActions({
  dirty,
  saving,
  blocked = false,
  error,
  onDiscard,
}: {
  dirty: boolean;
  saving: boolean;
  /** True when the current values cannot be saved (for example a taken phone number). */
  blocked?: boolean;
  error: string | null;
  onDiscard: () => void;
}) {
  return (
    <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-6 bg-gradient-to-t from-[#f4f1ed] from-75% to-transparent px-4 pb-3 pt-6 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:bg-none lg:p-0 lg:pt-2">
      {error ? <p role="alert" className="mb-2 text-sm font-medium text-[#7d1f2a]">{error}</p> : null}
      <div className="flex gap-2">
        {dirty && !saving ? (
          <button type="button" onClick={onDiscard} className={`h-12 rounded-xl border border-[#d9cec5] bg-white px-5 text-sm font-semibold text-[#4e4742] transition hover:bg-[#faf8f6] ${FOCUS}`}>
            Discard
          </button>
        ) : null}
        <button
          type="submit"
          disabled={!dirty || saving || blocked}
          className={`h-12 flex-1 rounded-xl bg-[#7d1f2a] text-sm font-semibold text-white shadow-sm transition hover:bg-[#681923] disabled:cursor-not-allowed disabled:opacity-50 lg:flex-none lg:px-8 ${FOCUS}`}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
