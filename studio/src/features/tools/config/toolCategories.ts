export const TOOL_CATEGORY_IDS = [
  'developer',
  'converter',
  'text',
  'language',
  'date',
  'image',
  'pdf',
  'design',
  'generator',
  'misc',
  'games',
] as const;

export type ToolCategoryId = (typeof TOOL_CATEGORY_IDS)[number];

export interface ToolCategoryConfig {
  id: ToolCategoryId;
  name: string;
  label: string;
  icon: string;
  accent: string;
}

export const toolCategories: ToolCategoryConfig[] = [
  {
    id: 'developer',
    name: 'Developer',
    label: '开发者工具',
    icon: 'code',
    accent: '#2563eb',
  },
  {
    id: 'converter',
    name: 'Converter',
    label: '格式转换',
    icon: 'converter',
    accent: '#0891b2',
  },
  {
    id: 'text',
    name: 'Text',
    label: '文本工具',
    icon: 'text',
    accent: '#c2410c',
  },
  {
    id: 'language',
    name: 'Language',
    label: '语言工具',
    icon: 'language',
    accent: '#db2777',
  },
  {
    id: 'date',
    name: 'Date',
    label: '时间日期',
    icon: 'calendar',
    accent: '#d97706',
  },
  {
    id: 'image',
    name: 'Image',
    label: '图片工具',
    icon: 'image',
    accent: '#b42375',
  },
  {
    id: 'pdf',
    name: 'PDF',
    label: 'PDF 工具',
    icon: 'pdf',
    accent: '#c2413d',
  },
  {
    id: 'design',
    name: 'Design',
    label: '设计工具',
    icon: 'palette',
    accent: '#9333ea',
  },
  {
    id: 'generator',
    name: 'Generator',
    label: '生成工具',
    icon: 'sparkles',
    accent: '#65a30d',
  },
  {
    id: 'misc',
    name: 'Misc',
    label: '其他工具',
    icon: 'tools',
    accent: '#64748B',
  },
  {
    id: 'games',
    name: 'Games',
    label: '趣味游戏',
    icon: 'gamepad',
    accent: '#7c3aed',
  },
];

export const toolCategoryMap = new Map(toolCategories.map((category) => [category.id, category]));

export function isToolCategoryId(value: string): value is ToolCategoryId {
  return TOOL_CATEGORY_IDS.includes(value as ToolCategoryId);
}
