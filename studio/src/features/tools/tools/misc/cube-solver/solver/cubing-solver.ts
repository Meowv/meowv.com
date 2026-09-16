import { applyMoves, clonePosition, isSolved, solvedPosition } from '../core/cube';
import { formatAlgorithm, parseAlgorithm } from '../core/notation';
import type { KPattern as CubingPattern } from 'cubing/kpuzzle';
import type { CubeMove, CubePosition, CubeSolution, CubeSolver } from '../types';

const CORNER_ORDER = [0, 3, 2, 1, 4, 5, 6, 7] as const;
const EDGE_ORDER = [1, 0, 3, 2, 5, 4, 7, 6, 8, 9, 11, 10] as const;
const SOLVE_TIMEOUT_MS = 15_000;

type CubingModules = {
  puzzle: Awaited<ReturnType<(typeof import('cubing/puzzles'))['cube3x3x3']['kpuzzle']>>;
  KPattern: (typeof import('cubing/kpuzzle'))['KPattern'];
  solve: (typeof import('cubing/search'))['experimentalSolve3x3x3IgnoringCenters'];
};

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
    };
    await this.#solvePattern(solvedPosition());
  }

  #toPattern(position: CubePosition): CubingPattern {
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

  async solve(position: CubePosition, revision: number): Promise<CubeSolution> {
    await this.initialize();
    const baseline = clonePosition(position);
    const moves = isSolved(position) ? [] : await this.#solvePattern(position);
    if (!isSolved(applyMoves(baseline, moves))) {
      throw new Error('求解结果未能还原当前魔方，请重试。');
    }
    return {
      algorithm: formatAlgorithm(moves),
      moves,
      moveCount: moves.length,
      baseline,
      revision,
    };
  }

  async randomScramble(): Promise<CubeMove[]> {
    await this.initialize();
    const { randomScrambleForEvent } = await import('cubing/scramble');
    return parseAlgorithm((await randomScrambleForEvent('333')).toString());
  }
}
