import { describe, expect, it } from 'vitest';
import { FACES } from '../types';
import {
  CUBIE_COORDINATES,
  faceletIndex,
  facesForPosition,
  layerForFace,
  turnAmountForStickerDrag,
} from '../renderer/geometry';

describe('3D cubie geometry', () => {
  it('包含 26 个互不重复的整数网格 Cubie', () => {
    expect(CUBIE_COORDINATES).toHaveLength(26);
    expect(new Set(CUBIE_COORDINATES.map(({ x, y, z }) => `${x},${y},${z}`)).size).toBe(26);
    expect(CUBIE_COORDINATES.every(({ x, y, z }) => [x, y, z].every(Number.isInteger))).toBe(true);
  });

  it('外侧贴纸与 54 个逻辑贴纸一一对应', () => {
    const indexes = CUBIE_COORDINATES.flatMap(({ x, y, z }) =>
      facesForPosition({ x, y, z }).map((face) => faceletIndex(face, x, y, z)),
    );
    expect(indexes).toHaveLength(54);
    expect(new Set(indexes).size).toBe(54);
    expect(indexes.sort((left, right) => left - right)).toEqual(
      Array.from({ length: 54 }, (_, index) => index),
    );
  });

  it('每个基础转层都选中九个 Cubie', () => {
    for (const face of FACES) {
      const layer = layerForFace(face);
      expect(
        CUBIE_COORDINATES.filter((coordinate) => coordinate[layer.axis] === layer.coordinate),
      ).toHaveLength(9);
    }
  });

  it('贴纸拖动仅在距离和方向明确时生成转层方向', () => {
    expect(turnAmountForStickerDrag('F', 8, 0)).toBeNull();
    expect(turnAmountForStickerDrag('F', 20, 18)).toBeNull();
    expect(turnAmountForStickerDrag('F', 20, 2)).toBe(1);
    expect(turnAmountForStickerDrag('F', -20, 2)).toBe(-1);
    expect(turnAmountForStickerDrag('B', 20, 2)).toBe(-1);
  });
});
