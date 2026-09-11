export type ToolIconSource = string | { url: string };

interface ToolSeed {
  id: string;
  name: string;
  description: string;
  icon: ToolIconSource;
}

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

interface ToolConfigBase {
  id: string;
  name: string;
  description: string;
  category: ToolCategoryId;
  icon: ToolIconSource;
}

export type InternalToolConfig = ToolConfigBase & {
  type: 'tool';
  route: string;
  url?: never;
};

export type LinkToolConfig = ToolConfigBase & {
  type: 'link';
  route?: never;
  url: string;
};

export type ToolConfig = InternalToolConfig | LinkToolConfig;

const toolCategorySeeds = {
  developer: {
    name: 'Developer',
    label: '开发工具',
    icon: 'code',
    color: 'var(--tools-category-developer)',
    tools: [
      {
        id: 'json',
        name: 'JSON 编辑器',
        description:
          '编辑、格式化和折叠 JSON，支持 XML/YAML 粘贴转换、注释清理、压缩复制与 JS 过滤。',
        icon: 'braces',
      },
      {
        id: 'text-json-diff',
        name: '文本 / JSON 对比',
        description: '并排对比文本或 JSON 内容，高亮显示新增、删除与修改差异。',
        icon: 'file-diff',
      },
      {
        id: 'sqlite',
        name: 'SQLite Online',
        description: '在浏览器中打开、查询和编辑 SQLite 数据库，数据不会上传。',
        icon: 'database',
      },
      {
        id: 'encoding-converter',
        name: '编码转换',
        description: '支持 Base64、URL、Unicode、HTML Entity 与 Hex 编码转换。',
        icon: 'binary',
      },
    ],
  },
  language: {
    name: 'Language',
    label: '语言工具',
    icon: 'language',
    color: 'var(--tools-category-language)',
    tools: [
      {
        id: 'translation',
        name: '中英翻译',
        description: '在中文与英文之间翻译文本内容。',
        icon: 'language',
      },
      {
        id: 'simplified-traditional-converter',
        name: '繁简互转',
        description: '在简体中文与繁体中文之间转换。',
        icon: 'switch-horizontal',
      },
      {
        id: 'chinese-pronunciation',
        name: '汉字标准发音',
        description: '查询汉字的标准读音与拼音。',
        icon: 'volume',
      },
      {
        id: 'chinese-stroke-order',
        name: '汉字笔顺',
        description: '查看汉字的笔画顺序与书写过程。',
        icon: 'writing',
      },
    ],
  },
  image: {
    name: 'Image',
    label: '图片工具',
    icon: 'image',
    color: 'var(--tools-category-image)',
    tools: [
      {
        id: 'image-compress',
        name: '图片压缩',
        description: '降低图片体积，保留清晰画质。',
        icon: 'file-zip',
      },
      {
        id: 'image-convert',
        name: '图片格式转换',
        description: '转换 PNG、JPEG、WebP、ICO 与 SVG。',
        icon: 'arrows-exchange',
      },
      {
        id: 'image-resize',
        name: '图片尺寸调整',
        description: '按宽高、百分比或最大边批量缩放。',
        icon: 'maximize',
      },
      {
        id: 'image-crop',
        name: '图片裁剪',
        description: '自由比例、常用尺寸与精确导出。',
        icon: 'crop',
      },
      {
        id: 'image-merge',
        name: '图片合并',
        description: '自由拖动、缩放和排列多张图片，合并导出为一张图片。',
        icon: 'photo-edit',
      },
      {
        id: 'images-to-pdf',
        name: '图片转 PDF',
        description: '多图排序并生成常用纸张 PDF。',
        icon: 'pdf',
      },
      {
        id: 'image-watermark',
        name: '图片添加水印',
        description: '添加文字、Logo、位置、旋转与平铺水印。',
        icon: 'photo-edit',
      },
      {
        id: 'merge-gif',
        name: '合并为 GIF',
        description: '设置帧率、画布、背景与循环。',
        icon: 'video',
      },
      {
        id: 'video-to-gif',
        name: '视频转 GIF',
        description: '截取本地视频片段，优化色彩并转换为 GIF 动图。',
        icon: 'video',
      },
      {
        id: 'psd-viewer',
        name: 'PSD 查看',
        description: '本地解析 Photoshop 合成图并导出预览。',
        icon: 'photoshop',
      },
      {
        id: 'image-rounded-corners',
        name: '图片添加圆角',
        description: '统一或独立圆角，保留透明背景。',
        icon: 'border-corner',
      },
      {
        id: 'image-padding',
        name: '图片补边留白',
        description: '设置四边边距、纯色、透明或渐变背景。',
        icon: 'photo',
      },
      {
        id: 'image-color',
        name: '图片取色与主色提取',
        description: '在图片中精确取色，并提取主色调色板。',
        icon: 'color-picker',
      },
    ],
  },
  pdf: {
    name: 'PDF',
    label: 'PDF 工具',
    icon: 'pdf',
    color: 'var(--tools-category-pdf)',
    tools: [
      {
        id: 'merge-pdf',
        name: '合并 PDF',
        description: '按指定顺序将多个 PDF 合成一个文件。',
        icon: 'files',
      },
      {
        id: 'split-pdf',
        name: '拆分 PDF',
        description: '按页、范围或自定义分组拆分 PDF。',
        icon: 'scissors',
      },
      {
        id: 'organize-pdf',
        name: '整理 PDF 页面',
        description: '拖拽排序、复制、旋转或移除页面。',
        icon: 'layout-grid',
      },
      {
        id: 'pdf-to-images',
        name: 'PDF 转图片',
        description: '将 PDF 页面导出为 PNG、JPG 或 WebP。',
        icon: 'photo-down',
      },
      {
        id: 'watermark-pdf',
        name: 'PDF 添加水印',
        description: '添加可定制的文字或图片水印。',
        icon: 'rubber-stamp',
      },
      {
        id: 'add-pdf-page-numbers',
        name: 'PDF 添加页码',
        description: '自定义格式、位置和范围添加页码。',
        icon: 'hash',
      },
      {
        id: 'delete-pdf-pages',
        name: '删除 PDF 页面',
        description: '选择不需要的页面并导出新的 PDF。',
        icon: 'trash',
      },
      {
        id: 'extract-pdf-pages',
        name: '提取 PDF 页面',
        description: '将选中页面合并或分别导出。',
        icon: 'file-export',
      },
      {
        id: 'rotate-pdf',
        name: '旋转 PDF',
        description: '旋转全部或指定页面并保存结果。',
        icon: 'rotate',
      },
      {
        id: 'pdf-metadata',
        name: 'PDF 元数据',
        description: '查看、编辑或清除 PDF 基础信息。',
        icon: 'file-settings',
      },
    ],
  },
  misc: {
    name: 'Misc',
    label: '其他工具',
    icon: 'tools',
    color: 'var(--tools-category-misc)',
    tools: [
      {
        id: 'calendar',
        name: '日历',
        description: '支持年、月、周、日视图，查看农历、中国节日和二十四节气。',
        icon: 'calendar',
      },
      {
        id: 'color-picker',
        name: '颜色选择器',
        description: '在 HEX、RGB、RGBA、HSL、HSLA、HSV 与 CMYK 之间实时转换。',
        icon: 'color-picker',
      },
      {
        id: 'qr-code',
        name: 'QR Code',
        description: '二维码生成与识别。',
        icon: 'qrcode',
      },
      {
        id: 'special-symbols',
        name: '特殊符号',
        description: '按分类查找并复制特殊符号、字符和 Emoji。',
        icon: 'asterisk',
      },
      {
        id: 'keyboard-visualizer',
        name: '键盘可视化',
        description: '机械键盘按键测试、组合键展示与 RGB 灯效体验。',
        icon: 'keyboard',
      },
      {
        id: 'calculation-paper',
        name: '计算稿纸',
        description: '从混合文本中提取数字并自动计算与汇总。',
        icon: 'calculator',
      },
      {
        id: 'periodic-table',
        name: '元素周期表',
        description: '交互式查看 118 个化学元素。',
        icon: 'flask',
      },
      {
        id: 'answer-book',
        name: '答案之书',
        description: '默念一个问题，翻开书页寻找答案。',
        icon: 'book',
      },
      {
        id: 'cube-solver',
        name: '3D 魔方还原',
        description: '本地录入三阶魔方，校验状态并通过 3D 动画逐步完成还原。',
        icon: 'cube',
      },
    ],
  },
  games: {
    name: 'Games',
    label: '趣味游戏',
    icon: 'gamepad',
    color: 'var(--tools-category-games)',
    tools: [
      {
        id: 'emoji-match',
        name: '表情符号消除',
        description: '在限时挑战中找出唯一成对的表情符号。',
        icon: 'mood-smile',
      },
    ],
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

function createTool(categoryId: ToolCategoryId, seed: ToolSeed): InternalToolConfig {
  return {
    ...seed,
    category: categoryId,
    type: 'tool',
    route: `/tools/${seed.id}`,
  };
}

export const tools: InternalToolConfig[] = toolCategories.flatMap((category) =>
  toolCategorySeeds[category.id].tools.map((seed) => createTool(category.id, seed)),
);

export function getToolById(toolId: string): InternalToolConfig | undefined {
  return tools.find((tool) => tool.id === toolId);
}

export function getToolsByCategory(categoryId: ToolCategoryId): InternalToolConfig[] {
  return tools.filter((tool) => tool.category === categoryId);
}

export function searchTools(query: string, source: readonly ToolConfig[] = tools): ToolConfig[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [...source];

  return source.filter((tool) => {
    const category = toolCategoryMap.get(tool.category);
    const searchable = [tool.id, tool.name, tool.description, category?.name, category?.label]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase();

    return terms.every((term) => searchable.includes(term));
  });
}
