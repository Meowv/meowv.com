import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Connect, Plugin } from 'vite';

const BOOKS_DIR = path.resolve(process.cwd(), 'public/data/books');
const BOOKS_PATH = '/data/books/';

const BOOKS_CONTENT_TYPES: Record<string, string> = {
  '.epub': 'application/epub+zip',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.mobi': 'application/octet-stream',
  '.azw3': 'application/octet-stream',
  '.fb2': 'application/octet-stream',
  '.cbz': 'application/octet-stream',
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function autoindexHtml(files: string[]): string {
  const rows = files
    .map((name) => `<a href="${escapeHtml(name)}">${escapeHtml(name)}</a>\n`)
    .join('');
  return [
    '<html>',
    '<head><title>Index of /data/books/</title></head>',
    '<body>',
    '<h1>Index of /data/books/</h1>',
    '<hr>',
    '<pre>',
    rows,
    '</pre>',
    '<hr>',
    '</body>',
    '</html>',
  ].join('');
}

interface ByteRange {
  start: number;
  end: number;
}

function parseByteRange(header: string, size: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isInteger(suffix) || suffix <= 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  if (!Number.isInteger(start) || start < 0 || start >= size) return null;
  const end = match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (end < start) return null;
  return { start, end };
}

async function listBooksDirectory(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.statusCode = 405;
    response.end();
    return;
  }
  let files: string[];
  try {
    files = (await fs.readdir(BOOKS_DIR)).filter((name) => !name.startsWith('.'));
  } catch {
    response.statusCode = 404;
    response.end();
    return;
  }
  files.sort((left, right) => left.localeCompare(right, 'zh-CN'));
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.statusCode = 200;
  response.end(autoindexHtml(files));
}

async function serveBookFile(
  request: IncomingMessage,
  response: ServerResponse,
  fileName: string,
): Promise<void> {
  let filePath: string;
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    const booksRoot = await fs.realpath(BOOKS_DIR);
    const candidatePath = path.resolve(booksRoot, fileName);
    const candidateRelative = path.relative(booksRoot, candidatePath);
    if (
      !candidateRelative ||
      candidateRelative === '..' ||
      candidateRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(candidateRelative)
    ) {
      response.statusCode = 404;
      response.end();
      return;
    }
    // realpath 也检查符号链接，避免书库内的链接指向目录外文件。
    filePath = await fs.realpath(candidatePath);
    const resolvedRelative = path.relative(booksRoot, filePath);
    if (
      !resolvedRelative ||
      resolvedRelative === '..' ||
      resolvedRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(resolvedRelative)
    ) {
      response.statusCode = 404;
      response.end();
      return;
    }
    stat = await fs.stat(filePath);
  } catch {
    response.statusCode = 404;
    response.end();
    return;
  }
  if (!stat.isFile()) {
    response.statusCode = 404;
    response.end();
    return;
  }
  const extension = path.extname(fileName).toLowerCase();
  response.setHeader('Content-Type', BOOKS_CONTENT_TYPES[extension] ?? 'application/octet-stream');
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Content-Length', stat.size);
  if (request.method === 'HEAD') {
    response.statusCode = 200;
    response.end();
    return;
  }
  if (request.method !== 'GET') {
    response.statusCode = 405;
    response.end();
    return;
  }
  const rangeHeader = request.headers.range;
  if (rangeHeader) {
    const range = parseByteRange(rangeHeader, stat.size);
    if (range) {
      response.statusCode = 206;
      response.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${stat.size}`);
      response.setHeader('Content-Length', range.end - range.start + 1);
      createReadStream(filePath, { start: range.start, end: range.end }).pipe(response);
      return;
    }
    response.statusCode = 416;
    response.setHeader('Content-Range', `bytes */${stat.size}`);
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}

function booksMiddleware(
  request: IncomingMessage,
  response: ServerResponse,
  next: Connect.NextFunction,
): void {
  const rawUrl = request.url ?? '';
  if (!rawUrl.startsWith(BOOKS_PATH)) {
    next();
    return;
  }
  const pathname = rawUrl.split('?')[0];
  let relative: string;
  try {
    relative = decodeURIComponent(pathname.slice(BOOKS_PATH.length));
  } catch {
    response.statusCode = 400;
    response.end();
    return;
  }
  if (relative === '') {
    void listBooksDirectory(request, response);
    return;
  }
  // 书库只暴露直接子文件。显式拒绝两种分隔符，防止 Windows 反斜杠绕过
  // POSIX basename 检查后被 path.resolve 当作目录跳转。
  const safeName = path.basename(relative);
  if (
    !safeName ||
    safeName !== relative ||
    relative.includes('/') ||
    relative.includes('\\') ||
    path.isAbsolute(relative)
  ) {
    response.statusCode = 404;
    response.end();
    return;
  }
  void serveBookFile(request, response, safeName);
}

export function builtinBooksDevPlugin(): Plugin {
  return {
    name: 'builtin-books-dev',
    configureServer(server) {
      server.middlewares.use(booksMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(booksMiddleware);
    },
  };
}
