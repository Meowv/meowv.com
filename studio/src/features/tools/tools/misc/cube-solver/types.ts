export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'] as const;

export type Face = (typeof FACES)[number];
export type Facelet = Face | null;
export type TurnAmount = 1 | -1 | 2;
export type CubeMode = 'solve' | 'algorithm' | 'practice' | 'beginner';
export type CubeInputMethod = 'manual' | 'state';

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

export interface SolutionPhase {
  id: string;
  title: string;
  goal: string;
  grip: string;
  start: number;
  end: number;
}

export interface CubeSolution {
  mode: 'quick' | 'beginner' | 'algorithm' | 'practice';
  algorithm: string;
  moves: CubeMove[];
  moveCount: number;
  baseline: CubePosition;
  phases: SolutionPhase[];
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
  teachingView: boolean;
  showFaceLabels: boolean;
  showMoveArrows: boolean;
  colorScheme: CubeColorScheme;
}

export interface CubeHistoryItem {
  id: string;
  createdAt: number;
  initialFacelets: string;
  solution: string;
  moveCount: number;
  source: CubeInputMethod | 'scramble';
}
