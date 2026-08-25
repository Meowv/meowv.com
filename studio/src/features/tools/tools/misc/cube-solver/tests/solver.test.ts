import { describe, expect, it } from 'vitest';
import { applyMoves, isSolved, solvedPosition } from '../core/cube';
import { parseAlgorithm } from '../core/notation';
import { CubingCubeSolver } from '../solver/cubing-solver';
import { beginnerPhaseReached } from '../solver/beginner-guide';

describe('cubing solver adapter', () => {
  it('求解并通过自研模型二次验证', async () => {
    const solver = new CubingCubeSolver();
    const scrambled = applyMoves(solvedPosition(), parseAlgorithm("R U2 F B R2 D L2 U B2 U'"));
    const result = await solver.solve(scrambled, 7);
    expect(result.revision).toBe(7);
    expect(result.moves.length).toBeGreaterThan(0);
    expect(isSolved(applyMoves(scrambled, result.moves))).toBe(true);
  }, 20_000);

  it('已还原状态返回零步', async () => {
    const solver = new CubingCubeSolver();
    const result = await solver.solve(solvedPosition(), 1);
    expect(result.moves).toEqual([]);
  }, 20_000);

  it('七阶段引导覆盖完整公式且边界单调', async () => {
    const solver = new CubingCubeSolver();
    const scrambled = applyMoves(solvedPosition(), parseAlgorithm("R U R' U' F2 D L2"));
    const guide = await solver.solveBeginner(scrambled, 2);
    expect(guide.phases).toHaveLength(7);
    expect(guide.phases[0]?.start).toBe(0);
    expect(guide.phases.at(-1)?.end).toBe(guide.moves.length);
    expect(
      guide.phases.every(
        (phase, index) => index === 0 || phase.start >= guide.phases[index - 1]!.start,
      ),
    ).toBe(true);
    for (const phase of guide.phases) {
      const position = applyMoves(scrambled, guide.moves.slice(0, phase.end));
      expect(beginnerPhaseReached(phase.id, position)).toBe(true);
    }
    expect(isSolved(applyMoves(scrambled, guide.moves))).toBe(true);
  }, 60_000);
});
