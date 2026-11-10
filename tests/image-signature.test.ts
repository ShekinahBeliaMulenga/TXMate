import { describe, expect, it } from "bun:test";
import { detectImageFormat } from "@/lib/image-signature";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => Array.from(text).map((character) => character.charCodeAt(0));

describe("image signature", () => {
  it("recognises a JPEG", () => {
    expect(detectImageFormat(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10))).toBe("jpeg");
  });

  it("recognises a PNG", () => {
    expect(detectImageFormat(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00))).toBe("png");
  });

  it("recognises a WebP (RIFF container with a WEBP tag)", () => {
    expect(detectImageFormat(bytes(...ascii("RIFF"), 0x24, 0x00, 0x00, 0x00, ...ascii("WEBP"), ...ascii("VP8 ")))).toBe("webp");
  });

  it("does not take other RIFF files (a WAV, say) for WebP", () => {
    expect(detectImageFormat(bytes(...ascii("RIFF"), 0x24, 0x00, 0x00, 0x00, ...ascii("WAVE")))).toBeNull();
  });

  it("refuses text, HTML and scripts, whatever they claim to be", () => {
    expect(detectImageFormat(bytes(...ascii("<html><script>alert(1)</script>")))).toBeNull();
    expect(detectImageFormat(bytes(...ascii("GIF89a")))).toBeNull();
  });

  it("refuses empty or truncated input without throwing", () => {
    expect(detectImageFormat(bytes())).toBeNull();
    expect(detectImageFormat(bytes(0xff, 0xd8))).toBeNull();
    expect(detectImageFormat(bytes(0x89, 0x50, 0x4e, 0x47))).toBeNull();
    expect(detectImageFormat(bytes(...ascii("RIFF"), 0x00, 0x00, 0x00, 0x00, ...ascii("WEB")))).toBeNull();
  });
});
