export const STUDIO_SITE_URL = 'https://studio.meowv.com';

export const STUDIO_DEFAULT_SEO = {
  title: 'Meowv Studio｜本地文件工作台',
  description:
    'Meowv Studio 提供浏览器本地文件工作台，可打开、编辑、转换和导出 Markdown、Office 文档、PDF 与图片；本地文件无需上传。',
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
    title: 'Markdown｜Meowv Studio',
    description:
      '在浏览器中编辑 Markdown 文档，打开本地文件夹并实时预览、全文搜索；支持导出 HTML、PDF 和 PNG 图片。',
  },
  mermaid: {
    title: 'Mermaid｜Meowv Studio',
    description:
      '在线编辑 Mermaid 流程图、时序图和架构图，实时预览并导出 SVG、PNG、PDF 等格式，还可生成分享链接。',
  },
  office: {
    title: 'Office｜Meowv Studio',
    description:
      '在浏览器中打开、创建和编辑 Word 文档、Excel 表格、PPT 演示文稿及 CSV 文件，支持保存到本地。',
  },
  books: {
    title: '仿真书｜Meowv Studio',
    description:
      '浏览器本地仿真书阅读器，支持 PDF、EPUB、TXT 等电子书翻页阅读，保留阅读进度，并可通过进度条跳页。',
  },
  draw: {
    title: '白板｜Meowv Studio',
    description:
      '使用浏览器白板自由绘图、制作流程图并在无限画布上整理想法；自动保存，支持导出图片和 Excalidraw 文件。',
  },
  floorplan: {
    title: '户型设计｜Meowv Studio',
    description:
      '在浏览器中布置户型和家具，调整地面材质、测量尺寸，使用 3D 视图和漫游预览设计；方案保存在本地，可导入导出。',
  },
  mind: {
    title: '思维导图｜Meowv Studio',
    description:
      '在线制作思维导图，支持可视化编辑、Markdown 大纲和主题切换，可导出 Markdown、PNG、SVG 或 JSON。',
  },
  notes: {
    title: '便签｜Meowv Studio',
    description:
      '在浏览器中创建和整理本地便签，自由摆放、设置颜色、置顶或折叠，自动保存灵感、待办和临时记录。',
  },
  wallpapers: {
    title: '壁纸｜Meowv Studio',
    description: '浏览电脑和手机壁纸，按静态、动态类型筛选或搜索，在线预览并下载喜欢的壁纸。',
  },
  tools: {
    title: '工具｜Meowv Studio',
    description:
      'Meowv Studio 在线工具箱汇集图片处理、PDF 编辑、文本与编码转换等实用工具，支持分类浏览、搜索和收藏。',
  },
  toolDetail: {
    title: '工具｜Meowv Studio',
    description:
      '在 Meowv Studio 中使用图片、PDF、文本和开发工具，按需处理文件与数据，快速完成常见任务。',
  },
  chat: {
    title: 'Chat｜Meowv Studio',
    description: '无需注册，使用匿名昵称加入 Meowv Chat 匿名聊天室，即刻与在线访客实时交流。',
  },
  notFound: {
    title: '页面未找到｜Meowv Studio',
    description:
      '页面未找到：当前地址可能有误，或页面已被移动。返回 Meowv Studio 首页，继续使用浏览器文件工作台。',
    noindex: true,
  },
} satisfies Record<string, StudioSeoMeta>;

export function studioCanonicalUrl(pathname: string): string {
  const path = pathname === '/' ? '/' : `/${pathname.replace(/^\/+|\/+$/g, '')}`;
  return `${STUDIO_SITE_URL}${path}`;
}
