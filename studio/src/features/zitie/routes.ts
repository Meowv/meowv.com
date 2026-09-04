import type { ExerciseMode } from './lib/types.ts';

export const ZITIE_BASE_PATH = '/zitie';
export const ZITIE_SITE_URL = 'https://studio.meowv.com/zitie/';

export type ZitiePageKind = 'home' | 'worksheet' | 'donate' | 'not-found';

export interface ZitiePageDefinition {
  path: string;
  kind: ZitiePageKind;
  mode?: ExerciseMode;
  title: string;
  description: string;
}

const SITE_NAME = '字帖生成';

export const ZITIE_PAGES: readonly ZitiePageDefinition[] = [
  {
    path: '/',
    kind: 'home',
    title: '字帖生成｜在线制作 A4 练字纸',
    description:
      '在线生成可打印的 A4 字帖，支持汉字、词语、段落、拼音、英文、数字、笔画与控笔练习，可导出 PNG、PDF 或直接打印。',
  },
  {
    path: '/hanzi/',
    kind: 'worksheet',
    mode: 'hanzi',
    title: '汉字字帖生成｜田字格、米字格在线练字纸',
    description:
      '在线生成可打印的汉字字帖，支持田字格、米字格、回宫格等方格，可设置笔顺、拼音、描红、字体与版式，并导出 PNG、PDF 或直接打印。',
  },
  {
    path: '/cizu/',
    kind: 'worksheet',
    mode: 'phrase',
    title: '词组字帖生成｜词语、成语在线描红练习',
    description:
      '在线制作词语、成语与词组练字字帖，支持拼音、描红、空行空列、多种方格与 A4 版式，可导出 PNG、PDF 或直接打印。',
  },
  {
    path: '/duanluo/',
    kind: 'worksheet',
    mode: 'cnParagraph',
    title: '中文段落字帖｜文章、古诗 A4 描红练习纸',
    description:
      '在线把文章、古诗和中文段落制作成 A4 字帖，支持作文格、田字格等版式及描红、字体、行距设置，可导出 PNG、PDF 或直接打印。',
  },
  {
    path: '/bihua/',
    kind: 'worksheet',
    mode: 'stroke',
    title: '笔画字帖生成｜汉字基本笔画在线练习纸',
    description:
      '在线制作汉字基本笔画练习字帖，可选择笔画、添加例字并调整方格、描红与 A4 页面版式，支持导出 PNG、PDF 或直接打印。',
  },
  {
    path: '/alphabet/',
    kind: 'worksheet',
    mode: 'alphabet',
    title: '英文字母字帖｜四线三格 A4 在线练字纸',
    description:
      '在线制作英文字母 A4 字帖，支持大小写成对、四线三格、描红数量、字体与间距设置，可导出 PNG、PDF 或直接打印。',
  },
  {
    path: '/word/',
    kind: 'worksheet',
    mode: 'word',
    title: '英文单词字帖｜在线制作 A4 英语练字纸',
    description:
      '在线制作英文单词 A4 练字纸，支持四线三格、描红、空行、字体字号与页面版式设置，可导出 PNG、PDF 或直接打印。',
  },
  {
    path: '/paragraph/',
    kind: 'worksheet',
    mode: 'enParagraph',
    title: '英文段落字帖｜文章、句子 A4 练习纸',
    description:
      '在线把英文文章、句子和段落制作成 A4 练字纸，支持四线三格、描红、字体、行距与页边距设置，可导出 PNG、PDF 或直接打印。',
  },
  {
    path: '/number/',
    kind: 'worksheet',
    mode: 'number',
    title: '数字字帖生成｜四线格 A4 数字练习纸',
    description:
      '在线制作数字 A4 练习字帖，支持四线格、描红、空行、字体字号与页面版式设置，可导出 PNG、PDF 或直接打印。',
  },
  {
    path: '/pinyin/',
    kind: 'worksheet',
    mode: 'pinyin',
    title: '拼音字帖生成｜在线制作四线三格练习纸',
    description:
      '在线制作拼音四线三格 A4 练习纸，支持带声调韵母输入、描红、空行、字体字号与版式设置，可导出 PNG、PDF 或直接打印。',
  },
  {
    path: '/pen-control/',
    kind: 'worksheet',
    mode: 'penControl',
    title: '控笔训练字帖｜儿童线条与运笔练习纸',
    description:
      '在线制作儿童控笔训练 A4 练习纸，提供多种线条与运笔图案，并可调整图案粗细、行距、边距和页面版式，支持导出 PNG、PDF 或直接打印。',
  },
  {
    path: '/donate/',
    kind: 'donate',
    title: '捐赠支持',
    description: '字帖生成免费开放，感谢通过支付宝或微信支持服务器、字体与功能维护。',
  },
  {
    path: '/404.html',
    kind: 'not-found',
    title: '页面未找到',
    description: '你访问的字帖页面不存在，请返回字帖生成首页。',
  },
] as const;

export function toZitiePath(path: string): string {
  return path === '/' ? `${ZITIE_BASE_PATH}/` : `${ZITIE_BASE_PATH}${path}`;
}

export function normalizeZitiePath(pathname: string): string {
  const stripped = pathname.startsWith(ZITIE_BASE_PATH)
    ? pathname.slice(ZITIE_BASE_PATH.length)
    : pathname;
  if (!stripped || stripped === '/') return '/';
  if (stripped === '/404.html') return stripped;
  return `${stripped.replace(/\/+$/, '')}/`;
}

export function findZitiePage(pathname: string): ZitiePageDefinition {
  const normalized = normalizeZitiePath(pathname);
  return (
    ZITIE_PAGES.find((page) => page.path === normalized) ??
    ZITIE_PAGES.find((page) => page.kind === 'not-found')!
  );
}

export function brandedZitieTitle(page: ZitiePageDefinition): string {
  return page.kind === 'home' ? page.title : `${page.title}｜${SITE_NAME}`;
}

export function canonicalZitieUrl(page: ZitiePageDefinition): string {
  return page.path === '/' ? ZITIE_SITE_URL : `${ZITIE_SITE_URL.slice(0, -1)}${page.path}`;
}
