import {
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_SIDE,
  readImageDimensions,
} from "./dimensions";
import {
  detectImageMime,
  isMatchingMime,
  normalizeMime,
} from "./formats";
import { sanitizeSvgFile } from "./process";

export type EffectOutputMime = "image/png" | "image/jpeg" | "image/webp";
export type ImageEffectMode = "watermark" | "rounded" | "padding";

export type WatermarkPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface EffectOutputOptions {
  mime: EffectOutputMime;
  quality?: number;
  background?: string;
}

export interface WatermarkOptions {
  text: string;
  position: WatermarkPosition;
  fontSize: number;
  color: string;
  opacity: number;
  margin?: number;
  rotation?: number;
  tiled?: boolean;
  tileGap?: number;
  output: EffectOutputOptions;
}

export interface ImageWatermarkOptions {
  logo: File;
  position: WatermarkPosition;
  sizePercent: number;
  opacity: number;
  margin?: number;
  rotation?: number;
  tiled?: boolean;
  tileGap?: number;
  output: EffectOutputOptions;
}

export type CornerRadiusUnit = "px" | "percent";

export interface CornerRadii {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

export interface RoundedCornerOptions {
  radius: number | CornerRadii;
  unit?: CornerRadiusUnit;
  output: EffectOutputOptions;
}

export interface ImagePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type PaddingGradientDirection =
  | "horizontal"
  | "vertical"
  | "diagonal";

export type PaddingBackground =
  | string
  | null
  | {
      type: "solid";
      color: string;
      opacity?: number;
    }
  | {
      type: "linear-gradient";
      startColor: string;
      endColor: string;
      direction: PaddingGradientDirection;
      opacity?: number;
    };

export interface PaddingOptions {
  padding: number | ImagePadding;
  background: PaddingBackground;
  output: EffectOutputOptions;
}

export interface EffectResult {
  blob: Blob;
  width: number;
  height: number;
  mime: EffectOutputMime;
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
}

type CanvasTarget = HTMLCanvasElement | OffscreenCanvas;
type CanvasContext =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

const MAX_EFFECT_SIDE = 16_384;
const MAX_EFFECT_PIXELS = 50_000_000;
const MAX_WATERMARK_LENGTH = 500;
const DEFAULT_MARGIN = 24;

function abortError(): DOMException {
  return new DOMException("图片处理已取消", "AbortError");
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw abortError();
  }
}

function assertFiniteRange(
  value: number,
  label: string,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${label}必须在 ${min} 到 ${max} 之间`);
  }
  return value;
}

function assertNonNegativeInteger(value: number, label: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label}必须是大于或等于 0 的整数`);
  }
  return value;
}

function assertSafeDimensions(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_EFFECT_SIDE ||
    height > MAX_EFFECT_SIDE ||
    width * height > MAX_EFFECT_PIXELS
  ) {
    throw new RangeError(
      `输出尺寸过大，最长边不能超过 ${MAX_EFFECT_SIDE} px，且总像素不能超过 5000 万`,
    );
  }
}

function normalizedOutput(
  output: EffectOutputOptions,
): Required<Pick<EffectOutputOptions, "mime">> &
  Pick<EffectOutputOptions, "quality" | "background"> {
  if (
    output.mime !== "image/png" &&
    output.mime !== "image/jpeg" &&
    output.mime !== "image/webp"
  ) {
    throw new TypeError(`不支持的效果输出格式：${output.mime}`);
  }

  if (output.quality !== undefined) {
    assertFiniteRange(output.quality, "输出质量", 0, 1);
  }

  return output;
}

async function prepareSource(file: File): Promise<File> {
  const mime = await detectImageMime(file);
  if (!mime) {
    throw new TypeError("无法识别图片格式，文件可能已损坏");
  }

  return mime === "image/svg+xml" ? sanitizeSvgFile(file) : file;
}

function loadHtmlImage(
  blob: Blob,
  signal?: AbortSignal,
): Promise<DecodedImage> {
  if (
    typeof Image === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return Promise.reject(new Error("当前浏览器不支持图片解码"));
  }

  checkAborted(signal);
  const url = URL.createObjectURL(blob);
  const image = new Image();

  return new Promise((resolve, reject) => {
    let settled = false;

    const removeListeners = () => {
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener("abort", onAbort);
    };
    const dispose = () => {
      removeListeners();
      image.src = "";
      URL.revokeObjectURL(url);
    };
    const onAbort = () => {
      if (settled) {
        return;
      }
      settled = true;
      dispose();
      reject(abortError());
    };

    image.onload = () => {
      if (settled) {
        return;
      }
      settled = true;
      removeListeners();
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        dispose,
      });
    };
    image.onerror = () => {
      if (settled) {
        return;
      }
      settled = true;
      dispose();
      reject(new TypeError("图片解码失败，格式可能不受浏览器支持"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    image.decoding = "async";
    image.src = url;
  });
}

async function decodeImage(
  blob: Blob,
  signal?: AbortSignal,
): Promise<DecodedImage> {
  checkAborted(signal);

  if (typeof createImageBitmap !== "function") {
    return loadHtmlImage(blob, signal);
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, {
      imageOrientation: "from-image",
    });
  } catch (firstError) {
    checkAborted(signal);
    try {
      bitmap = await createImageBitmap(blob);
    } catch {
      if (
        firstError instanceof DOMException &&
        firstError.name === "AbortError"
      ) {
        throw firstError;
      }
      return loadHtmlImage(blob, signal);
    }
  }

  if (signal?.aborted) {
    bitmap.close();
    throw abortError();
  }

  return {
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    dispose: () => bitmap.close(),
  };
}

function createCanvas(width: number, height: number): CanvasTarget {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }

  throw new Error("当前浏览器不支持 Canvas 图片处理");
}

function getContext(canvas: CanvasTarget): CanvasContext {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("无法创建 Canvas 2D 上下文");
  }
  return context;
}

function releaseCanvas(canvas: CanvasTarget): void {
  canvas.width = 0;
  canvas.height = 0;
}

async function encodeCanvas(
  canvas: CanvasTarget,
  output: ReturnType<typeof normalizedOutput>,
): Promise<Blob> {
  if ("toBlob" in canvas) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error(`浏览器无法编码 ${output.mime} 图片`));
            }
          },
          output.mime,
          output.quality,
        );
      } catch (error) {
        reject(error);
      }
    });
  }

  return (canvas as OffscreenCanvas).convertToBlob({
    type: output.mime,
    quality: output.quality,
  });
}

async function assertEncodedMime(
  blob: Blob,
  expected: EffectOutputMime,
): Promise<void> {
  const detected = await detectImageMime(blob);
  if (
    !isMatchingMime(blob.type, expected) ||
    normalizeMime(detected ?? "") !== expected
  ) {
    throw new TypeError(
      `浏览器未按要求输出 ${expected}，可能不支持该编码格式`,
    );
  }
}

function fillOutputBackground(
  context: CanvasContext,
  width: number,
  height: number,
  output: ReturnType<typeof normalizedOutput>,
): void {
  const background =
    output.background ?? (output.mime === "image/jpeg" ? "#ffffff" : undefined);

  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
  } else {
    context.clearRect(0, 0, width, height);
  }
}

async function withDecodedSource(
  file: File,
  signal: AbortSignal | undefined,
  draw: (
    decoded: DecodedImage,
    preparedFile: File,
  ) => Promise<EffectResult>,
): Promise<EffectResult> {
  checkAborted(signal);
  const preparedFile = await prepareSource(file);
  checkAborted(signal);

  const safeDimensions = await readImageDimensions(preparedFile);
  if (
    safeDimensions.width > MAX_IMAGE_SIDE ||
    safeDimensions.height > MAX_IMAGE_SIDE ||
    safeDimensions.width * safeDimensions.height > MAX_IMAGE_PIXELS
  ) {
    throw new RangeError("IMAGE_TOO_LARGE");
  }
  checkAborted(signal);

  const decoded = await decodeImage(preparedFile, signal);
  try {
    assertSafeDimensions(decoded.width, decoded.height);
    return await draw(decoded, preparedFile);
  } finally {
    decoded.dispose();
  }
}

async function renderEffect(
  decoded: DecodedImage,
  width: number,
  height: number,
  outputOptions: EffectOutputOptions,
  draw: (context: CanvasContext) => void,
  signal?: AbortSignal,
): Promise<EffectResult> {
  assertSafeDimensions(width, height);
  const output = normalizedOutput(outputOptions);
  const canvas = createCanvas(width, height);

  try {
    const context = getContext(canvas);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    fillOutputBackground(context, width, height, output);
    checkAborted(signal);
    draw(context);
    checkAborted(signal);

    const blob = await encodeCanvas(canvas, output);
    checkAborted(signal);
    await assertEncodedMime(blob, output.mime);
    checkAborted(signal);

    return {
      blob,
      width,
      height,
      mime: output.mime,
    };
  } finally {
    releaseCanvas(canvas);
  }
}

function watermarkAnchor(
  position: WatermarkPosition,
  width: number,
  height: number,
  blockHeight: number,
  margin: number,
): {
  x: number;
  y: number;
  align: CanvasTextAlign;
} {
  const horizontal = position.split("-").at(-1);
  const vertical = position.split("-").at(0);

  const x =
    horizontal === "left"
      ? margin
      : horizontal === "right"
        ? width - margin
        : width / 2;
  const y =
    vertical === "top"
      ? margin
      : vertical === "bottom"
        ? height - margin - blockHeight
        : (height - blockHeight) / 2;

  return {
    x,
    y,
    align:
      horizontal === "left"
        ? "left"
        : horizontal === "right"
          ? "right"
          : "center",
  };
}

function watermarkRectPosition(
  position: WatermarkPosition,
  canvasWidth: number,
  canvasHeight: number,
  itemWidth: number,
  itemHeight: number,
  margin: number,
): { x: number; y: number } {
  const horizontal = position.split("-").at(-1);
  const vertical = position.split("-").at(0);

  const x =
    horizontal === "left"
      ? margin
      : horizontal === "right"
        ? canvasWidth - margin - itemWidth
        : (canvasWidth - itemWidth) / 2;
  const y =
    vertical === "top"
      ? margin
      : vertical === "bottom"
        ? canvasHeight - margin - itemHeight
        : (canvasHeight - itemHeight) / 2;

  return {
    x: Math.max(0, Math.min(x, canvasWidth - itemWidth)),
    y: Math.max(0, Math.min(y, canvasHeight - itemHeight)),
  };
}

function drawTiled(
  context: CanvasContext,
  canvasWidth: number,
  canvasHeight: number,
  itemWidth: number,
  itemHeight: number,
  gap: number,
  rotation: number,
  drawItem: (x: number, y: number) => void,
): void {
  const extent = Math.ceil(Math.hypot(canvasWidth, canvasHeight));
  let stepX = Math.max(8, itemWidth + gap);
  let stepY = Math.max(8, itemHeight + gap);
  const estimatedCount =
    Math.ceil((extent * 2) / stepX) * Math.ceil((extent * 2) / stepY);

  if (estimatedCount > 2000) {
    const scale = Math.sqrt(estimatedCount / 2000);
    stepX *= scale;
    stepY *= scale;
  }

  context.save();
  context.translate(canvasWidth / 2, canvasHeight / 2);
  context.rotate((rotation * Math.PI) / 180);
  for (let y = -extent; y <= extent; y += stepY) {
    for (let x = -extent; x <= extent; x += stepX) {
      drawItem(x, y);
    }
  }
  context.restore();
}

/**
 * 在浏览器本地为单张图片添加文字水印。
 */
export async function addTextWatermark(
  file: File,
  options: WatermarkOptions,
  signal?: AbortSignal,
): Promise<EffectResult> {
  const text = options.text.trim();
  if (!text) {
    throw new TypeError("请输入水印文字");
  }
  if (text.length > MAX_WATERMARK_LENGTH) {
    throw new RangeError(`水印文字不能超过 ${MAX_WATERMARK_LENGTH} 个字符`);
  }

  const fontSize = assertFiniteRange(
    Math.round(options.fontSize),
    "水印字号",
    8,
    512,
  );
  const opacity = assertFiniteRange(options.opacity, "水印透明度", 0, 1);
  const margin = assertFiniteRange(
    Math.round(options.margin ?? DEFAULT_MARGIN),
    "水印边距",
    0,
    4096,
  );
  const rotation = assertFiniteRange(
    options.rotation ?? 0,
    "水印旋转角度",
    -180,
    180,
  );
  const color = options.color.trim();
  if (!color || color.length > 64) {
    throw new TypeError("水印颜色无效");
  }
  const tileGap = assertFiniteRange(
    Math.round(options.tileGap ?? fontSize * 2),
    "平铺间距",
    0,
    4096,
  );

  return withDecodedSource(file, signal, async (decoded) =>
    renderEffect(
      decoded,
      decoded.width,
      decoded.height,
      options.output,
      (context) => {
        context.drawImage(decoded.source, 0, 0, decoded.width, decoded.height);

        const lines = text.split(/\r?\n/).slice(0, 10);
        const lineHeight = Math.round(fontSize * 1.25);
        const blockHeight = lineHeight * lines.length;

        context.save();
        context.globalAlpha = opacity;
        context.fillStyle = color;
        context.strokeStyle = "rgb(0 0 0 / 45%)";
        context.lineWidth = Math.max(1, Math.round(fontSize * 0.075));
        context.lineJoin = "round";
        context.textBaseline = "top";
        context.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;
        context.shadowColor = "rgb(0 0 0 / 35%)";
        context.shadowBlur = Math.max(2, Math.round(fontSize * 0.12));

        if (options.tiled) {
          context.textAlign = "center";
          const textWidth = Math.max(
            fontSize,
            ...lines.map((line) => context.measureText(line).width),
          );
          drawTiled(
            context,
            decoded.width,
            decoded.height,
            textWidth,
            blockHeight,
            tileGap,
            rotation,
            (x, y) => {
              lines.forEach((line, index) => {
                const lineY = y + index * lineHeight - blockHeight / 2;
                context.strokeText(line, x, lineY);
                context.fillText(line, x, lineY);
              });
            },
          );
        } else {
          const anchor = watermarkAnchor(
            options.position,
            decoded.width,
            decoded.height,
            blockHeight,
            margin,
          );
          context.textAlign = anchor.align;
          context.translate(anchor.x, anchor.y + blockHeight / 2);
          context.rotate((rotation * Math.PI) / 180);
          context.translate(0, -blockHeight / 2);

          lines.forEach((line, index) => {
            const y = index * lineHeight;
            context.strokeText(line, 0, y);
            context.fillText(line, 0, y);
          });
        }
        context.restore();
      },
      signal,
    ),
  );
}

/**
 * 在浏览器本地为单张图片添加 Logo 图片水印。
 */
export async function addImageWatermark(
  file: File,
  options: ImageWatermarkOptions,
  signal?: AbortSignal,
): Promise<EffectResult> {
  const sizePercent = assertFiniteRange(
    options.sizePercent,
    "Logo 大小",
    1,
    100,
  );
  const opacity = assertFiniteRange(options.opacity, "Logo 透明度", 0, 1);
  const margin = assertFiniteRange(
    Math.round(options.margin ?? DEFAULT_MARGIN),
    "Logo 边距",
    0,
    4096,
  );
  const rotation = assertFiniteRange(
    options.rotation ?? 0,
    "Logo 旋转角度",
    -180,
    180,
  );
  const tileGap = assertFiniteRange(
    Math.round(options.tileGap ?? 48),
    "平铺间距",
    0,
    4096,
  );

  return withDecodedSource(file, signal, async (decoded) =>
    withDecodedSource(options.logo, signal, async (logo) => {
      const requestedWidth = Math.max(
        1,
        Math.round((decoded.width * sizePercent) / 100),
      );
      const requestedHeight = Math.max(
        1,
        Math.round((requestedWidth / logo.width) * logo.height),
      );
      const fitScale = Math.min(
        1,
        decoded.width / requestedWidth,
        decoded.height / requestedHeight,
      );
      const logoWidth = Math.max(1, Math.round(requestedWidth * fitScale));
      const logoHeight = Math.max(1, Math.round(requestedHeight * fitScale));

      return renderEffect(
        decoded,
        decoded.width,
        decoded.height,
        options.output,
        (context) => {
          context.drawImage(
            decoded.source,
            0,
            0,
            decoded.width,
            decoded.height,
          );
          context.save();
          context.globalAlpha = opacity;

          if (options.tiled) {
            drawTiled(
              context,
              decoded.width,
              decoded.height,
              logoWidth,
              logoHeight,
              tileGap,
              rotation,
              (x, y) => {
                context.drawImage(
                  logo.source,
                  x - logoWidth / 2,
                  y - logoHeight / 2,
                  logoWidth,
                  logoHeight,
                );
              },
            );
          } else {
            const position = watermarkRectPosition(
              options.position,
              decoded.width,
              decoded.height,
              logoWidth,
              logoHeight,
              margin,
            );
            context.translate(
              position.x + logoWidth / 2,
              position.y + logoHeight / 2,
            );
            context.rotate((rotation * Math.PI) / 180);
            context.drawImage(
              logo.source,
              -logoWidth / 2,
              -logoHeight / 2,
              logoWidth,
              logoHeight,
            );
          }
          context.restore();
        },
        signal,
      );
    }),
  );
}

function normalizeCornerRadii(
  radius: number | CornerRadii,
  unit: CornerRadiusUnit,
  width: number,
  height: number,
): CornerRadii {
  const values =
    typeof radius === "number"
      ? {
          topLeft: radius,
          topRight: radius,
          bottomRight: radius,
          bottomLeft: radius,
        }
      : radius;
  const max = unit === "percent" ? 50 : 8192;
  const factor = unit === "percent" ? Math.min(width, height) / 100 : 1;
  const converted = {
    topLeft:
      assertFiniteRange(values.topLeft, "左上圆角", 0, max) * factor,
    topRight:
      assertFiniteRange(values.topRight, "右上圆角", 0, max) * factor,
    bottomRight:
      assertFiniteRange(values.bottomRight, "右下圆角", 0, max) * factor,
    bottomLeft:
      assertFiniteRange(values.bottomLeft, "左下圆角", 0, max) * factor,
  };
  const scale = Math.min(
    1,
    width / Math.max(1, converted.topLeft + converted.topRight),
    width / Math.max(1, converted.bottomLeft + converted.bottomRight),
    height / Math.max(1, converted.topLeft + converted.bottomLeft),
    height / Math.max(1, converted.topRight + converted.bottomRight),
  );

  return {
    topLeft: converted.topLeft * scale,
    topRight: converted.topRight * scale,
    bottomRight: converted.bottomRight * scale,
    bottomLeft: converted.bottomLeft * scale,
  };
}

function roundedRectPath(
  context: CanvasContext,
  width: number,
  height: number,
  radii: CornerRadii,
): void {
  context.beginPath();
  context.moveTo(radii.topLeft, 0);
  context.lineTo(width - radii.topRight, 0);
  context.arcTo(
    width,
    0,
    width,
    radii.topRight,
    radii.topRight,
  );
  context.lineTo(width, height - radii.bottomRight);
  context.arcTo(
    width,
    height,
    width - radii.bottomRight,
    height,
    radii.bottomRight,
  );
  context.lineTo(radii.bottomLeft, height);
  context.arcTo(
    0,
    height,
    0,
    height - radii.bottomLeft,
    radii.bottomLeft,
  );
  context.lineTo(0, radii.topLeft);
  context.arcTo(0, 0, radii.topLeft, 0, radii.topLeft);
  context.closePath();
}

/**
 * 为图片添加圆角。PNG 与 WebP 默认保留透明圆角区域，JPEG 默认使用白色背景。
 */
export async function addRoundedCorners(
  file: File,
  options: RoundedCornerOptions,
  signal?: AbortSignal,
): Promise<EffectResult> {
  return withDecodedSource(file, signal, async (decoded) => {
    const radii = normalizeCornerRadii(
      options.radius,
      options.unit ?? "px",
      decoded.width,
      decoded.height,
    );

    return renderEffect(
      decoded,
      decoded.width,
      decoded.height,
      options.output,
      (context) => {
        context.save();
        roundedRectPath(context, decoded.width, decoded.height, radii);
        context.clip();
        context.drawImage(decoded.source, 0, 0, decoded.width, decoded.height);
        context.restore();
      },
      signal,
    );
  });
}

function normalizePadding(padding: number | ImagePadding): ImagePadding {
  if (typeof padding === "number") {
    const value = assertNonNegativeInteger(padding, "留白边距");
    return { top: value, right: value, bottom: value, left: value };
  }

  return {
    top: assertNonNegativeInteger(padding.top, "上边距"),
    right: assertNonNegativeInteger(padding.right, "右边距"),
    bottom: assertNonNegativeInteger(padding.bottom, "下边距"),
    left: assertNonNegativeInteger(padding.left, "左边距"),
  };
}

function assertColor(color: string, label: string): string {
  const normalized = color.trim();
  if (!normalized || normalized.length > 64) {
    throw new TypeError(`${label}无效`);
  }
  return normalized;
}

function normalizePaddingBackground(
  background: PaddingBackground,
): Exclude<PaddingBackground, string | null> | null {
  if (background === null) {
    return null;
  }
  if (typeof background === "string") {
    return {
      type: "solid",
      color: assertColor(background, "补边背景颜色"),
      opacity: 1,
    };
  }
  if (background.type === "solid") {
    return {
      ...background,
      color: assertColor(background.color, "补边背景颜色"),
      opacity: assertFiniteRange(
        background.opacity ?? 1,
        "补边背景透明度",
        0,
        1,
      ),
    };
  }

  return {
    ...background,
    startColor: assertColor(background.startColor, "渐变起始颜色"),
    endColor: assertColor(background.endColor, "渐变结束颜色"),
    opacity: assertFiniteRange(
      background.opacity ?? 1,
      "渐变透明度",
      0,
      1,
    ),
  };
}

function fillPaddingBackground(
  context: CanvasContext,
  width: number,
  height: number,
  background: ReturnType<typeof normalizePaddingBackground>,
): void {
  if (!background) {
    return;
  }

  context.save();
  context.globalAlpha = background.opacity ?? 1;
  if (background.type === "solid") {
    context.fillStyle = background.color;
  } else {
    const coordinates =
      background.direction === "horizontal"
        ? ([0, 0, width, 0] as const)
        : background.direction === "vertical"
          ? ([0, 0, 0, height] as const)
          : ([0, 0, width, height] as const);
    const gradient = context.createLinearGradient(...coordinates);
    gradient.addColorStop(0, background.startColor);
    gradient.addColorStop(1, background.endColor);
    context.fillStyle = gradient;
  }
  context.fillRect(0, 0, width, height);
  context.restore();
}

/**
 * 在原图四周添加纯色、渐变或透明留白，可使用统一边距或分别设置四边。
 */
export async function addImagePadding(
  file: File,
  options: PaddingOptions,
  signal?: AbortSignal,
): Promise<EffectResult> {
  const padding = normalizePadding(options.padding);
  const background = normalizePaddingBackground(options.background);

  return withDecodedSource(file, signal, async (decoded) => {
    const width = decoded.width + padding.left + padding.right;
    const height = decoded.height + padding.top + padding.bottom;

    return renderEffect(
      decoded,
      width,
      height,
      {
        ...options.output,
        background:
          options.output.mime === "image/jpeg" ? "#ffffff" : undefined,
      },
      (context) => {
        fillPaddingBackground(context, width, height, background);
        context.drawImage(
          decoded.source,
          padding.left,
          padding.top,
          decoded.width,
          decoded.height,
        );
      },
      signal,
    );
  });
}
