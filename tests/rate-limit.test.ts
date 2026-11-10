import { beforeEach, describe, expect, it } from "bun:test";
import { resetRateLimits, takeRateLimit } from "@/lib/rate-limit";

const RULE = { limit: 3, windowMs: 60_000 };

describe("rate limit", () => {
  beforeEach(() => resetRateLimits());

  it("allows requests up to the limit, then refuses", () => {
    expect(takeRateLimit("a", RULE, 1_000).allowed).toBe(true);
    expect(takeRateLimit("a", RULE, 1_001).allowed).toBe(true);
    expect(takeRateLimit("a", RULE, 1_002).allowed).toBe(true);
    expect(takeRateLimit("a", RULE, 1_003).allowed).toBe(false);
  });

  it("tells the caller how long to wait, rounded up and never below one second", () => {
    for (let i = 0; i < 3; i++) takeRateLimit("a", RULE, 10_000);
    expect(takeRateLimit("a", RULE, 10_000).retryAfterSeconds).toBe(60);
    expect(takeRateLimit("a", RULE, 69_500).retryAfterSeconds).toBe(1);
  });

  it("starts a fresh window once the old one has passed", () => {
    for (let i = 0; i < 3; i++) takeRateLimit("a", RULE, 0);
    expect(takeRateLimit("a", RULE, 59_999).allowed).toBe(false);
    expect(takeRateLimit("a", RULE, 60_000).allowed).toBe(true);
  });

  it("counts each key separately", () => {
    for (let i = 0; i < 3; i++) takeRateLimit("a", RULE, 0);
    expect(takeRateLimit("a", RULE, 1).allowed).toBe(false);
    expect(takeRateLimit("b", RULE, 1).allowed).toBe(true);
  });

  it("does not count a refused request against the next window", () => {
    for (let i = 0; i < 10; i++) takeRateLimit("a", RULE, 0);
    expect(takeRateLimit("a", RULE, 60_000).allowed).toBe(true);
    expect(takeRateLimit("a", RULE, 60_001).allowed).toBe(true);
    expect(takeRateLimit("a", RULE, 60_002).allowed).toBe(true);
    expect(takeRateLimit("a", RULE, 60_003).allowed).toBe(false);
  });
});
