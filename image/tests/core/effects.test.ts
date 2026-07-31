import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addImagePadding,
  addImageWatermark,
  addRoundedCorners,
  addTextWatermark,
} from "@/core/image/effects";

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const webpBytes = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

function sourcePng(
  name = "source.png",
  width = 400,
  height = 200,
): File {
  const bytes = new Uint8Array(24);
  bytes.set(pngBytes);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return new File([bytes], name, { type: "image/png" });
}

function createContext() {
  const gradient = {
    addColorStop: vi.fn(),
  };
  return {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    lineJoin: "miter",
    textAlign: "start",
    textBaseline: "alphabetic",
    font: "",
    globalAlpha: 1,
    shadowColor: "",
    shadowBlur: 0,
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    strokeText: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 20 })),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arcTo: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    gradient,
  };
}

function stubBitmapSequence(
  dimensions: Array<{ width: number; height: number }>,
): ReturnType<typeof vi.fn> {
  const queue = [...dimensions];
  return vi.fn().mockImplementation(async () => {
    const current = queue.shift() ?? dimensions.at(-1)!;
    return {
      ...current,
      close: vi.fn(),
    };
  });
}

function stubCanvas(
  context: ReturnType<typeof createContext>,
  overrideMime?: string,
) {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (callback, requestedMime) => {
      const mime = overrideMime ?? requestedMime ?? "image/png";
      callback(
        new Blob([mime === "image/webp" ? webpBytes : pngBytes], {
          type: mime,
        }),
      );
    },
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("image effects", () => {
  it("按位置、字号、颜色、透明度与旋转绘制文字水印并释放位图", async () => {
    const createBitmap = stubBitmapSequence([
      { width: 400, height: 200 },
      { width: 400, height: 200 },
    ]);
    vi.stubGlobal("createImageBitmap", createBitmap);
    const context = createContext();
    stubCanvas(context);

    const result = await addTextWatermark(sourcePng(), {
      text: "Image Studio",
      position: "bottom-right",
      fontSize: 40,
      color: "#ffffff",
      opacity: 0.7,
      margin: 20,
      rotation: -12,
      output: { mime: "image/png" },
    });

    expect(result).toMatchObject({
      width: 400,
      height: 200,
      mime: "image/png",
    });
    expect(context.globalAlpha).toBe(0.7);
    expect(context.fillStyle).toBe("#ffffff");
    expect(context.font).toContain("40px");
    expect(context.translate).toHaveBeenNthCalledWith(1, 380, 155);
    expect(context.rotate).toHaveBeenCalledWith((-12 * Math.PI) / 180);
    expect(context.strokeText).toHaveBeenCalledWith("Image Studio", 0, 0);
    expect(context.fillText).toHaveBeenCalledWith("Image Studio", 0, 0);

    const bitmaps = await Promise.all(
      createBitmap.mock.results.map((entry) => entry.value),
    );
    expect(bitmaps.every((bitmap) => bitmap.close.mock.calls.length === 1)).toBe(
      true,
    );
  });

  it("可平铺文字水印，并限制绘制数量避免极端参数阻塞页面", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      stubBitmapSequence([
        { width: 800, height: 600 },
        { width: 800, height: 600 },
      ]),
    );
    const context = createContext();
    stubCanvas(context);

    await addTextWatermark(sourcePng("large.png", 800, 600), {
      text: "Local",
      position: "center",
      fontSize: 24,
      color: "#111827",
      opacity: 0.25,
      rotation: -30,
      tiled: true,
      tileGap: 36,
      output: { mime: "image/png" },
    });

    expect(context.fillText.mock.calls.length).toBeGreaterThan(1);
    expect(context.fillText.mock.calls.length).toBeLessThanOrEqual(2000);
    expect(context.rotate).toHaveBeenCalledWith((-30 * Math.PI) / 180);
  });

  it("按比例缩放、定位并旋转 Logo 图片水印", async () => {
    const createBitmap = stubBitmapSequence([
      { width: 400, height: 200 },
      { width: 400, height: 200 },
      { width: 100, height: 50 },
      { width: 100, height: 50 },
    ]);
    vi.stubGlobal("createImageBitmap", createBitmap);
    const context = createContext();
    stubCanvas(context);

    const result = await addImageWatermark(
      sourcePng(),
      {
        logo: sourcePng("logo.png", 100, 50),
        position: "bottom-right",
        sizePercent: 25,
        opacity: 0.6,
        margin: 20,
        rotation: 15,
        output: { mime: "image/png" },
      },
    );

    expect(result).toMatchObject({ width: 400, height: 200 });
    expect(context.translate).toHaveBeenCalledWith(330, 155);
    expect(context.rotate).toHaveBeenCalledWith((15 * Math.PI) / 180);
    expect(context.drawImage).toHaveBeenCalledTimes(2);
    expect(context.drawImage.mock.calls[1]?.slice(1)).toEqual([
      -50,
      -25,
      100,
      50,
    ]);

    const bitmaps = await Promise.all(
      createBitmap.mock.results.map((entry) => entry.value),
    );
    expect(bitmaps).toHaveLength(4);
    expect(bitmaps.every((bitmap) => bitmap.close.mock.calls.length === 1)).toBe(
      true,
    );
  });

  it("支持百分比单位与四角独立圆角", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      stubBitmapSequence([
        { width: 400, height: 200 },
        { width: 400, height: 200 },
      ]),
    );
    const context = createContext();
    stubCanvas(context);

    await addRoundedCorners(sourcePng(), {
      radius: {
        topLeft: 10,
        topRight: 20,
        bottomRight: 30,
        bottomLeft: 40,
      },
      unit: "percent",
      output: { mime: "image/png" },
    });

    expect(context.moveTo).toHaveBeenCalledWith(20, 0);
    expect(context.lineTo).toHaveBeenNthCalledWith(1, 360, 0);
    expect(context.arcTo).toHaveBeenNthCalledWith(1, 400, 0, 400, 40, 40);
    expect(context.arcTo).toHaveBeenNthCalledWith(
      2,
      400,
      200,
      340,
      200,
      60,
    );
    expect(context.clip).toHaveBeenCalledOnce();
  });

  it("按四边独立尺寸和纯色背景补边", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      stubBitmapSequence([
        { width: 400, height: 200 },
        { width: 400, height: 200 },
      ]),
    );
    const context = createContext();
    stubCanvas(context);

    const result = await addImagePadding(sourcePng(), {
      padding: { top: 10, right: 15, bottom: 20, left: 5 },
      background: "#f3f4f6",
      output: { mime: "image/png" },
    });

    expect(result).toMatchObject({ width: 420, height: 230 });
    expect(context.fillStyle).toBe("#f3f4f6");
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 420, 230);
    expect(context.drawImage).toHaveBeenCalledWith(
      expect.anything(),
      5,
      10,
      400,
      200,
    );
  });

  it("PNG 补边可保持透明背景", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      stubBitmapSequence([
        { width: 400, height: 200 },
        { width: 400, height: 200 },
      ]),
    );
    const context = createContext();
    stubCanvas(context);

    await addImagePadding(sourcePng(), {
      padding: 24,
      background: null,
      output: { mime: "image/png" },
    });

    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 448, 248);
    expect(context.fillRect).not.toHaveBeenCalled();
  });

  it("支持带透明度与方向的渐变补边", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      stubBitmapSequence([
        { width: 400, height: 200 },
        { width: 400, height: 200 },
      ]),
    );
    const context = createContext();
    stubCanvas(context);

    await addImagePadding(sourcePng(), {
      padding: { top: 10, right: 15, bottom: 20, left: 5 },
      background: {
        type: "linear-gradient",
        startColor: "#ffffff",
        endColor: "#c7d2fe",
        direction: "vertical",
        opacity: 0.55,
      },
      output: { mime: "image/png" },
    });

    expect(context.createLinearGradient).toHaveBeenCalledWith(0, 0, 0, 230);
    expect(context.gradient.addColorStop).toHaveBeenNthCalledWith(
      1,
      0,
      "#ffffff",
    );
    expect(context.gradient.addColorStop).toHaveBeenNthCalledWith(
      2,
      1,
      "#c7d2fe",
    );
    expect(context.globalAlpha).toBe(0.55);
  });

  it("拒绝浏览器静默回退的输出格式并释放位图", async () => {
    const createBitmap = stubBitmapSequence([
      { width: 400, height: 200 },
      { width: 400, height: 200 },
    ]);
    vi.stubGlobal("createImageBitmap", createBitmap);
    const context = createContext();
    stubCanvas(context, "image/png");

    await expect(
      addRoundedCorners(sourcePng(), {
        radius: 24,
        output: { mime: "image/webp" },
      }),
    ).rejects.toThrow("未按要求输出");

    const bitmaps = await Promise.all(
      createBitmap.mock.results.map((entry) => entry.value),
    );
    expect(bitmaps.every((bitmap) => bitmap.close.mock.calls.length === 1)).toBe(
      true,
    );
  });
});
