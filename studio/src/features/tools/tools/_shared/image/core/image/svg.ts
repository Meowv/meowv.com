const sanitizedSvgSources = new WeakSet<Blob>();

export async function sanitizeSvgSource(blob: Blob): Promise<Blob> {
  if (sanitizedSvgSources.has(blob)) {
    return blob;
  }
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    throw new Error('当前浏览器无法安全解析 SVG');
  }

  const documentNode = new DOMParser().parseFromString(await blob.text(), 'image/svg+xml');
  if (
    documentNode.querySelector('parsererror') ||
    documentNode.documentElement.localName.toLowerCase() !== 'svg'
  ) {
    throw new TypeError('SVG 内容无效');
  }

  const blockedElements = new Set([
    'script',
    'style',
    'foreignobject',
    'iframe',
    'object',
    'embed',
    'link',
    'audio',
    'video',
  ]);

  for (const element of Array.from(documentNode.querySelectorAll('*'))) {
    if (blockedElements.has(element.localName.toLowerCase())) {
      element.remove();
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      const isRemoteReference =
        (name === 'href' || name === 'xlink:href' || name === 'src') &&
        value !== '' &&
        !value.startsWith('#') &&
        !value.startsWith('data:image/');
      const hasExternalCssUrl =
        /url\s*\(/i.test(value) &&
        !/url\s*\(\s*['"]?#/i.test(value) &&
        !/url\s*\(\s*['"]?data:image\//i.test(value);

      if (
        name.startsWith('on') ||
        name === 'xml:base' ||
        isRemoteReference ||
        hasExternalCssUrl ||
        (name === 'style' && /@import/i.test(value))
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  const sanitized = new Blob(
    [new XMLSerializer().serializeToString(documentNode.documentElement)],
    { type: 'image/svg+xml' },
  );
  sanitizedSvgSources.add(sanitized);
  return sanitized;
}

export async function sanitizeSvgFile(file: File): Promise<File> {
  const sanitizedBlob = await sanitizeSvgSource(file);
  const sanitizedFile = new File([sanitizedBlob], file.name, {
    type: 'image/svg+xml',
    lastModified: file.lastModified,
  });
  sanitizedSvgSources.add(sanitizedFile);
  return sanitizedFile;
}
