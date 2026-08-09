type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseJsonInput(input: string, label = 'JSON'): unknown {
  try {
    return JSON.parse(input);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : '格式无效';
    throw new Error(`${label} 格式无效：${message}`);
  }
}

export function diffJson(before: unknown, after: unknown, path = '$'): string[] {
  if (Object.is(before, after)) return [];
  if (Array.isArray(before) && Array.isArray(after)) {
    const changes: string[] = [];
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index += 1) {
      if (index >= before.length)
        changes.push(`+ ${path}[${index}] = ${JSON.stringify(after[index])}`);
      else if (index >= after.length)
        changes.push(`- ${path}[${index}] = ${JSON.stringify(before[index])}`);
      else changes.push(...diffJson(before[index], after[index], `${path}[${index}]`));
    }
    return changes;
  }
  if (isRecord(before) && isRecord(after)) {
    const changes: string[] = [];
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const nextPath = `${path}.${key}`;
      if (!(key in before)) changes.push(`+ ${nextPath} = ${JSON.stringify(after[key])}`);
      else if (!(key in after)) changes.push(`- ${nextPath} = ${JSON.stringify(before[key])}`);
      else changes.push(...diffJson(before[key], after[key], nextPath));
    }
    return changes;
  }
  return [`~ ${path}: ${JSON.stringify(before)} → ${JSON.stringify(after)}`];
}

function uniqueTypes(values: unknown[]): string[] {
  return Array.from(
    new Set(
      values.map((value) =>
        value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
      ),
    ),
  );
}

export function generateSchema(value: unknown): JsonRecord {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) {
    if (!value.length) return { type: 'array', items: {} };
    const types = uniqueTypes(value);
    return {
      type: 'array',
      items:
        types.length === 1
          ? generateSchema(value[0])
          : {
              anyOf: types.map((type) =>
                generateSchema(
                  value.find(
                    (item) =>
                      (item === null ? 'null' : Array.isArray(item) ? 'array' : typeof item) ===
                      type,
                  ),
                ),
              ),
            },
    };
  }
  if (isRecord(value))
    return {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(value).map(([key, child]) => [key, generateSchema(child)]),
      ),
      required: Object.keys(value),
      additionalProperties: false,
    };
  if (typeof value === 'number') return { type: Number.isInteger(value) ? 'integer' : 'number' };
  return { type: typeof value };
}

function matchesType(value: unknown, type: string): boolean {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return isRecord(value);
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  return typeof value === type;
}

export function validateSchema(value: unknown, schema: unknown, path = '$'): string[] {
  if (!isRecord(schema)) return [`${path}：Schema 必须是对象。`];
  const errors: string[] = [];
  if (Array.isArray(schema.anyOf)) {
    if (!schema.anyOf.some((candidate) => validateSchema(value, candidate, path).length === 0))
      errors.push(`${path}：不符合 anyOf 中的任何规则。`);
    return errors;
  }
  const type = schema.type;
  if (typeof type === 'string' && !matchesType(value, type)) {
    errors.push(
      `${path}：期望 ${type}，实际为 ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}。`,
    );
    return errors;
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => Object.is(item, value)))
    errors.push(`${path}：值不在 enum 范围内。`);
  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength)
      errors.push(`${path}：长度小于 ${schema.minLength}。`);
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength)
      errors.push(`${path}：长度大于 ${schema.maxLength}。`);
    if (typeof schema.pattern === 'string') {
      try {
        if (!new RegExp(schema.pattern).test(value)) errors.push(`${path}：不符合 pattern。`);
      } catch {
        errors.push(`${path}：Schema pattern 无效。`);
      }
    }
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum)
      errors.push(`${path}：小于 minimum ${schema.minimum}。`);
    if (typeof schema.maximum === 'number' && value > schema.maximum)
      errors.push(`${path}：大于 maximum ${schema.maximum}。`);
  }
  if (isRecord(value)) {
    const required = Array.isArray(schema.required)
      ? schema.required.filter((item): item is string => typeof item === 'string')
      : [];
    for (const key of required) if (!(key in value)) errors.push(`${path}.${key}：缺少必填字段。`);
    const properties = isRecord(schema.properties) ? schema.properties : {};
    for (const [key, child] of Object.entries(value)) {
      if (key in properties)
        errors.push(...validateSchema(child, properties[key], `${path}.${key}`));
      else if (schema.additionalProperties === false)
        errors.push(`${path}.${key}：不允许额外字段。`);
    }
  }
  if (Array.isArray(value) && isRecord(schema.items))
    value.forEach((item, index) =>
      errors.push(...validateSchema(item, schema.items, `${path}[${index}]`)),
    );
  return errors;
}

const names = ['Alex', 'Mia', 'Noah', 'Luna', 'Meowv'];
function mockPrimitive(value: unknown, index: number): unknown {
  if (typeof value === 'string')
    return value.includes('@')
      ? `user${index + 1}@example.com`
      : `${value || 'sample'}-${index + 1}`;
  if (typeof value === 'number') return value + index + 1;
  if (typeof value === 'boolean') return index % 2 === 0;
  return value;
}

export function mockFromSample(value: unknown, index = 0): unknown {
  if (Array.isArray(value))
    return Array.from({ length: Math.max(3, value.length) }, (_, itemIndex) =>
      mockFromSample(value[itemIndex % Math.max(1, value.length)] ?? {}, itemIndex),
    );
  if (isRecord(value))
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        /name/i.test(key) && typeof child === 'string'
          ? names[index % names.length]
          : mockFromSample(child, index),
      ]),
    );
  return mockPrimitive(value, index);
}

export function queryJsonPath(root: unknown, expression: string): unknown[] {
  const trimmed = expression.trim();
  if (!trimmed.startsWith('$')) throw new Error('JSONPath 必须以 $ 开头。');
  const tokens: Array<{
    type: 'key' | 'index' | 'wildcard' | 'recursive';
    value?: string | number;
  }> = [];
  const source = trimmed.slice(1);
  const pattern =
    /\.\.([A-Za-z_$][\w$]*)|\.([A-Za-z_$][\w$]*)|\[['"]([^'"]+)['"]\]|\[(\d+)\]|\.\*|\[\*\]/g;
  let lastIndex = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index !== lastIndex)
      throw new Error(`暂不支持的 JSONPath 片段：${source.slice(lastIndex)}`);
    if (match[1]) tokens.push({ type: 'recursive', value: match[1] });
    else if (match[2] || match[3]) tokens.push({ type: 'key', value: match[2] || match[3] });
    else if (match[4]) tokens.push({ type: 'index', value: Number(match[4]) });
    else tokens.push({ type: 'wildcard' });
    lastIndex = (match.index ?? 0) + match[0].length;
  }
  if (lastIndex !== source.length)
    throw new Error(`暂不支持的 JSONPath 片段：${source.slice(lastIndex)}`);
  let current: unknown[] = [root];
  for (const token of tokens) {
    if (token.type === 'key')
      current = current.flatMap((value) =>
        isRecord(value) && String(token.value) in value ? [value[String(token.value)]] : [],
      );
    else if (token.type === 'index')
      current = current.flatMap((value) =>
        Array.isArray(value) && Number(token.value) < value.length
          ? [value[Number(token.value)]]
          : [],
      );
    else if (token.type === 'wildcard')
      current = current.flatMap((value) =>
        Array.isArray(value) ? value : isRecord(value) ? Object.values(value) : [],
      );
    else {
      const found: unknown[] = [];
      const visit = (value: unknown): void => {
        if (isRecord(value)) {
          if (String(token.value) in value) found.push(value[String(token.value)]);
          Object.values(value).forEach(visit);
        } else if (Array.isArray(value)) value.forEach(visit);
      };
      current.forEach(visit);
      current = found;
    }
  }
  return current;
}
