import { describe, expect, it } from 'vitest';
import { classifyScannedStickers, deltaE2000, median, rgbToLab } from '../scanner/color';
import { CAMERA_FACELET_MAP, mapCameraSamples } from '../scanner/orientation';
import { DEFAULT_COLOR_SCHEME } from '../core/constants';
import { FACES, type Face, type ScannedSticker } from '../types';

function hexToRgb(value: string): [number, number, number] {
  const number = Number.parseInt(value.slice(1), 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

describe('scanner colors', () => {
  it('相同颜色的 CIEDE2000 距离为零', () => {
    const lab = rgbToLab([120, 80, 220]);
    expect(deltaE2000(lab, lab)).toBeCloseTo(0, 8);
    expect(deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 3);
  });

  it('计算奇偶样本中位数', () => {
    expect(median([4, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('容量约束确保每个中心身份恰好九格', () => {
    const stickers: ScannedSticker[] = FACES.flatMap((face) =>
      Array.from({ length: 9 }, (_, index) => ({
        face,
        index,
        rgb: hexToRgb(DEFAULT_COLOR_SCHEME[face]),
      })),
    );
    const result = classifyScannedStickers(stickers);
    for (const face of FACES) {
      expect(result.facelets.filter((value: Face) => value === face)).toHaveLength(9);
    }
  });

  it('六面相机方向映射覆盖每个规范索引且不修改颜色样本', () => {
    const colors = Array.from(
      { length: 9 },
      (_, index) => [index, index + 1, index + 2] as [number, number, number],
    );
    for (const face of FACES) {
      expect([...CAMERA_FACELET_MAP[face]].sort((left, right) => left - right)).toEqual([
        0, 1, 2, 3, 4, 5, 6, 7, 8,
      ]);
      const mapped = mapCameraSamples(face, colors);
      expect(mapped.map((item) => item.index).sort((left, right) => left - right)).toEqual([
        0, 1, 2, 3, 4, 5, 6, 7, 8,
      ]);
      expect(mapped[0]?.rgb).toEqual(colors[0]);
    }
  });

  it('高色差贴纸会进入人工复核列表', () => {
    const stickers: ScannedSticker[] = FACES.flatMap((face) =>
      Array.from({ length: 9 }, (_, index) => ({
        face,
        index,
        rgb:
          face === 'U' && index === 0
            ? ([80, 80, 80] as [number, number, number])
            : hexToRgb(DEFAULT_COLOR_SCHEME[face]),
      })),
    );
    expect(classifyScannedStickers(stickers).lowConfidence).toContainEqual({
      face: 'U',
      index: 0,
    });
  });
});
