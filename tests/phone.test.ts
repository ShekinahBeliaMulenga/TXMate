import { describe, expect, test } from "bun:test";
import { PHONE_FORMAT_MESSAGE, phoneVariants } from "../lib/phone-shared";

// The library is a new dependency (`npm install libphonenumber-js`). The checks that need it are skipped, not failed, until it is installed.
const lib = await import("../lib/phone").then((module) => module, () => null);
const withLibrary = lib ? test : test.skip;

describe("phone variants (no library needed)", () => {
  test("a Zambian number also matches every older saved format", () => {
    expect(phoneVariants("+260971234567")).toEqual(["+260971234567", "971234567", "0971234567", "260971234567"]);
  });
  test("other countries match only the E.164 form", () => {
    expect(phoneVariants("+447911123456")).toEqual(["+447911123456"]);
  });
  test("a message exists for invalid numbers", () => {
    expect(PHONE_FORMAT_MESSAGE.length).toBeGreaterThan(10);
  });
});

describe("parsing and formatting", () => {
  withLibrary("Zambian numbers in every common format give the same E.164", () => {
    for (const input of ["0971234567", "971234567", "+260971234567", "260971234567", "+260 97 1234567", "097-123-4567"]) {
      expect(lib!.normalizePhone(input)).toBe("+260971234567");
    }
  });
  withLibrary("international numbers", () => {
    expect(lib!.normalizePhone("+447911123456")).toBe("+447911123456");
    expect(lib!.normalizePhone("07911 123456", "GB")).toBe("+447911123456");
    expect(lib!.normalizePhone("(213) 373-4253", "US")).toBe("+12133734253");
  });
  withLibrary("the same number in two countries' formats is one number (uniqueness is on E.164)", () => {
    expect(lib!.normalizePhone("07911123456", "GB")).toBe(lib!.normalizePhone("+44 7911 123456"));
  });
  withLibrary("invalid or unsafe input is rejected", () => {
    for (const input of ["", "abc", "12345", "+260", "097123", "0971234567; DROP TABLE", "+2609712345678901234567890123"]) {
      expect(lib!.parsePhone(input).ok).toBe(false);
    }
    expect(lib!.parsePhone("").ok === false && (lib!.parsePhone("") as { empty: boolean }).empty).toBe(true);
  });
  withLibrary("display and splitting", () => {
    expect(lib!.formatPhone("+260971234567")).toBe("+260 97 1234567");
    expect(lib!.formatPhone("0971234567")).toBe("+260 97 1234567");
    expect(lib!.formatPhone(null)).toBe("");
    expect(lib!.splitPhone("+260971234567")).toEqual({ country: "ZM", national: "971234567" });
    expect(lib!.splitPhone(null)).toEqual({ country: "ZM", national: "" });
  });
  withLibrary("Zambia is listed first, with its calling code", () => {
    const options = lib!.phoneCountryOptions();
    expect(options[0]).toMatchObject({ code: "ZM", callingCode: "260" });
    expect(options.length).toBeGreaterThan(200);
  });
});
