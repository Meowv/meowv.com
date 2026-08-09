import { parseHeaders } from './developer-inspectors';

function ipv4Parts(source: string): number[] {
  const parts = source.trim().split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) {
    throw new Error('请输入有效 IPv4 地址。');
  }
  const values = parts.map(Number);
  if (values.some((value) => value < 0 || value > 255)) throw new Error('IPv4 段必须在 0–255。');
  return values;
}

function ipv4Number(source: string): number {
  return ipv4Parts(source).reduce((result, part) => result * 256 + part, 0) >>> 0;
}

function numberToIpv4(value: number): string {
  const unsigned = value >>> 0;
  return [24, 16, 8, 0].map((shift) => (unsigned >>> shift) & 255).join('.');
}

export function convertIpv4(source: string): Record<string, unknown> {
  let value: number;
  const input = source.trim();
  if (/^\d+\.\d+\.\d+\.\d+$/.test(input)) value = ipv4Number(input);
  else if (/^0x[\da-f]+$/i.test(input)) value = Number.parseInt(input.slice(2), 16);
  else if (/^[01]{32}$/.test(input)) value = Number.parseInt(input, 2);
  else if (/^\d+$/.test(input)) value = Number(input);
  else throw new Error('支持点分 IPv4、32 位二进制、十进制整数或 0x 十六进制。');
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error('IPv4 数值必须在 0–4294967295。');
  }
  return {
    ipv4: numberToIpv4(value),
    decimal: value >>> 0,
    hexadecimal: `0x${(value >>> 0).toString(16).padStart(8, '0').toUpperCase()}`,
    binary: (value >>> 0).toString(2).padStart(32, '0').match(/.{8}/g)?.join('.') ?? '',
  };
}

function expandIpv6(source: string): string[] {
  const input = source.trim().toLowerCase();
  if (!/^[\da-f:]+$/.test(input) || (input.match(/::/g)?.length ?? 0) > 1) {
    throw new Error('请输入有效 IPv6 地址。');
  }
  const [leftSource, rightSource] = input.split('::');
  const left = leftSource ? leftSource.split(':') : [];
  const right = rightSource ? rightSource.split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((input.includes('::') && missing < 1) || (!input.includes('::') && missing !== 0)) {
    throw new Error('IPv6 地址必须包含 8 个十六进制段。');
  }
  const parts = [...left, ...Array.from({ length: missing }, () => '0'), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[\da-f]{1,4}$/.test(part))) {
    throw new Error('IPv6 每个段必须是 1–4 位十六进制。');
  }
  return parts.map((part) => part.padStart(4, '0'));
}

function compressIpv6(parts: string[]): string {
  const compact = parts.map((part) => Number.parseInt(part, 16).toString(16));
  let bestStart = -1;
  let bestLength = 1;
  for (let start = 0; start < compact.length; start += 1) {
    if (compact[start] !== '0') continue;
    let end = start;
    while (end < compact.length && compact[end] === '0') end += 1;
    if (end - start > bestLength) {
      bestStart = start;
      bestLength = end - start;
    }
    start = end - 1;
  }
  if (bestStart < 0) return compact.join(':');
  const before = compact.slice(0, bestStart).join(':');
  const after = compact.slice(bestStart + bestLength).join(':');
  return `${before}::${after}`;
}

export function convertIpv6(source: string): Record<string, unknown> {
  const parts = expandIpv6(source);
  return {
    compressed: compressIpv6(parts),
    expanded: parts.join(':'),
    binary: parts.map((part) => Number.parseInt(part, 16).toString(2).padStart(16, '0')).join(' '),
    segments: parts.map((part, index) => ({ index: index + 1, hexadecimal: part })),
  };
}

export function analyzeIp(source: string): Record<string, unknown> {
  if (source.includes(':')) {
    const result = convertIpv6(source);
    const compressed = String(result.compressed);
    return {
      version: 6,
      ...result,
      loopback: compressed === '::1',
      linkLocal:
        compressed.toLowerCase().startsWith('fe8') ||
        compressed.toLowerCase().startsWith('fe9') ||
        compressed.toLowerCase().startsWith('fea') ||
        compressed.toLowerCase().startsWith('feb'),
      uniqueLocal: /^f[cd]/i.test(compressed),
    };
  }
  const parts = ipv4Parts(source);
  const value = ipv4Number(source);
  return {
    version: 4,
    address: parts.join('.'),
    decimal: value,
    private:
      parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168),
    loopback: parts[0] === 127,
    linkLocal: parts[0] === 169 && parts[1] === 254,
    multicast: parts[0] >= 224 && parts[0] <= 239,
    binary: parts.map((part) => part.toString(2).padStart(8, '0')).join('.'),
  };
}

export function calculateCidr(source: string): Record<string, unknown> {
  const match = source.trim().match(/^(\d+\.\d+\.\d+\.\d+)\/(\d|[12]\d|3[0-2])$/);
  if (!match) throw new Error('请输入 IPv4 CIDR，例如 192.168.1.10/24。');
  const prefix = Number(match[2]);
  const address = ipv4Number(match[1]);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (address & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const count = 2 ** (32 - prefix);
  return {
    cidr: `${numberToIpv4(network)}/${prefix}`,
    subnetMask: numberToIpv4(mask),
    wildcardMask: numberToIpv4(~mask >>> 0),
    networkAddress: numberToIpv4(network),
    broadcastAddress: numberToIpv4(broadcast),
    firstHost: prefix >= 31 ? numberToIpv4(network) : numberToIpv4(network + 1),
    lastHost: prefix >= 31 ? numberToIpv4(broadcast) : numberToIpv4(broadcast - 1),
    totalAddresses: count,
    usableHosts: prefix >= 31 ? count : Math.max(0, count - 2),
  };
}

const statusMap: Record<number, [string, string]> = {
  100: ['Continue', '继续发送请求。'],
  200: ['OK', '请求成功。'],
  201: ['Created', '资源创建成功。'],
  204: ['No Content', '成功，但没有响应正文。'],
  301: ['Moved Permanently', '资源已永久移动。'],
  302: ['Found', '资源临时重定向。'],
  304: ['Not Modified', '可继续使用缓存。'],
  400: ['Bad Request', '请求格式或参数有误。'],
  401: ['Unauthorized', '需要身份认证。'],
  403: ['Forbidden', '服务器拒绝访问。'],
  404: ['Not Found', '未找到资源。'],
  405: ['Method Not Allowed', '不支持当前请求方法。'],
  408: ['Request Timeout', '请求超时。'],
  409: ['Conflict', '请求与当前资源状态冲突。'],
  418: ["I'm a Teapot", 'RFC 2324 彩蛋状态码。'],
  429: ['Too Many Requests', '请求频率过高。'],
  500: ['Internal Server Error', '服务器内部错误。'],
  502: ['Bad Gateway', '网关收到无效上游响应。'],
  503: ['Service Unavailable', '服务暂时不可用。'],
  504: ['Gateway Timeout', '网关等待上游超时。'],
};

const mimeMap: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  json: 'application/json',
  xml: 'application/xml',
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',
  zip: 'application/zip',
  gz: 'application/gzip',
  wasm: 'application/wasm',
  woff: 'font/woff',
  woff2: 'font/woff2',
};

export function networkLookup(mode: 'status' | 'mime', source: string): Record<string, unknown> {
  if (mode === 'status') {
    const code = Number(source.trim());
    const entry = statusMap[code];
    if (!entry) throw new Error('内置表中没有该状态码。');
    return { code, name: entry[0], description: entry[1], class: `${Math.floor(code / 100)}xx` };
  }
  const input = source.trim().toLowerCase();
  const extension = input.includes('/') ? '' : input.replace(/^.*\./, '').replace(/^\./, '');
  if (input.includes('/')) {
    const extensions = Object.entries(mimeMap)
      .filter(([, mime]) => mime === input)
      .map(([ext]) => `.${ext}`);
    return { mimeType: input, extensions };
  }
  const mimeType = mimeMap[extension];
  if (!mimeType) throw new Error('内置表中没有该扩展名。');
  return { extension: `.${extension}`, mimeType };
}

export function parseNetworkInput(
  mode: 'url' | 'headers' | 'dns-query' | 'dns-lookup',
  source: string,
  recordType = 'A',
): Record<string, unknown> {
  if (mode === 'headers') return parseHeaders(source);
  if (mode === 'url') {
    let url: URL;
    try {
      url = new URL(source.trim());
    } catch {
      throw new Error('请输入包含协议的有效 URL。');
    }
    return {
      href: url.href,
      protocol: url.protocol,
      username: url.username,
      password: url.password ? '••••••' : '',
      host: url.host,
      hostname: url.hostname,
      port: url.port || '(默认)',
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      origin: url.origin,
      query: Object.fromEntries(url.searchParams.entries()),
    };
  }
  const domain = source.trim().replace(/\.$/, '');
  if (!/^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,63}$/i.test(domain)) {
    throw new Error('请输入有效域名。');
  }
  const type = recordType.toUpperCase();
  return mode === 'dns-query'
    ? {
        domain,
        recordType: type,
        dig: `dig ${domain} ${type}`,
        host: `host -t ${type} ${domain}`,
        nslookup: `nslookup -type=${type} ${domain}`,
        note: '浏览器没有本地 DNS API；为避免把域名发送给第三方，本工具仅生成系统查询命令。',
      }
    : {
        domain,
        ipv4: `dig +short A ${domain}`,
        ipv6: `dig +short AAAA ${domain}`,
        cname: `dig +short CNAME ${domain}`,
        mail: `dig +short MX ${domain}`,
        nameServers: `dig +short NS ${domain}`,
        note: '请在本机终端执行命令；页面不会自动发起外部 DNS 请求。',
      };
}
