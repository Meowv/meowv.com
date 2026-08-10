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

export const DEFERRED_TOOL_IDS = new Set<string>();

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
  'image-to-base64',
  'base64-to-image',
  'image-dimensions',
  'image-metadata',
  'exif-viewer',
  'qr-code-reader',
]);

const VISUAL_TOOL_IDS = new Set([
  'keyboard-visualizer',
  'periodic-table',
  '3d-globe',
  'emoji-match',
]);

const INLINE_SETTING_IDS = new Set(['json-tool']);

const PANEL_SETTING_IDS = new Set(['qr-code-generator']);

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

registerBlogSource('calculation-paper', ['calculation-paper'], 'full');
registerBlogSource('keyboard-visualizer', ['keyboard-visualizer'], 'full');
registerBlogSource('api-explorer', ['api-explorer'], 'adapted');
registerBlogSource('json-formatter', ['json-tool'], 'adapted');
registerBlogSource('cron-parser', ['cron-parser'], 'full');
registerBlogSource('text-diff', ['text-diff'], 'full');
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

function resolveLayout(id: string, category: ToolCategoryId): ToolLayout {
  if (EMBEDDED_TOOL_IDS.has(id)) return 'embedded';
  if (FILE_TOOL_IDS.has(id)) return 'file';
  if (VISUAL_TOOL_IDS.has(id) || category === 'design' || category === 'games') return 'visual';
  if (['developer', 'converter', 'text'].includes(category)) return 'code';
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
