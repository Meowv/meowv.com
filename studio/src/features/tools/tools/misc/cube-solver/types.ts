export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'] as const;

export type Face = (typeof FACES)[number];
export type Facelet = Face | null;
export type TurnAmount = 1 | -1 | 2;

export interface StickerRef {
  face: Face;
  index: number;
}

export interface CubeMove {
  face: Face;
  amount: TurnAmount;
  notation: string;
}

export interface CubeDraft {
  facelets: Facelet[];
  revision: number;
}

export interface CubePosition {
  corners: {
    permutation: number[];
    orientation: number[];
  };
  edges: {
    permutation: number[];
    orientation: number[];
  };
}

export type ValidationIssueCode =
  | 'INCOMPLETE'
  | 'COLOR_COUNT'
  | 'INVALID_CENTER'
  | 'INVALID_EDGE'
  | 'INVALID_CORNER'
  | 'EDGE_ORIENTATION'
  | 'CORNER_ORIENTATION'
  | 'PERMUTATION_PARITY';

export interface ValidationIssue {
  code: ValidationIssueCode;
  message: string;
  stickerRefs?: StickerRef[];
}

export type ValidationResult =
  | { valid: true; position: CubePosition; issues: [] }
  | { valid: false; position: null; issues: ValidationIssue[] };

export interface CubeSolution {
  algorithm: string;
  moves: CubeMove[];
  moveCount: number;
  baseline: CubePosition;
  revision: number;
}

export interface CubeSolver {
  initialize(): Promise<void>;
  solve(position: CubePosition, revision: number): Promise<CubeSolution>;
  randomScramble(): Promise<CubeMove[]>;
}

export interface CubeColorScheme {
  U: string;
  R: string;
  F: string;
  D: string;
  L: string;
  B: string;
}

export interface CubePreferences {
  animationSpeed: number;
  colorScheme: CubeColorScheme;
}
