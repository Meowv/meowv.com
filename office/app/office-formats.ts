export type OfficeFormat = 'docx' | 'xlsx' | 'pptx' | 'csv';

export interface FormatDetails {
  extension: OfficeFormat;
  route: string;
  badge: string;
  className: string;
  name: string;
  shortName: string;
  description: string;
  limitation: string;
  canCreate: boolean;
}

export const formats: Record<OfficeFormat, FormatDetails> = {
  docx: {
    extension: 'docx',
    route: '/doc',
    badge: 'W',
    className: 'word',
    name: 'Word 文档',
    shortName: 'Word',
    description: '打开、新建和保存 DOCX 文档，保留常见文字、段落、表格、图片和页面布局。',
    limitation: '复杂字体、宏、ActiveX、密码保护或桌面插件可能不受支持。',
    canCreate: true,
  },
  xlsx: {
    extension: 'xlsx',
    route: '/xls',
    badge: 'X',
    className: 'excel',
    name: 'Excel 表格',
    shortName: 'Excel',
    description: '打开、新建和保存 XLSX 表格，适合处理公式、图表与多工作表文件。',
    limitation: '复杂宏、外部数据连接和部分高级功能可能无法完整保留。',
    canCreate: true,
  },
  pptx: {
    extension: 'pptx',
    route: '/ppt',
    badge: 'P',
    className: 'powerpoint',
    name: 'PowerPoint 演示文稿',
    shortName: 'PowerPoint',
    description: '打开、新建和保存 PPTX 演示文稿，支持本地编辑多页幻灯片。',
    limitation: '动画、嵌入媒体和桌面插件效果需在保存后重新打开确认。',
    canCreate: true,
  },
  csv: {
    extension: 'csv',
    route: '/csv',
    badge: 'C',
    className: 'csv',
    name: 'CSV 数据',
    shortName: 'CSV',
    description: '打开并编辑 CSV 纯数据文件，完成后可保存回本地设备。',
    limitation: 'CSV 不保留样式、图片、图表和多个工作表；需要完整内容请另存为 XLSX。',
    canCreate: false,
  },
};

export const formatList = Object.values(formats);
