import { afterEach, describe, expect, it, vi } from "vitest";

import { readImageDimensions } from "@/core/image";

function png(width: number, height: number): Blob {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return new Blob([bytes], { type: "image/png" });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readImageDimensions", () => {
  it("可直接从 PNG 头读取尺寸", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    await expect(readImageDimensions(png(1280, 720))).resolves.toEqual({
      width: 1280,
      height: 720,
    });
  });

  it("可读取 GIF 与 WebP VP8X 尺寸", async () => {
    vi.stubGlobal("createImageBitmap", undefined);

    const gif = new Uint8Array(10);
    gif.set(new TextEncoder().encode("GIF89a"));
    const gifView = new DataView(gif.buffer);
    gifView.setUint16(6, 320, true);
    gifView.setUint16(8, 180, true);

    const webp = new Uint8Array(30);
    webp.set(new TextEncoder().encode("RIFF"), 0);
    webp.set(new TextEncoder().encode("WEBP"), 8);
    webp.set(new TextEncoder().encode("VP8X"), 12);
    new DataView(webp.buffer).setUint32(16, 10, true);
    webp.set([0xff, 0x03, 0], 24);
    webp.set([0x7f, 0x02, 0], 27);

    await expect(
      readImageDimensions(new Blob([gif], { type: "image/gif" })),
    ).resolves.toEqual({ width: 320, height: 180 });
    await expect(
      readImageDimensions(new Blob([webp], { type: "image/webp" })),
    ).resolves.toEqual({ width: 1024, height: 640 });
  });

  it("使用 ImageBitmap 后始终主动 close", async () => {
    const close = vi.fn();
    const create = vi.fn().mockResolvedValue({
      width: 600,
      height: 400,
      close,
    });
    vi.stubGlobal("createImageBitmap", create);

    await expect(readImageDimensions(png(10, 10))).resolves.toEqual({
      width: 600,
      height: 400,
    });
    expect(create).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it.each([
    ["最长边超过限制", 32_769, 1],
    ["总像素超过限制", 10_000, 5_001],
  ])("在解码前拒绝%s的图片", async (_label, width, height) => {
    const create = vi.fn();
    vi.stubGlobal("createImageBitmap", create);

    await expect(readImageDimensions(png(width, height))).rejects.toMatchObject({
      name: "RangeError",
      message: "IMAGE_TOO_LARGE",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("拒绝非图片内容", async () => {
    await expect(readImageDimensions(new Blob(["hello"]))).rejects.toThrow(
      "无法识别图片格式",
    );
  });
});
