export interface TextSection {
  title: string | null;
  content: string;
}

const SECTION_LIMIT = 72_000;
const CHAPTER_PATTERN =
  /^\s*(?:第[零〇一二三四五六七八九十百千万两\d]+[章节回卷部篇]|序章|楔子|前言|后记|尾声|引子)(?:\s*[:：、.]\s*)?.{0,64}$/;

function stripBom(bytes: Uint8Array): Uint8Array {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return bytes.subarray(3);
  return bytes;
}

export function decodeBookText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const source = bytes.subarray(2);
    const swapped = new Uint8Array(source.length);
    for (let index = 0; index + 1 < source.length; index += 2) {
      swapped[index] = source[index + 1];
      swapped[index + 1] = source[index];
    }
    return new TextDecoder('utf-16le').decode(swapped);
  }
  const source = stripBom(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(source);
  } catch {
    try {
      return new TextDecoder('gb18030', { fatal: true }).decode(source);
    } catch {
      return new TextDecoder('utf-8').decode(source);
    }
  }
}

export function splitTextSections(text: string): TextSection[] {
  const normalized = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim();
  if (!normalized) throw new Error('TXT 文件没有可阅读的文字。');
  const lines = normalized.split('\n');
  const result: TextSection[] = [];
  let title: string | null = null;
  let content: string[] = [];
  const flush = (): void => {
    const value = content.join('\n').trim();
    if (value || title) result.push({ title, content: value });
    content = [];
  };
  let contentLength = 0;
  for (const line of lines) {
    if (CHAPTER_PATTERN.test(line.trim())) {
      flush();
      title = line.trim();
      contentLength = 0;
      continue;
    }
    content.push(line);
    contentLength += line.length + 1;
    if (contentLength >= SECTION_LIMIT) {
      flush();
      title = null;
      contentLength = 0;
    }
  }
  flush();
  return result.length ? result : [{ title: null, content: normalized }];
}
