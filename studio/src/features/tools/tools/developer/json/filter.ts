type JsonFilterSegment = string;

function isIdentifierStart(character: string | undefined): boolean {
  return Boolean(character && /[A-Za-z_$]/.test(character));
}

function isIdentifierPart(character: string | undefined): boolean {
  return Boolean(character && /[A-Za-z0-9_$]/.test(character));
}

function skipWhitespace(source: string, index: number): number {
  while (index < source.length && /\s/.test(source[index])) index += 1;
  return index;
}

function parseQuotedSegment(source: string, start: number): { value: string; nextIndex: number } {
  const quote = source[start];
  let index = start + 1;
  let value = '';

  while (index < source.length) {
    const character = source[index];
    if (character === quote) return { value, nextIndex: index + 1 };
    if (character !== '\\') {
      value += character;
      index += 1;
      continue;
    }

    index += 1;
    const escaped = source[index];
    if (escaped === undefined) break;
    if (escaped === 'u') {
      const code = source.slice(index + 1, index + 5);
      if (!/^[0-9a-f]{4}$/i.test(code)) {
        throw new Error('过滤表达式中的 Unicode 转义无效。');
      }
      value += String.fromCharCode(Number.parseInt(code, 16));
      index += 5;
      continue;
    }

    const escapeMap: Record<string, string> = {
      b: '\b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
      v: '\v',
      '\\': '\\',
      "'": "'",
      '"': '"',
    };
    value += escapeMap[escaped] ?? escaped;
    index += 1;
  }

  throw new Error('过滤表达式中的字符串未闭合。');
}

function parseBracketSegment(
  source: string,
  start: number,
): { value: JsonFilterSegment; nextIndex: number } {
  let index = skipWhitespace(source, start + 1);
  const character = source[index];

  if (character === '"' || character === "'") {
    const parsed = parseQuotedSegment(source, index);
    index = skipWhitespace(source, parsed.nextIndex);
    if (source[index] !== ']') throw new Error('过滤表达式的属性下标缺少 “]”。');
    return { value: parsed.value, nextIndex: index + 1 };
  }

  const numberStart = index;
  while (index < source.length && /[0-9]/.test(source[index])) index += 1;
  if (numberStart === index) {
    throw new Error('数组下标必须是非负整数或带引号的对象键。');
  }
  index = skipWhitespace(source, index);
  if (source[index] !== ']') throw new Error('过滤表达式的数组下标缺少 “]”。');
  return { value: source.slice(numberStart, index).replace(/\s/g, ''), nextIndex: index + 1 };
}

export function parseJsonFilterPath(expression: string): JsonFilterSegment[] {
  const trimmed = expression.trim();
  const suffix = trimmed.startsWith('this') ? trimmed.slice(4) : trimmed;

  if (!suffix || !/^[.[\s]/.test(suffix)) {
    throw new Error('过滤表达式应以 “.” 或 “[” 开头。');
  }

  const segments: JsonFilterSegment[] = [];
  let index = 0;

  while (index < suffix.length) {
    if (suffix[index] === '.') {
      index += 1;
      if (!isIdentifierStart(suffix[index])) {
        throw new Error('点号后必须是对象属性名。');
      }
      const start = index;
      index += 1;
      while (isIdentifierPart(suffix[index])) index += 1;
      segments.push(suffix.slice(start, index));
      continue;
    }

    if (suffix[index] === '[') {
      const parsed = parseBracketSegment(suffix, index);
      segments.push(parsed.value);
      index = parsed.nextIndex;
      continue;
    }

    if (/\s/.test(suffix[index])) {
      index = skipWhitespace(suffix, index);
      if (index < suffix.length && suffix[index] !== '.' && suffix[index] !== '[') {
        throw new Error('属性路径之间只能使用 “.” 或 “[” 连接。');
      }
      continue;
    }

    throw new Error('过滤表达式只支持对象属性和数组下标。');
  }

  return segments;
}

export function evaluateJsonFilter(expression: string, root: unknown): unknown {
  const segments = parseJsonFilterPath(expression);
  let current = root;

  for (const segment of segments) {
    if (current === null || typeof current !== 'object') return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}
