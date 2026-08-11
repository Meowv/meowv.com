export interface ImageColor {
  hex: string;
  rgb: string;
  hsl: string;
  count?: number;
  percentage?: number;
}

function channelToHex(value: number): string {
  return value.toString(16).padStart(2, '0');
}

export function colorDetails(red: number, green: number, blue: number): ImageColor {
  const normalizedRed = red / 255;
  const normalizedGreen = green / 255;
  const normalizedBlue = blue / 255;
  const max = Math.max(normalizedRed, normalizedGreen, normalizedBlue);
  const min = Math.min(normalizedRed, normalizedGreen, normalizedBlue);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === normalizedRed) hue = ((normalizedGreen - normalizedBlue) / delta) % 6;
    else if (max === normalizedGreen) hue = (normalizedBlue - normalizedRed) / delta + 2;
    else hue = (normalizedRed - normalizedGreen) / delta + 4;
  }
  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return {
    hex: `#${channelToHex(red)}${channelToHex(green)}${channelToHex(blue)}`.toUpperCase(),
    rgb: `rgb(${red}, ${green}, ${blue})`,
    hsl: `hsl(${hue}, ${Math.round(saturation * 100)}%, ${Math.round(lightness * 100)}%)`,
  };
}

export function dominantColors(data: ImageData, limit = 8): ImageColor[] {
  const buckets = new Map<string, { red: number; green: number; blue: number; count: number }>();
  let opaquePixels = 0;
  for (let index = 0; index < data.data.length; index += 4) {
    if (data.data[index + 3] < 128) continue;
    const red = Math.min(255, Math.round(data.data[index] / 32) * 32);
    const green = Math.min(255, Math.round(data.data[index + 1] / 32) * 32);
    const blue = Math.min(255, Math.round(data.data[index + 2] / 32) * 32);
    const key = `${red},${green},${blue}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.count += 1;
    else buckets.set(key, { red, green, blue, count: 1 });
    opaquePixels += 1;
  }
  return Array.from(buckets.values())
    .sort((left, right) => right.count - left.count)
    .slice(0, limit)
    .map((bucket) => ({
      ...colorDetails(bucket.red, bucket.green, bucket.blue),
      count: bucket.count,
      percentage: opaquePixels ? Number(((bucket.count / opaquePixels) * 100).toFixed(1)) : 0,
    }));
}
