import {
  Crop,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileStack,
  Frame,
  ImageDown,
  Images,
  Maximize2,
  SquareRoundCorner,
  SquarePen,
  Stamp,
} from "@lucide/vue";
import type { Component } from "vue";

export interface ToolDefinition {
  slug: string;
  name: string;
  description: string;
  icon: Component;
  enabled: boolean;
  route?: string;
  stage?: string;
}

export const tools: ToolDefinition[] = [
  {
    slug: "compress",
    name: "图片压缩",
    description: "快速压缩 JPG、PNG、WebP 图片，降低文件大小，保持清晰画质。",
    icon: ImageDown,
    enabled: true,
    route: "/compress",
  },
  {
    slug: "convert",
    name: "格式转换",
    description: "批量转换 PNG、JPEG、WebP、ICO 与 SVG。",
    icon: FileImage,
    enabled: true,
    route: "/convert",
  },
  {
    slug: "resize",
    name: "尺寸调整",
    description: "按固定宽高、百分比或最大边批量调整图片尺寸。",
    icon: Maximize2,
    enabled: true,
    route: "/resize",
  },
  {
    slug: "crop",
    name: "图片裁剪",
    description: "自由调整裁剪区域，支持常用比例、缩放和精确导出。",
    icon: Crop,
    enabled: true,
    route: "/crop",
  },
  {
    slug: "watermark",
    name: "添加水印",
    description: "添加文字或 Logo 水印，支持九宫格位置、透明度、旋转和平铺。",
    icon: Stamp,
    enabled: true,
    route: "/watermark",
  },
  {
    slug: "rounded",
    name: "添加圆角",
    description: "使用像素或百分比设置统一、独立圆角，并保留透明背景。",
    icon: SquareRoundCorner,
    enabled: true,
    route: "/rounded",
  },
  {
    slug: "padding",
    name: "补边留白",
    description: "分别设置四边边距，支持纯色、透明或渐变背景。",
    icon: Frame,
    enabled: true,
    route: "/padding",
  },
  {
    slug: "to-pdf",
    name: "图片转 PDF",
    description: "排列多张图片，按常用纸张、方向与适配方式合并生成 PDF。",
    icon: FileStack,
    enabled: true,
    route: "/images-to-pdf",
  },
  {
    slug: "merge-gif",
    name: "合并为 GIF",
    description: "将多张图片按顺序合并为 GIF，设置画布、FPS、背景与循环。",
    icon: Images,
    enabled: true,
    route: "/merge-gif",
  },
];

export const productLinks = [
  {
    name: "Markdown Studio",
    description: "浏览器里的本地 Markdown 工作台",
    href: "https://md.meowv.com/",
    icon: FileCode2,
  },
  {
    name: "Meowv Office",
    description: "浏览器本地 Office 编辑器",
    href: "https://office.meowv.com/",
    icon: FileSpreadsheet,
  },
  {
    name: "在线 PDF 处理",
    description: "浏览器里的本地 PDF 工具",
    href: "https://pdf.meowv.com/",
    icon: FileStack,
  },
  {
    name: "字帖生成",
    description: "在线制作 A4 练字纸",
    href: "https://zt.meowv.com/",
    icon: SquarePen,
  },
];
