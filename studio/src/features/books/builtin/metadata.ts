import { inflateSync } from 'fflate';
import { createBookFingerprintFromParts } from '../persistence/BookFingerprint';
import type { PublicationMetadata } from '../types/reader';
import type { BuiltinBookDef } from './types';

const SAMPLE_BYTES = 64 * 1024;

const EOCD_SIGNATURE = 0x06054b50;
const CD_SIGNATURE = 0x02014b50;
const ZIP_METHOD_STORED = 0;
const ZIP_METHOD_DEFLATE = 8;

export interface BookProbeResult {
  id: string;
  metadata: PublicationMetadata | null;
  cover?: Blob;
}

interface SuffixData {
  size: number;
  start: number;
  bytes: Uint8Array;
}

interface CentralEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

async function readRange(
  url: string,
  start: number,
  end: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (end < start) return new Uint8Array(0);
  const response = await fetch(url, {
    signal,
    headers: { Range: `bytes=${start}-${end}` },
    cache: 'no-cache',
  });
  const range = await requirePartialResponse(response);
  if (range.start !== start || range.end !== Math.min(end, range.size - 1)) {
    await response.body?.cancel();
    throw new Error('书籍分段响应范围不匹配。');
  }
  return readPartialBytes(response, range);
}

async function readSuffix(
  url: string,
  byteCount: number,
  signal?: AbortSignal,
): Promise<SuffixData> {
  const response = await fetch(url, {
    signal,
    headers: { Range: `bytes=-${byteCount}` },
    cache: 'no-cache',
  });
  const range = await requirePartialResponse(response);
  if (range.start !== Math.max(0, range.size - byteCount) || range.end !== range.size - 1) {
    await response.body?.cancel();
    throw new Error('书籍尾部响应范围不匹配。');
  }
  return { size: range.size, start: range.start, bytes: await readPartialBytes(response, range) };
}

interface PartialRange {
  start: number;
  end: number;
  size: number;
}

async function requirePartialResponse(response: Response): Promise<PartialRange> {
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range') ?? '');
  if (response.status !== 206 || !match) {
    // 后台探测不能因服务器忽略 Range 而读取整本书。
    await response.body?.cancel();
    throw new Error('书库不支持分段读取。');
  }
  const [start, end, size] = match.slice(1).map(Number);
  if (![start, end, size].every(Number.isSafeInteger) || start > end || end >= size) {
    await response.body?.cancel();
    throw new Error('书籍分段响应无效。');
  }
  return { start, end, size };
}

async function readPartialBytes(response: Response, range: PartialRange): Promise<Uint8Array> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length !== range.end - range.start + 1) throw new Error('书籍分段响应长度不匹配。');
  return bytes;
}

function findEocd(bytes: Uint8Array): number {
  const minIndex = Math.max(0, bytes.length - 65557 - 22);
  for (let index = bytes.length - 22; index >= minIndex; index -= 1) {
    if (readUint32(bytes, index) === EOCD_SIGNATURE) return index;
  }
  return -1;
}

function parseCentralDirectory(bytes: Uint8Array): CentralEntry[] {
  const entries: CentralEntry[] = [];
  let offset = 0;
  while (offset + 0x2e <= bytes.length && readUint32(bytes, offset) === CD_SIGNATURE) {
    const nameLength = readUint16(bytes, offset + 0x1c);
    const extraLength = readUint16(bytes, offset + 0x1e);
    const commentLength = readUint16(bytes, offset + 0x20);
    const total = 0x2e + nameLength + extraLength + commentLength;
    if (offset + total > bytes.length) break;
    entries.push({
      name: new TextDecoder().decode(bytes.subarray(offset + 0x2e, offset + 0x2e + nameLength)),
      method: readUint16(bytes, offset + 0x0a),
      compressedSize: readUint32(bytes, offset + 0x14),
      localHeaderOffset: readUint32(bytes, offset + 0x2a),
    });
    offset += total;
  }
  return entries;
}

async function readZipEntryData(
  url: string,
  entry: CentralEntry,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (entry.compressedSize <= 0) return new Uint8Array(0);
  const header = await readRange(
    url,
    entry.localHeaderOffset,
    entry.localHeaderOffset + 29,
    signal,
  );
  if (header.byteLength < 30) return new Uint8Array(0);
  const nameLength = readUint16(header, 26);
  const extraLength = readUint16(header, 28);
  const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;
  const raw = await readRange(url, dataStart, dataStart + entry.compressedSize - 1, signal);
  if (entry.method === ZIP_METHOD_STORED) return raw;
  if (entry.method === ZIP_METHOD_DEFLATE) return inflateSync(raw);
  return new Uint8Array(0);
}

function containerOpfPath(xml: string): string | null {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  for (const element of Array.from(document.getElementsByTagName('rootfile'))) {
    const fullPath = element.getAttribute('full-path');
    if (fullPath) return fullPath;
  }
  return null;
}

/** 按本地名收集元素，规避 OPF 默认命名空间导致 CSS 选择器不匹配的问题。 */
function elementsByLocalName(document: Document, localName: string): Element[] {
  return Array.from(document.getElementsByTagName('*')).filter(
    (element) => element.localName === localName,
  );
}

function opfMetadata(xml: string): PublicationMetadata | null {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const children = elementsByLocalName(document, 'metadata').flatMap((element) =>
    Array.from(element.children),
  );
  const valueFor = (name: string): string | undefined =>
    children.find((element) => element.localName === name)?.textContent?.trim();
  const title = valueFor('title') ?? '';
  const authors = children
    .filter((element) => element.localName === 'creator')
    .map((element) => element.textContent?.trim() ?? '')
    .filter(Boolean);
  if (!title && !authors.length) return null;
  const language = valueFor('language');
  const description = valueFor('description');
  return {
    title,
    authors,
    ...(language ? { language } : {}),
    ...(description ? { description } : {}),
  };
}

/** 解析 OPF 中封面图片的 zip 内路径；无封面时返回 null。 */
function opfCoverPath(xml: string): string | null {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const items = elementsByLocalName(document, 'item');
  const hrefOf = (item: Element): string => item.getAttribute('href') ?? '';
  const typeOf = (item: Element): string => item.getAttribute('media-type') ?? '';
  const coverMeta = elementsByLocalName(document, 'meta').find(
    (element) => (element.getAttribute('name') ?? '').toLowerCase() === 'cover',
  );
  if (coverMeta) {
    const id = coverMeta.getAttribute('content');
    const item = id ? items.find((element) => element.getAttribute('id') === id) : undefined;
    if (item && typeOf(item).startsWith('image/')) return hrefOf(item);
  }
  const byCover = items.find((element) =>
    /cover/i.test(`${element.getAttribute('id') ?? ''} ${hrefOf(element)}`),
  );
  if (byCover && typeOf(byCover).startsWith('image/')) return hrefOf(byCover);
  const firstImage = items.find((element) => typeOf(element).startsWith('image/'));
  return firstImage ? hrefOf(firstImage) : null;
}

/** 把 OPF 内的 href（相对 OPF 所在目录）解析为 zip 内规范路径。 */
function resolveZipPath(opfPath: string, href: string): string {
  const clean = decodeURIComponent(href.split('?')[0] ?? '');
  if (clean.startsWith('/')) return clean.slice(1);
  const segments = (opfPath.slice(0, opfPath.lastIndexOf('/') + 1) + clean).split('/');
  const result: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') result.pop();
    else result.push(segment);
  }
  return result.join('/');
}

const MAX_COVER_BYTES = 4 * 1024 * 1024;

async function probeEpubCover(
  url: string,
  entries: CentralEntry[],
  normalizeName: (name: string) => string,
  opfPath: string,
  opfXml: string,
  signal?: AbortSignal,
): Promise<Blob | null> {
  const coverPath = opfCoverPath(opfXml);
  if (!coverPath) return null;
  const target = normalizeName(resolveZipPath(opfPath, coverPath));
  let entry = entries.find((candidate) => normalizeName(candidate.name) === target);
  if (!entry) {
    entry = entries.find(
      (candidate) => normalizeName(candidate.name).toLowerCase() === target.toLowerCase(),
    );
  }
  if (!entry || entry.compressedSize <= 0 || entry.compressedSize > MAX_COVER_BYTES) return null;
  const data = await readZipEntryData(url, entry, signal);
  if (!data.byteLength) return null;
  const mediaType = coverPath.split('?')[0].split('.').pop()?.toLowerCase();
  const type =
    mediaType === 'jpg' || mediaType === 'jpeg' || mediaType === 'png' || mediaType === 'gif'
      ? `image/${mediaType === 'jpeg' ? 'jpeg' : mediaType}`
      : 'image/jpeg';
  return new Blob([data.buffer as ArrayBuffer], { type });
}

async function probeEpubMetadata(
  url: string,
  suffix: SuffixData,
  signal?: AbortSignal,
): Promise<{ metadata: PublicationMetadata | null; cover: Blob | null }> {
  const eocdAt = findEocd(suffix.bytes);
  if (eocdAt < 0) return { metadata: null, cover: null };
  const cdOffset = readUint32(suffix.bytes, eocdAt + 0x10);
  const cdSize = readUint32(suffix.bytes, eocdAt + 0x0c);
  const cdStart = Math.max(0, cdOffset - suffix.start);
  const cd = await (async () => {
    if (cdOffset >= suffix.start && cdStart + cdSize <= suffix.bytes.byteLength) {
      return suffix.bytes.subarray(cdStart, cdStart + cdSize);
    }
    return readRange(url, cdOffset, cdOffset + cdSize - 1, signal);
  })();
  const entries = parseCentralDirectory(cd);
  const normalizeName = (name: string): string => name.replace(/\\/g, '/').replace(/^\.\//, '');
  const container = entries.find(
    (entry) => normalizeName(entry.name).toLowerCase() === 'meta-inf/container.xml',
  );
  if (!container) return { metadata: null, cover: null };
  const containerXml = new TextDecoder().decode(await readZipEntryData(url, container, signal));
  const opfPath = containerOpfPath(containerXml);
  if (!opfPath) return { metadata: null, cover: null };
  const opfEntry = entries.find((entry) => normalizeName(entry.name) === normalizeName(opfPath));
  if (!opfEntry) return { metadata: null, cover: null };
  const opfXml = new TextDecoder().decode(await readZipEntryData(url, opfEntry, signal));
  let cover: Blob | null = null;
  try {
    cover = await probeEpubCover(url, entries, normalizeName, opfPath, opfXml, signal);
  } catch {
    // 封面提取失败不影响元数据解析
  }
  return { metadata: opfMetadata(opfXml), cover };
}

function decodePdfBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  return new TextDecoder('latin1').decode(bytes);
}

function decodeLiteralResult(text: string): string {
  const first = text.charCodeAt(0);
  const second = text.charCodeAt(1);
  if ((first === 0xfe && second === 0xff) || (first === 0xff && second === 0xfe)) {
    const bytes = new Uint8Array(text.length);
    for (let index = 0; index < text.length; index += 1) {
      bytes[index] = text.charCodeAt(index) & 0xff;
    }
    return decodePdfBytes(bytes);
  }
  return text;
}

function pdfStringLiteral(text: string): string {
  if (text.startsWith('<')) {
    const close = text.indexOf('>');
    if (close < 0) return '';
    const hex = text.slice(1, close).replace(/\s+/g, '');
    if (hex.length % 2 !== 0) return '';
    const bytes = new Uint8Array(hex.length / 2);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    }
    return decodePdfBytes(bytes);
  }
  if (text.startsWith('(')) {
    let result = '';
    let index = 1;
    let depth = 1;
    while (index < text.length && depth > 0) {
      const char = text[index];
      if (char === '\\') {
        const next = text[index + 1];
        if (next === 'n') result += '\n';
        else if (next === 'r') result += '\r';
        else if (next === 't') result += '\t';
        else if (next === 'b') result += '\b';
        else if (next === 'f') result += '\f';
        else if (next === '(' || next === ')' || next === '\\') result += next;
        else if (next >= '0' && next <= '7') {
          let octal = next;
          let cursor = index + 2;
          while (
            octal.length < 3 &&
            cursor < text.length &&
            text[cursor] >= '0' &&
            text[cursor] <= '7'
          ) {
            octal += text[cursor];
            cursor += 1;
          }
          result += String.fromCharCode(parseInt(octal, 8));
          index = cursor - 1;
        } else if (next !== undefined) result += next;
        index += 2;
      } else if (char === '(') {
        depth += 1;
        result += char;
        index += 1;
      } else if (char === ')') {
        depth -= 1;
        if (depth > 0) result += char;
        index += 1;
      } else {
        result += char;
        index += 1;
      }
    }
    return decodeLiteralResult(result);
  }
  return '';
}

function parseXrefOffsets(xrefText: string): Map<number, number> {
  const offsets = new Map<number, number>();
  const lines = xrefText.replaceAll('\r', '\n').split('\n');
  let objectNumber = -1;
  for (const line of lines) {
    const trimmed = line.trim();
    const segment = /^(\d+)\s+(\d+)$/.exec(trimmed);
    if (segment) {
      objectNumber = Number(segment[1]);
      continue;
    }
    const row = /^(\d{10})\s+(\d{5})\s+([nf])$/.exec(trimmed);
    if (!row || objectNumber < 0) continue;
    if (row[3] === 'n') offsets.set(objectNumber, Number(row[1]));
    objectNumber += 1;
  }
  return offsets;
}

function extractPdfString(dictText: string, key: string): string | null {
  const pattern = new RegExp(
    `/\\b${key}\\b\\s*((?:\\((?:\\.|[^)\\])*\\))|(?:<[0-9a-fA-F\\s]*>))`,
    'i',
  );
  const match = pattern.exec(dictText);
  return match ? pdfStringLiteral(match[1]).trim() || null : null;
}

async function probePdfMetadata(
  url: string,
  suffix: SuffixData,
  signal?: AbortSignal,
): Promise<PublicationMetadata | null> {
  const tailText = new TextDecoder('latin1').decode(suffix.bytes);
  const findInfoObject = (text: string): { number: number; generation: number } | null => {
    const trailerAt = text.lastIndexOf('trailer');
    const match = trailerAt >= 0 ? /\/Info\s+(\d+)\s+(\d+)\s+R/i.exec(text.slice(trailerAt)) : null;
    return match ? { number: Number(match[1]), generation: Number(match[2]) } : null;
  };
  const resolveObjectText = async (object: {
    number: number;
    generation: number;
  }): Promise<string | null> => {
    const objectPattern = new RegExp(
      `${object.number}\\s+${object.generation}\\s+obj([\\s\\S]*?)endobj`,
      'i',
    );
    const inTail = objectPattern.exec(tailText);
    if (inTail) return inTail[1];
    const xrefMatch = /startxref\s+(\d+)/.exec(tailText);
    if (!xrefMatch) return null;
    const xrefOffset = Number(xrefMatch[1]);
    const xrefText = new TextDecoder('latin1').decode(
      await readRange(url, xrefOffset, xrefOffset + 32767, signal),
    );
    const objectOffset = parseXrefOffsets(xrefText).get(object.number);
    if (objectOffset == null) return null;
    const objectText = new TextDecoder('latin1').decode(
      await readRange(url, objectOffset, objectOffset + 16383, signal),
    );
    const matched = new RegExp(
      `${object.number}\\s+${object.generation}\\s+obj([\\s\\S]*?)endobj`,
      'i',
    ).exec(objectText);
    return matched ? matched[1] : null;
  };
  const info = findInfoObject(tailText);
  if (!info) return null;
  const dictText = await resolveObjectText(info);
  if (!dictText) return null;
  const title = extractPdfString(dictText, 'Title');
  const author = extractPdfString(dictText, 'Author');
  if (!title && !author) return null;
  return { title: title ?? '', authors: author ? [author] : [] };
}

/**
 * 通过 HTTP Range 轻量探测内置书籍：仅读取头尾采样与元数据，不下载整本文件。
 * 返回指纹 id（与打开后一致）与内容元数据；解析失败时 metadata 为 null，由文件名兜底。
 */
export async function probeBookMetadata(
  def: BuiltinBookDef,
  signal?: AbortSignal,
): Promise<BookProbeResult | null> {
  const suffix = await readSuffix(def.url, SAMPLE_BYTES, signal);
  const headEnd = Math.min(suffix.size, SAMPLE_BYTES);
  const head =
    suffix.start === 0
      ? suffix.bytes.subarray(0, headEnd)
      : await readRange(def.url, 0, headEnd - 1, signal);
  // 与本地指纹一致：小文件的头尾采样不能重叠。
  const tailStart = Math.max(headEnd, suffix.size - SAMPLE_BYTES);
  const tail = suffix.bytes.subarray(tailStart - suffix.start);
  const id = await createBookFingerprintFromParts(suffix.size, 0, head, tail);
  let metadata: PublicationMetadata | null = null;
  let cover: Blob | null = null;
  if (def.format === 'epub') {
    const result = await probeEpubMetadata(def.url, suffix, signal);
    metadata = result.metadata;
    cover = result.cover;
  } else if (def.format === 'pdf') {
    metadata = await probePdfMetadata(def.url, suffix, signal);
  }
  return { id, metadata, ...(cover ? { cover } : {}) };
}
