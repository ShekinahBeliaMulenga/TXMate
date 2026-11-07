import { describe, expect, test } from "bun:test";
import { qrMatrix, qrSvgPath } from "../lib/qr";

const URI = "otpauth://totp/TXMate:admin%40example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=TXMate&algorithm=SHA1&digits=6&period=30";

describe("QR encoder", () => {
  test("the size grows with the text, from 21 modules up to 57", () => {
    expect(qrMatrix("a").length).toBe(21);
    expect(qrMatrix(URI).length).toBeGreaterThanOrEqual(41);
    expect(qrMatrix("z".repeat(213)).length).toBe(57);
  });

  test("text that is too long is refused rather than drawn wrongly", () => {
    expect(() => qrMatrix("z".repeat(214))).toThrow();
  });

  test("the three corner finder patterns and the timing lines are in place", () => {
    const m = qrMatrix(URI);
    const n = m.length;
    for (const [x0, y0] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      for (let d = 0; d < 7; d++) {
        expect(m[y0][x0 + d]).toBe(true);
        expect(m[y0 + 6][x0 + d]).toBe(true);
        expect(m[y0 + d][x0]).toBe(true);
        expect(m[y0 + d][x0 + 6]).toBe(true);
      }
      expect(m[y0 + 3][x0 + 3]).toBe(true);
      expect(m[y0 + 1][x0 + 1]).toBe(false);
    }
    for (let i = 8; i < n - 8; i++) {
      expect(m[6][i]).toBe(i % 2 === 0);
      expect(m[i][6]).toBe(i % 2 === 0);
    }
    expect(m[n - 8][8]).toBe(true);
  });

  test("the same text always gives the same code, different text a different one", () => {
    expect(qrMatrix(URI)).toEqual(qrMatrix(URI));
    expect(qrMatrix(URI)).not.toEqual(qrMatrix(URI.replace("JBSW", "KBSW")));
  });

  test("the drawing path has a four-module border", () => {
    const { path, size } = qrSvgPath(qrMatrix("a"));
    expect(size).toBe(29);
    expect(path.startsWith("M")).toBe(true);
    expect(path).not.toContain("NaN");
  });
});
