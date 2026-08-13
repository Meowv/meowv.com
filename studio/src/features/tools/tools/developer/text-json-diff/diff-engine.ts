export type DiffMode = 'text' | 'json';
export type TextGranularity = 'line' | 'word' | 'character';
export type StructuralDiffKind = 'added' | 'removed' | 'modified' | 'type-changed';

export interface IgnoreRules {
  case: boolean;
  whitespace: boolean;
  blankLines: boolean;
}

export interface TextDifference {
  originalLine: number;
  modifiedLine: number;
}

export interface JsonPresentation {
  value: unknown;
  text: string;
  locations: Map<string, number>;
}

export interface StructuralDifference {
  kind: StructuralDiffKind;
  pointer: string;
  originalLine?: number;
  modifiedLine?: number;
  originalValue?: unknown;
  modifiedValue?: unknown;
}

interface Token {
  value: string;
  line: number;
}

const MAX_LCS_CELLS = 500_000;
const FALLBACK_LINE_WINDOW = 96;

function normalizeToken(value: string, rules: IgnoreRules): string {
  let next = value;
  if (rules.whitespace) next = next.replace(/\s+/g, ' ').trim();
  if (rules.case) next = next.toLocaleLowerCase();
  return next;
}

function tokenize(input: string, granularity: TextGranularity, rules: IgnoreRules): Token[] {
  if (granularity === 'line') {
    return input
      .split('\n')
      .map((value, index) => ({ value: normalizeToken(value, rules), line: index + 1 }))
      .filter((token) => !(rules.blankLines && token.value.trim() === ''));
  }

  const pattern = granularity === 'word' ? /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu : /[\s\S]/gu;
  const tokens: Token[] = [];
  let line = 1;
  const sourceLines = input.split('\n');
  for (const [index, sourceLine] of sourceLines.entries()) {
    if (rules.blankLines && sourceLine.trim() === '') {
      line += 1;
      continue;
    }
    const content = index < sourceLines.length - 1 ? `${sourceLine}\n` : sourceLine;
    for (const match of content.matchAll(pattern)) {
      const raw = match[0];
      const startLine = line;
      line += (raw.match(/\n/g) ?? []).length;
      if (rules.whitespace && /^\s+$/.test(raw)) continue;
      tokens.push({ value: normalizeToken(raw, rules), line: startLine });
    }
  }
  return tokens;
}

function differenceAt(
  original: Token[],
  modified: Token[],
  left: number,
  right: number,
): TextDifference {
  return {
    originalLine: original[left]?.line ?? original.at(-1)?.line ?? 1,
    modifiedLine: modified[right]?.line ?? modified.at(-1)?.line ?? 1,
  };
}

function exceedsLcsLimit(originalLength: number, modifiedLength: number): boolean {
  return modifiedLength + 1 > MAX_LCS_CELLS / (originalLength + 1);
}

function findWindowAnchor(
  original: Token[],
  modified: Token[],
  left: number,
  right: number,
): { left: number; right: number } | null {
  const modifiedOffsets = new Map<string, number>();
  const modifiedEnd = Math.min(modified.length, right + FALLBACK_LINE_WINDOW + 1);
  for (let index = right; index < modifiedEnd; index += 1) {
    if (!modifiedOffsets.has(modified[index]!.value)) {
      modifiedOffsets.set(modified[index]!.value, index - right);
    }
  }

  let best: { left: number; right: number; distance: number; span: number } | null = null;
  const originalEnd = Math.min(original.length, left + FALLBACK_LINE_WINDOW + 1);
  for (let index = left; index < originalEnd; index += 1) {
    const leftOffset = index - left;
    const rightOffset = modifiedOffsets.get(original[index]!.value);
    if (rightOffset === undefined || (leftOffset === 0 && rightOffset === 0)) continue;
    const distance = leftOffset + rightOffset;
    const span = Math.max(leftOffset, rightOffset);
    if (!best || distance < best.distance || (distance === best.distance && span < best.span)) {
      best = { left: index, right: right + rightOffset, distance, span };
    }
  }
  return best ? { left: best.left, right: best.right } : null;
}

/**
 * 超大文本不再按 token 下标逐项比较，而是在行级使用固定窗口寻找重新对齐点。
 * 时间复杂度受窗口大小约束，插入或删除一行不会把后续所有内容级联标记为变化。
 */
function windowedLineDifferences(original: Token[], modified: Token[]): TextDifference[] {
  if (!original.length || !modified.length) {
    return original.length || modified.length ? [differenceAt(original, modified, 0, 0)] : [];
  }

  const result: TextDifference[] = [];
  let left = 0;
  let right = 0;
  let inDifference = false;

  while (left < original.length || right < modified.length) {
    if (
      left < original.length &&
      right < modified.length &&
      original[left]!.value === modified[right]!.value
    ) {
      inDifference = false;
      left += 1;
      right += 1;
      continue;
    }

    if (!inDifference) {
      result.push(differenceAt(original, modified, left, right));
      inDifference = true;
    }

    const anchor = findWindowAnchor(original, modified, left, right);
    if (anchor) {
      left = anchor.left;
      right = anchor.right;
      continue;
    }

    const originalRemaining = original.length - left;
    const modifiedRemaining = modified.length - right;
    if (originalRemaining > modifiedRemaining && left < original.length) left += 1;
    else if (modifiedRemaining > originalRemaining && right < modified.length) right += 1;
    else {
      if (left < original.length) left += 1;
      if (right < modified.length) right += 1;
    }
  }
  return result;
}

function lcsDifferences(original: Token[], modified: Token[]): TextDifference[] {
  const columns = modified.length + 1;
  const table = new Uint32Array((original.length + 1) * columns);
  for (let left = original.length - 1; left >= 0; left -= 1) {
    for (let right = modified.length - 1; right >= 0; right -= 1) {
      const cell = left * columns + right;
      table[cell] =
        original[left]!.value === modified[right]!.value
          ? table[(left + 1) * columns + right + 1]! + 1
          : Math.max(table[(left + 1) * columns + right]!, table[cell + 1]!);
    }
  }

  const result: TextDifference[] = [];
  let left = 0;
  let right = 0;
  let inDifference = false;
  while (left < original.length || right < modified.length) {
    if (
      left < original.length &&
      right < modified.length &&
      original[left]!.value === modified[right]!.value
    ) {
      inDifference = false;
      left += 1;
      right += 1;
      continue;
    }

    if (!inDifference) {
      result.push(differenceAt(original, modified, left, right));
      inDifference = true;
    }
    if (
      right >= modified.length ||
      (left < original.length &&
        table[(left + 1) * columns + right]! >= table[left * columns + right + 1]!)
    ) {
      left += 1;
    } else {
      right += 1;
    }
  }
  return result;
}

export function compareText(
  originalInput: string,
  modifiedInput: string,
  granularity: TextGranularity,
  rules: IgnoreRules,
): TextDifference[] {
  const original = tokenize(originalInput, granularity, rules);
  const modified = tokenize(modifiedInput, granularity, rules);
  if (!exceedsLcsLimit(original.length, modified.length)) {
    return lcsDifferences(original, modified);
  }

  const originalLines = tokenize(originalInput, 'line', rules);
  const modifiedLines = tokenize(modifiedInput, 'line', rules);
  return exceedsLcsLimit(originalLines.length, modifiedLines.length)
    ? windowedLineDifferences(originalLines, modifiedLines)
    : lcsDifferences(originalLines, modifiedLines);
}

function pointerSegment(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

function childPointer(parent: string, segment: string): string {
  return `${parent}/${pointerSegment(segment)}`;
}

function jsonType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type JsonKeyOrders = Map<string, string[]>;

function mergeObjectKeys(left: Record<string, unknown>, right: Record<string, unknown>): string[] {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  const rightIndexes = new Map(rightKeys.map((key, index) => [key, index]));
  const insertions = Array.from({ length: rightKeys.length + 1 }, () => [] as string[]);

  leftKeys.forEach((key, index) => {
    if (rightIndexes.has(key)) return;

    let previousIndex: number | undefined;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const candidate = rightIndexes.get(leftKeys[cursor]!);
      if (candidate !== undefined) {
        previousIndex = candidate;
        break;
      }
    }

    let nextIndex: number | undefined;
    for (let cursor = index + 1; cursor < leftKeys.length; cursor += 1) {
      const candidate = rightIndexes.get(leftKeys[cursor]!);
      if (candidate !== undefined) {
        nextIndex = candidate;
        break;
      }
    }

    let slot = rightKeys.length;
    if (previousIndex !== undefined && nextIndex !== undefined) {
      slot = previousIndex < nextIndex ? nextIndex : previousIndex + 1;
    } else if (previousIndex !== undefined) {
      slot = previousIndex + 1;
    } else if (nextIndex !== undefined) {
      slot = nextIndex;
    }
    insertions[slot]!.push(key);
  });

  const result: string[] = [];
  rightKeys.forEach((key, index) => {
    result.push(...insertions[index]!, key);
  });
  result.push(...insertions[rightKeys.length]!);
  return result;
}

function buildJsonKeyOrders(
  left: unknown,
  right: unknown,
  pointer = '',
  orders: JsonKeyOrders = new Map(),
): JsonKeyOrders {
  if (Array.isArray(left) && Array.isArray(right)) {
    const length = Math.min(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      buildJsonKeyOrders(left[index], right[index], childPointer(pointer, String(index)), orders);
    }
    return orders;
  }

  if (!isRecord(left) || !isRecord(right)) return orders;
  const keys = mergeObjectKeys(left, right);
  orders.set(pointer, keys);
  for (const key of keys) {
    if (Object.hasOwn(left, key) && Object.hasOwn(right, key)) {
      buildJsonKeyOrders(left[key], right[key], childPointer(pointer, key), orders);
    }
  }
  return orders;
}

function renderJson(value: unknown, keyOrders: JsonKeyOrders = new Map()) {
  const lines: string[] = [];
  const locations = new Map<string, number>();

  function render(current: unknown, pointer: string, depth: number, prefix = ''): void {
    locations.set(pointer, lines.length + 1);
    const indentation = '  '.repeat(depth);
    if (Array.isArray(current)) {
      lines.push(`${indentation}${prefix}[`);
      current.forEach((item, index) => {
        const before = lines.length;
        render(item, childPointer(pointer, String(index)), depth + 1);
        lines[before] = `${'  '.repeat(depth + 1)}${lines[before]!.trimStart()}`;
        if (index < current.length - 1) lines[lines.length - 1] += ',';
      });
      lines.push(`${indentation}]`);
      return;
    }
    if (isRecord(current)) {
      lines.push(`${indentation}${prefix}{`);
      const preferredKeys = keyOrders.get(pointer) ?? Object.keys(current);
      const preferredKeySet = new Set(preferredKeys);
      const keys = [
        ...preferredKeys.filter((key) => Object.hasOwn(current, key)),
        ...Object.keys(current).filter((key) => !preferredKeySet.has(key)),
      ];
      const entries = keys.map((key) => [key, current[key]] as const);
      entries.forEach(([key, item], index) => {
        const before = lines.length;
        render(item, childPointer(pointer, key), depth + 1, `${JSON.stringify(key)}: `);
        lines[before] = `${'  '.repeat(depth + 1)}${lines[before]!.trimStart()}`;
        if (index < entries.length - 1) lines[lines.length - 1] += ',';
      });
      lines.push(`${indentation}}`);
      return;
    }
    lines.push(`${indentation}${prefix}${JSON.stringify(current)}`);
  }

  render(value, '', 0);
  return { text: lines.join('\n'), locations };
}

function synchronizeJsonPresentations(
  original: JsonPresentation,
  modified: JsonPresentation,
): JsonKeyOrders {
  const keyOrders = buildJsonKeyOrders(original.value, modified.value);
  const nextOriginal = renderJson(original.value, keyOrders);
  const nextModified = renderJson(modified.value, keyOrders);
  original.text = nextOriginal.text;
  original.locations = nextOriginal.locations;
  modified.text = nextModified.text;
  modified.locations = nextModified.locations;
  return keyOrders;
}

export function presentJson(input: string): JsonPresentation {
  const value = JSON.parse(input) as unknown;
  return { value, ...renderJson(value) };
}

/**
 * 按修改后文档的键顺序对齐两侧展示；仅存在于原文的键会插在最近的共享键旁边。
 */
export function alignJsonPresentations(
  original: JsonPresentation,
  modified: JsonPresentation,
): void {
  synchronizeJsonPresentations(original, modified);
}

function parentPointer(pointer: string): string {
  if (!pointer) return '';
  const separator = pointer.lastIndexOf('/');
  return separator <= 0 ? '' : pointer.slice(0, separator);
}

function nearestLocation(presentation: JsonPresentation, pointer: string): number {
  let current = pointer;
  while (true) {
    const location = presentation.locations.get(current);
    if (location !== undefined) return location;
    if (!current) return 1;
    current = parentPointer(current);
  }
}

export function compareJson(
  original: JsonPresentation,
  modified: JsonPresentation,
): StructuralDifference[] {
  const result: StructuralDifference[] = [];
  const keyOrders = synchronizeJsonPresentations(original, modified);

  function add(
    kind: StructuralDiffKind,
    pointer: string,
    originalValue?: unknown,
    modifiedValue?: unknown,
  ): void {
    result.push({
      kind,
      pointer,
      originalLine: nearestLocation(original, pointer),
      modifiedLine: nearestLocation(modified, pointer),
      originalValue,
      modifiedValue,
    });
  }

  function visit(left: unknown, right: unknown, pointer: string): void {
    if (jsonType(left) !== jsonType(right)) {
      add('type-changed', pointer, left, right);
      return;
    }
    if (Array.isArray(left) && Array.isArray(right)) {
      const length = Math.max(left.length, right.length);
      for (let index = 0; index < length; index += 1) {
        const nextPointer = childPointer(pointer, String(index));
        if (index >= left.length) add('added', nextPointer, undefined, right[index]);
        else if (index >= right.length) add('removed', nextPointer, left[index]);
        else visit(left[index], right[index], nextPointer);
      }
      return;
    }
    if (isRecord(left) && isRecord(right)) {
      const keys = keyOrders.get(pointer) ?? mergeObjectKeys(left, right);
      for (const key of keys) {
        const nextPointer = childPointer(pointer, key);
        const hasLeft = Object.hasOwn(left, key);
        const hasRight = Object.hasOwn(right, key);
        if (!hasLeft) add('added', nextPointer, undefined, right[key]);
        else if (!hasRight) add('removed', nextPointer, left[key]);
        else visit(left[key], right[key], nextPointer);
      }
      return;
    }
    if (!Object.is(left, right)) add('modified', pointer, left, right);
  }

  visit(original.value, modified.value, '');
  return result;
}

export function describeJsonValue(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return 'undefined';
  return serialized.length > 72 ? `${serialized.slice(0, 69)}…` : serialized;
}
