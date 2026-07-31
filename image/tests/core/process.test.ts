import { afterEach, describe, expect, it, vi } from "vitest";

import { processImage } from "@/core/image";
import type { RenderSpec } from "@/types/image";

function sourcePng(): Blob {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new Blob([bytes], { type: "image/png" });
}

function sourceIco(): Blob {
  return new Blob(
    [new Uint8Array([0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x20, 0x20])],
    { type: "image/vnd.microsoft.icon" },
  );
}

function sourceSvg(): Blob {
  return new Blob(
    [
      [
        '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="24" onload="alert(1)">',
        '<script>alert(1)</script>',
        '<image href="https://example.com/tracker.png" width="32" height="24"/>',
        '<rect width="32" height="24" fill="#7c3aed"/>',
        "</svg>",
      ].join(""),
    ],
    { type: "image/svg+xml" },
  );
}

const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const spec: RenderSpec = {
  outputSize: { width: 320, height: 180 },
  output: { mime: "image/jpeg", quality: 0.8 },
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("processImage", () => {
  it("为 JPEG 铺设白色背景、校验输出并释放 ImageBitmap", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({
        width: 640,
        height: 360,
        close,
      }),
    );

    const context = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      fillStyle: "",
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback, mime) => {
        callback(new Blob([jpegBytes], { type: mime }));
      },
    );

    await expect(processImage(sourcePng(), spec)).resolves.toMatchObject({
      width: 320,
      height: 180,
      mime: "image/jpeg",
    });
    expect(context.fillStyle).toBe("#ffffff");
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 320, 180);
    expect(context.drawImage).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("拒绝浏览器静默回退的错误输出格式并释放位图", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({
        width: 640,
        height: 360,
        close,
      }),
    );

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => {
        callback(new Blob([jpegBytes], { type: "image/png" }));
      },
    );

    await expect(
      processImage(sourcePng(), {
        ...spec,
        output: { mime: "image/webp" },
      }),
    ).rejects.toThrow("未按要求输出");
    expect(close).toHaveBeenCalledOnce();
  });

  it("支持读取 ICO 并转换为 PNG", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({
        width: 32,
        height: 32,
        close,
      }),
    );

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback, mime) => {
        callback(new Blob([pngBytes], { type: mime }));
      },
    );

    const result = await processImage(sourceIco(), {
      outputSize: { width: 32, height: 32 },
      output: { mime: "image/png" },
    });

    expect(result).toMatchObject({
      width: 32,
      height: 32,
      mime: "image/png",
    });
    expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(pngBytes);
    expect(close).toHaveBeenCalledOnce();
  });

  it("生成包含 PNG 图像数据的标准 ICO", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({
        width: 640,
        height: 320,
        close,
      }),
    );

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback, mime) => {
        callback(new Blob([pngBytes], { type: mime }));
      },
    );

    const result = await processImage(sourcePng(), {
      outputSize: { width: 256, height: 128 },
      output: { mime: "image/vnd.microsoft.icon" },
    });
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    const view = new DataView(bytes.buffer);

    expect(result).toMatchObject({
      width: 256,
      height: 128,
      mime: "image/vnd.microsoft.icon",
    });
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0, 0, 1, 0]);
    expect(view.getUint16(4, true)).toBe(1);
    expect(bytes[6]).toBe(0);
    expect(bytes[7]).toBe(128);
    expect(view.getUint32(14, true)).toBe(pngBytes.length);
    expect(view.getUint32(18, true)).toBe(22);
    expect(bytes.subarray(22)).toEqual(pngBytes);
    expect(close).toHaveBeenCalledOnce();
  });

  it("拒绝最长边超过 256 px 的 ICO 输出", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({
        width: 640,
        height: 320,
        close,
      }),
    );

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);

    await expect(
      processImage(sourcePng(), {
        outputSize: { width: 257, height: 128 },
        output: { mime: "image/vnd.microsoft.icon" },
      }),
    ).rejects.toThrow("ICO 输出最长边不能超过 256 px");
    expect(close).toHaveBeenCalledOnce();
  });

  it("生成嵌入 PNG 位图且尺寸一致的 SVG", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({
        width: 640,
        height: 360,
        close,
      }),
    );

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback, mime) => {
        callback(new Blob([pngBytes], { type: mime }));
      },
    );

    const result = await processImage(sourcePng(), {
      outputSize: { width: 320, height: 180 },
      output: { mime: "image/svg+xml" },
    });
    const markup = await result.blob.text();

    expect(result).toMatchObject({
      width: 320,
      height: 180,
      mime: "image/svg+xml",
    });
    expect(markup).toContain('width="320" height="180"');
    expect(markup).toContain('viewBox="0 0 320 180"');
    expect(markup).toContain(
      'href="data:image/png;base64,iVBORw0KGgo="',
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("读取 SVG 前会移除可执行内容和远程资源引用", async () => {
    let decodedSource = "";
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockImplementation(async (blob: Blob) => {
        decodedSource = await blob.text();
        return {
          width: 32,
          height: 24,
          close,
        };
      }),
    );

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback, mime) => {
        callback(new Blob([pngBytes], { type: mime }));
      },
    );

    await expect(
      processImage(sourceSvg(), {
        outputSize: { width: 32, height: 24 },
        output: { mime: "image/png" },
      }),
    ).resolves.toMatchObject({
      width: 32,
      height: 24,
      mime: "image/png",
    });

    expect(decodedSource).toContain("<svg");
    expect(decodedSource).toContain("<rect");
    expect(decodedSource).not.toContain("<script");
    expect(decodedSource).not.toContain("onload");
    expect(decodedSource).not.toContain("https://example.com");
    expect(close).toHaveBeenCalledOnce();
  });

  it("在开始前响应取消信号", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(processImage(sourcePng(), spec, controller.signal)).rejects.toMatchObject(
      { name: "AbortError" },
    );
  });
});
