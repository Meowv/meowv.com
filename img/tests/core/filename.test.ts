import { describe, expect, it } from "vitest";

import { getOutputFilename } from "@/core/image";

describe("getOutputFilename", () => {
  it.each([
    ["photo.jpeg", "image/webp", undefined, "photo.webp"],
    ["archive.hero.PNG", "image/jpeg", "-compressed", "archive.hero-compressed.jpg"],
    ["folder/source", "image/png", "", "source.png"],
    [".cover", "image/png", "-small", ".cover-small.png"],
    ["mark.png", "image/x-icon", undefined, "mark.ico"],
    ["poster.webp", "image/svg+xml", "-copy", "poster-copy.svg"],
  ])("生成与 MIME 一致的扩展名", (name, mime, suffix, expected) => {
    expect(getOutputFilename(name, mime, suffix)).toBe(expected);
  });

  it("清理后缀中的文件系统保留字符", () => {
    expect(getOutputFilename("photo.png", "image/jpeg", ':small/"x"')).toBe(
      "photo-small--x-.jpg",
    );
  });
});
