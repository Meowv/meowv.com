import { beforeEach, describe, expect, it } from 'vitest';
import {
  featureForFile,
  handoffFile,
  routeForFeature,
  useFileHandoff,
  type StudioFeature,
} from './file-handoff';

function fileOf(name: string, type = ''): File {
  return new File(['内容'], name, { type });
}

beforeEach(() => {
  useFileHandoff().currentHandoff.value = null;
});

describe('featureForFile', () => {
  it('按扩展名判定图片类文件', () => {
    for (const extension of ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'heic', 'tif', 'svg']) {
      expect(featureForFile(fileOf(`a.${extension}`))).toBe('image');
    }
  });

  it('把 PSD 单独归入 psd 功能', () => {
    expect(featureForFile(fileOf('a.psd'))).toBe('psd');
  });

  it('把 Markdown 与纯文本归入 markdown 功能', () => {
    expect(featureForFile(fileOf('a.md'))).toBe('markdown');
    expect(featureForFile(fileOf('a.markdown'))).toBe('markdown');
    expect(featureForFile(fileOf('a.txt'))).toBe('markdown');
  });

  it('识别 Mermaid 的三种扩展名写法', () => {
    expect(featureForFile(fileOf('a.mmd'))).toBe('mermaid');
    expect(featureForFile(fileOf('a.mermaid'))).toBe('mermaid');
    expect(featureForFile(fileOf('a.mermaid.json'))).toBe('mermaid');
  });

  it('识别 PDF、Office、白板、思维导图、书籍与数据库文件', () => {
    expect(featureForFile(fileOf('a.pdf'))).toBe('pdf');
    expect(featureForFile(fileOf('a.docx'))).toBe('office');
    expect(featureForFile(fileOf('a.xlsx'))).toBe('office');
    expect(featureForFile(fileOf('a.pptx'))).toBe('office');
    expect(featureForFile(fileOf('a.csv'))).toBe('office');
    expect(featureForFile(fileOf('a.excalidraw'))).toBe('draw');
    expect(featureForFile(fileOf('a.mind'))).toBe('mind');
    expect(featureForFile(fileOf('a.epub'))).toBe('book');
    expect(featureForFile(fileOf('a.cbz'))).toBe('book');
    expect(featureForFile(fileOf('a.mobi'))).toBe('book');
    expect(featureForFile(fileOf('a.db'))).toBe('sqlite');
    expect(featureForFile(fileOf('a.sqlite'))).toBe('sqlite');
  });

  it('扩展名大小写不敏感', () => {
    expect(featureForFile(fileOf('A.PNG'))).toBe('image');
    expect(featureForFile(fileOf('A.Md'))).toBe('markdown');
  });

  it('JSON 与未收录的扩展名返回 null', () => {
    expect(featureForFile(fileOf('a.json'))).toBeNull();
    expect(featureForFile(fileOf('a.xyz'))).toBeNull();
  });

  it('没有扩展名时返回 null', () => {
    expect(featureForFile(fileOf('README'))).toBeNull();
  });
});

describe('routeForFeature', () => {
  it('把每个功能映射到默认路由', () => {
    const expected: Record<StudioFeature, string> = {
      image: '/tools/image-compress',
      psd: '/tools/psd-viewer',
      markdown: '/markdown',
      mermaid: '/mermaid',
      json: '/tools/json',
      pdf: '/tools/merge-pdf',
      office: '/office',
      draw: '/draw',
      mind: '/mind',
      notes: '/notes',
      book: '/books',
      sqlite: '/tools/sqlite',
    };

    for (const [feature, route] of Object.entries(expected)) {
      expect(routeForFeature(feature as StudioFeature)).toBe(route);
    }
  });

  it('Office 文件按扩展名进入对应格式页', () => {
    expect(routeForFeature('office', fileOf('a.docx'))).toBe('/office/doc');
    expect(routeForFeature('office', fileOf('a.xlsx'))).toBe('/office/xls');
    expect(routeForFeature('office', fileOf('a.pptx'))).toBe('/office/ppt');
    expect(routeForFeature('office', fileOf('a.csv'))).toBe('/office/csv');
  });

  it('Office 扩展名无法识别时回退到通用入口', () => {
    expect(routeForFeature('office', fileOf('a.xyz'))).toBe('/office');
  });

  it('只有 Office 会因文件类型改变路由', () => {
    expect(routeForFeature('markdown', fileOf('a.md'))).toBe('/markdown');
    expect(routeForFeature('image', fileOf('a.png'))).toBe('/tools/image-compress');
  });
});

describe('handoffFile', () => {
  it('按文件类型创建待交接记录', () => {
    const file = fileOf('a.png');
    const handoff = handoffFile(file);

    expect(handoff).toMatchObject({ feature: 'image', file });
    expect(typeof handoff?.createdAt).toBe('number');
  });

  it('无法识别的文件返回 null 且不改变现有交接', () => {
    const pending = handoffFile(fileOf('a.png'));

    expect(handoffFile(fileOf('a.xyz'))).toBeNull();
    expect(useFileHandoff().currentHandoff.value).toBe(pending);
  });

  it('显式传入 null 时同样返回 null', () => {
    expect(handoffFile(fileOf('a.png'), null)).toBeNull();
  });

  it('可以显式指定目标功能', () => {
    expect(handoffFile(fileOf('a.bin'), 'draw')).toMatchObject({ feature: 'draw' });
  });

  it('只在提供句柄时记录句柄字段', () => {
    const handle = {} as FileSystemFileHandle;

    expect(handoffFile(fileOf('a.png'), 'draw')).not.toHaveProperty('handle');
    expect(handoffFile(fileOf('a.png'), 'draw', handle)).toMatchObject({ handle });
  });

  it('后一次交接覆盖前一次', () => {
    handoffFile(fileOf('a.png'));
    const latest = handoffFile(fileOf('b.md'));

    expect(useFileHandoff().currentHandoff.value).toBe(latest);
  });
});

describe('useFileHandoff', () => {
  it('按功能取用交接记录并在取用后清空', () => {
    const { takeHandoff, currentHandoff } = useFileHandoff();
    const handoff = handoffFile(fileOf('a.png'));

    expect(takeHandoff('image')).toBe(handoff);
    expect(currentHandoff.value).toBeNull();
    expect(takeHandoff('image')).toBeNull();
  });

  it('功能不匹配时返回 null 且保留待取用的记录', () => {
    const { takeHandoff, currentHandoff } = useFileHandoff();
    const handoff = handoffFile(fileOf('a.png'));

    expect(takeHandoff('pdf')).toBeNull();
    expect(currentHandoff.value).toBe(handoff);
  });

  it('take 直接返回文件对象', () => {
    const { take } = useFileHandoff();
    const file = fileOf('a.png');
    handoffFile(file);

    expect(take('image')).toBe(file);
    expect(take('image')).toBeNull();
  });

  it('没有待交接内容时返回 null', () => {
    const { take, takeHandoff } = useFileHandoff();

    expect(takeHandoff('image')).toBeNull();
    expect(take('image')).toBeNull();
  });
});
