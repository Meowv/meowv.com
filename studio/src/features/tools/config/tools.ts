import {
  toolCategories,
  toolCategoryMap,
  type ToolCategoryId,
} from '@/features/tools/config/toolCategories';
import { resolveToolContract, type ToolContract } from '@/features/tools/config/toolContracts';

export interface ToolConfig extends ToolContract {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  route: string;
  keywords: string;
}

type ToolSeed = readonly [
  id: string,
  name: string,
  keywords: string,
  description: string,
  icon: string,
];

const toolSeeds: Record<ToolCategoryId, ToolSeed[]> = {
  developer: [
    [
      'api-explorer',
      'API Explorer',
      'api http request rest 调试',
      '调试 HTTP API 请求并查看响应。',
      'api',
    ],
    ['json-tool', 'JSON 工具', '格式化 校验 压缩 转义 可视化', '这里是描述', 'braces'],
  ],
  converter: [
    ['video-to-gif', '视频转GIF', 'video gif 动图', '截取本地视频片段并转换为 GIF 动图。', 'video'],
    [
      'short-video-parser',
      '短视频解析',
      'video link url 去水印',
      '解析短视频链接及其媒体信息。',
      'link',
    ],
  ],
  text: [
    [
      'ocr-recognition',
      'OCR 识别',
      'ocr image text 文字识别',
      '识别图片中的文字并导出可编辑文本。',
      'text-recognition',
    ],
    [
      'special-symbols',
      '特殊符号',
      'symbol character 标点',
      '快速查找、复制和组合常用特殊符号。',
      'asterisk',
    ],
    ['emoji', 'Emoji 表情', 'emoji 表情符号', '查找、复制和使用 Emoji 表情符号。', 'mood-smile'],
  ],
  language: [
    [
      'translation',
      '翻译',
      'translate language 多语言',
      '在多种语言之间翻译文本内容。',
      'language',
    ],
    [
      'simplified-traditional-converter',
      '繁简互转',
      '简体 繁体 中文',
      '在简体中文与繁体中文之间转换。',
      'language',
    ],
    [
      'chinese-pronunciation',
      '汉字标准发音',
      '汉字 拼音 pronunciation',
      '查询汉字的标准读音与拼音。',
      'writing',
    ],
    [
      'chinese-stroke-order',
      '汉字笔顺',
      '汉字 笔画 stroke order',
      '查看汉字的笔画顺序与书写过程。',
      'writing',
    ],
  ],
  date: [
    [
      'cron',
      'Cron 表达式',
      'schedule expression generate parser',
      '生成、解析并预览 Linux、Quartz 与 Hangfire Cron 表达式。',
      'clock',
    ],
  ],
  image: [
    [
      'image-compress',
      '图片压缩',
      'image compress optimize',
      '降低图片体积，保留清晰画质。',
      'file-zip',
    ],
    [
      'image-convert',
      '图片格式转换',
      'png jpeg webp ico svg convert',
      '转换 PNG、JPEG、WebP、ICO 与 SVG。',
      'arrows-exchange',
    ],
    [
      'image-resize',
      '图片尺寸调整',
      'resize width height scale',
      '按宽高、百分比或最大边批量缩放。',
      'maximize',
    ],
    ['image-crop', '图片裁剪', 'crop ratio export', '自由比例、常用尺寸与精确导出。', 'crop'],
    ['images-to-pdf', '图片转 PDF', 'image pdf convert', '多图排序并生成常用纸张 PDF。', 'pdf'],
    [
      'image-watermark',
      '图片添加水印',
      'image text logo watermark',
      '添加文字、Logo、位置、旋转与平铺水印。',
      'photo-edit',
    ],
    [
      'merge-gif',
      '合并为 GIF',
      'image gif animation merge',
      '设置帧率、画布、背景与循环。',
      'video',
    ],
    [
      'psd-viewer',
      'PSD 查看',
      'photoshop psd preview',
      '本地解析 Photoshop 合成图并导出预览。',
      'photoshop',
    ],
    [
      'image-rounded-corners',
      '图片添加圆角',
      'image rounded corner',
      '统一或独立圆角，保留透明背景。',
      'border-corner',
    ],
    [
      'image-padding',
      '图片补边留白',
      'image padding border background',
      '设置四边边距、纯色、透明或渐变背景。',
      'photo',
    ],
    [
      'image-color',
      '图片取色与主色提取',
      'eyedropper palette dominant color',
      '在图片中精确取色，并提取主色调色板。',
      'color-picker',
    ],
  ],
  pdf: [
    ['merge-pdf', '合并 PDF', 'pdf merge combine', '按指定顺序将多个 PDF 合成一个文件。', 'files'],
    ['split-pdf', '拆分 PDF', 'pdf split pages', '按页、范围或自定义分组拆分 PDF。', 'scissors'],
    [
      'organize-pdf',
      '整理 PDF 页面',
      'pdf pages reorder rotate delete',
      '拖拽排序、复制、旋转或移除页面。',
      'layout-grid',
    ],
    [
      'pdf-to-images',
      'PDF 转图片',
      'pdf png jpg webp convert',
      '将 PDF 页面导出为 PNG、JPG 或 WebP。',
      'photo-down',
    ],
    [
      'watermark-pdf',
      'PDF 添加水印',
      'pdf watermark text image',
      '添加可定制的文字或图片水印。',
      'rubber-stamp',
    ],
    [
      'add-pdf-page-numbers',
      'PDF 添加页码',
      'pdf page numbers',
      '自定义格式、位置和范围添加页码。',
      'hash',
    ],
    [
      'delete-pdf-pages',
      '删除 PDF 页面',
      'pdf remove pages',
      '选择不需要的页面并导出新的 PDF。',
      'trash',
    ],
    [
      'extract-pdf-pages',
      '提取 PDF 页面',
      'pdf extract pages',
      '将选中页面合并或分别导出。',
      'file-export',
    ],
    ['rotate-pdf', '旋转 PDF', 'pdf rotate pages', '旋转全部或指定页面并保存结果。', 'rotate'],
    [
      'pdf-metadata',
      'PDF 元数据',
      'pdf metadata title author',
      '查看、编辑或清除 PDF 基础信息。',
      'file-settings',
    ],
  ],
  design: [
    [
      'color-picker',
      '颜色选择器',
      '取色 color',
      '可视化生成设计参数，并实时预览效果。',
      'color-picker',
    ],
  ],
  generator: [
    [
      'qr-code',
      'QR Code',
      '二维码 generate reader scan',
      '在浏览器本地生成或识别 QR Code。',
      'qrcode',
    ],
  ],
  misc: [
    [
      'keyboard-visualizer',
      '键盘可视化',
      'keyboard key test shortcut',
      '展示按键、组合键与键盘布局。',
      'keyboard',
    ],
    [
      'calculation-paper',
      '计算稿纸',
      'calculate math numbers',
      '从混合文本中提取数字并自动计算与汇总。',
      'calculator',
    ],
    [
      'periodic-table',
      '元素周期表',
      'chemistry elements periodic',
      '交互式查看 118 个化学元素。',
      'flask',
    ],
    ['3d-globe', '3D 地球仪', 'globe earth geography map', '可旋转缩放的交互式地球仪。', 'map'],
    [
      'answer-book',
      '答案之书',
      'answer book random question',
      '默念一个问题，翻开书页寻找答案。',
      'book',
    ],
  ],
  games: [
    [
      'emoji-match',
      '表情符号消除',
      'emoji match puzzle game',
      '在限时挑战中找出唯一成对的表情符号。',
      'mood-smile',
    ],
  ],
};

function createTool(
  categoryId: ToolCategoryId,
  [id, name, keywords, description, icon]: ToolSeed,
): ToolConfig {
  const category = toolCategoryMap.get(categoryId);
  if (!category) throw new Error(`未知工具分类：${categoryId}`);

  return {
    id,
    name,
    description,
    category: categoryId,
    icon,
    route: `/tools/${id}`,
    keywords: `${name} ${category.name} ${category.label} ${keywords}`,
    ...resolveToolContract(id, categoryId),
  };
}

export const tools: ToolConfig[] = toolCategories.flatMap((category) =>
  toolSeeds[category.id].map((seed) => createTool(category.id, seed)),
);

export function getToolById(toolId: string): ToolConfig | undefined {
  return tools.find((tool) => tool.id === toolId);
}

export function getToolsByCategory(categoryId: ToolCategoryId): ToolConfig[] {
  return tools.filter((tool) => tool.category === categoryId);
}

export function searchTools(query: string, source: ToolConfig[] = tools): ToolConfig[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return source;

  return source.filter((tool) => {
    const category = toolCategoryMap.get(tool.category as ToolCategoryId);
    const searchable = [
      tool.id,
      tool.name,
      tool.description,
      tool.keywords,
      category?.name,
      category?.label,
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase();

    return terms.every((term) => searchable.includes(term));
  });
}
