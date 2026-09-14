import { inflateSync, strFromU8, strToU8, unzlibSync, zlibSync } from 'fflate';
import type { MermaidShareSnapshot } from '@/features/mermaid/types';

const MAX_COMPRESSED = 120_000;
const MAX_DECOMPRESSED = 500_000;
const MAX_SOURCE = 200_000;
const MAX_CONFIG = 120_000;
const MAX_TITLE = 120;
const PAKO_PREFIX = 'pako:';
const BASE64_PREFIX = 'base64:';
const LEGACY_PREFIX = 'meowv1:';

interface OfficialMermaidState {
  code?: unknown;
  mermaid?: unknown;
  title?: unknown;
  source?: unknown;
  configText?: unknown;
  config?: unknown;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function decodeBase64Url(value: string): Uint8Array {
  if (!value || !/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1) {
    throw new Error('Invalid base64url payload');
  }
  const normalized =
    value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function snapshotFromValue(value: unknown): MermaidShareSnapshot {
  if (!isPlainObject(value)) throw new Error('分享内容格式错误。');
  const candidate = value as Record<string, unknown>;
  if (
    candidate.protocol !== 1 ||
    typeof candidate.source !== 'string' ||
    candidate.source.length > MAX_SOURCE ||
    typeof candidate.title !== 'string' ||
    candidate.title.length > MAX_TITLE ||
    typeof candidate.configText !== 'string' ||
    candidate.configText.length > MAX_CONFIG
  ) {
    throw new Error('分享内容缺少有效图表数据。');
  }
  return {
    protocol: 1,
    title: candidate.title.slice(0, MAX_TITLE),
    source: candidate.source,
    configText: candidate.configText,
  };
}

function officialStateFromValue(value: unknown): MermaidShareSnapshot {
  if (!isPlainObject(value)) throw new Error('分享内容格式错误。');
  const state = value as OfficialMermaidState;
  const source = typeof state.code === 'string' ? state.code : state.source;
  if (typeof source !== 'string' || source.length > MAX_SOURCE) {
    throw new Error('分享内容缺少有效图表数据。');
  }

  const rawConfig = state.mermaid ?? state.configText ?? state.config;
  let configText = '{}';
  if (typeof rawConfig === 'string') {
    configText = rawConfig;
  } else if (isPlainObject(rawConfig) || Array.isArray(rawConfig)) {
    configText = JSON.stringify(rawConfig);
  } else if (rawConfig !== undefined && rawConfig !== null) {
    throw new Error('分享内容配置格式错误。');
  }
  if (configText.length > MAX_CONFIG) throw new Error('分享内容配置过大。');

  const title =
    typeof state.title === 'string' && state.title.length <= MAX_TITLE ? state.title : '分享图表';
  return {
    protocol: 1,
    title: title.slice(0, MAX_TITLE),
    source,
    configText,
  };
}

function parseInflatedJson(bytes: Uint8Array): unknown {
  if (bytes.byteLength > MAX_DECOMPRESSED) throw new Error('分享内容解压后过大。');
  return JSON.parse(strFromU8(bytes)) as unknown;
}

function inflateWithLimit(bytes: Uint8Array, zlibWrapped: boolean): Uint8Array {
  // fflate 的同步解压支持固定输出缓冲区；多留一个字节即可识别被截断的超限载荷，
  // 避免高度压缩的恶意数据先分配无限大的结果缓冲区。
  const output = new Uint8Array(MAX_DECOMPRESSED + 1);
  return zlibWrapped ? unzlibSync(bytes, { out: output }) : inflateSync(bytes, { out: output });
}

function officialStateForSnapshot(snapshot: MermaidShareSnapshot): Record<string, unknown> {
  let rough = false;
  try {
    const config = JSON.parse(snapshot.configText) as unknown;
    rough = isPlainObject(config) && (config.look === 'handDrawn' || config.handDrawn === true);
  } catch {
    // 配置文本仍按原文分享；无效 JSON 会在工作台配置区显示错误。
  }
  // 使用 mermaid-live-editor 的 State 结构，让生成的 hash 也能在官方编辑器中打开。
  // 额外的 title 字段会被旧版本忽略，同时让 Studio 往返时保留文档名称。
  return {
    code: snapshot.source,
    mermaid: snapshot.configText,
    grid: true,
    panZoom: true,
    rough,
    updateDiagram: true,
    title: snapshot.title,
  };
}

export function encodeMermaidShare(snapshot: MermaidShareSnapshot): string {
  if (
    !snapshot ||
    snapshot.protocol !== 1 ||
    typeof snapshot.title !== 'string' ||
    typeof snapshot.source !== 'string' ||
    typeof snapshot.configText !== 'string' ||
    snapshot.title.length > MAX_TITLE ||
    snapshot.source.length > MAX_SOURCE ||
    snapshot.configText.length > MAX_CONFIG
  ) {
    throw new Error('图表内容无效或过大，无法生成分享链接。');
  }
  const json = JSON.stringify(officialStateForSnapshot(snapshot));
  const encodedBytes = strToU8(json);
  if (
    json.length > MAX_SOURCE + MAX_CONFIG + MAX_TITLE + 256 ||
    encodedBytes.byteLength > MAX_DECOMPRESSED
  )
    throw new Error('图表内容过大，无法生成分享链接。');
  const payload = `${PAKO_PREFIX}${encodeBase64Url(zlibSync(encodedBytes, { level: 9 }))}`;
  if (payload.length > MAX_COMPRESSED) throw new Error('分享链接过长，请导出图表文档备份。');
  return payload;
}

export function decodeMermaidShare(payload: string): MermaidShareSnapshot {
  if (!payload || payload.length > MAX_COMPRESSED) throw new Error('分享链接无效或内容过大。');
  const isPako = payload.startsWith(PAKO_PREFIX);
  const isBase64 = payload.startsWith(BASE64_PREFIX);
  const isLegacy = payload.startsWith(LEGACY_PREFIX);
  const encoded = isPako
    ? payload.slice(PAKO_PREFIX.length)
    : isBase64
      ? payload.slice(BASE64_PREFIX.length)
      : isLegacy
        ? payload.slice(LEGACY_PREFIX.length)
        : payload;
  if (!encoded || encoded.length > MAX_COMPRESSED) {
    throw new Error('分享链接无效或内容过大。');
  }

  try {
    const bytes = decodeBase64Url(encoded);
    if (bytes.byteLength > MAX_COMPRESSED) throw new Error('分享内容过大。');

    if (isBase64) return officialStateFromValue(parseInflatedJson(bytes));
    if (isPako) return officialStateFromValue(parseInflatedJson(inflateWithLimit(bytes, true)));

    // 兼容官方协议前生成的 Studio 链接：它们使用 raw DEFLATE 和
    // `{ protocol, source, ... }` 对象。无前缀的纯 base64 状态也按官方旧链接读取。
    try {
      return snapshotFromValue(parseInflatedJson(inflateWithLimit(bytes, false)));
    } catch (legacyError) {
      if (legacyError instanceof Error && legacyError.message === '分享内容解压后过大。')
        throw legacyError;
      return officialStateFromValue(parseInflatedJson(bytes));
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === '分享内容解压后过大。' ||
        error.message === '分享内容过大。' ||
        error.message === '分享链接无效或内容过大。')
    )
      throw error;
    throw new Error('分享链接无效或已损坏。');
  }
}

export function shareUrl(snapshot: MermaidShareSnapshot): string {
  return `${window.location.origin}/mermaid#${encodeMermaidShare(snapshot)}`;
}
