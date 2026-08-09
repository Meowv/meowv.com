import { sanitizeSvgFile } from '@/features/image/core/image';

function assertSvgDocument(source: string): XMLDocument {
  const documentNode = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (
    documentNode.querySelector('parsererror') ||
    documentNode.documentElement.localName.toLowerCase() !== 'svg'
  ) {
    throw new Error('SVG 内容无效，请检查 XML 结构。');
  }
  return documentNode;
}

export async function sanitizeSvg(source: string): Promise<string> {
  assertSvgDocument(source);
  const file = new File([source], 'input.svg', { type: 'image/svg+xml' });
  return (await sanitizeSvgFile(file)).text();
}

export async function formatSvg(source: string): Promise<string> {
  const safe = await sanitizeSvg(source);
  const serialized = new XMLSerializer().serializeToString(assertSvgDocument(safe).documentElement);
  const tokens = serialized.replace(/>\s*</g, '><').replace(/</g, '\n<').trim().split('\n');
  let depth = 0;
  return tokens
    .map((token) => {
      if (/^<\//.test(token)) depth = Math.max(0, depth - 1);
      const line = `${'  '.repeat(depth)}${token}`;
      if (/^<[^!?/][^>]*[^/]?>$/.test(token) && !/<\/[^>]+>$/.test(token)) depth += 1;
      return line;
    })
    .join('\n');
}

export async function minifySvg(source: string): Promise<string> {
  const safe = await sanitizeSvg(source);
  const documentNode = assertSvgDocument(safe);
  for (const node of Array.from(documentNode.documentElement.childNodes)) {
    if (node.nodeType === Node.COMMENT_NODE) node.remove();
  }
  return new XMLSerializer()
    .serializeToString(documentNode.documentElement)
    .replace(/>\s+</g, '><')
    .trim();
}
