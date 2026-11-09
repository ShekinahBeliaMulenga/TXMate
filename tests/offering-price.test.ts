import { describe, expect, it } from "bun:test";
import { isFreeOffering, priceBasisText, priceText } from "@/lib/offering-price";

describe("offering price", () => {
  it("shows Free for the FREE type and for a zero rate", () => {
    expect(priceText("0", "ZMW", "FREE")).toBe("Free");
    expect(priceText("0.00", "ZMW", "PER_SESSION")).toBe("Free");
    expect(priceText(0, "ZMW")).toBe("Free");
  });
  it("shows the amount for paid offerings", () => {
    expect(priceText("150", "ZMW", "PER_HOUR")).toBe("ZMW 150");
    expect(priceText("99.5", "ZMW", "PER_SESSION")).toBe("ZMW 99.5");
  });
  it("has no billing basis for free offerings", () => {
    expect(priceBasisText("FREE", "0")).toBe("");
    expect(priceBasisText("PER_HOUR", "150")).toBe("per hour");
    expect(priceBasisText("CUSTOM", "100")).toBe("custom pricing");
  });
  it("does not treat a missing or blank rate as free", () => {
    expect(isFreeOffering("PER_SESSION", "")).toBe(false);
    expect(isFreeOffering("PER_SESSION", null)).toBe(false);
    expect(isFreeOffering("PER_SESSION", "abc")).toBe(false);
  });
});
