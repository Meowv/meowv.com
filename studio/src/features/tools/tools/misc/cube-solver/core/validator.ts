import {
  CENTER_INDEXES,
  CORNER_COLORS,
  CORNER_FACELETS,
  EDGE_COLORS,
  EDGE_FACELETS,
  indexToStickerRef,
} from './constants';
import {
  FACES,
  type CubeDraft,
  type CubePosition,
  type Face,
  type Facelet,
  type ValidationIssue,
  type ValidationResult,
} from '../types';

function issue(
  code: ValidationIssue['code'],
  message: string,
  indexes?: readonly number[],
): ValidationIssue {
  return {
    code,
    message,
    stickerRefs: indexes?.map(indexToStickerRef),
  };
}

function permutationParity(permutation: readonly number[]): number {
  let inversions = 0;
  for (let left = 0; left < permutation.length; left += 1) {
    for (let right = left + 1; right < permutation.length; right += 1) {
      if (permutation[left]! > permutation[right]!) inversions += 1;
    }
  }
  return inversions % 2;
}

const ALL_CORNER_FACELETS = CORNER_FACELETS.flat();
const ALL_EDGE_FACELETS = EDGE_FACELETS.flat();

function parseCorners(
  facelets: readonly Face[],
): { permutation: number[]; orientation: number[] } | ValidationIssue {
  const permutation = Array<number>(8).fill(-1);
  const orientation = Array<number>(8).fill(0);

  for (let position = 0; position < CORNER_FACELETS.length; position += 1) {
    const indexes = CORNER_FACELETS[position]!;
    let twist = 0;
    while (twist < 3 && !['U', 'D'].includes(facelets[indexes[twist]!]!)) twist += 1;
    if (twist === 3) {
      return issue('INVALID_CORNER', '检测到不存在的角块颜色组合，请检查高亮贴纸。', indexes);
    }

    const second = facelets[indexes[(twist + 1) % 3]!]!;
    const third = facelets[indexes[(twist + 2) % 3]!]!;
    const piece = CORNER_COLORS.findIndex((colors) => colors[1] === second && colors[2] === third);
    if (piece < 0 || permutation.includes(piece)) {
      return issue('INVALID_CORNER', '检测到重复或不存在的角块，请检查高亮贴纸。', indexes);
    }
    permutation[position] = piece;
    orientation[position] = twist % 3;
  }

  return { permutation, orientation };
}

function parseEdges(
  facelets: readonly Face[],
): { permutation: number[]; orientation: number[] } | ValidationIssue {
  const permutation = Array<number>(12).fill(-1);
  const orientation = Array<number>(12).fill(0);

  for (let position = 0; position < EDGE_FACELETS.length; position += 1) {
    const indexes = EDGE_FACELETS[position]!;
    const first = facelets[indexes[0]]!;
    const second = facelets[indexes[1]]!;
    let piece = -1;
    let flip = 0;

    for (let candidate = 0; candidate < EDGE_COLORS.length; candidate += 1) {
      const colors = EDGE_COLORS[candidate]!;
      if (colors[0] === first && colors[1] === second) {
        piece = candidate;
        break;
      }
      if (colors[0] === second && colors[1] === first) {
        piece = candidate;
        flip = 1;
        break;
      }
    }

    if (piece < 0 || permutation.includes(piece)) {
      return issue('INVALID_EDGE', '检测到重复或不存在的棱块，请检查高亮贴纸。', indexes);
    }
    permutation[position] = piece;
    orientation[position] = flip;
  }

  return { permutation, orientation };
}

export function validateFacelets(input: readonly Facelet[]): ValidationResult {
  if (input.length !== 54) {
    return {
      valid: false,
      position: null,
      issues: [issue('INCOMPLETE', '魔方状态必须包含 54 个贴纸。')],
    };
  }

  const missing = input.flatMap((value, index) => (value ? [] : [index]));
  if (missing.length) {
    return {
      valid: false,
      position: null,
      issues: [issue('INCOMPLETE', `还有 ${missing.length} 个贴纸未录入。`, missing)],
    };
  }

  const facelets = input as Face[];
  const centerIssues = CENTER_INDEXES.flatMap((absoluteIndex, faceIndex) =>
    facelets[absoluteIndex] === FACES[faceIndex] ? [] : [absoluteIndex],
  );
  if (centerIssues.length) {
    return {
      valid: false,
      position: null,
      issues: [
        issue('INVALID_CENTER', '中心块必须保持 U、R、F、D、L、B 的固定身份。', centerIssues),
      ],
    };
  }

  const colorIssues: ValidationIssue[] = [];
  for (const face of FACES) {
    const count = facelets.filter((value) => value === face).length;
    if (count !== 9) {
      const indexes = facelets.flatMap((value, index) => (value === face ? [index] : []));
      colorIssues.push(
        issue('COLOR_COUNT', `${face} 色当前有 ${count} 个，必须正好为 9 个。`, indexes),
      );
    }
  }
  if (colorIssues.length) return { valid: false, position: null, issues: colorIssues };

  const corners = parseCorners(facelets);
  if ('code' in corners) return { valid: false, position: null, issues: [corners] };
  const edges = parseEdges(facelets);
  if ('code' in edges) return { valid: false, position: null, issues: [edges] };

  if (corners.orientation.reduce((sum, value) => sum + value, 0) % 3 !== 0) {
    return {
      valid: false,
      position: null,
      issues: [
        issue(
          'CORNER_ORIENTATION',
          '检测到角块方向异常，真实魔方无法只扭转一个角块。',
          ALL_CORNER_FACELETS,
        ),
      ],
    };
  }
  if (edges.orientation.reduce((sum, value) => sum + value, 0) % 2 !== 0) {
    return {
      valid: false,
      position: null,
      issues: [
        issue('EDGE_ORIENTATION', '检测到单条棱块翻转，请复核棱块两侧颜色。', ALL_EDGE_FACELETS),
      ],
    };
  }
  if (permutationParity(corners.permutation) !== permutationParity(edges.permutation)) {
    return {
      valid: false,
      position: null,
      issues: [
        issue('PERMUTATION_PARITY', '角块与棱块排列存在奇偶冲突，当前状态无法由正常转动得到。', [
          ...ALL_CORNER_FACELETS,
          ...ALL_EDGE_FACELETS,
        ]),
      ],
    };
  }

  const position: CubePosition = { corners, edges };
  return { valid: true, position, issues: [] };
}

export function validateDraft(draft: CubeDraft): ValidationResult {
  return validateFacelets(draft.facelets);
}

export function parseFaceletString(value: string): Facelet[] | null {
  const normalized = value.toUpperCase().replace(/\s+/g, '');
  if (
    normalized.length !== 54 ||
    [...normalized].some((character) => !FACES.includes(character as Face))
  ) {
    return null;
  }
  return [...normalized] as Face[];
}
