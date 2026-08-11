type ToolSeed = readonly [id: string, name: string, description: string, icon: string];

interface ToolCategorySeed {
  name: string;
  label: string;
  icon: string;
  color: string;
  tools: readonly ToolSeed[];
}

export interface ToolCategoryConfig {
  id: ToolCategoryId;
  name: string;
  label: string;
  icon: string;
  color: string;
}

export interface ToolConfig {
  id: string;
  name: string;
  description: string;
  category: ToolCategoryId;
  icon: string;
  route: string;
}

const toolCategorySeeds = {
  developer: {
    name: 'Developer',
    label: '开发者工具',
    icon: 'code',
    color: '#2563eb',
    tools: [
      ['api-explorer', 'API Explorer', '调试 HTTP API 请求并查看响应。', 'api'],
      ['json-tool', 'JSON 工具', '格式化、压缩和校验 JSON，并在常见数据格式之间转换。', 'braces'],
    ],
  },
  converter: {
    name: 'Converter',
    label: '格式转换',
    icon: 'converter',
    color: '#0891b2',
    tools: [
      ['video-to-gif', '视频转GIF', '截取本地视频片段并转换为 GIF 动图。', 'video'],
      ['short-video-parser', '短视频解析', '解析短视频链接及其媒体信息。', 'link'],
    ],
  },
  text: {
    name: 'Text',
    label: '文本工具',
    icon: 'text',
    color: '#c2410c',
    tools: [
      ['ocr-recognition', 'OCR 识别', '识别图片中的文字并导出可编辑文本。', 'text-recognition'],
      ['special-symbols', '特殊符号', '快速查找、复制和组合常用特殊符号。', 'asterisk'],
      ['emoji', 'Emoji 表情', '查找、复制和使用 Emoji 表情符号。', 'mood-smile'],
    ],
  },
  language: {
    name: 'Language',
    label: '语言工具',
    icon: 'language',
    color: '#db2777',
    tools: [
      ['translation', '翻译', '在多种语言之间翻译文本内容。', 'language'],
      [
        'simplified-traditional-converter',
        '繁简互转',
        '在简体中文与繁体中文之间转换。',
        'language',
      ],
      ['chinese-pronunciation', '汉字标准发音', '查询汉字的标准读音与拼音。', 'writing'],
      ['chinese-stroke-order', '汉字笔顺', '查看汉字的笔画顺序与书写过程。', 'writing'],
    ],
  },
  date: {
    name: 'Date',
    label: '时间日期',
    icon: 'calendar',
    color: '#d97706',
    tools: [
      ['cron', 'Cron 表达式', '生成、解析并预览 Linux、Quartz 与 Hangfire Cron 表达式。', 'clock'],
    ],
  },
  image: {
    name: 'Image',
    label: '图片工具',
    icon: 'image',
    color: '#b42375',
    tools: [
      ['image-compress', '图片压缩', '降低图片体积，保留清晰画质。', 'file-zip'],
      ['image-convert', '图片格式转换', '转换 PNG、JPEG、WebP、ICO 与 SVG。', 'arrows-exchange'],
      ['image-resize', '图片尺寸调整', '按宽高、百分比或最大边批量缩放。', 'maximize'],
      ['image-crop', '图片裁剪', '自由比例、常用尺寸与精确导出。', 'crop'],
      ['images-to-pdf', '图片转 PDF', '多图排序并生成常用纸张 PDF。', 'pdf'],
      ['image-watermark', '图片添加水印', '添加文字、Logo、位置、旋转与平铺水印。', 'photo-edit'],
      ['merge-gif', '合并为 GIF', '设置帧率、画布、背景与循环。', 'video'],
      ['psd-viewer', 'PSD 查看', '本地解析 Photoshop 合成图并导出预览。', 'photoshop'],
      ['image-rounded-corners', '图片添加圆角', '统一或独立圆角，保留透明背景。', 'border-corner'],
      ['image-padding', '图片补边留白', '设置四边边距、纯色、透明或渐变背景。', 'photo'],
      ['image-color', '图片取色与主色提取', '在图片中精确取色，并提取主色调色板。', 'color-picker'],
    ],
  },
  pdf: {
    name: 'PDF',
    label: 'PDF 工具',
    icon: 'pdf',
    color: '#c2413d',
    tools: [
      ['merge-pdf', '合并 PDF', '按指定顺序将多个 PDF 合成一个文件。', 'files'],
      ['split-pdf', '拆分 PDF', '按页、范围或自定义分组拆分 PDF。', 'scissors'],
      ['organize-pdf', '整理 PDF 页面', '拖拽排序、复制、旋转或移除页面。', 'layout-grid'],
      ['pdf-to-images', 'PDF 转图片', '将 PDF 页面导出为 PNG、JPG 或 WebP。', 'photo-down'],
      ['watermark-pdf', 'PDF 添加水印', '添加可定制的文字或图片水印。', 'rubber-stamp'],
      ['add-pdf-page-numbers', 'PDF 添加页码', '自定义格式、位置和范围添加页码。', 'hash'],
      ['delete-pdf-pages', '删除 PDF 页面', '选择不需要的页面并导出新的 PDF。', 'trash'],
      ['extract-pdf-pages', '提取 PDF 页面', '将选中页面合并或分别导出。', 'file-export'],
      ['rotate-pdf', '旋转 PDF', '旋转全部或指定页面并保存结果。', 'rotate'],
      ['pdf-metadata', 'PDF 元数据', '查看、编辑或清除 PDF 基础信息。', 'file-settings'],
    ],
  },
  design: {
    name: 'Design',
    label: '设计工具',
    icon: 'palette',
    color: '#9333ea',
    tools: [['color-picker', '颜色选择器', '可视化生成设计参数，并实时预览效果。', 'color-picker']],
  },
  generator: {
    name: 'Generator',
    label: '生成工具',
    icon: 'sparkles',
    color: '#65a30d',
    tools: [['qr-code', 'QR Code', '在浏览器本地生成或识别 QR Code。', 'qrcode']],
  },
  misc: {
    name: 'Misc',
    label: '其他工具',
    icon: 'tools',
    color: '#64748B',
    tools: [
      ['keyboard-visualizer', '键盘可视化', '展示按键、组合键与键盘布局。', 'keyboard'],
      ['calculation-paper', '计算稿纸', '从混合文本中提取数字并自动计算与汇总。', 'calculator'],
      ['periodic-table', '元素周期表', '交互式查看 118 个化学元素。', 'flask'],
      ['answer-book', '答案之书', '默念一个问题，翻开书页寻找答案。', 'book'],
    ],
  },
  games: {
    name: 'Games',
    label: '趣味游戏',
    icon: 'gamepad',
    color: '#7c3aed',
    tools: [['emoji-match', '表情符号消除', '在限时挑战中找出唯一成对的表情符号。', 'mood-smile']],
  },
} as const satisfies Record<string, ToolCategorySeed>;

export type ToolCategoryId = keyof typeof toolCategorySeeds;

const toolCategoryIds = Object.keys(toolCategorySeeds) as ToolCategoryId[];

export const toolCategories: ToolCategoryConfig[] = toolCategoryIds.map((id) => {
  const { name, label, icon, color } = toolCategorySeeds[id];
  return { id, name, label, icon, color };
});

export const toolCategoryMap = new Map<ToolCategoryId, ToolCategoryConfig>(
  toolCategories.map((category) => [category.id, category]),
);

function createTool(
  categoryId: ToolCategoryId,
  [id, name, description, icon]: ToolSeed,
): ToolConfig {
  return {
    id,
    name,
    description,
    category: categoryId,
    icon,
    route: `/tools/${id}`,
  };
}

export const tools: ToolConfig[] = toolCategories.flatMap((category) =>
  toolCategorySeeds[category.id].tools.map((seed) => createTool(category.id, seed)),
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
    const category = toolCategoryMap.get(tool.category);
    const searchable = [tool.id, tool.name, tool.description, category?.name, category?.label]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase();

    return terms.every((term) => searchable.includes(term));
  });
}
