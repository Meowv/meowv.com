export const STUDIO_SITE_URL = 'https://studio.meowv.com';

export const STUDIO_DEFAULT_SEO = {
  title: 'Meowv Studio｜本地文件工作台',
  description:
    '无需上传文件的本地工作台：在浏览器中打开、编辑、转换和导出图片、PDF、Markdown、Office 文档及更多内容。',
};

export type StudioSeoMeta = {
  title: string;
  description: string;
  noindex?: boolean;
};

/** 路由 SEO 文案唯一来源；构建期静态页面和运行时路由共用。 */
export const STUDIO_ROUTE_SEO = {
  home: STUDIO_DEFAULT_SEO,
  markdown: {
    title: 'Markdown 在线编辑器｜Meowv Studio',
    description:
      '浏览器本地 Markdown 编辑器：打开文件夹、编辑与预览文档，支持全文搜索，并导出 HTML、PDF、Word 等格式。',
  },
  mermaid: {
    title: 'Mermaid 在线编辑器｜Meowv Studio',
    description:
      '在线编辑 Mermaid 流程图、时序图和架构图，在浏览器本地预览、导出与分享，图表内容无需上传。',
  },
  office: {
    title: 'Word、Excel、PPT 在线编辑｜Meowv Studio',
    description:
      '浏览器本地 Office 编辑器，支持 Word、Excel、PowerPoint 和 CSV 文件的打开、创建、编辑与保存，无需上传文档。',
  },
  books: {
    title: 'PDF 仿真书阅读器｜Meowv Studio',
    description:
      '在浏览器本地打开 PDF，以仿真书方式翻页阅读，支持阅读进度和分页索引，文件内容始终留在设备内。',
  },
  draw: {
    title: '在线白板与流程图工具｜Meowv Studio',
    description:
      '浏览器本地在线白板，支持草图、流程图和无限画布，自动保存并导出 PNG、SVG 或 Excalidraw 文件。',
  },
  mind: {
    title: '在线思维导图工具｜Meowv Studio',
    description:
      '在浏览器本地创建和整理思维导图，支持 Markdown 大纲、主题设置及 Markdown、PNG、SVG、JSON 导出。',
  },
  notes: {
    title: '在线便签与灵感记录工具｜Meowv Studio',
    description:
      '浏览器本地便签工具，支持自由布局、颜色、置顶、折叠和自动保存，适合记录灵感、待办与临时信息。',
  },
  wallpapers: {
    title: '电脑与手机壁纸｜Meowv Studio',
    description: '精选电脑和手机壁纸，支持静态与动态壁纸预览、分类筛选和下载，直接在浏览器中浏览。',
  },
  tools: {
    title: '在线工具箱｜图片、PDF、文本与开发工具｜Meowv Studio',
    description:
      '实用在线工具箱，汇集图片、PDF、文本、编码、数据和设计工具，支持搜索与收藏，打开浏览器即可使用。',
  },
  toolDetail: {
    title: '在线工具｜Meowv Studio',
    description: '使用 Meowv Studio 在线工具处理文件、文本与数据，内容在浏览器本地处理，无需上传。',
  },
  notFound: {
    title: '页面未找到｜Meowv Studio',
    description: '你访问的页面不存在或已被移动，请返回 Meowv Studio 首页继续使用本地文件工作台。',
    noindex: true,
  },
} satisfies Record<string, StudioSeoMeta>;

export function studioCanonicalUrl(pathname: string): string {
  const path = pathname === '/' ? '/' : `/${pathname.replace(/^\/+|\/+$/g, '')}`;
  return `${STUDIO_SITE_URL}${path}`;
}
