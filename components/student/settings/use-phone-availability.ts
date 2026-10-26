"use client";

import { useCallback, useEffect, useState } from "react";
import { requestJson } from "./settings-api";
import { ZAMBIA_MOBILE_PATTERN } from "./phone";

type PhoneCheck = { phone: string; result: "available" | "taken" | "error" } | null;

/**
 * Live phone availability check. It only runs for a complete, valid number that differs from the
 * one already saved on this account, and it is debounced. The server re-checks on save, so a
 * failed lookup never blocks saving.
 */
export function usePhoneAvailability(phoneNumber: string, savedPhone: string) {
  const [check, setCheck] = useState<PhoneCheck>(null);

  const valid = ZAMBIA_MOBILE_PATTERN.test(phoneNumber);
  const changed = phoneNumber !== savedPhone;
  const phoneToCheck = valid && changed ? phoneNumber : "";

  useEffect(() => {
    if (!phoneToCheck) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const body = await requestJson<{ available: boolean }>(
          `/api/student/phone-check?phone=${encodeURIComponent(`+260${phoneToCheck}`)}`,
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
    valid,
    changed,
    checking: phoneToCheck !== "" && !checked,
    taken: checked && check?.result === "taken",
    available: checked && check?.result === "available",
    formatError: changed && phoneNumber.length === 9 && !valid,
    markTaken,
  };
}
