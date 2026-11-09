"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { requestJson } from "./settings-api";
import { normalizePhone, parsePhone, splitPhone, type CountryCode } from "@/lib/phone";

type PhoneCheck = { phone: string; result: "available" | "taken" | "error" } | null;

/**
 * Live phone check for the number being typed (`country` + `national`) against the one already saved.
 * It validates the format with the shared phone service, and only asks the server whether the number is
 * free when it is complete, valid and different from the saved one. The check is debounced, and the
 * server checks again on save, so a failed lookup never blocks saving.
 */
export function usePhoneAvailability(country: string, national: string, savedStored: string | null) {
  const [check, setCheck] = useState<PhoneCheck>(null);

  const parsed = useMemo(() => parsePhone(national, country as CountryCode), [national, country]);
  const e164 = parsed.ok ? parsed.e164 : "";
  const saved = useMemo(() => splitPhone(savedStored), [savedStored]);
  const savedE164 = normalizePhone(savedStored) ?? "";

  // "Untouched" means the field still shows what was saved, so an older saved format never blocks other edits.
  const untouched = country === saved.country && national === saved.national;
  const changed = !untouched && e164 !== savedE164;
  const phoneToCheck = changed && e164 ? e164 : "";

  useEffect(() => {
    if (!phoneToCheck) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const body = await requestJson<{ available: boolean }>(
          `/api/student/phone-check?phone=${encodeURIComponent(phoneToCheck)}`,
          { method: "GET", headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal },
          "Unable to check this phone number."
        );
        if (!controller.signal.aborted) setCheck({ phone: phoneToCheck, result: body.available ? "available" : "taken" });
      } catch {
        if (!controller.signal.aborted) setCheck({ phone: phoneToCheck, result: "error" });
      }
    }, 400);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [phoneToCheck]);

  const checked = phoneToCheck !== "" && check?.phone === phoneToCheck;
  /** Records that the server rejected this number on save (someone registered it after the live check). */
  const markTaken = useCallback((phone: string) => setCheck({ phone, result: "taken" }), []);

  return {
    valid: parsed.ok,
    /** The number in E.164 form, or "" when it is empty or not valid yet. */
    e164,
    changed,
    untouched,
    checking: phoneToCheck !== "" && !checked,
    taken: checked && check?.result === "taken",
    available: checked && check?.result === "available",
    formatError: !untouched && national !== "" && !parsed.ok,
    markTaken,
  };
}
