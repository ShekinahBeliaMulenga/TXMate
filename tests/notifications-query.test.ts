import { describe, expect, test } from "bun:test";
import { decodeCursor, encodeCursor, notificationWhere, parseNotificationQuery, MAX_LIMIT, NOTIFICATION_CATEGORIES } from "../lib/notifications-query";

function parse(query: string) {
  const result = parseNotificationQuery(new URLSearchParams(query));
  if (!result.ok) throw new Error(result.error);
  return result.query;
}

describe("notification list query", () => {
  test("defaults give the first 20 newest notifications with no filters", () => {
    const q = parse("");
    expect(q.limit).toBe(20);
    expect(q.search).toBe("");
    expect(q.category).toBeNull();
    expect(q.unreadOnly).toBe(false);
    expect(q.cursor).toBeNull();
    expect(notificationWhere("u1", q)).toEqual({ userId: "u1", deletedAt: null });
  });

  test("limit is clamped and junk falls back to the default", () => {
    expect(parse("limit=9999").limit).toBe(MAX_LIMIT);
    expect(parse("limit=0").limit).toBe(20);
    expect(parse("limit=abc").limit).toBe(20);
    expect(parse("limit=5").limit).toBe(5);
  });

  test("every filter is applied and the signed-in user is always part of the filter", () => {
    const q = parse("q=%20session%20%20today%20&type=sessions&unread=1&from=2026-11-01&to=2026-11-02");
    const where = notificationWhere("u1", q);
    expect(where.userId).toBe("u1");
    expect(where.deletedAt).toBeNull();
    expect(where.readAt).toBeNull();
    expect(where.type).toEqual({ in: [...NOTIFICATION_CATEGORIES.sessions.types] });
    expect(q.search).toBe("session today");
    expect(where.createdAt?.gte?.toISOString()).toBe("2026-10-31T22:00:00.000Z");
    expect(where.createdAt?.lt?.toISOString()).toBe("2026-11-02T22:00:00.000Z");
    expect(JSON.stringify(where.AND)).toContain("session today");
  });

  test("unknown types are refused instead of silently ignored", () => {
    expect(parseNotificationQuery(new URLSearchParams("type=everything")).ok).toBe(false);
    expect(parseNotificationQuery(new URLSearchParams("type=__proto__")).ok).toBe(false);
    expect(parseNotificationQuery(new URLSearchParams("type=all")).ok).toBe(true);
  });

  test("invalid dates are ignored", () => {
    expect(parse("from=nope&to=2026-13-40").createdAt).toBeUndefined();
  });

  test("search text is capped", () => {
    expect(parse(`q=${"a".repeat(500)}`).search.length).toBe(100);
  });

  test("cursors round-trip and bad ones are refused", () => {
    const at = new Date("2026-11-02T10:00:00.000Z");
    const cursor = encodeCursor(at, "abc");
    expect(decodeCursor(cursor)).toEqual({ createdAt: at, id: "abc" });
    for (const bad of ["", "x", Buffer.from("[1,2]").toString("base64url"), Buffer.from('["nope","a"]').toString("base64url")]) {
      expect(decodeCursor(bad)).toBeNull();
    }
    expect(parseNotificationQuery(new URLSearchParams("cursor=garbage")).ok).toBe(false);
  });

  test("the next page starts after the cursor, and the count ignores it", () => {
    const q = parse(`cursor=${encodeCursor(new Date("2026-11-02T10:00:00.000Z"), "m")}`);
    expect(JSON.stringify(notificationWhere("u1", q).AND)).toContain('"id":{"lt":"m"}');
    expect(notificationWhere("u1", q, false).AND).toBeUndefined();
  });

  test("the list can run oldest first, and paging then moves forward in time", () => {
    expect(parse("").order).toBe("newest");
    expect(parse("order=bogus").order).toBe("newest");
    const q = parse(`order=oldest&cursor=${encodeCursor(new Date("2026-11-02T10:00:00.000Z"), "m")}`);
    expect(q.order).toBe("oldest");
    expect(JSON.stringify(notificationWhere("u1", q).AND)).toContain('"id":{"gt":"m"}');
  });

  test("categories cover every stored notification type exactly once", () => {
    const all = Object.values(NOTIFICATION_CATEGORIES).flatMap((c) => [...c.types]);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(15);
  });
});

import { categoryOfType, foldCategoryCounts } from "../lib/notification-categories";

describe("notification categories", () => {
  test("every type belongs to the category that lists it", () => {
    expect(categoryOfType("SESSION_REMINDER")).toBe("sessions");
    expect(categoryOfType("MATE_REQUEST")).toBe("requests");
    expect(categoryOfType("NEW_MESSAGE")).toBe("messages");
    expect(categoryOfType("REVIEW_RECEIVED")).toBe("reviews");
    expect(categoryOfType("VERIFICATION_UPDATED")).toBe("account");
    expect(categoryOfType("SOMETHING_NEW")).toBe("account");
  });

  test("per-type counts are added up per category", () => {
    expect(foldCategoryCounts([
      { type: "SESSION_REMINDER", count: 2 }, { type: "SESSION_COMPLETED", count: 1 },
      { type: "MATE_REQUEST", count: 1 }, { type: "NEW_MESSAGE", count: 2 },
    ])).toEqual({ sessions: 3, requests: 1, messages: 2, reviews: 0, account: 0 });
    expect(foldCategoryCounts([])).toEqual({ sessions: 0, requests: 0, messages: 0, reviews: 0, account: 0 });
  });
});
