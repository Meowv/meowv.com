export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function normalizeHex(source: string): string {
  const value = source.trim().replace(/^#/, '');
  const expanded =
    value.length === 3
      ? value
          .split('')
          .map((item) => item + item)
          .join('')
      : value;
  if (!/^[\da-f]{6}$/i.test(expanded)) throw new Error('请输入 3 位或 6 位十六进制颜色。');
  return `#${expanded.toUpperCase()}`;
}

export function hexToRgb(source: string): RgbColor {
  const hex = normalizeHex(source).slice(1);
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((value) =>
      Math.round(clamp(value, 0, 255))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const [red, green, blue] = [r, g, b].map((value) => clamp(value, 0, 255) / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let h = 0;
  if (delta) {
    if (max === red) h = ((green - blue) / delta) % 6;
    else if (max === green) h = (blue - red) / delta + 2;
    else h = (red - green) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = delta ? delta / (1 - Math.abs(2 * l - 1)) : 0;
  return { h: Math.round(h), s: Math.round(s * 1000) / 10, l: Math.round(l * 1000) / 10 };
}

export function hslToRgb(h: number, s: number, l: number): RgbColor {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s, 0, 100) / 100;
  const lightness = clamp(l, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - chroma / 2;
  const [red, green, blue] =
    hue < 60
      ? [chroma, x, 0]
      : hue < 120
        ? [x, chroma, 0]
        : hue < 180
          ? [0, chroma, x]
          : hue < 240
            ? [0, x, chroma]
            : hue < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return {
    r: Math.round((red + m) * 255),
    g: Math.round((green + m) * 255),
    b: Math.round((blue + m) * 255),
  };
}

export function mixColor(base: string, target: '#FFFFFF' | '#000000', ratio: number): string {
  const from = hexToRgb(base);
  const to = hexToRgb(target);
  const amount = clamp(ratio, 0, 1);
  return rgbToHex(
    from.r + (to.r - from.r) * amount,
    from.g + (to.g - from.g) * amount,
    from.b + (to.b - from.b) * amount,
  );
}

export function colorDetails(source: string): Record<string, unknown> {
  const hex = normalizeHex(source);
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  return {
    hex,
    rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
    hsl: `hsl(${hsl.h} ${hsl.s}% ${hsl.l}%)`,
    red: rgb.r,
    green: rgb.g,
    blue: rgb.b,
    hue: hsl.h,
    saturation: hsl.s,
    lightness: hsl.l,
  };
}

export function shadePalette(base: string): Record<string, string> {
  return {
    50: mixColor(base, '#FFFFFF', 0.92),
    100: mixColor(base, '#FFFFFF', 0.8),
    200: mixColor(base, '#FFFFFF', 0.62),
    300: mixColor(base, '#FFFFFF', 0.42),
    400: mixColor(base, '#FFFFFF', 0.2),
    500: normalizeHex(base),
    600: mixColor(base, '#000000', 0.12),
    700: mixColor(base, '#000000', 0.26),
    800: mixColor(base, '#000000', 0.4),
    900: mixColor(base, '#000000', 0.54),
    950: mixColor(base, '#000000', 0.68),
  };
}
