import type { PageTheme } from './types/reader';

export interface ReaderThemeColors {
  /** 纸张底色。 */
  background: string;
  /** 正文颜色。 */
  foreground: string;
}

/**
 * 阅读主题的纸色与字色 —— **唯一来源**。
 *
 * 有两个消费方，必须共用同一份取值，否则会出现「正文已换色、占位页还是旧色」这类不一致：
 * - `publication/html/HtmlPageProvider` 注入到 HTML 视口与截图底色（正文字色）；
 * - `engine/BookEngine` 的占位空白页（跨页缺页、封面内侧）。
 */
const READER_THEME_COLORS: Readonly<Record<PageTheme, ReaderThemeColors>> = {
  paper: { background: '#fffdf8', foreground: '#241f1b' },
  warm: { background: '#f2eadc', foreground: '#282521' },
  night: { background: '#25221f', foreground: '#e8dfd2' },
};

export function themeColors(theme: PageTheme): ReaderThemeColors {
  return READER_THEME_COLORS[theme] ?? READER_THEME_COLORS.warm;
}
