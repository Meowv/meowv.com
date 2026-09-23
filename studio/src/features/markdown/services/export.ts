import DOMPurify from 'dompurify';
import type { Paragraph, ParagraphChild, Table } from 'docx';
import { enqueueMermaidTask } from '@/core/mermaid/scheduler';

export type ExportExtension = 'md' | 'html' | 'pdf' | 'png' | 'docx';

export type ExportErrorCode =
  'INVALID_CONTENT' | 'UNSUPPORTED_BROWSER' | 'RENDER_FAILED' | 'DOWNLOAD_FAILED';

export interface ExportArtifact {
  readonly blob: Blob;
  readonly filename: string;
  readonly mimeType: string;
  readonly warnings: readonly string[];
}

export interface BaseExportOptions {
  readonly filename?: string;
  readonly title?: string;
  readonly resolveImageBlob?: (source: string) => Promise<Blob | undefined>;
}

export interface HtmlExportOptions extends BaseExportOptions {
  readonly language?: string;
}

export interface PdfExportOptions extends BaseExportOptions {
  readonly backgroundColor?: string;
  readonly margin?: number;
  readonly scale?: number;
}

export interface ImageExportOptions extends BaseExportOptions {
  readonly backgroundColor?: string;
  readonly scale?: number;
}

export interface DocxExportOptions extends BaseExportOptions {
  readonly creator?: string;
}

export interface PreparedExportHtml {
  readonly html: string;
  readonly warnings: readonly string[];
}

export class ExportError extends Error {
  readonly code: ExportErrorCode;
  readonly cause?: unknown;

  constructor(code: ExportErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'ExportError';
    this.code = code;
    this.cause = cause;
  }
}

const MIME_TYPES: Readonly<Record<ExportExtension, string>> = {
  md: 'text/markdown;charset=utf-8',
  html: 'text/html;charset=utf-8',
  pdf: 'application/pdf',
  png: 'image/png',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const KNOWN_EXPORT_EXTENSION = /\.(?:md|markdown|html?|pdf|png|docx)$/i;
const RESERVED_WINDOWS_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const SAFE_EMBEDDED_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;
const SAFE_LOCAL_IMAGE = /^blob:/i;
const SAFE_REMOTE_IMAGE = /^https:\/\//i;
const SAFE_RELATIVE_IMAGE = /^(?!(?:[a-z][a-z\d+.-]*:|\/\/))\S+$/i;
const SAFE_FRAGMENT_RESOURCE = /^#/u;
const REMOTE_URL = /^(?:https?:)?\/\//i;
const SAFE_MERMAID_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const MERMAID_IMAGE_ATTRIBUTE = /(\bimg\s*:\s*)(?:"([^"]*)"|'([^']*)'|([^\s,}]+))/giu;
const MERMAID_HTML_IMAGE = /(<img\b[^>]*\bsrc\s*=\s*)(["'])(.*?)\2/giu;
const MERMAID_MARKDOWN_IMAGE = /(!\[[^\]]*\]\(\s*)([^)\s]+)(\s*(?:["'][^"']*["'])?\s*\))/giu;
const RESOURCE_ATTRIBUTES = ['src', 'srcset', 'poster', 'background', 'data'] as const;

const EXPORT_DOCUMENT_STYLES = `
  :root {
    color-scheme: light;
    font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI",
      "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    color: #111827;
    background: #ffffff;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: #ffffff; }
  article {
    width: min(860px, calc(100% - 48px));
    margin: 0 auto;
    padding: 48px 0 72px;
    font-size: 16px;
    line-height: 1.75;
    overflow-wrap: anywhere;
  }
  h1, h2, h3, h4, h5, h6 {
    color: #0f172a;
    line-height: 1.3;
    margin: 1.6em 0 0.65em;
  }
  h1 { font-size: 2.25em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.35em; }
  h2 { font-size: 1.7em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3em; }
  h3 { font-size: 1.35em; }
  p, blockquote, ul, ol, pre, table { margin: 0 0 1.15em; }
  a { color: #2563eb; text-decoration: none; }
  a:hover { text-decoration: underline; }
  blockquote {
    margin-left: 0;
    padding: 0.2em 1em;
    color: #475569;
    border-left: 4px solid #cbd5e1;
  }
  code {
    padding: 0.15em 0.35em;
    border-radius: 4px;
    background: #f1f5f9;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    font-size: 0.9em;
  }
  pre {
    padding: 18px;
    overflow: auto;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    background: #0f172a;
    color: #e2e8f0;
  }
  pre code { padding: 0; background: transparent; color: inherit; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 9px 12px; border: 1px solid #dbe3ee; text-align: left; }
  th { background: #f8fafc; }
  img { display: block; max-width: 100%; height: auto; margin: 1.25em auto; }
  hr { margin: 2em 0; border: 0; border-top: 1px solid #dbe3ee; }
  .mermaid-export {
    margin: 1.5em 0;
    overflow-x: auto;
    text-align: center;
  }
  .mermaid-export svg {
    display: block;
    max-width: 100%;
    height: auto;
    margin: 0 auto;
  }
  .mermaid-export-error {
    margin: 1.25em 0;
    padding: 0.75em 1em;
    border: 1px dashed #cbd5e1;
    border-radius: 8px;
    color: #64748b;
    background: #f8fafc;
  }
  .export-image-placeholder {
    display: inline-block;
    padding: 0.3em 0.55em;
    border: 1px dashed #cbd5e1;
    border-radius: 5px;
    color: #64748b;
    background: #f8fafc;
  }
  .export-remote-image-placeholder {
    display: grid;
    min-height: 132px;
    place-items: center;
    margin: 1.25em 0;
    padding: 18px;
    border: 1px dashed #94a3b8;
    border-radius: 10px;
    color: #475569;
    background: #f8fafc;
    text-align: center;
  }
  .export-remote-image-placeholder strong {
    display: block;
    margin-bottom: 6px;
    color: #334155;
  }
  .export-remote-image-placeholder code {
    display: block;
    max-width: 100%;
    overflow-wrap: anywhere;
    background: transparent;
    color: #64748b;
    font-size: 0.78em;
  }
  @media print {
    article { width: 100%; padding: 0; }
    pre, blockquote, table, img { break-inside: avoid; }
  }
`;

type DocxModule = typeof import('docx');
type DocxBlock = Paragraph | Table;

interface InlineStyle {
  readonly bold?: boolean;
  readonly italics?: boolean;
  readonly strike?: boolean;
  readonly underline?: boolean;
  readonly code?: boolean;
}

interface DocxConversionContext {
  readonly docx: DocxModule;
  readonly warnings: string[];
}

interface ExportHtmlSanitizeOptions {
  readonly allowMermaidStyles?: boolean;
}

interface ExportImagePreparationOptions {
  readonly embedRemoteImages?: boolean;
  readonly resolveImageBlob?: (source: string) => Promise<Blob | undefined>;
}

interface RasterizedImage {
  readonly data: ArrayBuffer;
  readonly height: number;
  readonly width: number;
}

class WebpConversionError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'WebpConversionError';
  }
}

let mermaidPromise: Promise<(typeof import('mermaid'))['default']> | null = null;
let mermaidExportSequence = 0;
let pdfRendererPromise: Promise<{
  html2canvas: (typeof import('html2canvas'))['default'];
  jsPDF: (typeof import('jspdf'))['jsPDF'];
}> | null = null;

function loadPdfRenderer(): Promise<{
  html2canvas: (typeof import('html2canvas'))['default'];
  jsPDF: (typeof import('jspdf'))['jsPDF'];
}> {
  pdfRendererPromise ??= Promise.all([import('html2canvas'), import('jspdf')])
    .then(([html2canvas, jspdf]) => ({
      html2canvas: html2canvas.default,
      jsPDF: jspdf.jsPDF,
    }))
    .catch((error: unknown) => {
      pdfRendererPromise = null;
      throw error;
    });
  return pdfRendererPromise;
}

/** 在浏览器空闲后预加载 PDF 依赖，减少首次点击导出的等待。 */
export function preloadPdfExporter(): void {
  void loadPdfRenderer().catch(() => undefined);
}

function ensureString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new ExportError('INVALID_CONTENT', `${label}无效，导出内容必须是字符串。`);
  }
}

function ensureDomSupport(): void {
  if (typeof document === 'undefined' || typeof DOMParser === 'undefined' || !document.body) {
    throw new ExportError(
      'UNSUPPORTED_BROWSER',
      '当前浏览器缺少导出所需的 DOM 能力，请使用最新版 Chrome、Edge 或 Safari。',
    );
  }
}

function ensureBlobSupport(): void {
  if (typeof Blob === 'undefined') {
    throw new ExportError(
      'UNSUPPORTED_BROWSER',
      '当前浏览器不支持生成本地文件，请升级浏览器后重试。',
    );
  }
}

function truncateByCodePoint(value: string, maxLength: number): string {
  const characters = Array.from(value);
  return characters.length > maxLength ? characters.slice(0, maxLength).join('') : value;
}

function filenameStem(value: string, fallback: string): string {
  const withoutKnownExtension = value.trim().replace(KNOWN_EXPORT_EXTENSION, '');
  let result = withoutKnownExtension
    .normalize('NFC')
    .replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, '')
    .replace(/[<>:"/\\|?*]+/gu, '-')
    .replace(/\s+/gu, ' ')
    .replace(/[-\s]+$/gu, '')
    .replace(/^[.\s-]+|[.\s]+$/gu, '');

  if (!result || result === '.' || result === '..') {
    result = fallback;
  }

  if (RESERVED_WINDOWS_NAME.test(result)) {
    result = `_${result}`;
  }

  return truncateByCodePoint(result, 96);
}

export function sanitizeExportFilename(value: string, extension?: ExportExtension): string {
  const stem = filenameStem(typeof value === 'string' ? value : '', 'markdown-document');
  return extension ? `${stem}.${extension}` : stem;
}

function resolveFilename(options: BaseExportOptions, extension: ExportExtension): string {
  const requestedName = options.filename?.trim() || options.title?.trim() || 'markdown-document';
  return sanitizeExportFilename(requestedName, extension);
}

function isSafeEmbeddedResource(value: string): boolean {
  const normalized = value.trim();
  return SAFE_EMBEDDED_IMAGE.test(normalized) || SAFE_LOCAL_IMAGE.test(normalized);
}

function isSafeExportImageSource(value: string): boolean {
  const normalized = value.trim();
  return (
    isSafeEmbeddedResource(normalized) ||
    SAFE_REMOTE_IMAGE.test(normalized) ||
    SAFE_RELATIVE_IMAGE.test(normalized)
  );
}

function isLocalExportImageSource(value: string): boolean {
  const normalized = value.trim();
  return SAFE_LOCAL_IMAGE.test(normalized) || SAFE_RELATIVE_IMAGE.test(normalized);
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new ExportError('RENDER_FAILED', '本地图片编码失败。'));
      }
    };
    reader.onerror = () => reject(new ExportError('RENDER_FAILED', '本地图片读取失败。'));
    reader.readAsDataURL(blob);
  });
}

function imageMimeType(source: string, blob: Blob): string | undefined {
  const type = blob.type.toLowerCase();
  if (/^image\/(?:png|jpeg|gif|webp)$/u.test(type)) {
    return type;
  }
  if (type === 'image/jpg') {
    return 'image/jpeg';
  }

  const path = source.split(/[?#]/u, 1)[0]?.toLowerCase() ?? '';
  if (path.endsWith('.png')) {
    return 'image/png';
  }
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (path.endsWith('.gif')) {
    return 'image/gif';
  }
  if (path.endsWith('.webp')) {
    return 'image/webp';
  }
  return undefined;
}

async function imageBlobFromSource(
  source: string,
  resolver?: (source: string) => Promise<Blob | undefined>,
): Promise<Blob> {
  const resolved = await resolver?.(source);
  if (resolved) {
    return resolved;
  }

  const response = await fetch(source, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok) {
    throw new ExportError('RENDER_FAILED', '图片读取失败。');
  }
  return await response.blob();
}

async function prepareExportImages(
  root: HTMLElement,
  ownerDocument: Document,
  warnings: string[],
  options: ExportImagePreparationOptions,
): Promise<void> {
  await Promise.all(
    Array.from(root.querySelectorAll('img')).map(async (image) => {
      const source = image.getAttribute('src')?.trim() ?? '';
      const isLocal = isLocalExportImageSource(source);
      const isRemote = SAFE_REMOTE_IMAGE.test(source);
      if (!isLocal && !(isRemote && options.embedRemoteImages)) {
        return;
      }

      try {
        const blob = await imageBlobFromSource(source, options.resolveImageBlob);
        const mimeType = imageMimeType(source, blob);
        if (!mimeType) {
          throw new ExportError('RENDER_FAILED', '图片格式不受支持。');
        }
        const normalizedBlob = blob.type === mimeType ? blob : new Blob([blob], { type: mimeType });
        const dataUrl = await readBlobAsDataUrl(normalizedBlob);
        if (!SAFE_EMBEDDED_IMAGE.test(dataUrl)) {
          throw new ExportError('RENDER_FAILED', '图片格式不受支持。');
        }
        image.setAttribute('src', dataUrl);
      } catch {
        if (isRemote) {
          warnings.push(`PDF 无法加载线上图片（跨域限制），已使用占位：${source}`);
          image.replaceWith(remoteImagePlaceholder(image, ownerDocument, source));
          return;
        }
        warnings.push(`本地图片无法嵌入导出：${image.getAttribute('alt')?.trim() || '未命名图片'}`);
        image.replaceWith(imagePlaceholder(image, ownerDocument));
      }
    }),
  );
}

function isSafeStyleResource(value: string): boolean {
  const normalized = value.trim();
  return isSafeEmbeddedResource(normalized) || SAFE_FRAGMENT_RESOURCE.test(normalized);
}

function sanitizeInlineStyle(style: string): string {
  if (/expression\s*\(|@import|-moz-binding|behavior\s*:/i.test(style)) {
    return '';
  }

  return style.replace(/url\(([^)]+)\)/gi, (match, rawValue: string) => {
    const value = rawValue.trim().replace(/^(['"])(.*)\1$/u, '$2');
    return isSafeStyleResource(value) ? match : 'none';
  });
}

function sanitizeEmbeddedStyleSheet(style: string): string {
  if (/expression\s*\(|-moz-binding|behavior\s*:/i.test(style)) {
    return '';
  }

  return style
    .replace(/@import[\s\S]*?(?:;|$)/giu, '')
    .replace(/url\(([^)]+)\)/gi, (match, rawValue: string) => {
      const value = rawValue.trim().replace(/^(['"])(.*)\1$/u, '$2');
      return isSafeStyleResource(value) ? match : 'none';
    });
}

function imagePlaceholder(image: Element, ownerDocument: Document): HTMLElement {
  const placeholder = ownerDocument.createElement('span');
  placeholder.className = 'export-image-placeholder';
  const alt = image.getAttribute('alt')?.trim();
  placeholder.textContent = alt ? `[图片未导出：${alt}]` : '[图片未导出：资源不可用]';
  return placeholder;
}

function remoteImagePlaceholder(
  image: Element,
  ownerDocument: Document,
  source: string,
): HTMLElement {
  const placeholder = ownerDocument.createElement('figure');
  placeholder.className = 'export-remote-image-placeholder';
  const caption = ownerDocument.createElement('figcaption');
  const title = ownerDocument.createElement('strong');
  const alt = image.getAttribute('alt')?.trim();
  title.textContent = alt ? `线上图片无法嵌入：${alt}` : '线上图片无法嵌入 PDF';
  const url = ownerDocument.createElement('code');
  url.textContent = source;
  caption.append(title, url);
  placeholder.append(caption);
  return placeholder;
}

function sanitizeExportHtml(
  previewHtml: string,
  options: ExportHtmlSanitizeOptions = {},
): PreparedExportHtml {
  ensureString(previewHtml, 'HTML');
  ensureDomSupport();

  const warnings: string[] = [];
  const forbiddenTags = [
    'script',
    'link',
    'meta',
    'base',
    'iframe',
    'frame',
    'frameset',
    'object',
    'embed',
    'form',
    'input',
    'button',
    'textarea',
    'select',
    'option',
    'video',
    'audio',
    'source',
    'track',
  ];
  if (!options.allowMermaidStyles) {
    forbiddenTags.push('style');
  }
  const sanitized = DOMPurify.sanitize(previewHtml, {
    ALLOW_DATA_ATTR: true,
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|tel):|blob:|data:image\/(?:png|jpe?g|gif|webp);base64,|[^:]+$)/i,
    FORBID_ATTR: ['srcdoc'],
    FORBID_TAGS: forbiddenTags,
  });
  const parsed = new DOMParser().parseFromString(
    `<main data-export-root>${sanitized}</main>`,
    'text/html',
  );
  const root = parsed.querySelector<HTMLElement>('[data-export-root]');

  if (!root) {
    throw new ExportError('RENDER_FAILED', '无法准备 HTML 导出内容。');
  }

  for (const style of Array.from(root.querySelectorAll('style'))) {
    const isTrustedMermaidStyle =
      options.allowMermaidStyles &&
      style.hasAttribute('data-mermaid-export-style') &&
      style.closest('svg');
    if (!isTrustedMermaidStyle) {
      style.remove();
      warnings.push('已移除不受信任的内嵌样式。');
      continue;
    }

    const safeStyle = sanitizeEmbeddedStyleSheet(style.textContent ?? '').trim();
    if (safeStyle) {
      style.textContent = safeStyle;
    } else {
      style.remove();
      warnings.push('已移除 Mermaid 图表中的不安全样式。');
    }
  }

  for (const image of Array.from(root.querySelectorAll('img'))) {
    const source = image.getAttribute('src') ?? '';
    if (!isSafeExportImageSource(source)) {
      warnings.push(`已移除不受支持的图片：${source || '空地址'}`);
      image.replaceWith(imagePlaceholder(image, parsed));
      continue;
    }
    image.removeAttribute('srcset');
    image.setAttribute('loading', 'eager');
    image.setAttribute('decoding', 'sync');
  }

  for (const element of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    for (const attribute of RESOURCE_ATTRIBUTES) {
      if (element.tagName === 'IMG' && attribute === 'src') {
        continue;
      }
      if (element.hasAttribute(attribute)) {
        element.removeAttribute(attribute);
        warnings.push(`已移除可能加载外部资源的 ${attribute} 属性。`);
      }
    }

    const style = element.getAttribute('style');
    if (style) {
      const safeStyle = sanitizeInlineStyle(style).trim();
      if (safeStyle) {
        element.setAttribute('style', safeStyle);
      } else {
        element.removeAttribute('style');
      }
    }

    if (element.tagName === 'A') {
      element.setAttribute('rel', 'noreferrer noopener');
    }

    if (element.namespaceURI === 'http://www.w3.org/2000/svg') {
      for (const attribute of ['href', 'xlink:href']) {
        const value = element.getAttribute(attribute);
        if (value && !value.trim().startsWith('#') && !isSafeEmbeddedResource(value)) {
          element.removeAttribute(attribute);
          warnings.push('已移除 SVG 中的外部资源引用。');
        }
      }
    }
  }

  return {
    html: root.innerHTML,
    warnings: [...new Set(warnings)],
  };
}

export function prepareExportHtml(previewHtml: string): PreparedExportHtml {
  return sanitizeExportHtml(previewHtml);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function normalizeLanguage(language?: string): string {
  const normalized = language?.trim();
  return normalized && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(normalized) ? normalized : 'zh-CN';
}

function uniqueWarnings(...warningGroups: readonly (readonly string[])[]): string[] {
  return [...new Set(warningGroups.flat())];
}

function sanitizeMermaidImageSources(source: string, warnings: string[]): string {
  const blockedResources = new Set<string>();
  const safeResource = (resource: string): string => {
    const normalized = resource.trim();
    if (isSafeEmbeddedResource(normalized)) {
      return normalized;
    }
    blockedResources.add(normalized || '空地址');
    return SAFE_MERMAID_IMAGE;
  };

  let sanitized = source.replace(
    MERMAID_IMAGE_ATTRIBUTE,
    (
      _match,
      prefix: string,
      doubleQuoted: string | undefined,
      singleQuoted: string | undefined,
      unquoted: string | undefined,
    ) => {
      const resource = doubleQuoted ?? singleQuoted ?? unquoted ?? '';
      return `${prefix}"${safeResource(resource)}"`;
    },
  );
  sanitized = sanitized.replace(
    MERMAID_HTML_IMAGE,
    (_match, prefix: string, quote: string, resource: string) =>
      `${prefix}${quote}${safeResource(resource)}${quote}`,
  );
  sanitized = sanitized.replace(
    MERMAID_MARKDOWN_IMAGE,
    (_match, prefix: string, resource: string, suffix: string) =>
      `${prefix}${safeResource(resource)}${suffix}`,
  );

  for (const resource of blockedResources) {
    warnings.push(`已阻止 Mermaid 图表中的非本地图片：${resource}`);
  }
  return sanitized;
}

function mermaidErrorPlaceholder(ownerDocument: Document, message: string): HTMLElement {
  const placeholder = ownerDocument.createElement('div');
  placeholder.className = 'mermaid-export-error';
  placeholder.setAttribute('role', 'img');
  placeholder.setAttribute('aria-label', message);
  placeholder.textContent = message;
  return placeholder;
}

function sanitizeRenderedMermaidSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    ALLOW_DATA_ATTR: true,
    ALLOWED_URI_REGEXP: /^(?:#|blob:|data:image\/(?:png|jpe?g|gif|webp);base64,)/i,
    ADD_TAGS: ['style'],
    FORBID_TAGS: ['script', 'foreignObject'],
    USE_PROFILES: { svg: true, svgFilters: true },
  });
}

async function prepareRenderedExportHtml(
  previewHtml: string,
  imageOptions: ExportImagePreparationOptions = {},
): Promise<PreparedExportHtml> {
  const initiallyPrepared = sanitizeExportHtml(previewHtml);
  const parsed = new DOMParser().parseFromString(
    `<main data-mermaid-export-root>${initiallyPrepared.html}</main>`,
    'text/html',
  );
  const root = parsed.querySelector<HTMLElement>('[data-mermaid-export-root]');
  if (!root) {
    throw new ExportError('RENDER_FAILED', '无法准备 Mermaid 导出内容。');
  }

  const warnings = [...initiallyPrepared.warnings];
  await prepareExportImages(root, parsed, warnings, imageOptions);

  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.mermaid'));
  if (!blocks.length) {
    const prepared = sanitizeExportHtml(root.innerHTML);
    return {
      html: prepared.html,
      warnings: uniqueWarnings(warnings, prepared.warnings),
    };
  }

  await enqueueMermaidTask(async () => {
    let mermaid: (typeof import('mermaid'))['default'];
    try {
      mermaidPromise ??= import('mermaid').then((module) => module.default);
      mermaid = await mermaidPromise;
      mermaid.initialize({
        flowchart: { htmlLabels: false },
        securityLevel: 'strict',
        startOnLoad: false,
        suppressErrorRendering: true,
        theme: 'default',
      });
    } catch {
      for (const block of blocks) {
        block.replaceWith(mermaidErrorPlaceholder(parsed, 'Mermaid 图表渲染器不可用。'));
      }
      warnings.push('Mermaid 图表渲染器加载失败，图表未导出。');
      return;
    }

    for (const block of blocks) {
      const encodedSource = block.dataset.mermaidSource;
      if (!encodedSource) {
        block.replaceWith(mermaidErrorPlaceholder(parsed, 'Mermaid 图表缺少源数据。'));
        warnings.push('Mermaid 图表缺少源数据，图表未导出。');
        continue;
      }

      try {
        const source = sanitizeMermaidImageSources(decodeURIComponent(encodedSource), warnings);
        mermaidExportSequence += 1;
        const result = await mermaid.render(
          `markdown-export-mermaid-${mermaidExportSequence}`,
          source,
        );
        const sanitizedSvg = sanitizeRenderedMermaidSvg(result.svg);
        const replacement = parsed.createElement('div');
        replacement.className = 'mermaid-export';
        replacement.setAttribute('role', 'img');
        replacement.setAttribute('aria-label', 'Mermaid 图表');
        replacement.innerHTML = sanitizedSvg;
        for (const style of Array.from(replacement.querySelectorAll('svg style'))) {
          style.setAttribute('data-mermaid-export-style', '');
        }
        if (!replacement.querySelector('svg')) {
          throw new ExportError('RENDER_FAILED', 'Mermaid 未生成有效的 SVG 图表。');
        }
        block.replaceWith(replacement);
      } catch {
        block.replaceWith(mermaidErrorPlaceholder(parsed, 'Mermaid 图表渲染失败。'));
        warnings.push('Mermaid 图表渲染失败，图表未导出。');
      }
    }
  });

  const prepared = sanitizeExportHtml(root.innerHTML, {
    allowMermaidStyles: true,
  });
  return {
    html: prepared.html,
    warnings: uniqueWarnings(warnings, prepared.warnings),
  };
}

function exportArticleMarkup(preparedHtml: string): string {
  const template = document.createElement('template');
  template.innerHTML = preparedHtml.trim();
  const significantNodes = Array.from(template.content.childNodes).filter(
    (node) =>
      node.nodeType === Node.ELEMENT_NODE ||
      (node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim())),
  );
  const onlyNode = significantNodes[0];
  if (
    significantNodes.length === 1 &&
    onlyNode instanceof Element &&
    onlyNode.tagName.toLowerCase() === 'article'
  ) {
    return onlyNode.outerHTML;
  }
  return `<article>${preparedHtml}</article>`;
}

export async function renderHtmlDocument(
  previewHtml: string,
  options: HtmlExportOptions = {},
): Promise<string> {
  const prepared = await prepareRenderedExportHtml(previewHtml, {
    resolveImageBlob: options.resolveImageBlob,
  });
  return buildHtmlDocument(prepared.html, options);
}

function buildHtmlDocument(preparedHtml: string, options: HtmlExportOptions): string {
  const title = options.title?.trim() || 'Markdown 文档';

  return `<!doctype html>
<html lang="${escapeHtml(normalizeLanguage(options.language))}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; font-src data:; media-src 'none'; object-src 'none'; frame-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'">
  <title>${escapeHtml(title)}</title>
  <style>${EXPORT_DOCUMENT_STYLES}</style>
</head>
<body>
  ${exportArticleMarkup(preparedHtml)}
</body>
</html>`;
}

function createArtifact(
  content: BlobPart,
  extension: ExportExtension,
  options: BaseExportOptions,
  warnings: readonly string[] = [],
): ExportArtifact {
  ensureBlobSupport();
  const mimeType = MIME_TYPES[extension];
  return {
    blob:
      content instanceof Blob && content.type === mimeType
        ? content
        : new Blob([content], { type: mimeType }),
    filename: resolveFilename(options, extension),
    mimeType,
    warnings,
  };
}

export function createMarkdownExport(
  markdown: string,
  options: BaseExportOptions = {},
): ExportArtifact {
  ensureString(markdown, 'Markdown');
  return createArtifact(markdown, 'md', options);
}

export async function createHtmlExport(
  previewHtml: string,
  options: HtmlExportOptions = {},
): Promise<ExportArtifact> {
  const prepared = await prepareRenderedExportHtml(previewHtml, {
    resolveImageBlob: options.resolveImageBlob,
  });
  const html = buildHtmlDocument(prepared.html, options);
  return createArtifact(html, 'html', options, prepared.warnings);
}

function createPdfRenderContainer(html: string, backgroundColor: string): HTMLDivElement {
  const container = document.createElement('div');
  container.dataset.exportPdfRoot = '';
  container.setAttribute('aria-hidden', 'true');
  container.innerHTML = exportArticleMarkup(html);
  Object.assign(container.style, {
    position: 'fixed',
    zIndex: '-2147483648',
    top: '0',
    left: '-100000px',
    width: '794px',
    minHeight: '1123px',
    overflow: 'visible',
    pointerEvents: 'none',
    color: '#111827',
    background: backgroundColor,
  });

  const article = container.querySelector<HTMLElement>('article');
  if (article) {
    article.style.cssText =
      'width: 746px; margin: 0; padding: 42px 48px 58px; box-sizing: border-box;' +
      "font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC'," +
      "'Microsoft YaHei', sans-serif; font-size: 16px; line-height: 1.7;" +
      'overflow-wrap: anywhere; background: transparent;';
  }

  const style = document.createElement('style');
  style.textContent = EXPORT_DOCUMENT_STYLES;
  container.prepend(style);
  document.body.append(container);
  return container;
}

interface PdfPageSlice {
  readonly y: number;
  readonly height: number;
}

function createPdfPageSlices(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  article: HTMLElement,
  contentHeight: number,
  contentWidth: number,
): PdfPageSlice[] {
  const containerBounds = container.getBoundingClientRect();
  const articleBounds = article.getBoundingClientRect();
  const cssWidth = containerBounds.width || container.offsetWidth;
  const pixelsPerCssPixel = canvas.width / cssWidth;
  const documentBottom = Math.min(
    canvas.height,
    Math.ceil((articleBounds.bottom - containerBounds.top) * pixelsPerCssPixel),
  );
  const pageHeight = (contentHeight * canvas.width) / contentWidth;
  const blockBreakPoints = new Set<number>();
  const lineBreakPoints = new Set<number>();
  const avoidedBlockBounds: Array<{ top: number; bottom: number }> = [];

  const toCanvasY = (viewportY: number): number =>
    Math.round((viewportY - containerBounds.top) * pixelsPerCssPixel);
  const addBreakPoint = (target: Set<number>, viewportY: number): void => {
    const y = toCanvasY(viewportY);
    if (y > 0 && y < documentBottom) {
      target.add(y);
    }
  };

  for (const element of article.querySelectorAll<HTMLElement>(
    'h1, h2, h3, h4, h5, h6, p, blockquote, pre, table, tr, li, hr, img, .mermaid-export',
  )) {
    const bounds = element.getBoundingClientRect();
    addBreakPoint(blockBreakPoints, bounds.top);
    addBreakPoint(blockBreakPoints, bounds.bottom);

    if (element.matches('blockquote, pre, table, tr, img, .mermaid-export')) {
      avoidedBlockBounds.push({
        top: toCanvasY(bounds.top),
        bottom: toCanvasY(bounds.bottom),
      });
    }
  }

  const textWalker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  let textNode = textWalker.nextNode();
  while (textNode) {
    if (textNode.textContent?.trim()) {
      const range = document.createRange();
      range.selectNodeContents(textNode);
      for (const bounds of range.getClientRects()) {
        addBreakPoint(lineBreakPoints, bounds.top);
        addBreakPoint(lineBreakPoints, bounds.bottom);
      }
      range.detach();
    }
    textNode = textWalker.nextNode();
  }

  const sortedBlockBreakPoints = [...blockBreakPoints].sort((left, right) => left - right);
  const sortedLineBreakPoints = [...lineBreakPoints].sort((left, right) => left - right);
  const slices: PdfPageSlice[] = [];
  let y = 0;

  while (y < documentBottom) {
    const target = Math.min(documentBottom, y + pageHeight);
    let end = target;
    if (target < documentBottom) {
      const earliestBreak = y + pageHeight * 0.75;
      const lastAtOrBefore = (breakPoints: number[]): number | undefined =>
        breakPoints.filter((point) => point >= earliestBreak && point <= target).at(-1);
      const blockBreak = lastAtOrBefore(sortedBlockBreakPoints);
      const lineBreak = lastAtOrBefore(sortedLineBreakPoints);
      end = blockBreak ?? lineBreak ?? target;

      const crossingBlockStart = avoidedBlockBounds
        .filter(
          (bounds) =>
            bounds.top >= y &&
            bounds.top < target &&
            bounds.bottom > target &&
            bounds.bottom - bounds.top <= pageHeight,
        )
        .map((bounds) => bounds.top)
        .sort((left, right) => right - left)[0];
      if (crossingBlockStart !== undefined && crossingBlockStart > y) {
        end = Math.min(end, crossingBlockStart);
      }
    }

    const nextY = Math.max(y + 1, Math.min(end, documentBottom));
    slices.push({ y, height: nextY - y });
    y = nextY;
  }

  return slices;
}

function positiveNumber(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : fallback;
}

async function waitForPdfImages(container: HTMLElement, warnings: string[]): Promise<void> {
  await Promise.all(
    Array.from(container.querySelectorAll<HTMLImageElement>('img')).map(async (image) => {
      if (typeof image.decode !== 'function') {
        return;
      }
      try {
        await Promise.race([
          image.decode(),
          new Promise<never>((_, reject) => {
            globalThis.setTimeout(() => reject(new Error('image decode timeout')), 8000);
          }),
        ]);
      } catch {
        warnings.push(`PDF 图片加载失败：${image.alt.trim() || image.currentSrc || '未命名图片'}`);
      }
    }),
  );
}

export async function createImageExport(
  previewHtml: string,
  options: ImageExportOptions = {},
): Promise<ExportArtifact> {
  ensureString(previewHtml, 'HTML');
  ensureDomSupport();
  ensureBlobSupport();

  const prepared = await prepareRenderedExportHtml(previewHtml, {
    embedRemoteImages: true,
    resolveImageBlob: options.resolveImageBlob,
  });
  const backgroundColor = options.backgroundColor?.trim() || '#ffffff';
  const scale = positiveNumber(
    options.scale,
    Math.min(globalThis.devicePixelRatio || 1.5, 2),
    0.5,
    3,
  );
  const container = createPdfRenderContainer(prepared.html, backgroundColor);
  const warnings = [...prepared.warnings];

  try {
    const { html2canvas } = await loadPdfRenderer();
    await waitForPdfImages(container, warnings);
    await document.fonts?.ready;
    const canvas = await html2canvas(container, {
      allowTaint: false,
      backgroundColor,
      foreignObjectRendering: false,
      logging: false,
      removeContainer: true,
      scale,
      useCORS: true,
    });

    if (!canvas.width || !canvas.height) {
      throw new ExportError('RENDER_FAILED', '图片渲染结果为空，请确认文档内容后重试。');
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
    if (!blob) {
      throw new ExportError('RENDER_FAILED', '图片编码失败，请检查浏览器是否支持 PNG 导出。');
    }

    return createArtifact(blob, 'png', options, warnings);
  } catch (error) {
    if (error instanceof ExportError) {
      throw error;
    }
    throw new ExportError('RENDER_FAILED', '图片导出失败。请减少超大图片或文档长度后重试。', error);
  } finally {
    container.remove();
  }
}

export async function createPdfExport(
  previewHtml: string,
  options: PdfExportOptions = {},
): Promise<ExportArtifact> {
  ensureString(previewHtml, 'HTML');
  ensureDomSupport();
  ensureBlobSupport();

  const prepared = await prepareRenderedExportHtml(previewHtml, {
    embedRemoteImages: true,
    resolveImageBlob: options.resolveImageBlob,
  });
  const backgroundColor = options.backgroundColor?.trim() || '#ffffff';
  const scale = positiveNumber(
    options.scale,
    Math.min(globalThis.devicePixelRatio || 1.5, 2),
    0.5,
    3,
  );
  const margin = positiveNumber(options.margin, 32, 0, 96);
  const container = createPdfRenderContainer(prepared.html, backgroundColor);
  for (const image of container.querySelectorAll<HTMLElement>('article img')) {
    image.style.maxHeight = '900px';
  }
  const warnings = [...prepared.warnings];

  try {
    const { html2canvas, jsPDF } = await loadPdfRenderer();
    await waitForPdfImages(container, warnings);
    await document.fonts?.ready;
    const canvas = await html2canvas(container, {
      allowTaint: false,
      backgroundColor,
      foreignObjectRendering: false,
      logging: false,
      removeContainer: true,
      scale,
      useCORS: true,
    });

    if (!canvas.width || !canvas.height) {
      throw new ExportError('RENDER_FAILED', 'PDF 渲染结果为空，请确认文档内容后重试。');
    }

    const pdf = new jsPDF({
      compress: true,
      format: 'a4',
      orientation: 'portrait',
      unit: 'pt',
    });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const contentWidth = pageWidth - margin * 2;
    const contentHeight = pageHeight - margin * 2;
    const article = container.querySelector<HTMLElement>('article');

    if (contentWidth <= 0 || contentHeight <= 0 || !article) {
      throw new ExportError('INVALID_CONTENT', 'PDF 页边距过大，无法放置文档内容。');
    }

    const pageSlices = createPdfPageSlices(canvas, container, article, contentHeight, contentWidth);

    for (const [page, slice] of pageSlices.entries()) {
      if (page > 0) {
        pdf.addPage();
      }

      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = slice.height;
      const context = pageCanvas.getContext('2d');
      if (!context) {
        throw new ExportError('RENDER_FAILED', '无法创建 PDF 分页画布。');
      }
      context.drawImage(
        canvas,
        0,
        slice.y,
        canvas.width,
        slice.height,
        0,
        0,
        canvas.width,
        slice.height,
      );
      pdf.addImage(
        pageCanvas.toDataURL('image/png', 1),
        'PNG',
        margin,
        margin,
        contentWidth,
        (slice.height * contentWidth) / canvas.width,
        undefined,
        'FAST',
      );
      pageCanvas.width = 0;
      pageCanvas.height = 0;
    }

    const blob = pdf.output('blob');
    return createArtifact(blob, 'pdf', options, warnings);
  } catch (error) {
    if (error instanceof ExportError) {
      throw error;
    }
    throw new ExportError('RENDER_FAILED', 'PDF 导出失败。请减少超大图片或文档长度后重试。', error);
  } finally {
    container.remove();
  }
}

function styleForElement(element: Element, inherited: InlineStyle): InlineStyle {
  const tagName = element.tagName.toLowerCase();
  return {
    bold: inherited.bold || tagName === 'strong' || tagName === 'b' || tagName === 'th',
    italics: inherited.italics || tagName === 'em' || tagName === 'i',
    strike: inherited.strike || tagName === 'del' || tagName === 's',
    underline: inherited.underline || tagName === 'u',
    code: inherited.code || tagName === 'code',
  };
}

function runOptions(text: string, style: InlineStyle) {
  return {
    text,
    bold: style.bold,
    italics: style.italics,
    strike: style.strike,
    underline: style.underline ? { type: 'single' as const } : undefined,
    font: style.code ? 'Consolas' : undefined,
    color: style.code ? '334155' : undefined,
    size: style.code ? 19 : 22,
  };
}

function decodeBase64(value: string): Uint8Array {
  if (typeof atob !== 'function') {
    throw new ExportError('UNSUPPORTED_BROWSER', '当前浏览器无法解码文档中的本地图片。');
  }
  const binary = atob(value.replace(/\s+/gu, ''));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function numericSvgLength(value: string | null): number | undefined {
  if (!value || !/^\d+(?:\.\d+)?(?:px)?$/iu.test(value.trim())) {
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function svgDimensions(svg: SVGElement): { width: number; height: number } {
  const viewBox = (svg.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/u)
    .map(Number);
  const viewBoxWidth =
    viewBox.length === 4 && Number.isFinite(viewBox[2]) && viewBox[2] > 0 ? viewBox[2] : undefined;
  const viewBoxHeight =
    viewBox.length === 4 && Number.isFinite(viewBox[3]) && viewBox[3] > 0 ? viewBox[3] : undefined;
  const width = numericSvgLength(svg.getAttribute('width')) ?? viewBoxWidth ?? 800;
  const height = numericSvgLength(svg.getAttribute('height')) ?? viewBoxHeight ?? 450;
  const scale = Math.min(1, 560 / width, 720 / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function createRasterCanvas(
  width: number,
  height: number,
): {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
} {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new ExportError('UNSUPPORTED_BROWSER', '当前浏览器无法创建图片转换画布。');
  }
  return { canvas, context };
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  if (typeof canvas.toBlob !== 'function') {
    throw new ExportError('UNSUPPORTED_BROWSER', '当前浏览器不支持本地 PNG 转换。');
  }

  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new ExportError('RENDER_FAILED', '本地 PNG 转换未生成有效图片。'));
        }
      }, 'image/png');
    } catch (error) {
      reject(new ExportError('RENDER_FAILED', '本地 PNG 转换失败。', error));
    }
  });
}

function loadLocalImage(source: string): Promise<HTMLImageElement> {
  if (typeof Image === 'undefined') {
    throw new ExportError('UNSUPPORTED_BROWSER', '当前浏览器不支持本地图片解码。');
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new ExportError('RENDER_FAILED', '本地图片解码失败。'));
    image.decoding = 'sync';
    image.src = source;
  });
}

async function rasterizeSvg(svg: SVGElement): Promise<RasterizedImage> {
  if (typeof XMLSerializer === 'undefined') {
    throw new ExportError('UNSUPPORTED_BROWSER', '当前浏览器不支持 Mermaid 图表栅格化。');
  }

  const dimensions = svgDimensions(svg);
  const rasterWidth = Math.min(2048, Math.max(1, dimensions.width * 2));
  const rasterHeight = Math.min(2048, Math.max(1, dimensions.height * 2));
  const clone = svg.cloneNode(true) as SVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(rasterWidth));
  clone.setAttribute('height', String(rasterHeight));
  const serialized = new XMLSerializer().serializeToString(clone);
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
  const image = await loadLocalImage(source);
  const { canvas, context } = createRasterCanvas(rasterWidth, rasterHeight);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, rasterWidth, rasterHeight);
  context.drawImage(image, 0, 0, rasterWidth, rasterHeight);
  const png = await canvasToPng(canvas);
  return {
    data: await png.arrayBuffer(),
    ...dimensions,
  };
}

async function convertWebpToPng(source: string): Promise<ArrayBuffer> {
  try {
    const image = await loadLocalImage(source);
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    if (!naturalWidth || !naturalHeight) {
      throw new ExportError('RENDER_FAILED', 'WebP 图片没有可用的像素尺寸。');
    }
    const scale = Math.min(1, 4096 / naturalWidth, 4096 / naturalHeight);
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));
    const { canvas, context } = createRasterCanvas(width, height);
    context.drawImage(image, 0, 0, width, height);
    return await (await canvasToPng(canvas)).arrayBuffer();
  } catch (error) {
    throw new WebpConversionError('当前浏览器无法在本地将 WebP 转换为 PNG。', error);
  }
}

function imageTypeFromMime(mimeType: string): 'png' | 'jpg' | 'gif' | undefined {
  switch (mimeType.toLowerCase()) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    default:
      return undefined;
  }
}

async function localImageData(source: string): Promise<
  | {
      readonly data: Uint8Array | ArrayBuffer;
      readonly type: 'png' | 'jpg' | 'gif';
    }
  | undefined
> {
  const dataMatch = /^data:(image\/(?:png|jpe?g|gif|webp));base64,([a-z0-9+/=\s]+)$/i.exec(source);
  if (dataMatch) {
    if (dataMatch[1].toLowerCase() === 'image/webp') {
      return {
        data: await convertWebpToPng(source),
        type: 'png',
      };
    }
    const type = imageTypeFromMime(dataMatch[1]);
    return type
      ? {
          data: decodeBase64(dataMatch[2]),
          type,
        }
      : undefined;
  }

  if (!source.startsWith('blob:') || typeof fetch !== 'function') {
    return undefined;
  }

  const response = await fetch(source);
  if (!response.ok) {
    return undefined;
  }
  const blob = await response.blob();
  if (blob.type.toLowerCase() === 'image/webp') {
    return {
      data: await convertWebpToPng(source),
      type: 'png',
    };
  }
  const type = imageTypeFromMime(blob.type);
  return type
    ? {
        data: await blob.arrayBuffer(),
        type,
      }
    : undefined;
}

function imageDimensions(image: Element): { width: number; height: number } {
  const rawWidth = Number.parseInt(image.getAttribute('width') ?? '', 10);
  const rawHeight = Number.parseInt(image.getAttribute('height') ?? '', 10);
  const width = Number.isFinite(rawWidth) ? Math.min(Math.max(rawWidth, 48), 560) : 520;
  const height = Number.isFinite(rawHeight)
    ? Math.min(Math.max(rawHeight, 32), 720)
    : Math.round(width * 0.625);
  return { width, height };
}

async function imageRun(image: Element, context: DocxConversionContext): Promise<ParagraphChild> {
  const source = image.getAttribute('src') ?? '';
  const alt = image.getAttribute('alt')?.trim() || '图片';

  try {
    const imageData = await localImageData(source);
    if (!imageData) {
      context.warnings.push(`Word 导出未嵌入不支持的图片：${alt}`);
      return new context.docx.TextRun({
        text: `[图片未导出：${alt}]`,
        color: '64748B',
        italics: true,
      });
    }
    return new context.docx.ImageRun({
      ...imageData,
      transformation: imageDimensions(image),
      altText: {
        description: alt,
        name: alt,
        title: alt,
      },
    });
  } catch (error) {
    context.warnings.push(
      error instanceof WebpConversionError
        ? `Word 导出无法转换 WebP 图片：${alt}。${error.message}`
        : `Word 导出无法读取本地图片：${alt}`,
    );
    return new context.docx.TextRun({
      text: `[图片未导出：${alt}]`,
      color: '64748B',
      italics: true,
    });
  }
}

async function mermaidDocxBlock(
  element: Element,
  context: DocxConversionContext,
): Promise<Paragraph> {
  const svg = element.querySelector('svg');
  if (!svg || svg.namespaceURI !== 'http://www.w3.org/2000/svg') {
    context.warnings.push('Word 导出未找到可用的 Mermaid SVG 图表。');
    return new context.docx.Paragraph({
      children: [
        new context.docx.TextRun({
          text: '[Mermaid 图表未导出]',
          color: '64748B',
          italics: true,
        }),
      ],
      spacing: { after: 180, before: 120 },
    });
  }

  try {
    const image = await rasterizeSvg(svg as SVGElement);
    return new context.docx.Paragraph({
      alignment: context.docx.AlignmentType.CENTER,
      children: [
        new context.docx.ImageRun({
          data: image.data,
          type: 'png',
          transformation: {
            height: image.height,
            width: image.width,
          },
          altText: {
            description: 'Mermaid 图表',
            name: 'Mermaid 图表',
            title: 'Mermaid 图表',
          },
        }),
      ],
      spacing: { after: 180, before: 120 },
    });
  } catch {
    context.warnings.push('当前浏览器无法在本地栅格化 Mermaid 图表，Word 中已使用占位文本。');
    return new context.docx.Paragraph({
      children: [
        new context.docx.TextRun({
          text: '[Mermaid 图表未导出]',
          color: '64748B',
          italics: true,
        }),
      ],
      spacing: { after: 180, before: 120 },
    });
  }
}

async function inlineChildren(
  node: Node,
  context: DocxConversionContext,
  inheritedStyle: InlineStyle = {},
): Promise<ParagraphChild[]> {
  if (node.nodeType === Node.TEXT_NODE) {
    const value = node.textContent ?? '';
    return value ? [new context.docx.TextRun(runOptions(value, inheritedStyle))] : [];
  }

  if (!(node instanceof Element)) {
    return [];
  }

  const tagName = node.tagName.toLowerCase();
  if (tagName === 'br') {
    return [new context.docx.TextRun({ break: 1 })];
  }
  if (tagName === 'img') {
    return [await imageRun(node, context)];
  }

  const style = styleForElement(node, inheritedStyle);
  const children = (
    await Promise.all(
      Array.from(node.childNodes).map((child) => inlineChildren(child, context, style)),
    )
  ).flat();

  if (tagName === 'a') {
    const link = node.getAttribute('href')?.trim();
    if (
      link &&
      (REMOTE_URL.test(link) ||
        /^(?:mailto|tel):/i.test(link) ||
        !/^[a-z][a-z0-9+.-]*:/i.test(link))
    ) {
      return [
        new context.docx.ExternalHyperlink({
          children,
          link,
        }),
      ];
    }
  }

  return children;
}

function headingLevel(
  tagName: string,
  docx: DocxModule,
): (typeof docx.HeadingLevel)[keyof typeof docx.HeadingLevel] | undefined {
  const levels = [
    docx.HeadingLevel.HEADING_1,
    docx.HeadingLevel.HEADING_2,
    docx.HeadingLevel.HEADING_3,
    docx.HeadingLevel.HEADING_4,
    docx.HeadingLevel.HEADING_5,
    docx.HeadingLevel.HEADING_6,
  ] as const;
  const level = Number.parseInt(tagName.slice(1), 10);
  return level >= 1 && level <= levels.length ? levels[level - 1] : undefined;
}

async function codeParagraph(element: Element, context: DocxConversionContext): Promise<Paragraph> {
  const lines = (element.textContent ?? '').replace(/\r\n?/gu, '\n').split('\n');
  const children: ParagraphChild[] = [];
  lines.forEach((line, index) => {
    children.push(
      new context.docx.TextRun({
        text: line || ' ',
        break: index === 0 ? undefined : 1,
        color: 'E2E8F0',
        font: 'Consolas',
        size: 18,
      }),
    );
  });
  return new context.docx.Paragraph({
    children,
    shading: {
      color: '0F172A',
      fill: '0F172A',
      type: context.docx.ShadingType.CLEAR,
    },
    spacing: { after: 240, before: 120 },
  });
}

async function listBlocks(
  list: Element,
  context: DocxConversionContext,
  level = 0,
): Promise<DocxBlock[]> {
  const blocks: DocxBlock[] = [];
  const ordered = list.tagName.toLowerCase() === 'ol';
  const items = Array.from(list.children).filter((child) => child.tagName.toLowerCase() === 'li');

  for (const [index, item] of items.entries()) {
    const inlineNodes = Array.from(item.childNodes).filter(
      (child) => !(child instanceof Element) || !['ul', 'ol'].includes(child.tagName.toLowerCase()),
    );
    const children = (
      await Promise.all(inlineNodes.map((child) => inlineChildren(child, context)))
    ).flat();
    if (ordered) {
      children.unshift(
        new context.docx.TextRun({
          text: `${index + 1}. `,
          bold: true,
        }),
      );
    }
    blocks.push(
      new context.docx.Paragraph({
        bullet: ordered ? undefined : { level: Math.min(level, 8) },
        children,
        indent: ordered ? { left: 360 * (level + 1) } : undefined,
        spacing: { after: 80 },
      }),
    );

    for (const nested of Array.from(item.children).filter((child) =>
      ['ul', 'ol'].includes(child.tagName.toLowerCase()),
    )) {
      blocks.push(...(await listBlocks(nested, context, level + 1)));
    }
  }

  return blocks;
}

async function tableBlock(
  table: Element,
  context: DocxConversionContext,
): Promise<Table | undefined> {
  const rowElements = Array.from(table.querySelectorAll('tr'));
  if (!rowElements.length) {
    return undefined;
  }

  const rows = await Promise.all(
    rowElements.map(async (rowElement) => {
      const cells = await Promise.all(
        Array.from(rowElement.children)
          .filter((cell) => ['th', 'td'].includes(cell.tagName.toLowerCase()))
          .map(async (cell) => {
            const children = await inlineChildren(cell, context);
            return new context.docx.TableCell({
              children: [
                new context.docx.Paragraph({
                  children,
                  spacing: { after: 40, before: 40 },
                }),
              ],
              shading:
                cell.tagName.toLowerCase() === 'th'
                  ? {
                      color: 'F1F5F9',
                      fill: 'F1F5F9',
                      type: context.docx.ShadingType.CLEAR,
                    }
                  : undefined,
            });
          }),
      );
      return new context.docx.TableRow({ children: cells });
    }),
  );

  return new context.docx.Table({
    rows,
    width: {
      size: 100,
      type: context.docx.WidthType.PERCENTAGE,
    },
  });
}

async function elementBlocks(
  element: Element,
  context: DocxConversionContext,
): Promise<DocxBlock[]> {
  const tagName = element.tagName.toLowerCase();
  const heading = /^h[1-6]$/u.test(tagName) ? headingLevel(tagName, context.docx) : undefined;

  if (heading) {
    return [
      new context.docx.Paragraph({
        children: await inlineChildren(element, context),
        heading,
        spacing: { after: 160, before: 280 },
      }),
    ];
  }

  if (tagName === 'pre') {
    return [await codeParagraph(element, context)];
  }

  if (tagName === 'ul' || tagName === 'ol') {
    return listBlocks(element, context);
  }

  if (tagName === 'table') {
    const table = await tableBlock(element, context);
    return table ? [table] : [];
  }

  if (tagName === 'hr') {
    return [
      new context.docx.Paragraph({
        children: [new context.docx.TextRun({ text: '────────', color: 'CBD5E1' })],
        spacing: { after: 160, before: 160 },
      }),
    ];
  }

  if (tagName === 'img') {
    return [
      new context.docx.Paragraph({
        children: [await imageRun(element, context)],
        spacing: { after: 180, before: 120 },
      }),
    ];
  }

  if (element.classList.contains('mermaid-export')) {
    return [await mermaidDocxBlock(element, context)];
  }

  if (tagName === 'blockquote') {
    return [
      new context.docx.Paragraph({
        children: await inlineChildren(element, context, { italics: true }),
        indent: { left: 360, right: 180 },
        border: {
          left: {
            color: '94A3B8',
            size: 12,
            space: 10,
            style: context.docx.BorderStyle.SINGLE,
          },
        },
        spacing: { after: 160 },
      }),
    ];
  }

  if (
    ['p', 'figcaption', 'dt', 'dd'].includes(tagName) ||
    (tagName === 'div' && !element.children.length)
  ) {
    return [
      new context.docx.Paragraph({
        children: await inlineChildren(element, context),
        spacing: { after: 160 },
      }),
    ];
  }

  const blocks: DocxBlock[] = [];
  let inlineBuffer: Node[] = [];

  const flushInlineBuffer = async () => {
    if (!inlineBuffer.length) {
      return;
    }
    const children = (
      await Promise.all(inlineBuffer.map((child) => inlineChildren(child, context)))
    ).flat();
    if (children.length) {
      blocks.push(
        new context.docx.Paragraph({
          children,
          spacing: { after: 160 },
        }),
      );
    }
    inlineBuffer = [];
  };

  for (const child of Array.from(element.childNodes)) {
    if (
      child instanceof Element &&
      [
        'address',
        'article',
        'aside',
        'blockquote',
        'div',
        'dl',
        'fieldset',
        'figure',
        'footer',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'header',
        'hr',
        'main',
        'nav',
        'ol',
        'p',
        'pre',
        'section',
        'table',
        'ul',
      ].includes(child.tagName.toLowerCase())
    ) {
      await flushInlineBuffer();
      blocks.push(...(await elementBlocks(child, context)));
    } else {
      inlineBuffer.push(child);
    }
  }
  await flushInlineBuffer();
  return blocks;
}

async function htmlToDocxBlocks(
  html: string,
  context: DocxConversionContext,
): Promise<DocxBlock[]> {
  const parsed = new DOMParser().parseFromString(
    `<main data-docx-root>${html}</main>`,
    'text/html',
  );
  const root = parsed.querySelector('[data-docx-root]');
  if (!root) {
    throw new ExportError('RENDER_FAILED', '无法准备 Word 导出内容。');
  }
  const blocks = await elementBlocks(root, context);
  return blocks.length ? blocks : [new context.docx.Paragraph({ text: '' })];
}

export async function createDocxExport(
  previewHtml: string,
  options: DocxExportOptions = {},
): Promise<ExportArtifact> {
  ensureString(previewHtml, 'HTML');
  ensureDomSupport();
  ensureBlobSupport();

  const prepared = await prepareRenderedExportHtml(previewHtml, {
    resolveImageBlob: options.resolveImageBlob,
  });
  const warnings = [...prepared.warnings];

  try {
    const docx = await import('docx');
    const context: DocxConversionContext = { docx, warnings };
    const children = await htmlToDocxBlocks(prepared.html, context);
    const documentTitle = options.title?.trim() || 'Markdown 文档';
    const document = new docx.Document({
      creator: options.creator?.trim() || 'Meowv Studio',
      description: '由 Meowv Studio 在浏览器本地生成',
      sections: [
        {
          children,
          properties: {
            page: {
              margin: {
                bottom: 1080,
                left: 1080,
                right: 1080,
                top: 1080,
              },
            },
          },
        },
      ],
      title: documentTitle,
    });
    const blob = await docx.Packer.toBlob(document);
    return createArtifact(blob, 'docx', options, [...new Set(warnings)]);
  } catch (error) {
    if (error instanceof ExportError) {
      throw error;
    }
    throw new ExportError('RENDER_FAILED', 'Word 导出失败，请检查文档内容后重试。', error);
  }
}

export function downloadExport(artifact: ExportArtifact): void {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function' ||
    typeof URL.revokeObjectURL !== 'function'
  ) {
    throw new ExportError('UNSUPPORTED_BROWSER', '当前浏览器不支持文件下载，请升级浏览器后重试。');
  }

  const objectUrl = URL.createObjectURL(artifact.blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = artifact.filename;
  anchor.hidden = true;

  try {
    document.body.append(anchor);
    anchor.click();
  } catch (error) {
    throw new ExportError('DOWNLOAD_FAILED', '文件下载未能启动，请检查浏览器下载权限。', error);
  } finally {
    anchor.remove();
    globalThis.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}

export function downloadMarkdown(
  markdown: string,
  options: BaseExportOptions = {},
): ExportArtifact {
  const artifact = createMarkdownExport(markdown, options);
  downloadExport(artifact);
  return artifact;
}

export async function downloadHtml(
  previewHtml: string,
  options: HtmlExportOptions = {},
): Promise<ExportArtifact> {
  const artifact = await createHtmlExport(previewHtml, options);
  downloadExport(artifact);
  return artifact;
}

export async function downloadPdf(
  previewHtml: string,
  options: PdfExportOptions = {},
): Promise<ExportArtifact> {
  const artifact = await createPdfExport(previewHtml, options);
  downloadExport(artifact);
  return artifact;
}

export async function downloadImage(
  previewHtml: string,
  options: ImageExportOptions = {},
): Promise<ExportArtifact> {
  const artifact = await createImageExport(previewHtml, options);
  downloadExport(artifact);
  return artifact;
}

export async function downloadDocx(
  previewHtml: string,
  options: DocxExportOptions = {},
): Promise<ExportArtifact> {
  const artifact = await createDocxExport(previewHtml, options);
  downloadExport(artifact);
  return artifact;
}

export const downloadWord = downloadDocx;
