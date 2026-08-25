import { describe, expect, it } from 'vitest';
import {
  applyMove,
  applyMoves,
  isSolved,
  positionToFacelets,
  positionsEqual,
  solvedPosition,
} from '../core/cube';
import { CubeNotationError, invertAlgorithm, parseAlgorithm } from '../core/notation';
import { validateFacelets } from '../core/validator';
import { CORNER_FACELETS, EDGE_FACELETS } from '../core/constants';
import { FACES, type CubeMove } from '../types';

const quarterMoves = FACES.map((face) => ({ face, amount: 1, notation: face })) as CubeMove[];

describe('cube core', () => {
  it.each(quarterMoves)('$notation 连续执行四次回到原状态', (move) => {
    const result = applyMoves(solvedPosition(), [move, move, move, move]);
    expect(isSolved(result)).toBe(true);
  });

  it('公式和逆公式相互抵消', () => {
    const moves = parseAlgorithm("R U R' U' F2 L D B'");
    expect(isSolved(applyMoves(solvedPosition(), [...moves, ...invertAlgorithm(moves)]))).toBe(
      true,
    );
  });

  it('状态序列化后能够恢复同一角棱状态', () => {
    const position = applyMoves(solvedPosition(), parseAlgorithm("R2 U F' L D2 B U'"));
    const validation = validateFacelets(positionToFacelets(position));
    expect(validation.valid).toBe(true);
    if (validation.valid) expect(positionsEqual(validation.position, position)).toBe(true);
  });

  it('所有基础面转动都生成合法状态', () => {
    for (const face of FACES) {
      const position = applyMove(solvedPosition(), { face, amount: 1, notation: face });
      expect(validateFacelets(positionToFacelets(position)).valid).toBe(true);
    }
  });

  it('种子随机公式和逆公式均回到原状态', () => {
    let seed = 0x5eed1234;
    const suffixes = ['', "'", '2'];
    for (let sample = 0; sample < 24; sample += 1) {
      const notation = Array.from({ length: 30 }, () => {
        seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
        const face = FACES[seed % FACES.length]!;
        seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
        return `${face}${suffixes[seed % suffixes.length]}`;
      }).join(' ');
      const moves = parseAlgorithm(notation);
      expect(isSolved(applyMoves(solvedPosition(), [...moves, ...invertAlgorithm(moves)]))).toBe(
        true,
      );
    }
  });
});

describe('cube validator', () => {
  it('识别单棱翻转', () => {
    const facelets = positionToFacelets(solvedPosition());
    const [left, right] = EDGE_FACELETS[0];
    [facelets[left], facelets[right]] = [facelets[right]!, facelets[left]!];
    const result = validateFacelets(facelets);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues[0]?.code).toBe('EDGE_ORIENTATION');
  });

  it('识别单角扭转', () => {
    const facelets = positionToFacelets(solvedPosition());
    const [first, second, third] = CORNER_FACELETS[0];
    [facelets[first], facelets[second], facelets[third]] = [
      facelets[third]!,
      facelets[first]!,
      facelets[second]!,
    ];
    const result = validateFacelets(facelets);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues[0]?.code).toBe('CORNER_ORIENTATION');
  });

  it('识别只交换两条棱块的奇偶冲突', () => {
    const position = solvedPosition();
    [position.edges.permutation[0], position.edges.permutation[1]] = [1, 0];
    const result = validateFacelets(positionToFacelets(position));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues[0]?.code).toBe('PERMUTATION_PARITY');
  });

  it('识别只交换两个角块的奇偶冲突', () => {
    const position = solvedPosition();
    [position.corners.permutation[0], position.corners.permutation[1]] = [1, 0];
    const result = validateFacelets(positionToFacelets(position));
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.issues[0]?.code).toBe('PERMUTATION_PARITY');
  });

  it('识别中心异常和不存在的色块组合', () => {
    const centers = positionToFacelets(solvedPosition());
    [centers[4], centers[13]] = [centers[13]!, centers[4]!];
    const centerResult = validateFacelets(centers);
    expect(centerResult.valid).toBe(false);
    if (!centerResult.valid) expect(centerResult.issues[0]?.code).toBe('INVALID_CENTER');

    const pieces = positionToFacelets(solvedPosition());
    [pieces[9], pieces[18]] = [pieces[18]!, pieces[9]!];
    const pieceResult = validateFacelets(pieces);
    expect(pieceResult.valid).toBe(false);
    if (!pieceResult.valid) expect(pieceResult.issues[0]?.code).toBe('INVALID_CORNER');
  });

  it('识别数量错误和未完成状态', () => {
    const facelets = positionToFacelets(solvedPosition());
    facelets[0] = 'R';
    const wrongCount = validateFacelets(facelets);
    expect(wrongCount.valid).toBe(false);
    if (!wrongCount.valid)
      expect(wrongCount.issues.some((item) => item.code === 'COLOR_COUNT')).toBe(true);

    const incomplete = validateFacelets([...facelets.slice(0, 10), null, ...facelets.slice(11)]);
    expect(incomplete.valid).toBe(false);
    if (!incomplete.valid) expect(incomplete.issues[0]?.code).toBe('INCOMPLETE');
  });
});

describe('notation', () => {
  it('规范化大小写、紧邻动作和 2 撇号', () => {
    expect(parseAlgorithm("rU2'f'").map((move) => move.notation)).toEqual(['R', 'U2', "F'"]);
  });

  it('拒绝不支持的宽层和旋转', () => {
    expect(() => parseAlgorithm('Rw U')).toThrow();
    expect(() => parseAlgorithm('x y')).toThrow();
  });

  it('公式错误包含可定位字符位置', () => {
    try {
      parseAlgorithm('R U M');
      throw new Error('应当拒绝 M 层动作');
    } catch (error) {
      expect(error).toBeInstanceOf(CubeNotationError);
      expect((error as CubeNotationError).index).toBe(4);
    }
  });
});
