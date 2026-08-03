export type PdfToolCategory = "organize" | "convert" | "edit";

export type PdfToolIcon =
  | "files"
  | "scissors"
  | "layout-grid"
  | "trash"
  | "file-output"
  | "rotate"
  | "images"
  | "image-down"
  | "stamp"
  | "hash"
  | "file-cog";

export interface PdfToolDefinition {
  slug: string;
  name: string;
  shortName: string;
  description: string;
  icon: PdfToolIcon;
  category: PdfToolCategory;
  accept: string[];
  multiple: boolean;
  enabled: boolean;
  featured: boolean;
  seo: {
    title: string;
    description: string;
  };
}

export const toolCategories: ReadonlyArray<{
  id: PdfToolCategory;
  name: string;
  description: string;
}> = [
  {
    id: "organize",
    name: "整理 PDF",
    description: "重新组合、选择或调整 PDF 页面"
  },
  {
    id: "convert",
    name: "转换 PDF",
    description: "在 PDF 与常用图片格式之间转换"
  },
  {
    id: "edit",
    name: "编辑 PDF",
    description: "为 PDF 添加信息或修改基础属性"
  }
];

export const pdfTools: ReadonlyArray<PdfToolDefinition> = [
  {
    slug: "merge-pdf",
    name: "合并 PDF",
    shortName: "合并",
    description: "按你指定的顺序，将多个 PDF 合成一个文件。",
    icon: "files",
    category: "organize",
    accept: ["application/pdf", ".pdf"],
    multiple: true,
    enabled: true,
    featured: true,
    seo: {
      title: "合并 PDF｜在线免费合并多个 PDF 文件 - Meowv",
      description:
        "免费在线合并多个 PDF 文件，支持拖拽排序和页面预览。文件不上传，在浏览器本地完成合并，无需注册登录。"
    }
  },
  {
    slug: "split-pdf",
    name: "拆分 PDF",
    shortName: "拆分",
    description: "按页、范围或自定义分组拆分 PDF。",
    icon: "scissors",
    category: "organize",
    accept: ["application/pdf", ".pdf"],
    multiple: false,
    enabled: true,
    featured: true,
    seo: {
      title: "拆分 PDF｜在线按页或范围拆分 PDF - Meowv",
      description: "免费在线拆分 PDF，支持按页、页码范围和自定义分组导出。文件仅在浏览器本地处理。"
    }
  },
  {
    slug: "organize-pdf",
    name: "整理 PDF 页面",
    shortName: "整理页面",
    description: "拖拽排序、复制、旋转或移除页面。",
    icon: "layout-grid",
    category: "organize",
    accept: ["application/pdf", ".pdf"],
    multiple: false,
    enabled: true,
    featured: true,
    seo: {
      title: "整理 PDF 页面｜在线排序与调整 PDF 页面 - Meowv",
      description:
        "在线整理 PDF 页面，支持拖拽排序、复制、旋转和删除。处理过程在当前浏览器本地完成。"
    }
  },
  {
    slug: "delete-pdf-pages",
    name: "删除 PDF 页面",
    shortName: "删除页面",
    description: "选择不需要的页面并导出新的 PDF。",
    icon: "trash",
    category: "organize",
    accept: ["application/pdf", ".pdf"],
    multiple: false,
    enabled: true,
    featured: false,
    seo: {
      title: "删除 PDF 页面｜在线移除 PDF 指定页面 - Meowv",
      description: "在线选择并删除 PDF 指定页面，原始文件不会被修改，文件不会上传到服务器。"
    }
  },
  {
    slug: "extract-pdf-pages",
    name: "提取 PDF 页面",
    shortName: "提取页面",
    description: "将选中页面合并或分别导出。",
    icon: "file-output",
    category: "organize",
    accept: ["application/pdf", ".pdf"],
    multiple: false,
    enabled: true,
    featured: false,
    seo: {
      title: "提取 PDF 页面｜在线导出 PDF 指定页面 - Meowv",
      description: "在线提取 PDF 指定页面，可合并为一个 PDF 或分别导出，文件仅在浏览器本地处理。"
    }
  },
  {
    slug: "rotate-pdf",
    name: "旋转 PDF",
    shortName: "旋转",
    description: "旋转全部或指定页面并保存结果。",
    icon: "rotate",
    category: "organize",
    accept: ["application/pdf", ".pdf"],
    multiple: false,
    enabled: true,
    featured: false,
    seo: {
      title: "旋转 PDF｜在线旋转 PDF 页面 - Meowv",
      description: "在线旋转 PDF 的全部或指定页面，支持 90° 与 180°，文件不会上传。"
    }
  },
  {
    slug: "images-to-pdf",
    name: "图片转 PDF",
    shortName: "图片转 PDF",
    description: "将 JPG、PNG 或 WebP 图片整理为 PDF。",
    icon: "images",
    category: "convert",
    accept: ["image/jpeg", "image/png", "image/webp", ".jpg", ".jpeg", ".png", ".webp"],
    multiple: true,
    enabled: true,
    featured: true,
    seo: {
      title: "图片转 PDF｜在线将 JPG、PNG、WebP 转为 PDF - Meowv",
      description:
        "在线将 JPG、PNG 和 WebP 图片转换为 PDF，支持排序、页面尺寸和边距设置，图片不会上传。"
    }
  },
  {
    slug: "pdf-to-images",
    name: "PDF 转图片",
    shortName: "PDF 转图片",
    description: "将 PDF 页面导出为 PNG、JPG 或 WebP。",
    icon: "image-down",
    category: "convert",
    accept: ["application/pdf", ".pdf"],
    multiple: false,
    enabled: true,
    featured: true,
    seo: {
      title: "PDF 转图片｜在线将 PDF 转为 PNG、JPG、WebP - Meowv",
      description:
        "在线将 PDF 页面转换为 PNG、JPG 或 WebP 图片，支持选择页码和输出清晰度。文件仅在浏览器本地处理。"
    }
  },
  {
    slug: "watermark-pdf",
    name: "PDF 添加水印",
    shortName: "添加水印",
    description: "添加可定制的文字或图片水印。",
    icon: "stamp",
    category: "edit",
    accept: ["application/pdf", ".pdf"],
    multiple: false,
    enabled: true,
    featured: true,
    seo: {
      title: "PDF 添加水印｜在线添加文字或图片水印 - Meowv",
      description: "在线为 PDF 添加文字或图片水印，支持位置、透明度和页面范围设置，文件不会上传。"
    }
  },
  {
    slug: "add-pdf-page-numbers",
    name: "PDF 添加页码",
    shortName: "添加页码",
    description: "自定义格式、位置和范围添加页码。",
    icon: "hash",
    category: "edit",
    accept: ["application/pdf", ".pdf"],
    multiple: false,
    enabled: true,
    featured: false,
    seo: {
      title: "PDF 添加页码｜在线为 PDF 添加页码 - Meowv",
      description:
        "在线为 PDF 添加页码，自定义格式、起始页、位置和边距，所有处理均在浏览器本地完成。"
    }
  },
  {
    slug: "pdf-metadata",
    name: "PDF 元数据",
    shortName: "元数据",
    description: "查看、编辑或清除 PDF 基础信息。",
    icon: "file-cog",
    category: "edit",
    accept: ["application/pdf", ".pdf"],
    multiple: false,
    enabled: true,
    featured: false,
    seo: {
      title: "PDF 元数据｜在线查看与编辑 PDF 信息 - Meowv",
      description: "在线查看和编辑 PDF 标题、作者、主题、关键词与日期等基础元数据，不修改原始文件。"
    }
  }
];

export function getToolsByCategory(category: PdfToolCategory): PdfToolDefinition[] {
  return pdfTools.filter((tool) => tool.enabled && tool.category === category);
}

export function getToolBySlug(slug: string): PdfToolDefinition | undefined {
  return pdfTools.find((tool) => tool.enabled && tool.slug === slug);
}
