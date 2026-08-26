import { FACE_OFFSETS } from '../core/constants';
import type { Face, TurnAmount } from '../types';

export interface CubieCoordinate {
  x: number;
  y: number;
  z: number;
}

export const CUBIE_COORDINATES: readonly CubieCoordinate[] = [-1, 0, 1].flatMap((x) =>
  [-1, 0, 1].flatMap((y) =>
    [-1, 0, 1].flatMap((z) => (x === 0 && y === 0 && z === 0 ? [] : [{ x, y, z }])),
  ),
);

export function faceletIndex(face: Face, x: number, y: number, z: number): number {
  switch (face) {
    case 'U':
      return FACE_OFFSETS.U + (z + 1) * 3 + (x + 1);
    case 'D':
      return FACE_OFFSETS.D + (1 - z) * 3 + (x + 1);
    case 'F':
      return FACE_OFFSETS.F + (1 - y) * 3 + (x + 1);
    case 'B':
      return FACE_OFFSETS.B + (1 - y) * 3 + (1 - x);
    case 'R':
      return FACE_OFFSETS.R + (1 - y) * 3 + (1 - z);
    case 'L':
      return FACE_OFFSETS.L + (1 - y) * 3 + (z + 1);
  }
}

export function facesForPosition({ x, y, z }: CubieCoordinate): Face[] {
  const faces: Face[] = [];
  if (y === 1) faces.push('U');
  if (x === 1) faces.push('R');
  if (z === 1) faces.push('F');
  if (y === -1) faces.push('D');
  if (x === -1) faces.push('L');
  if (z === -1) faces.push('B');
  return faces;
}

export function layerForFace(face: Face): {
  axis: 'x' | 'y' | 'z';
  coordinate: number;
  sign: number;
} {
  const layers = {
    U: { axis: 'y', coordinate: 1, sign: 1 },
    D: { axis: 'y', coordinate: -1, sign: -1 },
    R: { axis: 'x', coordinate: 1, sign: -1 },
    L: { axis: 'x', coordinate: -1, sign: 1 },
    F: { axis: 'z', coordinate: 1, sign: -1 },
    B: { axis: 'z', coordinate: -1, sign: 1 },
  } as const;
  return layers[face];
}

export function turnAmountForStickerDrag(
  face: Face,
  deltaX: number,
  deltaY: number,
  threshold = 12,
): TurnAmount | null {
  const horizontal = Math.abs(deltaX);
  const vertical = Math.abs(deltaY);
  const dominant = Math.max(horizontal, vertical);
  const secondary = Math.min(horizontal, vertical);
  if (dominant < threshold || dominant < secondary * 1.25) return null;

  const forward = horizontal >= vertical ? deltaX > 0 : deltaY > 0;
  const invertedFace = face === 'D' || face === 'L' || face === 'B';
  return forward !== invertedFace ? 1 : -1;
}
