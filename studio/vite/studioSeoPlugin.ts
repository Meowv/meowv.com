import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { STUDIO_ROUTE_SEO, studioCanonicalUrl, type StudioSeoMeta } from '../src/router/seo.ts';

const studioRoot = fileURLToPath(new URL('..', import.meta.url));
const outputRoot = path.join(studioRoot, 'dist');

const staticPages = [
  ['/', STUDIO_ROUTE_SEO.home],
  ['/markdown', STUDIO_ROUTE_SEO.markdown],
  ['/mermaid', STUDIO_ROUTE_SEO.mermaid],
  ['/office', STUDIO_ROUTE_SEO.office],
  ['/books', STUDIO_ROUTE_SEO.books],
  ['/draw', STUDIO_ROUTE_SEO.draw],
  ['/floorplan', STUDIO_ROUTE_SEO.floorplan],
  ['/mind', STUDIO_ROUTE_SEO.mind],
  ['/notes', STUDIO_ROUTE_SEO.notes],
  ['/wallpapers', STUDIO_ROUTE_SEO.wallpapers],
  ['/tools', STUDIO_ROUTE_SEO.tools],
  ['/chat', STUDIO_ROUTE_SEO.chat],
] as const satisfies readonly (readonly [string, StudioSeoMeta])[];

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function upsertHeadTag(html: string, pattern: RegExp, tag: string): string {
  if (pattern.test(html)) return html.replace(pattern, tag);
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

function injectSeo(html: string, pathname: string, seo: StudioSeoMeta): string {
  const title = escapeHtml(seo.title);
  const description = escapeHtml(seo.description);
  const canonical = escapeHtml(studioCanonicalUrl(pathname));
  let output = html.replace(/<title>.*?<\/title>/s, `<title>${title}</title>`);
  output = upsertHeadTag(
    output,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
    `<meta name="description" content="${description}" />`,
  );
  output = upsertHeadTag(
    output,
    /<meta\s+name="robots"\s+content="[^"]*"\s*\/>/,
    `<meta name="robots" content="${seo.noindex ? 'noindex, follow' : 'index, follow'}" />`,
  );
  output = upsertHeadTag(
    output,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?\s*>/,
    `<link rel="canonical" href="${canonical}" />`,
  );

  const tags = [
    ['property="og:type"', 'website'],
    ['property="og:locale"', 'zh_CN'],
    ['property="og:site_name"', 'Meowv Studio'],
    ['property="og:url"', canonical],
    ['property="og:title"', title],
    ['property="og:description"', description],
    ['name="twitter:card"', 'summary'],
    ['name="twitter:title"', title],
    ['name="twitter:description"', description],
  ] as const;
  for (const [attribute, content] of tags) {
    const escapedAttribute = attribute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const attributePattern = new RegExp(
      `<meta\\s+${escapedAttribute}\\s+content="[^"]*"\\s*/>` +
        `|<meta\\s+content="[^"]*"\\s+${escapedAttribute}\\s*/>`,
    );
    output = upsertHeadTag(output, attributePattern, `<meta ${attribute} content="${content}" />`);
  }

  const structuredData = escapeJson({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Meowv Studio',
    url: studioCanonicalUrl(pathname),
    description: seo.description,
    applicationCategory: 'ProductivityApplication',
    operatingSystem: 'Any',
    browserRequirements: 'Requires JavaScript and a modern browser',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'CNY' },
    featureList: ['Markdown 编辑器', 'Office 文档编辑', 'PDF 阅读', '在线白板', '思维导图'],
  });
  output = output.replace(
    /<script type="application\/ld\+json">.*?<\/script>/s,
    `<script type="application/ld+json">${structuredData}</script>`,
  );
  return output;
}

export function studioSeoPlugin(): Plugin {
  return {
    name: 'studio-seo',
    apply: 'build',
    async closeBundle() {
      const template = await readFile(path.join(outputRoot, 'index.html'), 'utf8');
      for (const [pathname, seo] of staticPages) {
        const html = injectSeo(template, pathname, seo);
        const outputPath =
          pathname === '/'
            ? path.join(outputRoot, 'index.html')
            : path.join(outputRoot, pathname.slice(1), 'index.html');
        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, html);
      }
    },
  };
}
