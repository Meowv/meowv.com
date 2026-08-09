import { dump as dumpYaml, load as loadYaml } from 'js-yaml';

export type DataConvertMode =
  | 'json-to-yaml'
  | 'json-to-xml'
  | 'json-to-csv'
  | 'json-to-toml'
  | 'json-to-typescript'
  | 'json-to-java'
  | 'json-to-csharp'
  | 'csv-to-json'
  | 'yaml-to-json'
  | 'xml-to-json'
  | 'toml-to-json';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    throw new Error('JSON 格式无效。');
  }
}

function xmlName(value: string): string {
  const safe = value.replace(/[^\p{L}\p{N}_.-]/gu, '_');
  return /^[\p{L}_]/u.test(safe) ? safe : `item_${safe}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function valueToXml(name: string, value: unknown, depth = 0): string {
  const indent = '  '.repeat(depth);
  const tag = xmlName(name);
  if (value === null || value === undefined) return `${indent}<${tag} />`;
  if (Array.isArray(value)) return value.map((item) => valueToXml(tag, item, depth)).join('\n');
  if (isRecord(value)) {
    const children = Object.entries(value)
      .map(([key, child]) => valueToXml(key, child, depth + 1))
      .join('\n');
    return `${indent}<${tag}>\n${children}\n${indent}</${tag}>`;
  }
  return `${indent}<${tag}>${escapeXml(String(value))}</${tag}>`;
}

function xmlElementToValue(element: Element): unknown {
  const attributes: JsonRecord = {};
  for (const attribute of Array.from(element.attributes))
    attributes[`@${attribute.name}`] = attribute.value;
  const children = Array.from(element.children);
  const directText = Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? '')
    .join('')
    .trim();
  if (!children.length && !Object.keys(attributes).length) return directText;
  const result: JsonRecord = { ...attributes };
  for (const child of children) {
    const value = xmlElementToValue(child);
    const current = result[child.tagName];
    result[child.tagName] =
      current === undefined
        ? value
        : Array.isArray(current)
          ? [...current, value]
          : [current, value];
  }
  if (directText) result['#text'] = directText;
  return result;
}

function parseXml(input: string): unknown {
  const documentNode = new DOMParser().parseFromString(input, 'application/xml');
  if (documentNode.querySelector('parsererror')) throw new Error('XML 格式无效。');
  return {
    [documentNode.documentElement.tagName]: xmlElementToValue(documentNode.documentElement),
  };
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else cell += character;
  }
  if (quoted) throw new Error('CSV 引号未闭合。');
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => value !== ''));
}

function csvToJson(input: string): unknown {
  const rows = parseCsv(input);
  if (!rows.length) return [];
  const headers = rows[0].map((header, index) => header.trim() || `column${index + 1}`);
  return rows
    .slice(1)
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

function csvCell(value: unknown): string {
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function jsonToCsv(value: unknown): string {
  const rows = Array.isArray(value) ? value : [value];
  if (!rows.length) return '';
  if (!rows.every(isRecord)) throw new Error('JSON 转 CSV 需要对象或对象数组。');
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return [
    headers.map(csvCell).join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ].join('\n');
}

function tomlValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return `[${value.map(tomlValue).join(', ')}]`;
  if (value === null) return '""';
  return JSON.stringify(value);
}

function jsonToToml(value: unknown): string {
  if (!isRecord(value)) throw new Error('JSON 转 TOML 需要根对象。');
  const lines: string[] = [];
  function writeTable(record: JsonRecord, path: string[]): void {
    const simple = Object.entries(record).filter(([, child]) => !isRecord(child));
    const nested = Object.entries(record).filter(([, child]) => isRecord(child));
    if (path.length) lines.push(`[${path.join('.')}]`);
    for (const [key, child] of simple) lines.push(`${key} = ${tomlValue(child)}`);
    for (const [key, child] of nested) {
      if (lines.length && lines.at(-1) !== '') lines.push('');
      writeTable(child as JsonRecord, [...path, key]);
    }
  }
  writeTable(value, []);
  return lines.join('\n');
}

function parseTomlValue(source: string): unknown {
  const value = source.trim();
  if (value.startsWith('"') || value.startsWith("'")) {
    try {
      return value.startsWith('"') ? JSON.parse(value) : value.slice(1, -1);
    } catch {
      throw new Error(`TOML 字符串无效：${value}`);
    }
  }
  if (value === 'true' || value === 'false') return value === 'true';
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value)) return Number(value);
  if (value.startsWith('[') && value.endsWith(']'))
    return parseCsv(value.slice(1, -1))
      .flat()
      .map((item) => parseTomlValue(item));
  return value;
}

function tomlToJson(input: string): unknown {
  const root: JsonRecord = {};
  let target = root;
  for (const [lineIndex, rawLine] of input.split(/\r?\n/).entries()) {
    const line = rawLine.replace(/\s+#.*$/, '').trim();
    if (!line) continue;
    const table = line.match(/^\[([^\]]+)\]$/);
    if (table) {
      target = root;
      for (const part of table[1].split('.').map((item) => item.trim())) {
        const current = target[part];
        if (current !== undefined && !isRecord(current))
          throw new Error(`TOML 第 ${lineIndex + 1} 行表名冲突。`);
        target[part] = isRecord(current) ? current : {};
        target = target[part] as JsonRecord;
      }
      continue;
    }
    const separator = line.indexOf('=');
    if (separator < 1) throw new Error(`TOML 第 ${lineIndex + 1} 行缺少等号。`);
    target[line.slice(0, separator).trim()] = parseTomlValue(line.slice(separator + 1));
  }
  return root;
}

function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `${value.length ? typeName(value[0]) : 'unknown'}[]`;
  if (typeof value === 'number') return 'number';
  return typeof value;
}

function propertyName(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

function typescriptType(value: unknown, name = 'Root'): string {
  if (!isRecord(value)) return `export type ${name} = ${typeName(value)};`;
  const nested: string[] = [];
  const fields = Object.entries(value).map(([key, child]) => {
    let type = typeName(child);
    if (isRecord(child)) {
      const childName = `${name}${key[0]?.toUpperCase() ?? ''}${key.slice(1)}`;
      nested.push(typescriptType(child, childName));
      type = childName;
    } else if (Array.isArray(child) && isRecord(child[0])) {
      const childName = `${name}${key[0]?.toUpperCase() ?? ''}${key.slice(1)}Item`;
      nested.push(typescriptType(child[0], childName));
      type = `${childName}[]`;
    }
    return `  ${propertyName(key)}: ${type};`;
  });
  return [`export interface ${name} {`, ...fields, '}', ...nested.map((item) => `\n${item}`)].join(
    '\n',
  );
}

function pascal(value: string): string {
  return (
    value.replace(/(^|[^A-Za-z0-9]+)([A-Za-z0-9])/g, (_, __, char: string) => char.toUpperCase()) ||
    'Value'
  );
}

function objectCode(
  value: unknown,
  language: 'java' | 'csharp',
  name = 'Root',
  isRoot = true,
): string {
  if (!isRecord(value)) throw new Error('代码生成需要 JSON 根对象。');
  const nested: string[] = [];
  const fields = Object.entries(value).map(([key, child]) => {
    let type: string;
    if (isRecord(child)) {
      type = pascal(key);
      nested.push(objectCode(child, language, type, false));
    } else if (Array.isArray(child)) {
      const item = child[0];
      let itemType = language === 'java' ? 'Object' : 'object';
      if (isRecord(item)) {
        itemType = `${pascal(key)}Item`;
        nested.push(objectCode(item, language, itemType, false));
      } else if (typeof item === 'string') itemType = language === 'java' ? 'String' : 'string';
      else if (typeof item === 'number') itemType = language === 'java' ? 'double' : 'double';
      else if (typeof item === 'boolean') itemType = language === 'java' ? 'boolean' : 'bool';
      type = language === 'java' ? `List<${itemType}>` : `List<${itemType}>`;
    } else if (typeof child === 'string') type = language === 'java' ? 'String' : 'string';
    else if (typeof child === 'number') type = 'double';
    else if (typeof child === 'boolean') type = language === 'java' ? 'boolean' : 'bool';
    else type = language === 'java' ? 'Object' : 'object?';
    return language === 'java'
      ? `    public ${type} ${key};`
      : `    public ${type} ${pascal(key)} { get; set; }`;
  });
  const declaration = language === 'java' && !isRoot ? `class ${name}` : `public class ${name}`;
  return [declaration, '{', ...fields, '}', ...nested.map((item) => `\n${item}`)].join('\n');
}

export function convertData(input: string, mode: DataConvertMode): string {
  if (mode === 'yaml-to-json') return JSON.stringify(loadYaml(input), null, 2);
  if (mode === 'xml-to-json') return JSON.stringify(parseXml(input), null, 2);
  if (mode === 'csv-to-json') return JSON.stringify(csvToJson(input), null, 2);
  if (mode === 'toml-to-json') return JSON.stringify(tomlToJson(input), null, 2);
  const value = parseJson(input);
  if (mode === 'json-to-yaml') return dumpYaml(value, { noRefs: true, lineWidth: 100 });
  if (mode === 'json-to-xml') {
    const body = Array.isArray(value)
      ? `<root>\n${value.map((item) => valueToXml('item', item, 1)).join('\n')}\n</root>`
      : valueToXml('root', value);
    return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
  }
  if (mode === 'json-to-csv') return jsonToCsv(value);
  if (mode === 'json-to-toml') return jsonToToml(value);
  if (mode === 'json-to-typescript') return typescriptType(value);
  if (mode === 'json-to-java') return `import java.util.List;\n\n${objectCode(value, 'java')}`;
  return `using System.Collections.Generic;\n\n${objectCode(value, 'csharp')}`;
}
