import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import { load as loadYaml } from "js-yaml";
import MarkdownIt, { type Options as MarkdownItOptions } from "markdown-it";
import type Renderer from "markdown-it/lib/renderer.mjs";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
import type Token from "markdown-it/lib/token.mjs";

export interface MarkdownMetadata {
  title: string;
  tags: string[];
  category?: string;
  date?: string;
}

export interface OutlineItem {
  id: string;
  text: string;
  level: number;
  lineNumber: number;
}

export interface WikiLink {
  target: string;
  label: string;
  anchor?: string;
  raw: string;
  lineNumber: number;
  embedded: boolean;
}

export interface FrontMatterResult {
  attributes: Record<string, unknown>;
  body: string;
  bodyStartLine: number;
  error?: string;
}

export interface MarkdownImageContext {
  source: string;
  resolvedPath: string | null;
  documentPath?: string;
}

export interface MarkdownRenderOptions {
  path?: string;
  imageResolver?: (context: MarkdownImageContext) => string | undefined;
}

export interface ParsedMarkdownDocument {
  source: string;
  body: string;
  frontMatter: Record<string, unknown>;
  metadata: MarkdownMetadata;
  outline: OutlineItem[];
  relativeImagePaths: string[];
  wikiLinks: WikiLink[];
  html: string;
  warnings: string[];
}

interface WikiLinkTokenMeta {
  target: string;
  label: string;
  anchor?: string;
  raw: string;
}

interface RenderResult {
  html: string;
  outline: OutlineItem[];
  relativeImagePaths: string[];
  warnings: string[];
}

const FRONT_MATTER_PATTERN =
  /^(?:\uFEFF)?---[^\S\r\n]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[^\S\r\n]*(?:\r?\n|$)/;
const REMOTE_OR_ABSOLUTE_URL_PATTERN =
  /^(?:[a-z][a-z\d+.-]*:|\/\/|\/|#)/i;
const MARKDOWN_EXTENSION_PATTERN = /\.(?:md|markdown)$/i;
const SAFE_URI_PATTERN =
  /^(?:(?:(?:f|ht)tps?|mailto|tel):|blob:|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

const markdown = createMarkdownRenderer();

function createMarkdownRenderer(): MarkdownIt {
  const renderer = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
    highlight(code, language) {
      const normalizedLanguage = language.trim().split(/\s+/u)[0]?.toLowerCase();

      if (normalizedLanguage && hljs.getLanguage(normalizedLanguage)) {
        return hljs.highlight(code, {
          language: normalizedLanguage,
          ignoreIllegals: true,
        }).value;
      }

      return "";
    },
  });

  renderer.inline.ruler.before(
    "emphasis",
    "wiki_link",
    (state: StateInline, silent: boolean): boolean => {
      if (!state.src.startsWith("[[", state.pos)) {
        return false;
      }

      const end = state.src.indexOf("]]", state.pos + 2);
      if (end < 0) {
        return false;
      }

      const raw = state.src.slice(state.pos + 2, end);
      if (raw.includes("\n")) {
        return false;
      }

      const parsed = parseWikiLinkValue(raw);
      if (!parsed) {
        return false;
      }

      if (!silent) {
        const token = state.push("wiki_link", "a", 0);
        token.content = parsed.label;
        token.meta = parsed;
      }

      state.pos = end + 2;
      return true;
    },
  );

  renderer.renderer.rules.wiki_link = (
    tokens: Token[],
    index: number,
  ): string => {
    const meta = tokens[index]?.meta as WikiLinkTokenMeta | undefined;
    if (!meta) {
      return "";
    }

    const anchorAttribute = meta.anchor
      ? ` data-wiki-anchor="${renderer.utils.escapeHtml(meta.anchor)}"`
      : "";
    const href = `#wiki=${encodeURIComponent(meta.target)}${
      meta.anchor ? `&anchor=${encodeURIComponent(meta.anchor)}` : ""
    }`;

    return `<a class="wiki-link" href="${href}" data-wiki-link="${renderer.utils.escapeHtml(
      meta.target,
    )}"${anchorAttribute}>${renderer.utils.escapeHtml(meta.label)}</a>`;
  };

  const defaultFenceRenderer = renderer.renderer.rules.fence;
  renderer.renderer.rules.fence = (
    tokens: Token[],
    index: number,
    options: MarkdownItOptions,
    env: unknown,
    self: Renderer,
  ): string => {
    const token = tokens[index];
    if (!token) {
      return "";
    }

    const language = token.info.trim().split(/\s+/u)[0]?.toLowerCase();
    if (language !== "mermaid") {
      return defaultFenceRenderer
        ? defaultFenceRenderer(tokens, index, options, env, self)
        : "";
    }

    const escapedSource = renderer.utils.escapeHtml(token.content);
    const encodedSource = encodeURIComponent(token.content);

    return `<div class="mermaid mermaid-placeholder" data-mermaid-source="${encodedSource}"><pre><code class="language-mermaid">${escapedSource}</code></pre></div>\n`;
  };

  return renderer;
}

export function parseFrontMatter(source: string): FrontMatterResult {
  const match = FRONT_MATTER_PATTERN.exec(source);
  if (!match) {
    return {
      attributes: {},
      body: source.replace(/^\uFEFF/u, ""),
      bodyStartLine: 1,
    };
  }

  const body = source.slice(match[0].length);
  const bodyStartLine = (match[0].match(/\n/gu)?.length ?? 0) + 1;

  try {
    const loaded = loadYaml(match[1] ?? "");
    const attributes = isPlainRecord(loaded) ? loaded : {};

    return {
      attributes,
      body,
      bodyStartLine,
      ...(isPlainRecord(loaded) || loaded == null
        ? {}
        : { error: "Front Matter 必须是 YAML 对象。" }),
    };
  } catch (error) {
    return {
      attributes: {},
      body,
      bodyStartLine,
      error: `Front Matter 解析失败：${toErrorMessage(error)}`,
    };
  }
}

export function parseMarkdownDocument(
  source: string,
  options: MarkdownRenderOptions = {},
): ParsedMarkdownDocument {
  const frontMatter = parseFrontMatter(source);
  const rendered = renderMarkdownBody(
    frontMatter.body,
    frontMatter.bodyStartLine,
    options,
  );
  const metadata = extractMetadata(
    frontMatter.attributes,
    rendered.outline,
    options.path,
  );
  const wikiLinks = extractWikiLinks(source);
  const warnings = [...rendered.warnings];

  if (frontMatter.error) {
    warnings.unshift(frontMatter.error);
  }

  return {
    source,
    body: frontMatter.body,
    frontMatter: frontMatter.attributes,
    metadata,
    outline: rendered.outline,
    relativeImagePaths: rendered.relativeImagePaths,
    wikiLinks,
    html: rendered.html,
    warnings,
  };
}

export function renderMarkdown(
  source: string,
  options: MarkdownRenderOptions = {},
): string {
  return parseMarkdownDocument(source, options).html;
}

export function sanitizeMarkdownHtml(html: string): string {
  if (!DOMPurify.isSupported || typeof DOMPurify.sanitize !== "function") {
    return "";
  }

  return DOMPurify.sanitize(html, {
    ADD_ATTR: ["target"],
    ALLOW_DATA_ATTR: true,
    ALLOWED_URI_REGEXP: SAFE_URI_PATTERN,
    FORBID_ATTR: ["style", "srcdoc"],
    FORBID_TAGS: [
      "base",
      "embed",
      "form",
      "frame",
      "frameset",
      "iframe",
      "input",
      "link",
      "meta",
      "object",
      "script",
      "source",
      "style",
      "svg",
      "textarea",
      "video",
      "audio",
      "math",
      "use",
      "image",
      "foreignobject",
    ],
  }) as string;
}

export function extractRelativeImagePaths(markdownSource: string): string[] {
  const frontMatter = parseFrontMatter(markdownSource);
  const tokens = markdown.parse(frontMatter.body, {});
  const paths = new Set<string>();

  walkTokens(tokens, (token) => {
    if (token.type !== "image") {
      return;
    }

    const source = token.attrGet("src")?.trim();
    if (source && isRelativeAssetPath(source)) {
      paths.add(source);
    }
  });

  return [...paths];
}

export function resolveRelativeAssetPath(
  documentPath: string,
  assetPath: string,
): string | null {
  if (!isRelativeAssetPath(assetPath)) {
    return null;
  }

  const cleanAssetPath = safeDecodeUriComponent(
    assetPath.split(/[?#]/u, 1)[0] ?? "",
  ).replace(/\\/gu, "/");
  const normalizedDocumentPath = documentPath.replace(/\\/gu, "/");
  const documentDirectory = normalizedDocumentPath.includes("/")
    ? normalizedDocumentPath.slice(0, normalizedDocumentPath.lastIndexOf("/"))
    : "";
  const segments = `${documentDirectory}/${cleanAssetPath}`.split("/");
  const resolved: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === ".") {
      continue;
    }

    if (segment === "..") {
      if (resolved.length === 0) {
        return null;
      }
      resolved.pop();
      continue;
    }

    resolved.push(segment);
  }

  return resolved.join("/");
}

export function extractWikiLinks(source: string): WikiLink[] {
  const frontMatter = parseFrontMatter(source);
  const lines = frontMatter.body.split(/\r?\n/u);
  const links: WikiLink[] = [];
  let activeFence: { character: "`" | "~"; length: number } | null = null;

  lines.forEach((line, bodyLineIndex) => {
    const fenceMatch = /^\s*(`{3,}|~{3,})/u.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!marker) {
        return;
      }

      const character = marker[0] as "`" | "~";
      if (!activeFence) {
        activeFence = { character, length: marker.length };
      } else if (
        activeFence.character === character &&
        marker.length >= activeFence.length
      ) {
        activeFence = null;
      }
      return;
    }

    if (activeFence) {
      return;
    }

    const visibleLine = stripInlineCode(line);
    const pattern = /(!)?\[\[([^\]\r\n]+)\]\]/gu;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(visibleLine)) !== null) {
      const parsed = parseWikiLinkValue(match[2] ?? "");
      if (!parsed) {
        continue;
      }

      links.push({
        ...parsed,
        lineNumber: frontMatter.bodyStartLine + bodyLineIndex,
        embedded: Boolean(match[1]),
      });
    }
  });

  return links;
}

export function markdownToPlainText(source: string): string {
  const frontMatter = parseFrontMatter(source);
  const tokens = markdown.parse(frontMatter.body, {});
  const parts: string[] = [];

  walkTokens(tokens, (token) => {
    if (
      token.type === "text" ||
      token.type === "code_inline" ||
      token.type === "code_block" ||
      token.type === "fence"
    ) {
      parts.push(token.content);
    } else if (token.type === "softbreak" || token.type === "hardbreak") {
      parts.push("\n");
    } else if (token.type === "wiki_link") {
      const meta = token.meta as WikiLinkTokenMeta | undefined;
      if (meta) {
        parts.push(meta.label);
      }
    }
  });

  return parts
    .join(" ")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n[ \t]+/gu, "\n")
    .replace(/[ \t]{2,}/gu, " ")
    .trim();
}

function renderMarkdownBody(
  body: string,
  bodyStartLine: number,
  options: MarkdownRenderOptions,
): RenderResult {
  const tokens = markdown.parse(body, {});
  const outline = applyHeadingIds(tokens, bodyStartLine);
  const relativeImagePaths = new Set<string>();
  const warnings: string[] = [];

  walkTokens(tokens, (token) => {
    if (token.type === "link_open") {
      token.attrSet("target", "_blank");
      token.attrSet("rel", "noopener noreferrer");
      return;
    }

    if (token.type !== "image") {
      return;
    }

    const source = token.attrGet("src")?.trim();
    if (!source || !isRelativeAssetPath(source)) {
      return;
    }

    relativeImagePaths.add(source);
    if (!options.imageResolver) {
      return;
    }

    const resolvedPath = options.path
      ? resolveRelativeAssetPath(options.path, source)
      : source;

    try {
      const replacement = options.imageResolver({
        source,
        resolvedPath,
        documentPath: options.path,
      });
      if (replacement) {
        token.attrSet("src", replacement);
      }
    } catch (error) {
      warnings.push(
        `图片路径解析失败（${source}）：${toErrorMessage(error)}`,
      );
    }
  });

  const unsafeHtml = markdown.renderer.render(tokens, markdown.options, {});

  return {
    html: sanitizeMarkdownHtml(unsafeHtml),
    outline,
    relativeImagePaths: [...relativeImagePaths],
    warnings,
  };
}

function applyHeadingIds(
  tokens: Token[],
  bodyStartLine: number,
): OutlineItem[] {
  const outline: OutlineItem[] = [];
  const slugCounts = new Map<string, number>();

  for (let index = 0; index < tokens.length; index += 1) {
    const opening = tokens[index];
    const inline = tokens[index + 1];
    if (
      !opening ||
      opening.type !== "heading_open" ||
      !inline ||
      inline.type !== "inline"
    ) {
      continue;
    }

    const text = inlineTokenText(inline).trim();
    const baseSlug = slugifyHeading(text) || "section";
    const occurrence = (slugCounts.get(baseSlug) ?? 0) + 1;
    slugCounts.set(baseSlug, occurrence);
    const id = occurrence === 1 ? baseSlug : `${baseSlug}-${occurrence}`;
    const level = Number.parseInt(opening.tag.slice(1), 10);
    const lineNumber = (opening.map?.[0] ?? 0) + bodyStartLine;

    opening.attrSet("id", id);
    outline.push({
      id,
      text,
      level: Number.isFinite(level) ? level : 1,
      lineNumber,
    });
  }

  return outline;
}

function extractMetadata(
  attributes: Record<string, unknown>,
  outline: OutlineItem[],
  path?: string,
): MarkdownMetadata {
  const frontMatterTitle = toOptionalString(attributes.title);
  const fallbackTitle =
    outline[0]?.text ||
    (path ? fileStem(path) : undefined) ||
    "未命名文档";
  const category =
    toOptionalString(attributes.category) ??
    firstStringValue(attributes.categories);
  const date = toDateString(attributes.date);

  return {
    title: frontMatterTitle ?? fallbackTitle,
    tags: normalizeTags(attributes.tags),
    ...(category ? { category } : {}),
    ...(date ? { date } : {}),
  };
}

function parseWikiLinkValue(rawValue: string): WikiLinkTokenMeta | null {
  const [targetWithAnchor = "", ...labelParts] = rawValue.split("|");
  const [targetPart = "", ...anchorParts] = targetWithAnchor.split("#");
  const target = targetPart.trim();

  if (!target) {
    return null;
  }

  const anchor = anchorParts.join("#").trim() || undefined;
  const explicitLabel = labelParts.join("|").trim();

  return {
    target,
    label: explicitLabel || target,
    ...(anchor ? { anchor } : {}),
    raw: `[[${rawValue}]]`,
  };
}

function normalizeTags(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const tags = values
    .map((tag) => toOptionalString(tag))
    .filter((tag): tag is string => Boolean(tag));

  return [...new Set(tags)];
}

function firstStringValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value
      .map((item) => toOptionalString(item))
      .find((item): item is string => Boolean(item));
  }

  return toOptionalString(value);
}

function toDateString(value: unknown): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return toOptionalString(value);
}

function toOptionalString(value: unknown): string | undefined {
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized || undefined;
}

function inlineTokenText(token: Token): string {
  if (!token.children) {
    return token.content;
  }

  return token.children
    .map((child) => {
      if (child.type === "wiki_link") {
        const meta = child.meta as WikiLinkTokenMeta | undefined;
        return meta?.label ?? "";
      }

      if (
        child.type === "text" ||
        child.type === "code_inline" ||
        child.type === "image"
      ) {
        return child.content;
      }

      return "";
    })
    .join("");
}

function slugifyHeading(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .trim()
    .replace(/\s+/gu, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .replace(/-{2,}/gu, "-")
    .replace(/^-|-$/gu, "");
}

function walkTokens(
  tokens: Token[],
  visitor: (token: Token) => void,
): void {
  for (const token of tokens) {
    visitor(token);
    if (token.children) {
      walkTokens(token.children, visitor);
    }
  }
}

function stripInlineCode(line: string): string {
  return line.replace(/(`+)([\s\S]*?)\1/gu, (match) => " ".repeat(match.length));
}

function isRelativeAssetPath(path: string): boolean {
  return Boolean(path) && !REMOTE_OR_ABSOLUTE_URL_PATTERN.test(path.trim());
}

function fileStem(path: string): string {
  const fileName = path.replace(/\\/gu, "/").split("/").pop() ?? path;
  return fileName.replace(MARKDOWN_EXTENSION_PATTERN, "");
}

function safeDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
