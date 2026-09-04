import { createReadStream, existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import {
  brandedZitieTitle,
  canonicalZitieUrl,
  findZitiePage,
  toZitiePath,
  type ZitiePageDefinition,
  ZITIE_PAGES,
} from '../src/features/zitie/routes.ts';

const studioRoot = fileURLToPath(new URL('..', import.meta.url));
const zitieHtmlTemplate = path.join(studioRoot, 'zitie', 'index.html');
const zitieOutputRoot = path.join(studioRoot, 'dist', 'zitie');
const hanziDataSource = path.join(studioRoot, 'node_modules', 'hanzi-writer-data');
const hanziDataOutput = path.join(zitieOutputRoot, 'hanzi-data');
const hanziDataPrefix = '/zitie/hanzi-data/';
const knownPagePaths = new Set(ZITIE_PAGES.map((page) => toZitiePath(page.path)));
const pageHeadStart = '<!-- zitie-page-head:start -->';
const pageHeadEnd = '<!-- zitie-page-head:end -->';

function htmlContextPath(contextPath: string): string {
  if (contextPath.endsWith('/index.html')) return contextPath.slice(0, -'index.html'.length);
  return contextPath;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function pageHeadHtml(page: ZitiePageDefinition): string {
  const title = brandedZitieTitle(page);
  const canonical = canonicalZitieUrl(page);
  const description = escapeHtml(page.description);
  const escapedTitle = escapeHtml(title);
  const escapedCanonical = escapeHtml(canonical);
  return `${pageHeadStart}
    <title>${escapedTitle}</title>
    <meta name="description" content="${description}">
    <link rel="canonical" href="${escapedCanonical}">
    <link rel="icon" href="/zitie/icon.png">
    <link rel="shortcut icon" href="/zitie/icon.png">
    <link rel="apple-touch-icon" href="/zitie/icon.png">
    <meta property="og:type" content="website">
    <meta property="og:locale" content="zh_CN">
    <meta property="og:site_name" content="字帖生成">
    <meta property="og:url" content="${escapedCanonical}">
    <meta property="og:title" content="${escapedTitle}">
    <meta property="og:description" content="${description}">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${escapedTitle}">
    <meta name="twitter:description" content="${description}">
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-EPJQW4WXS0"></script>
    <script>window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-EPJQW4WXS0');</script>
    ${pageHeadEnd}`;
}

function injectPageHead(html: string, page: ZitiePageDefinition): string {
  const head = pageHeadHtml(page);
  const start = html.indexOf(pageHeadStart);
  const end = html.indexOf(pageHeadEnd);
  if (start >= 0 && end >= start) {
    return `${html.slice(0, start)}${head}${html.slice(end + pageHeadEnd.length)}`;
  }
  return html.replace('</head>', `  ${head}\n  </head>`);
}

function safeHanziFileName(pathname: string): string | null {
  if (!pathname.startsWith(hanziDataPrefix)) return null;
  try {
    const fileName = decodeURIComponent(pathname.slice(hanziDataPrefix.length));
    if (!fileName.endsWith('.json') || fileName !== path.basename(fileName)) return null;
    return fileName;
  } catch {
    return null;
  }
}

async function copyHanziData(): Promise<number> {
  const entries = (await readdir(hanziDataSource, { withFileTypes: true })).filter(
    (entry) => entry.isFile() && entry.name.endsWith('.json'),
  );
  if (entries.length < 9_000) {
    throw new Error(`笔顺数据不完整，仅找到 ${entries.length} 个 JSON 文件。`);
  }
  await mkdir(hanziDataOutput, { recursive: true });
  for (let index = 0; index < entries.length; index += 64) {
    await Promise.all(
      entries
        .slice(index, index + 64)
        .map((entry) =>
          cp(path.join(hanziDataSource, entry.name), path.join(hanziDataOutput, entry.name)),
        ),
    );
  }
  return entries.length;
}

async function generateZitiePages(): Promise<void> {
  const rootHtmlPath = path.join(zitieOutputRoot, 'index.html');
  const rootHtml = await readFile(rootHtmlPath, 'utf8');
  for (const page of ZITIE_PAGES) {
    if (page.path === '/') continue;
    const outputPath =
      page.path === '/404.html'
        ? path.join(zitieOutputRoot, '404.html')
        : path.join(zitieOutputRoot, page.path, 'index.html');
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, injectPageHead(rootHtml, page));
  }
}

async function validateZitieOutput(): Promise<void> {
  const requiredPaths = [
    ...ZITIE_PAGES.map((page) =>
      page.path === '/'
        ? path.join(studioRoot, 'dist', 'zitie', 'index.html')
        : page.path === '/404.html'
          ? path.join(studioRoot, 'dist', 'zitie', '404.html')
          : path.join(studioRoot, 'dist', 'zitie', page.path, 'index.html'),
    ),
    path.join(studioRoot, 'dist', 'zitie', 'fonts', 'practice-pinyin.woff2'),
    path.join(studioRoot, 'dist', 'zitie', 'brand', 'logo-h.png'),
    path.join(studioRoot, 'dist', 'zitie', 'icon.png'),
  ];
  for (const requiredPath of requiredPaths) {
    if (!existsSync(requiredPath) || (await stat(requiredPath)).size === 0) {
      throw new Error(`字帖构建产物缺失：${requiredPath}`);
    }
  }
}

export function zitiePlugin(): Plugin {
  return {
    name: 'meowv-zitie',
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        if (!context.path.startsWith('/zitie')) return html;
        return injectPageHead(html, findZitiePage(htmlContextPath(context.path)));
      },
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url ?? '/', 'http://studio.local');
        const fileName = safeHanziFileName(requestUrl.pathname);
        if (fileName) {
          const filePath = path.join(hanziDataSource, fileName);
          if (!existsSync(filePath)) {
            response.statusCode = 404;
            response.end('Not Found');
            return;
          }
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.setHeader('Cache-Control', 'no-cache');
          createReadStream(filePath).pipe(response);
          return;
        }

        if (requestUrl.pathname === '/zitie') {
          response.statusCode = 308;
          response.setHeader('Location', '/zitie/');
          response.end();
          return;
        }

        if (knownPagePaths.has(`${requestUrl.pathname}/`)) {
          response.statusCode = 308;
          response.setHeader('Location', `${requestUrl.pathname}/${requestUrl.search}`);
          response.end();
          return;
        }

        const isZitieHtmlRequest =
          request.headers.accept?.includes('text/html') &&
          requestUrl.pathname.startsWith('/zitie/') &&
          !requestUrl.pathname.startsWith('/zitie/fonts/') &&
          !requestUrl.pathname.startsWith('/zitie/brand/') &&
          requestUrl.pathname !== '/zitie/icon.png';
        if (isZitieHtmlRequest) {
          try {
            const template = await readFile(zitieHtmlTemplate, 'utf8');
            const contextPath =
              requestUrl.pathname === '/zitie/index.html' ? '/zitie/' : requestUrl.pathname;
            const html = await server.transformIndexHtml(contextPath, template, request.url);
            response.statusCode = knownPagePaths.has(contextPath) ? 200 : 404;
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            if (request.method === 'HEAD') response.end();
            else response.end(html);
          } catch (error) {
            next(error as Error);
          }
          return;
        }
        next();
      });
    },
    async closeBundle() {
      await generateZitiePages();
      const count = await copyHanziData();
      await validateZitieOutput();
      console.log(`[zitie] 已输出 ${count} 个笔顺数据文件。`);
    },
  };
}
