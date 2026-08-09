export interface RegexResult {
  index: number;
  match: string;
  groups: string[];
  namedGroups?: Record<string, string>;
}

export function testRegex(pattern: string, flags: string, source: string): RegexResult[] {
  if (!pattern) throw new Error('请输入正则表达式。');
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags);
  } catch (cause) {
    throw new Error(cause instanceof Error ? cause.message : '正则表达式无效。');
  }
  const results: RegexResult[] = [];
  if (regex.global) {
    for (const match of source.matchAll(regex)) {
      results.push({
        index: match.index ?? 0,
        match: match[0],
        groups: match.slice(1).map((item) => item ?? ''),
        namedGroups: match.groups ? ({ ...match.groups } as Record<string, string>) : undefined,
      });
      if (results.length >= 1000) break;
    }
  } else {
    const match = regex.exec(source);
    if (match)
      results.push({
        index: match.index,
        match: match[0],
        groups: match.slice(1).map((item) => item ?? ''),
        namedGroups: match.groups ? ({ ...match.groups } as Record<string, string>) : undefined,
      });
  }
  return results;
}

export function parseUserAgent(input: string): Record<string, unknown> {
  const source = input.trim();
  if (!source) throw new Error('请输入 User-Agent。');
  const browserMatch =
    source.match(/(?:Edg|Edge)\/([\d.]+)/) ??
    source.match(/OPR\/([\d.]+)/) ??
    source.match(/Chrome\/([\d.]+)/) ??
    source.match(/Firefox\/([\d.]+)/) ??
    source.match(/Version\/([\d.]+).*Safari/);
  const browser = source.includes('Edg/')
    ? 'Microsoft Edge'
    : source.includes('OPR/')
      ? 'Opera'
      : source.includes('Chrome/')
        ? 'Google Chrome'
        : source.includes('Firefox/')
          ? 'Firefox'
          : /Safari/.test(source)
            ? 'Safari'
            : 'Unknown';
  const os = /Windows NT 10/.test(source)
    ? 'Windows 10/11'
    : /Windows NT/.test(source)
      ? 'Windows'
      : /Android ([\d.]+)/.test(source)
        ? `Android ${RegExp.$1}`
        : /iPhone OS ([\d_]+)/.test(source)
          ? `iOS ${RegExp.$1.replace(/_/g, '.')}`
          : /iPad/.test(source)
            ? 'iPadOS'
            : /Mac OS X ([\d_]+)/.test(source)
              ? `macOS ${RegExp.$1.replace(/_/g, '.')}`
              : /Linux/.test(source)
                ? 'Linux'
                : 'Unknown';
  const device = /Mobile|Android|iPhone/.test(source)
    ? 'Mobile'
    : /iPad|Tablet/.test(source)
      ? 'Tablet'
      : 'Desktop';
  return {
    browser,
    browserVersion: browserMatch?.[1] ?? null,
    operatingSystem: os,
    deviceType: device,
    engine: /AppleWebKit/.test(source)
      ? 'WebKit/Blink'
      : /Gecko\//.test(source)
        ? 'Gecko'
        : 'Unknown',
    mobile: device === 'Mobile',
    bot: /bot|crawler|spider|slurp/i.test(source),
    raw: source,
  };
}

export function parseHeaders(input: string): Record<string, unknown> {
  const lines = input.split(/\r?\n/).filter((line) => line.trim());
  const first = lines[0]?.trim() ?? '';
  const statusMatch = first.match(/^HTTP\/([\d.]+)\s+(\d{3})\s*(.*)$/i);
  const start = statusMatch ? 1 : 0;
  const headers: Record<string, string | string[]> = {};
  for (let index = start; index < lines.length; index += 1) {
    const separator = lines[index].indexOf(':');
    if (separator < 1) throw new Error(`第 ${index + 1} 行不是有效 Header。`);
    const name = lines[index].slice(0, separator).trim().toLowerCase();
    const value = lines[index].slice(separator + 1).trim();
    const current = headers[name];
    headers[name] =
      current === undefined
        ? value
        : Array.isArray(current)
          ? [...current, value]
          : [current, value];
  }
  return {
    status: statusMatch
      ? { httpVersion: statusMatch[1], code: Number(statusMatch[2]), text: statusMatch[3] }
      : null,
    count: Object.keys(headers).length,
    headers,
  };
}

function shellSplit(source: string): string[] {
  const tokens: string[] = [];
  let token = '';
  let quote = '';
  let escaped = false;
  for (const character of source.trim()) {
    if (escaped) {
      token += character;
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = '';
      else token += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (token) {
        tokens.push(token);
        token = '';
      }
    } else token += character;
  }
  if (quote) throw new Error('cURL 命令中的引号未闭合。');
  if (token) tokens.push(token);
  return tokens;
}

export function curlToFetch(input: string): string {
  const tokens = shellSplit(input.replace(/\\\r?\n/g, ' '));
  if (tokens[0] !== 'curl') throw new Error('命令必须以 curl 开头。');
  let method = 'GET';
  let url = '';
  let body = '';
  const headers: Record<string, string> = {};
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (['-X', '--request'].includes(token)) method = tokens[++index]?.toUpperCase() || method;
    else if (['-H', '--header'].includes(token)) {
      const header = tokens[++index] ?? '';
      const separator = header.indexOf(':');
      if (separator > 0)
        headers[header.slice(0, separator).trim()] = header.slice(separator + 1).trim();
    } else if (['-d', '--data', '--data-raw', '--data-binary'].includes(token)) {
      body = tokens[++index] ?? '';
      if (method === 'GET') method = 'POST';
    } else if (token === '--url') url = tokens[++index] ?? '';
    else if (!token.startsWith('-') && !url) url = token;
  }
  if (!url) throw new Error('cURL 命令中没有找到 URL。');
  const options: string[] = [`  method: ${JSON.stringify(method)},`];
  if (Object.keys(headers).length)
    options.push(`  headers: ${JSON.stringify(headers, null, 2).replace(/\n/g, '\n  ')},`);
  if (body) options.push(`  body: ${JSON.stringify(body)},`);
  return [
    `const response = await fetch(${JSON.stringify(url)}, {`,
    ...options,
    '});',
    '',
    'const data = await response.text();',
    'console.log(response.status, data);',
  ].join('\n');
}
