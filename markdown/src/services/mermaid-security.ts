const BLOCKED_ELEMENT_NAMES = new Set([
  "animate",
  "animatemotion",
  "animatetransform",
  "audio",
  "base",
  "button",
  "canvas",
  "discard",
  "embed",
  "form",
  "frame",
  "frameset",
  "iframe",
  "img",
  "input",
  "link",
  "meta",
  "object",
  "portal",
  "script",
  "select",
  "set",
  "source",
  "textarea",
  "track",
  "video",
]);

const DIRECT_RESOURCE_ATTRIBUTE_NAMES = new Set([
  "action",
  "background",
  "data",
  "formaction",
  "href",
  "ping",
  "poster",
  "src",
  "srcdoc",
  "srcset",
]);

const CSS_RESOURCE_ATTRIBUTE_NAMES = new Set([
  "clip-path",
  "cursor",
  "fill",
  "filter",
  "marker",
  "marker-end",
  "marker-mid",
  "marker-start",
  "mask",
  "stroke",
  "style",
]);

const REFERENCE_ELEMENT_NAMES = new Set(["feimage", "image", "use"]);
const CSS_RESOURCE_FUNCTION_PATTERN = /url\s*\(\s*([^)]*?)\s*\)/giu;
const CSS_UNSAFE_CONSTRUCT_PATTERN =
  /@(?:font-face|import)\b|(?:-webkit-)?image-set\s*\(|cross-fade\s*\(/iu;
const CSS_EXTERNAL_SCHEME_PATTERN =
  /(?:data|file|ftp|https?|javascript|blob):|\/\//iu;

function isSafeFragmentReference(value: string): boolean {
  const normalized = value.trim();
  return (
    normalized.length > 1 &&
    normalized.startsWith("#") &&
    !/[\u0000-\u0020"'<>`]/u.test(normalized)
  );
}

function unwrapCssUrl(value: string): string {
  const normalized = value.trim();
  const first = normalized[0];
  const last = normalized.at(-1);
  if (
    normalized.length >= 2 &&
    (first === '"' || first === "'") &&
    last === first
  ) {
    return normalized.slice(1, -1).trim();
  }
  return normalized;
}

function hasUnsafeCssResource(value: string): boolean {
  const normalized = value.replace(/\/\*[\s\S]*?\*\//gu, "");

  // CSS 转义可隐藏 url()、协议或 @import。Mermaid 自身生成的样式不依赖转义。
  if (
    normalized.includes("\\") ||
    CSS_UNSAFE_CONSTRUCT_PATTERN.test(normalized) ||
    CSS_EXTERNAL_SCHEME_PATTERN.test(normalized)
  ) {
    return true;
  }

  CSS_RESOURCE_FUNCTION_PATTERN.lastIndex = 0;
  for (const match of normalized.matchAll(CSS_RESOURCE_FUNCTION_PATTERN)) {
    if (!isSafeFragmentReference(unwrapCssUrl(match[1] ?? ""))) {
      return true;
    }
  }

  return false;
}

function removeAttribute(
  element: Element,
  attribute: Attr,
): void {
  if (attribute.namespaceURI) {
    element.removeAttributeNS(attribute.namespaceURI, attribute.localName);
  } else {
    element.removeAttribute(attribute.name);
  }
}

function sanitizeElementAttributes(element: Element): void {
  for (const attribute of [...element.attributes]) {
    const name = attribute.localName.toLocaleLowerCase();

    if (name.startsWith("on")) {
      removeAttribute(element, attribute);
      continue;
    }

    if (DIRECT_RESOURCE_ATTRIBUTE_NAMES.has(name)) {
      if (
        name !== "srcset" &&
        name !== "srcdoc" &&
        isSafeFragmentReference(attribute.value)
      ) {
        continue;
      }
      removeAttribute(element, attribute);
      continue;
    }

    if (
      CSS_RESOURCE_ATTRIBUTE_NAMES.has(name) &&
      hasUnsafeCssResource(attribute.value)
    ) {
      removeAttribute(element, attribute);
    }
  }
}

function hasInternalHref(element: Element): boolean {
  return [...element.attributes].some(
    (attribute) =>
      attribute.localName.toLocaleLowerCase() === "href" &&
      isSafeFragmentReference(attribute.value),
  );
}

/**
 * Mermaid 的 strict 模式仍允许图表生成带外部资源引用的 SVG。
 * 写入预览 DOM 前仅保留 SVG 内部 fragment 引用，并清除所有网络加载入口。
 */
export function sanitizeMermaidSvg(svg: string): string {
  if (
    typeof DOMParser === "undefined" ||
    typeof XMLSerializer === "undefined"
  ) {
    throw new Error("当前环境无法安全解析 Mermaid SVG。");
  }

  const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (parsed.querySelector("parsererror")) {
    throw new Error("Mermaid 返回了无效 SVG。");
  }

  const root = parsed.documentElement;
  if (root.localName.toLocaleLowerCase() !== "svg") {
    throw new Error("Mermaid 返回内容不是 SVG。");
  }

  for (const element of [root, ...root.querySelectorAll("*")]) {
    const name = element.localName.toLocaleLowerCase();
    if (BLOCKED_ELEMENT_NAMES.has(name)) {
      element.remove();
      continue;
    }

    if (name === "style" && hasUnsafeCssResource(element.textContent ?? "")) {
      element.remove();
      continue;
    }

    sanitizeElementAttributes(element);

    if (REFERENCE_ELEMENT_NAMES.has(name) && !hasInternalHref(element)) {
      element.remove();
    }
  }

  return new XMLSerializer().serializeToString(root);
}
