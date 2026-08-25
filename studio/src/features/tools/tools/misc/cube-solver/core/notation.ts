import { FACES, type CubeMove, type Face, type TurnAmount } from '../types';

const FACE_SET = new Set<string>(FACES);

export class CubeNotationError extends Error {
  constructor(
    message: string,
    readonly index: number,
  ) {
    super(message);
    this.name = 'CubeNotationError';
  }
}

export function moveNotation(face: Face, amount: TurnAmount): string {
  return `${face}${amount === -1 ? "'" : amount === 2 ? '2' : ''}`;
}

export function parseAlgorithm(input: string): CubeMove[] {
  const moves: CubeMove[] = [];
  let index = 0;

  while (index < input.length) {
    if (/\s/.test(input[index]!)) {
      index += 1;
      continue;
    }

    const rawFace = input[index]!;
    const face = rawFace.toUpperCase();
    if (!FACE_SET.has(face) || !/[a-zA-Z]/.test(rawFace)) {
      throw new CubeNotationError(`第 ${index + 1} 个字符不是支持的面转动。`, index);
    }
    index += 1;

    let amount: TurnAmount = 1;
    if (input[index] === "'") {
      amount = -1;
      index += 1;
    } else if (input[index] === '2') {
      amount = 2;
      index += 1;
      if (input[index] === "'") index += 1;
    }

    if (input[index] === "'" || input[index] === '2') {
      throw new CubeNotationError(`第 ${index + 1} 个字符包含重复的转动后缀。`, index);
    }

    moves.push({ face: face as Face, amount, notation: moveNotation(face as Face, amount) });
  }

  return moves;
}

export function formatAlgorithm(moves: readonly CubeMove[]): string {
  return moves.map((move) => move.notation).join(' ');
}

export function invertMove(move: CubeMove): CubeMove {
  const amount: TurnAmount = move.amount === 2 ? 2 : move.amount === 1 ? -1 : 1;
  return { face: move.face, amount, notation: moveNotation(move.face, amount) };
}

export function invertAlgorithm(moves: readonly CubeMove[]): CubeMove[] {
  return [...moves].reverse().map(invertMove);
}

export function describeMove(move: CubeMove): string {
  const names: Record<Face, string> = {
    U: '上层',
    R: '右层',
    F: '前层',
    D: '下层',
    L: '左层',
    B: '后层',
  };
  const direction =
    move.amount === 2 ? '旋转 180°' : move.amount === 1 ? '顺时针旋转 90°' : '逆时针旋转 90°';
  return `${names[move.face]}${direction}`;
}
