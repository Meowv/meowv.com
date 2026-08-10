import type { ToolCategoryId } from '@/features/tools/config/toolCategories';

export type ToolLayout = 'code' | 'form' | 'file' | 'visual' | 'embedded';
export type ToolSettingsMode = 'none' | 'inline' | 'panel';

export interface ToolSource {
  kind: 'blog';
  slug: string;
  parity: 'full' | 'adapted';
}

export interface ToolContract {
  layout: ToolLayout;
  settingsMode: ToolSettingsMode;
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
  'json-visualizer',
  'keyboard-visualizer',
  'periodic-table',
  '3d-globe',
  'emoji-match',
  'plonky',
  'typing-practice',
]);

const INLINE_SETTING_IDS = new Set([
  'json-tool',
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

const BLOG_SOURCE_BY_TOOL: Record<string, ToolSource> = {};

function registerBlogSource(
  slug: string,
  ids: readonly string[],
  parity: ToolSource['parity'],
): void {
  ids.forEach((id) => {
    BLOG_SOURCE_BY_TOOL[id] = { kind: 'blog', slug, parity };
  });
}

registerBlogSource(
  'date-calculator',
  ['date-add-subtract', 'date-difference', 'workday-calculator'],
  'adapted',
);
registerBlogSource('calculation-paper', ['calculation-paper'], 'full');
registerBlogSource(
  'unit-converter',
  [
    'length-converter',
    'area-converter',
    'weight-converter',
    'temperature-converter',
    'speed-converter',
  ],
  'adapted',
);
registerBlogSource('timer', ['timer'], 'full');
registerBlogSource('keyboard-visualizer', ['keyboard-visualizer'], 'full');
registerBlogSource('api-explorer', ['api-explorer'], 'adapted');
registerBlogSource('api-doc-generator', ['api-doc-generator'], 'adapted');
registerBlogSource('regex-tester', ['regex-tester'], 'full');
registerBlogSource(
  'base64',
  ['base64-converter', 'base64-image-viewer', 'base64-file-converter'],
  'adapted',
);
registerBlogSource(
  'hash-checksum',
  ['md5-hash', 'sha1-hash', 'sha256-hash', 'sha512-hash', 'file-hash-checker'],
  'adapted',
);
registerBlogSource('jwt-decoder', ['jwt-tool', 'jwt-debugger'], 'adapted');
registerBlogSource('uuid-generator', ['uuid-generator', 'guid-generator'], 'adapted');
registerBlogSource('json-formatter', ['json-tool'], 'adapted');
registerBlogSource('json-yaml', ['yaml-to-json'], 'adapted');
registerBlogSource('csv-json', ['csv-to-json'], 'adapted');
registerBlogSource('url-encode', ['url-converter'], 'adapted');
registerBlogSource('url-parser', ['encode-url-parser'], 'adapted');
registerBlogSource(
  'timestamp',
  [
    'unix-timestamp-to-date',
    'date-to-unix-timestamp',
    'seconds-timestamp',
    'milliseconds-timestamp',
  ],
  'adapted',
);
registerBlogSource('cron-parser', ['cron-parser'], 'full');
registerBlogSource('text-diff', ['text-diff'], 'full');
registerBlogSource(
  'text-toolbox',
  ['trim-spaces', 'remove-empty-lines', 'remove-duplicate-lines', 'sort-lines', 'case-converter'],
  'adapted',
);
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
  ['json-tool', 'json-visualizer'],
  ['code-formatter'],
  [
    'api-explorer',
    'api-doc-generator',
    'regex-tester',
    'curl-converter',
    'http-header-viewer',
    'jwt-debugger',
  ],
  [
    'base64-converter',
    'base64-file-converter',
    'base64-image-viewer',
    'url-converter',
    'html-converter',
    'unicode-converter',
  ],
  [
    'md5-hash',
    'sha1-hash',
    'sha256-hash',
    'sha512-hash',
    'sha3-hash',
    'file-hash-checker',
    'hmac-md5',
    'hmac-sha256',
  ],
  ['uuid-generator', 'guid-generator', 'security-guid-generator', 'nanoid-generator'],
  [
    'unix-timestamp-to-date',
    'date-to-unix-timestamp',
    'seconds-timestamp',
    'milliseconds-timestamp',
    'iso8601-converter',
    'timezone-converter',
  ],
  [
    'date-add-subtract',
    'date-difference',
    'age-calculator',
    'workday-calculator',
    'date-formatter',
  ],
  ['cron-parser', 'cron-generator', 'timer', 'date-add-subtract', 'unix-timestamp-to-date'],
  [
    'word-count',
    'character-count',
    'line-count',
    'reading-time',
    'trim-spaces',
    'remove-empty-lines',
    'remove-duplicate-lines',
    'sort-lines',
  ],
  [
    'text-diff',
    'markdown-diff',
    'markdown-preview',
    'markdown-toc-generator',
    'markdown-table-generator',
  ],
  [
    'translation',
    'simplified-traditional-converter',
    'chinese-pronunciation',
    'chinese-stroke-order',
    'special-symbols',
    'emoji',
  ],
  [
    'qr-code-generator',
    'qr-code-reader',
    'image-to-base64',
    'base64-to-image',
    'image-color-picker',
  ],
  [
    'image-compress',
    'image-convert',
    'image-resize',
    'image-crop',
    'image-watermark',
    'image-rounded-corners',
    'image-padding',
    'image-metadata',
  ],
  [
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
  ],
  [
    'color-picker',
    'hex-rgb-converter',
    'rgb-hsl-converter',
    'hsl-hex-converter',
    'palette-generator',
    'material-color',
    'tailwind-color',
  ],
  [
    'css-gradient-generator',
    'linear-gradient-generator',
    'radial-gradient-generator',
    'box-shadow-generator',
    'border-radius-generator',
    'css-animation-generator',
    'grid-generator',
    'flex-generator',
  ],
  [
    'password-generator',
    'security-password-generator',
    'random-string',
    'security-random-string',
    'random-number',
    'password-strength-checker',
  ],
  [
    'keyboard-visualizer',
    'timer',
    'calculation-paper',
    'periodic-table',
    '3d-globe',
    'answer-book',
    'emoji-match',
  ],
  ['emoji-match', 'plonky', 'typing-practice', 'keyboard-visualizer', 'timer'],
];

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
    if (id !== tool.id && !ids.includes(id) && allTools.some((item) => item.id === id))
      ids.push(id);
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
    .sort(
      (left, right) =>
        right.score - left.score || left.candidate.id.localeCompare(right.candidate.id),
    )
    .forEach(({ candidate }) => push(candidate.id));

  return ids.slice(0, 4);
}
