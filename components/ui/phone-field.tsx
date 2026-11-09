"use client";

import { useMemo } from "react";
import { DEFAULT_PHONE_COUNTRY, parsePhone, phoneCountryLabel, phoneCountryOptions, type CountryCode } from "@/lib/phone";

type Props = {
  id: string;
  country: string;
  national: string;
  onChange: (value: { country: string; national: string }) => void;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  onBlur?: () => void;
};

/**
 * Country picker plus number input, the same everywhere a phone number is entered. The picker shows
 * "Zambia (+260)" and starts on Zambia. Pasting a full international number (+44 7911 123456) picks the
 * country for you. The field itself only keeps digits; the shared phone service does the real validation.
 */
export default function PhoneField({ id, country, national, onChange, invalid = false, describedBy, disabled = false, onBlur }: Props) {
  const options = useMemo(() => phoneCountryOptions(), []);
  const selected = options.find((option) => option.code === country) ?? options[0];

  function handleInput(raw: string) {
    if (raw.includes("+")) {
      const pasted = parsePhone(raw);
      if (pasted.ok) return onChange({ country: pasted.country, national: pasted.national });
    }
    onChange({ country, national: raw.replace(/\D/g, "").slice(0, 15) });
  }

  return (
    <div className={`flex items-stretch overflow-hidden rounded-xl border bg-white focus-within:ring-2 ${invalid ? "border-[#7d1f2a] focus-within:ring-[#7d1f2a]/10" : "border-[#ded3ca] focus-within:border-[#7d1f2a] focus-within:ring-[#7d1f2a]/10"}`}>
      <div className="relative shrink-0 border-r border-[#ded3ca] bg-[#fcfaf7]">
        <span aria-hidden="true" className="pointer-events-none flex h-full items-center gap-1 px-3 text-sm font-medium text-[#3f3734]">
          {selected.code} +{selected.callingCode}
          <svg viewBox="0 0 20 20" className="h-4 w-4 text-[#8a7f7a]" fill="currentColor"><path d="M5.5 7.5 10 12l4.5-4.5-1-1L10 10 6.5 6.5z" /></svg>
        </span>
        <select
          aria-label="Country calling code"
          value={selected.code}
          disabled={disabled}
          onChange={(event) => onChange({ country: event.target.value as CountryCode, national })}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        >
          {options.map((option) => <option key={option.code} value={option.code}>{phoneCountryLabel(option)}</option>)}
        </select>
      </div>
      <input
        id={id}
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder={selected.code === DEFAULT_PHONE_COUNTRY ? "97 1234567" : "Phone number"}
        value={national}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onChange={(event) => handleInput(event.target.value)}
        onBlur={onBlur}
        className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-[#a79b95]"
      />
    </div>
  );
}
