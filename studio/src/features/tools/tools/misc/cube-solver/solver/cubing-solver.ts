import { applyMoves, clonePosition, isSolved, solvedPosition } from '../core/cube';
import { formatAlgorithm, parseAlgorithm } from '../core/notation';
import { beginnerPhaseDefinitions, beginnerPhaseReached } from './beginner-guide';
import type { KPattern as CubingPattern } from 'cubing/kpuzzle';
import type { CubeMove, CubePosition, CubeSolution, CubeSolver, SolutionPhase } from '../types';

const CORNER_ORDER = [0, 3, 2, 1, 4, 5, 6, 7] as const;
const EDGE_ORDER = [1, 0, 3, 2, 5, 4, 7, 6, 8, 9, 11, 10] as const;
const SOLVE_TIMEOUT_MS = 15_000;

type CubingModules = {
  puzzle: Awaited<ReturnType<(typeof import('cubing/puzzles'))['cube3x3x3']['kpuzzle']>>;
  KPattern: (typeof import('cubing/kpuzzle'))['KPattern'];
  solve: (typeof import('cubing/search'))['experimentalSolve3x3x3IgnoringCenters'];
  solveTwips: (typeof import('cubing/search'))['experimentalSolveTwips'];
};

interface StageProjection {
  exactEdges: readonly number[];
  orientedEdges?: readonly number[];
  exactCorners: readonly number[];
  orientedCorners?: readonly number[];
}

interface BeginnerStagePlan {
  id: string;
  projections: readonly StageProjection[];
}

const U_EDGES = [0, 1, 2, 3] as const;
const D_EDGES = [4, 5, 6, 7] as const;
const MIDDLE_EDGES = [8, 9, 10, 11] as const;
const U_CORNERS = [0, 1, 2, 3] as const;
const D_CORNERS = [4, 5, 6, 7] as const;
const ALL_EDGES = [...U_EDGES, ...D_EDGES, ...MIDDLE_EDGES] as const;
const ALL_CORNERS = [...U_CORNERS, ...D_CORNERS] as const;

const BEGINNER_STAGE_PLANS: readonly BeginnerStagePlan[] = [
  {
    id: 'white-cross',
    projections: U_EDGES.map((_, index) => ({
      exactEdges: U_EDGES.slice(0, index + 1),
      exactCorners: [],
    })),
  },
  {
    id: 'white-corners',
    projections: U_CORNERS.map((_, index) => ({
      exactEdges: U_EDGES,
      exactCorners: U_CORNERS.slice(0, index + 1),
    })),
  },
  {
    id: 'middle-edges',
    projections: MIDDLE_EDGES.map((_, index) => ({
      exactEdges: [...U_EDGES, ...MIDDLE_EDGES.slice(0, index + 1)],
      exactCorners: U_CORNERS,
    })),
  },
  {
    id: 'yellow-cross',
    projections: [
      {
        exactEdges: [...U_EDGES, ...MIDDLE_EDGES],
        orientedEdges: D_EDGES,
        exactCorners: U_CORNERS,
      },
    ],
  },
  {
    id: 'yellow-face',
    projections: [
      {
        exactEdges: [...U_EDGES, ...MIDDLE_EDGES],
        orientedEdges: D_EDGES,
        exactCorners: U_CORNERS,
        orientedCorners: D_CORNERS,
      },
    ],
  },
  {
    id: 'yellow-corners',
    projections: [
      {
        exactEdges: [...U_EDGES, ...MIDDLE_EDGES],
        orientedEdges: D_EDGES,
        exactCorners: ALL_CORNERS,
      },
    ],
  },
  {
    id: 'yellow-edges',
    projections: [{ exactEdges: ALL_EDGES, exactCorners: ALL_CORNERS }],
  },
];

function remapPieces(permutation: readonly number[], order: readonly number[]): number[] {
  const toCubing = new Map(order.map((ourIndex, cubingIndex) => [ourIndex, cubingIndex]));
  return order.map((ourPosition) => toCubing.get(permutation[ourPosition]!)!);
}

function remapOrientation(orientation: readonly number[], order: readonly number[]): number[] {
  return order.map((ourPosition) => orientation[ourPosition]!);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = globalThis.setTimeout(
          () => reject(new Error('求解耗时过长，请重试或检查魔方状态。')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) globalThis.clearTimeout(timeout);
  }
}

export class CubingCubeSolver implements CubeSolver {
  #modules: CubingModules | null = null;
  #initializing: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.#modules) return;
    if (this.#initializing) return this.#initializing;
    this.#initializing = this.#load();
    try {
      await this.#initializing;
    } finally {
      this.#initializing = null;
    }
  }

  async #load(): Promise<void> {
    const [{ cube3x3x3 }, { KPattern }, search] = await Promise.all([
      import('cubing/puzzles'),
      import('cubing/kpuzzle'),
      import('cubing/search'),
    ]);
    search.setSearchDebug({
      logPerf: false,
      prioritizeEsbuildWorkaroundForWorkerInstantiation: true,
    });
    const puzzle = await cube3x3x3.kpuzzle();
    this.#modules = {
      puzzle,
      KPattern,
      solve: search.experimentalSolve3x3x3IgnoringCenters,
      solveTwips: search.experimentalSolveTwips,
    };
    await this.#solvePattern(solvedPosition());
  }

  #toPattern(position: CubePosition) {
    if (!this.#modules) throw new Error('求解器尚未初始化。');
    const { puzzle, KPattern } = this.#modules;
    return new KPattern(puzzle, {
      CORNERS: {
        pieces: remapPieces(position.corners.permutation, CORNER_ORDER),
        orientation: remapOrientation(position.corners.orientation, CORNER_ORDER),
      },
      EDGES: {
        pieces: remapPieces(position.edges.permutation, EDGE_ORDER),
        orientation: remapOrientation(position.edges.orientation, EDGE_ORDER),
      },
      CENTERS: {
        pieces: [0, 1, 2, 3, 4, 5],
        orientation: [0, 0, 0, 0, 0, 0],
        orientationMod: [1, 1, 1, 1, 1, 1],
      },
    });
  }

  async #solvePattern(position: CubePosition): Promise<CubeMove[]> {
    if (!this.#modules) throw new Error('求解器尚未初始化。');
    const algorithm = await withTimeout(
      this.#modules.solve(this.#toPattern(position)),
      SOLVE_TIMEOUT_MS,
    );
    return parseAlgorithm(algorithm.toString());
  }

  #projectPattern(pattern: CubingPattern, projection: StageProjection): CubingPattern {
    if (!this.#modules) throw new Error('求解器尚未初始化。');
    const { puzzle, KPattern } = this.#modules;
    const projectOrbit = (
      pieces: readonly number[],
      orientations: readonly number[],
      pieceCount: number,
      exactValues: readonly number[],
      orientedValues: readonly number[] = [],
    ) => {
      const exact = new Set(exactValues);
      const oriented = new Set(orientedValues);
      const orientedSentinel = orientedValues[0] ?? 0;
      const neutralSentinel =
        Array.from({ length: pieceCount }, (_, index) => index).find(
          (piece) => !exact.has(piece) && !oriented.has(piece),
        ) ?? 0;
      return {
        pieces: pieces.map((piece) =>
          exact.has(piece) ? piece : oriented.has(piece) ? orientedSentinel : neutralSentinel,
        ),
        orientation: pieces.map((piece, index) =>
          exact.has(piece) || oriented.has(piece) ? orientations[index]! : 0,
        ),
        orientationMod: pieces.map((piece) => (exact.has(piece) || oriented.has(piece) ? 0 : 1)),
      };
    };
    const data = pattern.patternData;
    return new KPattern(puzzle, {
      EDGES: projectOrbit(
        data.EDGES!.pieces,
        data.EDGES!.orientation,
        12,
        projection.exactEdges,
        projection.orientedEdges,
      ),
      CORNERS: projectOrbit(
        data.CORNERS!.pieces,
        data.CORNERS!.orientation,
        8,
        projection.exactCorners,
        projection.orientedCorners,
      ),
      CENTERS: {
        pieces: [0, 0, 0, 0, 0, 0],
        orientation: [0, 0, 0, 0, 0, 0],
        orientationMod: [1, 1, 1, 1, 1, 1],
      },
    });
  }

  async #solveProjection(position: CubePosition, projection: StageProjection): Promise<CubeMove[]> {
    if (!this.#modules) throw new Error('求解器尚未初始化。');
    const current = this.#projectPattern(this.#toPattern(position), projection);
    const target = this.#projectPattern(this.#toPattern(solvedPosition()), projection);
    if (current.isIdentical(target)) return [];
    const algorithm = await withTimeout(
      this.#modules.solveTwips(this.#modules.puzzle, current, {
        targetPattern: target,
        generatorMoves: ['U', 'R', 'F', 'D', 'L', 'B'],
        maxDepth: 20,
      }),
      SOLVE_TIMEOUT_MS,
    );
    return parseAlgorithm(algorithm.toString());
  }

  async solve(position: CubePosition, revision: number): Promise<CubeSolution> {
    await this.initialize();
    const baseline = clonePosition(position);
    const moves = isSolved(position) ? [] : await this.#solvePattern(position);
    if (!isSolved(applyMoves(baseline, moves))) {
      throw new Error('求解结果未能还原当前魔方，请重试。');
    }
    return {
      mode: 'quick',
      algorithm: formatAlgorithm(moves),
      moves,
      moveCount: moves.length,
      baseline,
      phases: [],
      revision,
    };
  }

  async solveBeginner(position: CubePosition, revision: number): Promise<CubeSolution> {
    await this.initialize();
    const baseline = clonePosition(position);
    let current = clonePosition(position);
    const moves: CubeMove[] = [];
    const definitions = new Map(
      beginnerPhaseDefinitions().map((definition) => [definition.id, definition]),
    );
    const phases: SolutionPhase[] = [];

    for (const stage of BEGINNER_STAGE_PLANS) {
      const start = moves.length;
      for (const projection of stage.projections) {
        const stageMoves = await this.#solveProjection(current, projection);
        current = applyMoves(current, stageMoves);
        moves.push(...stageMoves);
      }
      if (!beginnerPhaseReached(stage.id, current)) {
        throw new Error(`新手教学阶段“${definitions.get(stage.id)?.title ?? stage.id}”验证失败。`);
      }
      const definition = definitions.get(stage.id)!;
      phases.push({ ...definition, start, end: moves.length });
    }

    if (!isSolved(current)) throw new Error('新手教学步骤未能完成还原，请重试。');
    return {
      mode: 'beginner',
      algorithm: formatAlgorithm(moves),
      moves,
      moveCount: moves.length,
      baseline,
      phases,
      revision,
    };
  }

  async randomScramble(): Promise<CubeMove[]> {
    await this.initialize();
    const { randomScrambleForEvent } = await import('cubing/scramble');
    return parseAlgorithm((await randomScrambleForEvent('333')).toString());
  }
}
