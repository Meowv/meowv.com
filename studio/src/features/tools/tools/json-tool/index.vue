<script setup lang="ts">
import {
  IconArrowsExchange,
  IconBraces,
  IconCheck,
  IconEraser,
  IconFileZip,
  IconRefresh,
} from '@tabler/icons-vue';
import { dump as dumpYaml, load as loadYaml } from 'js-yaml';
import { computed, onMounted, ref, watch } from 'vue';
import CopyButton from '@/features/tools/components/CopyButton.vue';
import DownloadButton from '@/features/tools/components/DownloadButton.vue';
import ToolActions from '@/features/tools/components/ToolActions.vue';
import ToolCodeEditor from '@/features/tools/components/ToolCodeEditor.vue';
import ToolInput from '@/features/tools/components/ToolInput.vue';
import ToolOutput from '@/features/tools/components/ToolOutput.vue';
import ToolPane from '@/features/tools/components/ToolPane.vue';
import ToolSection from '@/features/tools/components/ToolSection.vue';
import ToolWorkspace from '@/features/tools/components/ToolWorkspace.vue';

type DataConvertMode =
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

function parseJsonData(input: string): unknown {
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

function convertData(input: string, mode: DataConvertMode): string {
  if (mode === 'yaml-to-json') return JSON.stringify(loadYaml(input), null, 2);
  if (mode === 'xml-to-json') return JSON.stringify(parseXml(input), null, 2);
  if (mode === 'csv-to-json') return JSON.stringify(csvToJson(input), null, 2);
  if (mode === 'toml-to-json') return JSON.stringify(tomlToJson(input), null, 2);
  const value = parseJsonData(input);
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

interface ParsedJson {
  value: unknown;
  normalized: string;
}

function describeJsonError(input: string, error: unknown): string {
  const message = error instanceof Error ? error.message : 'JSON 格式无效';
  const positionMatch = message.match(/position\s+(\d+)/i);
  if (!positionMatch) return message;

  const position = Number(positionMatch[1]);
  const before = input.slice(0, position);
  const line = before.split('\n').length;
  const lastLineBreak = before.lastIndexOf('\n');
  const column = position - lastLineBreak;
  return `${message}（第 ${line} 行，第 ${column} 列）`;
}

function parseJson(input: string): ParsedJson {
  if (!input.trim()) {
    throw new Error('请输入需要处理的 JSON 内容。');
  }

  try {
    const value: unknown = JSON.parse(input);
    return { value, normalized: JSON.stringify(value) };
  } catch (error) {
    throw new Error(describeJsonError(input, error));
  }
}

function formatJson(input: string, indent: number | string = 2): string {
  return JSON.stringify(parseJson(input).value, null, indent);
}

function minifyJson(input: string): string {
  return parseJson(input).normalized;
}

type JsonMode = 'format' | 'minify' | 'validate';
type Mode = JsonMode | DataConvertMode;
type IndentOption = '2' | '4' | 'tab';

const mode = ref<Mode>('format');
const options: Array<{ value: Mode; label: string }> = [
  { value: 'format', label: '格式化' },
  { value: 'minify', label: '压缩' },
  { value: 'validate', label: '校验' },
  { value: 'json-to-yaml', label: '转 YAML' },
  { value: 'json-to-xml', label: '转 XML' },
  { value: 'json-to-csv', label: '转 CSV' },
  { value: 'json-to-toml', label: '转 TOML' },
  { value: 'json-to-typescript', label: '转 TypeScript' },
  { value: 'json-to-java', label: '转 Java' },
  { value: 'json-to-csharp', label: '转 C#' },
];
const jsonModes: JsonMode[] = ['format', 'minify', 'validate'];
const isJsonMode = computed(() => jsonModes.includes(mode.value as JsonMode));

const jsonExample = `{
  "name": "Meowv Studio",
  "version": "1.0.0",
  "active": true,
  "features": ["JSON format", "converter", "validator"],
  "config": { "theme": "light", "language": "zh-CN" }
}`;
const jsonInput = ref(jsonExample);
const jsonOutput = ref('');
const jsonMessage = ref('');
const jsonError = ref('');
const indent = ref<IndentOption>('2');
const wordWrap = ref(true);
const primaryAction = computed(() => {
  if (mode.value === 'minify')
    return { label: '压缩', action: 'minify' as const, icon: IconFileZip };
  if (mode.value === 'validate')
    return { label: '校验', action: 'validate' as const, icon: IconCheck };
  return { label: '格式化', action: 'format' as const, icon: IconBraces };
});
const jsonOutputTitle = computed(() => (mode.value === 'validate' ? '校验结果' : '输出结果'));
const indentValue = computed(() => (indent.value === 'tab' ? '\t' : Number(indent.value)));

function runJson(action: JsonMode): void {
  jsonError.value = '';
  jsonMessage.value = '';
  try {
    if (action === 'format') {
      jsonOutput.value = formatJson(jsonInput.value, indentValue.value);
      jsonMessage.value = `格式正确 · 已按${indent.value === 'tab' ? ' Tab' : ` ${indent.value} 空格`}缩进`;
    } else if (action === 'minify') {
      jsonOutput.value = minifyJson(jsonInput.value);
      jsonMessage.value = '格式正确 · 已移除多余空白';
    } else {
      const parsed = parseJson(jsonInput.value);
      jsonOutput.value = JSON.stringify(parsed.value, null, indentValue.value);
      jsonMessage.value = 'JSON 格式有效';
    }
  } catch (cause) {
    jsonOutput.value = '';
    jsonError.value = cause instanceof Error ? cause.message : '处理失败，请检查输入内容。';
  }
}
function clearJson(): void {
  jsonInput.value = '';
  jsonOutput.value = '';
  jsonMessage.value = '';
  jsonError.value = '';
}
function restoreJsonExample(): void {
  jsonInput.value = jsonExample;
  runJson(mode.value as JsonMode);
}

const convertInput = ref('');
const convertOutput = ref('');
const convertError = ref('');
const target = computed(() => mode.value.split('-to-')[1]);
const source = computed(() => mode.value.split('-to-')[0]);
const labels: Record<string, string> = {
  json: 'JSON',
  yaml: 'YAML',
  xml: 'XML',
  csv: 'CSV',
  toml: 'TOML',
  typescript: 'TypeScript',
  java: 'Java',
  csharp: 'C#',
};
const convertExample = computed(() =>
  source.value === 'json'
    ? '{\n  "name": "Meowv Studio",\n  "local": true,\n  "tools": ["JSON", "Image", "PDF"]\n}'
    : source.value === 'yaml'
      ? 'name: Meowv Studio\nlocal: true\ntools:\n  - JSON\n  - Image'
      : source.value === 'xml'
        ? '<studio><name>Meowv Studio</name><local>true</local></studio>'
        : source.value === 'csv'
          ? 'name,category,status\nJSON 格式化,Developer,ready\n图片压缩,Image,ready'
          : 'name = "Meowv Studio"\nlocal = true\n\n[owner]\nname = "Meowv"',
);
function convert(): void {
  convertError.value = '';
  try {
    convertOutput.value = convertData(convertInput.value, mode.value as DataConvertMode);
  } catch (cause) {
    convertOutput.value = '';
    convertError.value = cause instanceof Error ? cause.message : '格式转换失败。';
  }
}
function clearConvert(): void {
  convertInput.value = '';
  convertOutput.value = '';
  convertError.value = '';
}

watch(mode, (value) => {
  if (jsonModes.includes(value as JsonMode)) {
    jsonInput.value = jsonExample;
    jsonOutput.value = '';
    jsonMessage.value = '';
    jsonError.value = '';
    runJson(value as JsonMode);
  } else {
    convertInput.value = '';
    convertOutput.value = '';
    convertError.value = '';
  }
});
onMounted(() => runJson('format'));
</script>

<template>
  <div class="tool-stack">
    <label class="tool-inline-select">
      <span>操作</span>
      <select v-model="mode" aria-label="JSON 操作">
        <option v-for="option in options" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </label>

    <ToolWorkspace v-if="isJsonMode" label="JSON 处理工作区">
      <ToolPane title="输入 JSON">
        <template #actions>
          <label class="tool-inline-select">
            <span>缩进</span>
            <select v-model="indent" aria-label="JSON 缩进方式" @change="runJson(mode as JsonMode)">
              <option value="2">2 空格</option>
              <option value="4">4 空格</option>
              <option value="tab">Tab</option>
            </select>
          </label>
          <button
            type="button"
            class="tool-button tool-button--primary"
            @click="runJson(primaryAction.action)"
          >
            <component :is="primaryAction.icon" :size="16" aria-hidden="true" />
            {{ primaryAction.label }}
          </button>
          <button
            v-if="mode !== 'minify'"
            type="button"
            class="tool-button tool-button--secondary"
            @click="runJson('minify')"
          >
            <IconFileZip :size="16" aria-hidden="true" />
            压缩
          </button>
          <button
            v-if="mode !== 'validate'"
            type="button"
            class="tool-button tool-button--secondary"
            @click="runJson('validate')"
          >
            <IconCheck :size="16" aria-hidden="true" />
            校验
          </button>
          <button type="button" class="tool-button tool-button--danger" @click="clearJson">
            <IconEraser :size="16" aria-hidden="true" />
            清空
          </button>
        </template>
        <ToolCodeEditor
          v-model="jsonInput"
          language="json"
          label="JSON 输入编辑器"
          :word-wrap="wordWrap"
        />
        <template #footer>
          <button type="button" class="tool-text-action" @click="restoreJsonExample">
            <IconRefresh :size="15" aria-hidden="true" />
            恢复示例
          </button>
          <label class="tool-switch">
            <input v-model="wordWrap" type="checkbox" />
            自动换行
          </label>
        </template>
      </ToolPane>

      <ToolPane
        :title="jsonOutputTitle"
        tone="output"
        :status="jsonError || jsonMessage"
        :status-tone="jsonError ? 'error' : jsonMessage ? 'success' : 'neutral'"
      >
        <template #actions>
          <CopyButton :text="jsonOutput" label="复制结果" />
          <DownloadButton
            :content="jsonOutput"
            filename="meowv-studio.json"
            mime-type="application/json;charset=utf-8"
          />
        </template>
        <ToolCodeEditor
          v-model="jsonOutput"
          language="json"
          label="JSON 输出编辑器"
          :word-wrap="wordWrap"
          read-only
        />
        <p v-if="jsonError" class="tool-pane__message tool-pane__message--error" role="alert">
          {{ jsonError }}
        </p>
        <p v-else-if="jsonMessage" class="tool-pane__message" role="status">
          {{ jsonMessage }}
        </p>
      </ToolPane>
    </ToolWorkspace>

    <div v-else class="tool-workspace-grid">
      <ToolSection
        :title="`${labels[source]} 输入`"
        :description="`将 ${labels[source]} 转换为 ${labels[target]}。`"
      >
        <div class="tool-stack">
          <ToolInput
            v-model="convertInput"
            :label="`${labels[source]} 内容`"
            :placeholder="convertExample"
          />
          <ToolActions>
            <button type="button" class="tool-button tool-button--primary" @click="convert">
              <IconArrowsExchange :size="16" aria-hidden="true" />转换为 {{ labels[target] }}
            </button>
            <button
              type="button"
              class="tool-button tool-button--quiet"
              @click="convertInput = convertExample"
            >
              使用示例
            </button>
            <button type="button" class="tool-button tool-button--danger" @click="clearConvert">
              <IconEraser :size="16" aria-hidden="true" />清空
            </button>
          </ToolActions>
          <p v-if="convertError" class="tool-status tool-status--error" role="alert">
            {{ convertError }}
          </p>
        </div>
      </ToolSection>
      <ToolOutput
        :title="`${labels[target]} 结果`"
        :value="convertOutput"
        :filename="`result.${target === 'typescript' ? 'ts' : target === 'csharp' ? 'cs' : target}`"
      />
    </div>
  </div>
</template>
