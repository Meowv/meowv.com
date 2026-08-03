import { describe, expect, it } from "vitest";

import {
  detectImageMime,
  detectImageMimeFromBytes,
  normalizeOutputMime,
} from "@/core/image";

function ascii(value: string): number[] {
  return Array.from(value, (character) => character.charCodeAt(0));
}

describe("detectImageMime", () => {
  it.each([
    [
      "PNG",
      [0x89, ...ascii("PNG"), 0x0d, 0x0a, 0x1a, 0x0a],
      "image/png",
    ],
    ["JPEG", [0xff, 0xd8, 0xff, 0xe0], "image/jpeg"],
    ["GIF", ascii("GIF89a"), "image/gif"],
    [
      "WebP",
      [...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")],
      "image/webp",
    ],
    ["BMP", ascii("BM"), "image/bmp"],
    ["TIFF", [0x49, 0x49, 0x2a, 0], "image/tiff"],
    ["ICO", [0, 0, 1, 0], "image/vnd.microsoft.icon"],
  ])("通过魔数识别 %s", (_label, bytes, expected) => {
    expect(detectImageMimeFromBytes(new Uint8Array(bytes))).toBe(expected);
  });

  it("不会信任伪造的 Blob.type", async () => {
    const blob = new Blob(["not an image"], { type: "image/png" });
    await expect(detectImageMime(blob)).resolves.toBeNull();
  });

  it("识别带 XML 声明的 SVG", () => {
    const bytes = new TextEncoder().encode(
      '<?xml version="1.0"?><!-- icon --><svg viewBox="0 0 24 24"></svg>',
    );
    expect(detectImageMimeFromBytes(bytes)).toBe("image/svg+xml");
  });

  it("统一输出 MIME 并拒绝非 Canvas 输出格式", () => {
    expect(normalizeOutputMime(" IMAGE/JPG; charset=binary ")).toBe(
      "image/jpeg",
    );
    expect(normalizeOutputMime("image/x-icon")).toBe(
      "image/vnd.microsoft.icon",
    );
    expect(normalizeOutputMime("image/svg+xml")).toBe("image/svg+xml");
    expect(() => normalizeOutputMime("image/gif")).toThrow("不支持的输出格式");
  });
});
