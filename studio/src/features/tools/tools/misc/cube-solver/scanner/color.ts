import {
  FACES,
  type Face,
  type ScanClassification,
  type ScannedSticker,
  type StickerRef,
} from '../types';
import { FACE_OFFSETS } from '../core/constants';

export type Lab = [number, number, number];

const pivotRgb = (value: number): number => {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
};

export function rgbToLab([red, green, blue]: readonly number[]): Lab {
  const r = pivotRgb(red ?? 0);
  const g = pivotRgb(green ?? 0);
  const b = pivotRgb(blue ?? 0);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const pivot = (value: number): number =>
    value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
  const px = pivot(x);
  const py = pivot(y);
  const pz = pivot(z);
  return [116 * py - 16, 500 * (px - py), 200 * (py - pz)];
}

const degrees = (radians: number): number => (radians * 180) / Math.PI;
const radians = (value: number): number => (value * Math.PI) / 180;

// CIEDE2000，扫描阶段只处理 54 个贴纸，直接实现可避免引入额外依赖。
export function deltaE2000(left: Lab, right: Lab): number {
  const [l1, a1, b1] = left;
  const [l2, a2, b2] = right;
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const averageC = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(averageC ** 7 / (averageC ** 7 + 25 ** 7)));
  const a1Prime = (1 + g) * a1;
  const a2Prime = (1 + g) * a2;
  const c1Prime = Math.hypot(a1Prime, b1);
  const c2Prime = Math.hypot(a2Prime, b2);
  const hue = (a: number, b: number): number => {
    const value = degrees(Math.atan2(b, a));
    return value < 0 ? value + 360 : value;
  };
  const h1Prime = hue(a1Prime, b1);
  const h2Prime = hue(a2Prime, b2);
  const deltaL = l2 - l1;
  const deltaC = c2Prime - c1Prime;
  let deltaHAngle = h2Prime - h1Prime;
  if (c1Prime * c2Prime === 0) deltaHAngle = 0;
  else if (deltaHAngle > 180) deltaHAngle -= 360;
  else if (deltaHAngle < -180) deltaHAngle += 360;
  const deltaH = 2 * Math.sqrt(c1Prime * c2Prime) * Math.sin(radians(deltaHAngle / 2));
  const averageL = (l1 + l2) / 2;
  const averageCPrime = (c1Prime + c2Prime) / 2;
  let averageH = h1Prime + h2Prime;
  if (c1Prime * c2Prime === 0) averageH = h1Prime + h2Prime;
  else if (Math.abs(h1Prime - h2Prime) <= 180) averageH /= 2;
  else if (averageH < 360) averageH = (averageH + 360) / 2;
  else averageH = (averageH - 360) / 2;
  const t =
    1 -
    0.17 * Math.cos(radians(averageH - 30)) +
    0.24 * Math.cos(radians(2 * averageH)) +
    0.32 * Math.cos(radians(3 * averageH + 6)) -
    0.2 * Math.cos(radians(4 * averageH - 63));
  const deltaTheta = 30 * Math.exp(-(((averageH - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(averageCPrime ** 7 / (averageCPrime ** 7 + 25 ** 7));
  const sl = 1 + (0.015 * (averageL - 50) ** 2) / Math.sqrt(20 + (averageL - 50) ** 2);
  const sc = 1 + 0.045 * averageCPrime;
  const sh = 1 + 0.015 * averageCPrime * t;
  const rt = -Math.sin(radians(2 * deltaTheta)) * rc;
  const lTerm = deltaL / sl;
  const cTerm = deltaC / sc;
  const hTerm = deltaH / sh;
  return Math.sqrt(lTerm ** 2 + cTerm ** 2 + hTerm ** 2 + rt * cTerm * hTerm);
}

// 最小费用完美匹配；每种中心色展开为八个槽位，天然保证每种颜色恰好九格。
function assignMinimumCost(costs: readonly (readonly number[])[]): number[] {
  const size = costs.length;
  const u = Array<number>(size + 1).fill(0);
  const v = Array<number>(size + 1).fill(0);
  const p = Array<number>(size + 1).fill(0);
  const way = Array<number>(size + 1).fill(0);

  for (let row = 1; row <= size; row += 1) {
    p[0] = row;
    let column0 = 0;
    const minimum = Array<number>(size + 1).fill(Number.POSITIVE_INFINITY);
    const used = Array<boolean>(size + 1).fill(false);
    do {
      used[column0] = true;
      const row0 = p[column0]!;
      let delta = Number.POSITIVE_INFINITY;
      let column1 = 0;
      for (let column = 1; column <= size; column += 1) {
        if (used[column]) continue;
        const current = costs[row0 - 1]![column - 1]! - u[row0]! - v[column]!;
        if (current < minimum[column]!) {
          minimum[column] = current;
          way[column] = column0;
        }
        if (minimum[column]! < delta) {
          delta = minimum[column]!;
          column1 = column;
        }
      }
      for (let column = 0; column <= size; column += 1) {
        if (used[column]) {
          u[p[column]!]! += delta;
          v[column]! -= delta;
        } else minimum[column]! -= delta;
      }
      column0 = column1;
    } while (p[column0] !== 0);

    do {
      const column1 = way[column0]!;
      p[column0] = p[column1]!;
      column0 = column1;
    } while (column0 !== 0);
  }

  const assignment = Array<number>(size).fill(-1);
  for (let column = 1; column <= size; column += 1) assignment[p[column]! - 1] = column - 1;
  return assignment;
}

export function classifyScannedStickers(stickers: readonly ScannedSticker[]): ScanClassification {
  if (stickers.length !== 54) throw new Error('需要完成六个面的扫描后才能识别颜色。');
  const stickerByIndex = new Map(
    stickers.map((sticker) => [FACE_OFFSETS[sticker.face] + sticker.index, sticker]),
  );
  const centers = Object.fromEntries(
    FACES.map((face) => {
      const center = stickerByIndex.get(FACE_OFFSETS[face] + 4);
      if (!center) throw new Error(`缺少 ${face} 面中心色样本。`);
      return [face, rgbToLab(center.rgb)];
    }),
  ) as Record<Face, Lab>;
  const nonCenters = stickers.filter((sticker) => sticker.index !== 4);
  const slots = FACES.flatMap((face) => Array<Face>(8).fill(face));
  const labs = nonCenters.map((sticker) => rgbToLab(sticker.rgb));
  const costs = labs.map((lab) => slots.map((face) => deltaE2000(lab, centers[face])));
  const assignment = assignMinimumCost(costs);
  const facelets = Array<Face>(54);
  const lowConfidence: StickerRef[] = [];

  FACES.forEach((face) => {
    facelets[FACE_OFFSETS[face] + 4] = face;
  });
  nonCenters.forEach((sticker, index) => {
    const face = slots[assignment[index]!]!;
    facelets[FACE_OFFSETS[sticker.face] + sticker.index] = face;
    const distinctCosts = FACES.map((candidate) =>
      deltaE2000(labs[index]!, centers[candidate]),
    ).sort((left, right) => left - right);
    const chosenCost = deltaE2000(labs[index]!, centers[face]);
    if (chosenCost > 25 || distinctCosts[1]! - distinctCosts[0]! < 8) {
      lowConfidence.push({ face: sticker.face, index: sticker.index });
    }
  });

  return { facelets, lowConfidence };
}

export function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
