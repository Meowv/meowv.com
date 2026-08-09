import type { ToolCategoryId } from '@/features/tools/config/toolCategories';

export type ToolLayout = 'code' | 'form' | 'file' | 'visual' | 'embedded';
export type ToolSettingsMode = 'none' | 'inline' | 'panel';

export type ToolDataBoundary =
  | { kind: 'local'; label: string }
  | { kind: 'directRemote'; label: string; sends: readonly string[] }
  | {
      kind: 'thirdParty';
      label: string;
      provider: string;
      hostname: string;
      sends: readonly string[];
    };

export interface ToolSource {
  kind: 'blog';
  slug: string;
  parity: 'full' | 'adapted';
}

export interface ToolContract {
  layout: ToolLayout;
  settingsMode: ToolSettingsMode;
  dataBoundary: ToolDataBoundary;
  source?: ToolSource;
}

interface ToolLike {
  id: string;
  category: string;
  keywords: string;
  name: string;
}

export const DEFERRED_TOOL_IDS = new Set(['plonky', 'typing-practice']);

const EMBEDDED_TOOL_IDS = new Set([
  'image-compress',
  'image-convert',
  'image-resize',
  'image-crop',
  'images-to-pdf',
  'image-watermark',
  'merge-gif',
  'psd-viewer',
  'image-rounded-corners',
  'image-padding',
  'merge-pdf',
  'split-pdf',
  'organize-pdf',
  'pdf-to-images',
  'watermark-pdf',
  'add-pdf-page-numbers',
  'delete-pdf-pages',
  'extract-pdf-pages',
  'rotate-pdf',
  'pdf-metadata',
  'ocr-recognition',
]);

const FILE_TOOL_IDS = new Set([
  'video-to-gif',
  'base64-file-converter',
  'base64-image-viewer',
  'image-to-base64',
  'base64-to-image',
  'image-dimensions',
  'image-metadata',
  'exif-viewer',
  'file-info-viewer',
  'file-hash-checker',
  'qr-code-reader',
]);

const VISUAL_TOOL_IDS = new Set([
  'json-graph-viewer',
  'json-tree-viewer',
  'keyboard-visualizer',
  'periodic-table',
  '3d-globe',
  'emoji-match',
  'plonky',
  'typing-practice',
]);

const INLINE_SETTING_IDS = new Set([
  'json-format',
  'json-minify',
  'json-validator',
  'javascript-formatter',
  'typescript-formatter',
  'css-formatter',
  'html-formatter',
  'sql-formatter',
  'xml-formatter',
  'yaml-formatter',
  'markdown-formatter',
  'length-converter',
  'area-converter',
  'weight-converter',
  'temperature-converter',
  'volume-converter',
  'speed-converter',
]);

const PANEL_SETTING_IDS = new Set([
  'qr-code-generator',
  'password-generator',
  'security-password-generator',
  'random-string',
  'fake-user-generator',
  'avatar-generator',
  'meta-tag-generator',
  'html-template-generator',
  'css-gradient-generator',
  'linear-gradient-generator',
  'radial-gradient-generator',
  'box-shadow-generator',
  'border-radius-generator',
  'css-animation-generator',
  'grid-generator',
  'flex-generator',
  'palette-generator',
]);

const DATA_BOUNDARY_OVERRIDES: Record<string, ToolDataBoundary> = {
  'api-explorer': {
    kind: 'directRemote',
    label: '请求会直接发送到你填写的目标地址',
    sends: ['请求 URL', 'Query', 'Header', 'Body'],
  },
  translation: {
    kind: 'thirdParty',
    label: '翻译内容会发送到第三方翻译服务',
    provider: 'MyMemory Translation',
    hostname: 'api.mymemory.translated.net',
    sends: ['原文', '源语言', '目标语言'],
  },
  'short-video-parser': {
    kind: 'thirdParty',
    label: '短视频链接会发送到解析服务',
    provider: 'BugPK',
    hostname: 'api.bugpk.com',
    sends: ['短视频分享链接'],
  },
  'dns-query': {
    kind: 'thirdParty',
    label: '域名与记录类型会发送到 DNS over HTTPS 服务',
    provider: 'Cloudflare DNS',
    hostname: 'cloudflare-dns.com',
    sends: ['域名', 'DNS 记录类型'],
  },
  'dns-lookup': {
    kind: 'thirdParty',
    label: '域名与记录类型会发送到 DNS over HTTPS 服务',
    provider: 'Cloudflare DNS',
    hostname: 'cloudflare-dns.com',
    sends: ['域名', 'DNS 记录类型'],
  },
};

const BLOG_SOURCE_BY_TOOL: Record<string, ToolSource> = {};

function registerBlogSource(slug: string, ids: readonly string[], parity: ToolSource['parity']): void {
  ids.forEach((id) => {
    BLOG_SOURCE_BY_TOOL[id] = { kind: 'blog', slug, parity };
  });
}

registerBlogSource('date-calculator', ['date-add-subtract', 'date-difference', 'workday-calculator'], 'adapted');
registerBlogSource('calculation-paper', ['calculation-paper'], 'full');
registerBlogSource('unit-converter', ['length-converter', 'area-converter', 'weight-converter', 'temperature-converter', 'speed-converter'], 'adapted');
registerBlogSource('timer', ['timer'], 'full');
registerBlogSource('keyboard-visualizer', ['keyboard-visualizer'], 'full');
registerBlogSource('api-explorer', ['api-explorer'], 'adapted');
registerBlogSource('api-doc-generator', ['api-doc-generator'], 'adapted');
registerBlogSource('regex-tester', ['regex-tester'], 'full');
registerBlogSource('base64', ['base64-encode', 'base64-decode', 'base64-image-viewer', 'base64-file-converter'], 'adapted');
registerBlogSource('hash-checksum', ['md5-hash', 'sha1-hash', 'sha256-hash', 'sha512-hash', 'file-hash-checker'], 'adapted');
registerBlogSource('jwt-decoder', ['jwt-decode', 'jwt-debugger'], 'adapted');
registerBlogSource('uuid-generator', ['uuid-generator', 'guid-generator', 'uuid-v4'], 'adapted');
registerBlogSource('json-formatter', ['json-format', 'json-minify', 'json-validator'], 'adapted');
registerBlogSource('json-yaml', ['json-to-yaml', 'yaml-to-json'], 'adapted');
registerBlogSource('csv-json', ['csv-to-json', 'json-to-csv'], 'adapted');
registerBlogSource('url-encode', ['url-encode', 'url-decode'], 'adapted');
registerBlogSource('url-parser', ['encode-url-parser', 'network-url-parser'], 'adapted');
registerBlogSource('timestamp', ['unix-timestamp-to-date', 'date-to-unix-timestamp', 'seconds-timestamp', 'milliseconds-timestamp'], 'adapted');
registerBlogSource('cron-parser', ['cron-parser'], 'full');
registerBlogSource('text-diff', ['text-diff'], 'full');
registerBlogSource('text-toolbox', ['trim-spaces', 'remove-empty-lines', 'remove-duplicate-lines', 'sort-lines', 'case-converter'], 'adapted');
registerBlogSource('special-symbols', ['special-symbols'], 'full');
registerBlogSource('emojis', ['emoji'], 'full');
registerBlogSource('chinese-converter', ['simplified-traditional-converter'], 'adapted');
registerBlogSource('translate', ['translation'], 'adapted');
registerBlogSource('pronunciation', ['chinese-pronunciation'], 'full');
registerBlogSource('bishun', ['chinese-stroke-order'], 'full');
registerBlogSource('qr-generator', ['qr-code-generator'], 'full');
registerBlogSource('qr-reader', ['qr-code-reader'], 'full');
registerBlogSource('color-picker', ['color-picker'], 'full');
registerBlogSource('exif-cleaner', ['exif-viewer', 'image-metadata'], 'adapted');
registerBlogSource('video-to-gif', ['video-to-gif'], 'adapted');
registerBlogSource('video-parser', ['short-video-parser'], 'adapted');
registerBlogSource('periodic-table', ['periodic-table'], 'full');
registerBlogSource('3d-globe', ['3d-globe'], 'full');
registerBlogSource('emoji-match', ['emoji-match'], 'full');
registerBlogSource('answer-book', ['answer-book'], 'full');

const RELATED_GROUPS: readonly (readonly string[])[] = [
  ['json-format', 'json-minify', 'json-validator', 'json-tree-viewer', 'json-graph-viewer', 'json-diff', 'json-schema-validator', 'json-path-tester'],
  ['json-to-yaml', 'yaml-to-json', 'json-to-xml', 'xml-to-json', 'json-to-csv', 'csv-to-json', 'json-to-toml', 'toml-to-json'],
  ['json-to-typescript', 'json-to-java', 'json-to-csharp', 'json-schema-generator', 'json-mock-generator'],
  ['javascript-formatter', 'typescript-formatter', 'css-formatter', 'html-formatter', 'sql-formatter', 'xml-formatter', 'yaml-formatter', 'markdown-formatter'],
  ['api-explorer', 'api-doc-generator', 'regex-tester', 'curl-converter', 'http-header-viewer', 'jwt-debugger'],
  ['base64-encode', 'base64-decode', 'base64-file-converter', 'base64-image-viewer', 'url-encode', 'url-decode', 'html-encode', 'html-decode'],
  ['md5-hash', 'sha1-hash', 'sha256-hash', 'sha512-hash', 'sha3-hash', 'file-hash-checker', 'hmac-md5', 'hmac-sha256'],
  ['uuid-generator', 'uuid-v1', 'uuid-v4', 'uuid-v7', 'guid-generator', 'security-guid-generator', 'nanoid-generator'],
  ['unix-timestamp-to-date', 'date-to-unix-timestamp', 'seconds-timestamp', 'milliseconds-timestamp', 'iso8601-converter', 'timezone-converter'],
  ['date-add-subtract', 'date-difference', 'age-calculator', 'workday-calculator', 'date-formatter'],
  ['cron-parser', 'cron-generator', 'timer', 'date-add-subtract', 'unix-timestamp-to-date'],
  ['dns-query', 'dns-lookup', 'ip-address-viewer', 'ipv4-converter', 'ipv6-converter', 'cidr-calculator', 'network-url-parser'],
  ['word-count', 'character-count', 'line-count', 'reading-time', 'trim-spaces', 'remove-empty-lines', 'remove-duplicate-lines', 'sort-lines'],
  ['text-diff', 'markdown-diff', 'markdown-preview', 'markdown-toc-generator', 'markdown-table-generator'],
  ['translation', 'simplified-traditional-converter', 'chinese-pronunciation', 'chinese-stroke-order', 'special-symbols', 'emoji'],
  ['qr-code-generator', 'qr-code-reader', 'image-to-base64', 'base64-to-image', 'image-color-picker'],
  ['image-compress', 'image-convert', 'image-resize', 'image-crop', 'image-watermark', 'image-rounded-corners', 'image-padding', 'image-metadata'],
  ['merge-pdf', 'split-pdf', 'organize-pdf', 'pdf-to-images', 'watermark-pdf', 'add-pdf-page-numbers', 'delete-pdf-pages', 'extract-pdf-pages', 'rotate-pdf', 'pdf-metadata'],
  ['color-picker', 'hex-rgb-converter', 'rgb-hsl-converter', 'hsl-hex-converter', 'palette-generator', 'material-color', 'tailwind-color'],
  ['css-gradient-generator', 'linear-gradient-generator', 'radial-gradient-generator', 'box-shadow-generator', 'border-radius-generator', 'css-animation-generator', 'grid-generator', 'flex-generator'],
  ['password-generator', 'security-password-generator', 'random-string', 'security-random-string', 'random-number', 'password-strength-checker'],
  ['keyboard-visualizer', 'timer', 'calculation-paper', 'periodic-table', '3d-globe', 'answer-book', 'emoji-match'],
  ['emoji-match', 'plonky', 'typing-practice', 'keyboard-visualizer', 'timer'],
];

const LOCAL_BOUNDARY: ToolDataBoundary = {
  kind: 'local',
  label: '所有内容仅在当前浏览器中处理',
};

function resolveLayout(id: string, category: ToolCategoryId): ToolLayout {
  if (EMBEDDED_TOOL_IDS.has(id)) return 'embedded';
  if (FILE_TOOL_IDS.has(id)) return 'file';
  if (VISUAL_TOOL_IDS.has(id) || category === 'design' || category === 'games') return 'visual';
  if (['developer', 'json', 'converter', 'encode', 'text'].includes(category)) return 'code';
  return 'form';
}

function resolveSettingsMode(id: string): ToolSettingsMode {
  if (PANEL_SETTING_IDS.has(id)) return 'panel';
  if (INLINE_SETTING_IDS.has(id)) return 'inline';
  return 'none';
}

export function resolveToolContract(id: string, category: ToolCategoryId): ToolContract {
  return {
    layout: resolveLayout(id, category),
    settingsMode: resolveSettingsMode(id),
    dataBoundary: DATA_BOUNDARY_OVERRIDES[id] ?? LOCAL_BOUNDARY,
    source: BLOG_SOURCE_BY_TOOL[id],
  };
}

function terms(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((term) => term.length > 1),
  );
}

function scoreCandidate(tool: ToolLike, candidate: ToolLike): number {
  const sourceTerms = terms(`${tool.name} ${tool.keywords}`);
  const candidateTerms = terms(`${candidate.name} ${candidate.keywords}`);
  let score = tool.category === candidate.category ? 10 : 0;
  sourceTerms.forEach((term) => {
    if (candidateTerms.has(term)) score += 3;
  });
  return score;
}

export function resolveRelatedToolIds(tool: ToolLike, allTools: readonly ToolLike[]): string[] {
  const ids: string[] = [];
  const push = (id: string): void => {
    if (id !== tool.id && !ids.includes(id) && allTools.some((item) => item.id === id)) ids.push(id);
  };

  RELATED_GROUPS.filter((group) => group.includes(tool.id)).forEach((group) => {
    const index = group.indexOf(tool.id);
    for (let offset = 1; offset < group.length; offset += 1) {
      push(group[(index + offset) % group.length]);
    }
  });

  allTools
    .filter((candidate) => candidate.id !== tool.id)
    .map((candidate) => ({ candidate, score: scoreCandidate(tool, candidate) }))
    .sort((left, right) => right.score - left.score || left.candidate.id.localeCompare(right.candidate.id))
    .forEach(({ candidate }) => push(candidate.id));

  return ids.slice(0, 4);
}
