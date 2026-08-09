interface EndpointSpec {
  title?: string;
  description?: string;
  method?: string;
  path?: string;
  headers?: Record<string, unknown>;
  query?: Record<string, unknown>;
  requestBody?: unknown;
  response?: unknown;
}

function jsonBlock(value: unknown): string {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

function table(value: Record<string, unknown> | undefined): string {
  if (!value || !Object.keys(value).length) return '_无_';
  return [
    '| 名称 | 示例/说明 |',
    '| --- | --- |',
    ...Object.entries(value).map(
      ([key, item]) =>
        `| ${key.replace(/\|/g, '\\|')} | ${typeof item === 'string' ? item.replace(/\|/g, '\\|') : `\`${JSON.stringify(item)}\``} |`,
    ),
  ].join('\n');
}

export function generateApiDoc(input: string): string {
  let parsed: EndpointSpec | EndpointSpec[];
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error('接口定义必须是有效 JSON。');
  }
  const endpoints = Array.isArray(parsed) ? parsed : [parsed];
  if (!endpoints.length) throw new Error('接口定义不能为空。');
  return endpoints
    .map((endpoint, index) => {
      const title = endpoint.title?.trim() || `接口 ${index + 1}`;
      const method = (endpoint.method || 'GET').toUpperCase();
      const path = endpoint.path || '/';
      return [
        `# ${title}`,
        '',
        endpoint.description || '_暂无描述_',
        '',
        `**${method}** \`${path}\``,
        '',
        '## Request Headers',
        '',
        table(endpoint.headers),
        '',
        '## Query Parameters',
        '',
        table(endpoint.query),
        '',
        '## Request Body',
        '',
        endpoint.requestBody === undefined ? '_无_' : jsonBlock(endpoint.requestBody),
        '',
        '## Response Example',
        '',
        endpoint.response === undefined ? '_未提供_' : jsonBlock(endpoint.response),
      ].join('\n');
    })
    .join('\n\n---\n\n');
}
