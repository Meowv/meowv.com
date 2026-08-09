export type FormatterMode =
  'javascript' | 'typescript' | 'css' | 'html' | 'sql' | 'xml' | 'yaml' | 'markdown';

async function loadPrettierPlugin(name: string): Promise<unknown> {
  if (name === 'babel') return import('prettier/plugins/babel');
  if (name === 'estree') return import('prettier/plugins/estree');
  if (name === 'typescript') return import('prettier/plugins/typescript');
  if (name === 'postcss') return import('prettier/plugins/postcss');
  if (name === 'html') return import('prettier/plugins/html');
  if (name === 'yaml') return import('prettier/plugins/yaml');
  if (name === 'markdown') return import('prettier/plugins/markdown');
  throw new Error(`未知 Prettier 插件：${name}`);
}

async function prettierFormat(
  source: string,
  parser: string,
  pluginNames: string[],
): Promise<string> {
  const [{ format }, ...plugins] = await Promise.all([
    import('prettier/standalone'),
    ...pluginNames.map(loadPrettierPlugin),
  ]);
  return format(source, {
    parser,
    plugins: plugins.map((plugin) => {
      const module = plugin as { default?: unknown };
      return module.default ?? module;
    }),
    printWidth: 100,
    singleQuote: true,
    tabWidth: 2,
    useTabs: false,
  });
}

function formatXml(source: string): string {
  const documentNode = new DOMParser().parseFromString(source, 'application/xml');
  if (documentNode.querySelector('parsererror')) throw new Error('XML 格式无效。');
  const serializer = new XMLSerializer();
  const formatNode = (node: Node, depth: number): string => {
    const indent = '  '.repeat(depth);
    if (!(node instanceof Element)) return `${indent}${serializer.serializeToString(node).trim()}`;
    const elementChildren = Array.from(node.children);
    const hasMixedText = Array.from(node.childNodes).some(
      (child) => child.nodeType === Node.TEXT_NODE && Boolean(child.textContent?.trim()),
    );
    if (!elementChildren.length || hasMixedText) {
      return `${indent}${serializer.serializeToString(node)}`;
    }
    const serialized = serializer.serializeToString(node);
    const opening = serialized.slice(0, serialized.indexOf('>') + 1);
    const children = Array.from(node.childNodes)
      .filter((child) => child.nodeType !== Node.TEXT_NODE || Boolean(child.textContent?.trim()))
      .map((child) => formatNode(child, depth + 1))
      .join('\n');
    return `${indent}${opening}\n${children}\n${indent}</${node.tagName}>`;
  };
  return Array.from(documentNode.childNodes)
    .filter((node) => node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim()))
    .map((node) => formatNode(node, 0))
    .join('\n');
}

const SQL_BREAK_BEFORE = new Set([
  'SELECT',
  'FROM',
  'WHERE',
  'GROUP BY',
  'ORDER BY',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'INSERT INTO',
  'VALUES',
  'UPDATE',
  'SET',
  'DELETE FROM',
  'LEFT JOIN',
  'RIGHT JOIN',
  'INNER JOIN',
  'FULL JOIN',
  'CROSS JOIN',
  'JOIN',
  'UNION',
  'UNION ALL',
]);

function formatSql(source: string): string {
  const protectedValues: string[] = [];
  const protectedSource = source.replace(
    /'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|--[^\n]*|\/\*[\s\S]*?\*\//g,
    (value) => ` __SQL_LITERAL_${protectedValues.push(value) - 1}__ `,
  );
  let normalized = protectedSource.replace(/\s+/g, ' ').trim();
  const phrases = Array.from(SQL_BREAK_BEFORE).sort((left, right) => right.length - left.length);
  for (const phrase of phrases) {
    const pattern = new RegExp(`\\b${phrase.replace(/ /g, '\\s+')}\\b`, 'gi');
    normalized = normalized.replace(pattern, `\n${phrase}`);
  }
  normalized = normalized
    .replace(/\s*,\s*/g, ',\n  ')
    .replace(/\s+(AND|OR)\s+/gi, (_, keyword: string) => `\n  ${keyword.toUpperCase()} `)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return normalized.replace(
    /__SQL_LITERAL_(\d+)__/g,
    (_, index: string) => protectedValues[Number(index)] ?? '',
  );
}

export async function formatCode(source: string, mode: FormatterMode): Promise<string> {
  if (!source.trim()) return '';
  if (mode === 'xml') return formatXml(source);
  if (mode === 'sql') return formatSql(source);
  if (mode === 'javascript') return prettierFormat(source, 'babel', ['babel', 'estree']);
  if (mode === 'typescript') return prettierFormat(source, 'typescript', ['typescript', 'estree']);
  if (mode === 'css') return prettierFormat(source, 'css', ['postcss']);
  if (mode === 'html') return prettierFormat(source, 'html', ['html']);
  if (mode === 'yaml') return prettierFormat(source, 'yaml', ['yaml']);
  return prettierFormat(source, 'markdown', ['markdown']);
}
