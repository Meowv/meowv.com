export type TextCodecMode =
  | 'url-parser'
  | 'html-encode'
  | 'html-decode'
  | 'unicode-to-chinese'
  | 'chinese-to-unicode'
  | 'ascii'
  | 'binary'
  | 'octal'
  | 'hex';

const radixByMode: Record<'ascii' | 'binary' | 'octal' | 'hex', number> = {
  ascii: 10,
  binary: 2,
  octal: 8,
  hex: 16,
};

function encodeHtml(input: string): string {
  return input.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );
}

function decodeHtml(input: string): string {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = input;
  return textarea.value;
}

function encodeUnicode(input: string): string {
  let output = '';
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    output += code > 0x7f ? `\\u${code.toString(16).padStart(4, '0').toUpperCase()}` : input[index];
  }
  return output;
}

function decodeUnicode(input: string): string {
  return input
    .replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code: string) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    );
}

function parseUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('请输入 URL。');
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('URL 格式无效，请输入包含协议的完整地址。');
  }
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of url.searchParams) {
    const current = query[key];
    query[key] =
      current === undefined
        ? value
        : Array.isArray(current)
          ? [...current, value]
          : [current, value];
  }
  return JSON.stringify(
    {
      href: url.href,
      protocol: url.protocol,
      username: url.username,
      password: url.password ? '******' : '',
      host: url.host,
      hostname: url.hostname,
      port: url.port,
      pathname: url.pathname,
      search: url.search,
      query,
      hash: url.hash,
      origin: url.origin,
    },
    null,
    2,
  );
}

function convertRadix(input: string, mode: 'ascii' | 'binary' | 'octal' | 'hex'): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const radix = radixByMode[mode];
  const tokenPattern =
    radix === 2
      ? /^[01]{1,8}(?:[\s,]+[01]{1,8})*$/
      : radix === 8
        ? /^[0-7]{1,3}(?:[\s,]+[0-7]{1,3})*$/
        : radix === 10
          ? /^\d{1,3}(?:[\s,]+\d{1,3})*$/
          : /^[0-9a-fA-F]{1,2}(?:[\s,]+[0-9a-fA-F]{1,2})*$/;
  if (tokenPattern.test(trimmed)) {
    const bytes = trimmed.split(/[\s,]+/).map((token) => Number.parseInt(token, radix));
    if (bytes.some((value) => !Number.isFinite(value) || value < 0 || value > 255)) {
      throw new Error('数值必须位于 0 到 255 之间。');
    }
    return new TextDecoder().decode(Uint8Array.from(bytes));
  }
  const padding = radix === 2 ? 8 : radix === 8 ? 3 : radix === 10 ? 0 : 2;
  return Array.from(new TextEncoder().encode(input), (byte) =>
    byte.toString(radix).toUpperCase().padStart(padding, '0'),
  ).join(' ');
}

export function transformTextCodec(input: string, mode: TextCodecMode): string {
  if (mode === 'url-parser') return parseUrl(input);
  if (mode === 'html-encode') return encodeHtml(input);
  if (mode === 'html-decode') return decodeHtml(input);
  if (mode === 'unicode-to-chinese') return decodeUnicode(input);
  if (mode === 'chinese-to-unicode') return encodeUnicode(input);
  return convertRadix(input, mode);
}
