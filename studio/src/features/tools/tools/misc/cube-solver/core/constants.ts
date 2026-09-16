import type { CubeColorScheme, Face, StickerRef } from '../types';

export const FACE_SIZE = 9;
export const FACELET_COUNT = 54;
export const FACE_OFFSETS: Record<Face, number> = {
  U: 0,
  R: 9,
  F: 18,
  D: 27,
  L: 36,
  B: 45,
};

export const CENTER_INDEXES = [4, 13, 22, 31, 40, 49] as const;

export const DEFAULT_COLOR_SCHEME: CubeColorScheme = {
  U: '#f7f7f4',
  R: '#e5484d',
  F: '#30a46c',
  D: '#f5d90a',
  L: '#f28c28',
  B: '#3e63dd',
};

// 角块顺序：URF UFL ULB UBR DFR DLF DBL DRB。
export const CORNER_FACELETS = [
  [8, 9, 20],
  [6, 18, 38],
  [0, 36, 47],
  [2, 45, 11],
  [29, 26, 15],
  [27, 44, 24],
  [33, 53, 42],
  [35, 17, 51],
] as const;

export const CORNER_COLORS: readonly (readonly Face[])[] = [
  ['U', 'R', 'F'],
  ['U', 'F', 'L'],
  ['U', 'L', 'B'],
  ['U', 'B', 'R'],
  ['D', 'F', 'R'],
  ['D', 'L', 'F'],
  ['D', 'B', 'L'],
  ['D', 'R', 'B'],
];

// 棱块顺序：UR UF UL UB DR DF DL DB FR FL BL BR。
export const EDGE_FACELETS = [
  [5, 10],
  [7, 19],
  [3, 37],
  [1, 46],
  [32, 16],
  [28, 25],
  [30, 43],
  [34, 52],
  [23, 12],
  [21, 41],
  [50, 39],
  [48, 14],
] as const;

export const EDGE_COLORS: readonly (readonly Face[])[] = [
  ['U', 'R'],
  ['U', 'F'],
  ['U', 'L'],
  ['U', 'B'],
  ['D', 'R'],
  ['D', 'F'],
  ['D', 'L'],
  ['D', 'B'],
  ['F', 'R'],
  ['F', 'L'],
  ['B', 'L'],
  ['B', 'R'],
];

export const indexToStickerRef = (absoluteIndex: number): StickerRef => {
  const entries = Object.entries(FACE_OFFSETS) as Array<[Face, number]>;
  const [face, offset] = entries.find(
    ([, start]) => absoluteIndex >= start && absoluteIndex < start + 9,
  ) ?? ['U', 0];
  return { face, index: absoluteIndex - offset };
};
