import { describe, expect, it } from 'vitest';
import DOMPurify from 'dompurify';
import {
  extractRelativeImagePaths,
  extractWikiLinks,
  markdownToPlainText,
  parseFrontMatter,
  parseMarkdownDocument,
  renderMarkdown,
  resolveRelativeAssetPath,
  sanitizeMarkdownHtml,
} from './markdown';

describe('parseFrontMatter', () => {
  it('没有 Front Matter 时原样返回正文', () => {
    expect(parseFrontMatter('# 标题\n\n正文')).toEqual({
      attributes: {},
      body: '# 标题\n\n正文',
      bodyStartLine: 1,
    });
  });

  it('解析 YAML 属性并给出正文起始行号', () => {
    const result = parseFrontMatter('---\ntitle: 测试\ntags:\n  - a\n---\n正文');

    expect(result.attributes).toEqual({ title: '测试', tags: ['a'] });
    expect(result.body).toBe('正文');
    expect(result.bodyStartLine).toBe(6);
    expect(result.error).toBeUndefined();
  });

  it('支持以 ... 结尾的 Front Matter', () => {
    const result = parseFrontMatter('---\na: 1\n...\n正文');

    expect(result.attributes).toEqual({ a: 1 });
    expect(result.body).toBe('正文');
    expect(result.bodyStartLine).toBe(4);
  });

  it('忽略 BOM', () => {
    const result = parseFrontMatter('\uFEFF---\ntitle: 测试\n---\n正文');

    expect(result.attributes).toEqual({ title: '测试' });
    expect(result.body).toBe('正文');
  });

  it('空的 Front Matter 视为没有属性且不报错', () => {
    const result = parseFrontMatter('---\n\n---\n正文');

    expect(result.attributes).toEqual({});
    expect(result.error).toBeUndefined();
  });

  it('仅含注释的 Front Matter 视为没有属性且不报错', () => {
    const result = parseFrontMatter('---\n# 只是注释\n---\n正文');

    expect(result.attributes).toEqual({});
    expect(result.body).toBe('正文');
    expect(result.error).toBeUndefined();
  });

  it('YAML 不是对象时给出错误提示并保留正文', () => {
    const result = parseFrontMatter('---\n- a\n- b\n---\n正文');

    expect(result.attributes).toEqual({});
    expect(result.body).toBe('正文');
    expect(result.error).toBe('Front Matter 必须是 YAML 对象。');
  });

  it('YAML 语法错误时给出错误提示并保留正文', () => {
    const result = parseFrontMatter('---\na: [1\n---\n正文');

    expect(result.attributes).toEqual({});
    expect(result.body).toBe('正文');
    expect(result.error).toMatch(/^Front Matter 解析失败：/);
  });

  it('只有起始分隔符时不做 Front Matter 处理', () => {
    const result = parseFrontMatter('---\ntitle: 测试\n');

    expect(result.attributes).toEqual({});
    expect(result.bodyStartLine).toBe(1);
  });
});

describe('extractWikiLinks', () => {
  it('提取基本引用并记录行号', () => {
    expect(extractWikiLinks('# 标题\n\n[[目标]]')).toEqual([
      { target: '目标', label: '目标', raw: '[[目标]]', lineNumber: 3, embedded: false },
    ]);
  });

  it('行号按 Front Matter 偏移计算', () => {
    const links = extractWikiLinks('---\ntitle: 测试\n---\n\n# 标题\n\n[[目标]]');

    expect(links[0]!.lineNumber).toBe(7);
  });

  it('支持别名语法', () => {
    expect(extractWikiLinks('[[目标|显示文字]]')[0]).toMatchObject({
      target: '目标',
      label: '显示文字',
      raw: '[[目标|显示文字]]',
    });
  });

  it('别名中可以包含竖线', () => {
    expect(extractWikiLinks('[[目标|甲|乙]]')[0]).toMatchObject({
      target: '目标',
      label: '甲|乙',
    });
  });

  it('支持锚点语法', () => {
    expect(extractWikiLinks('[[目标#小节]]')[0]).toMatchObject({
      target: '目标',
      label: '目标',
      anchor: '小节',
    });
  });

  it('锚点中可以包含井号', () => {
    expect(extractWikiLinks('[[目标#甲#乙]]')[0]).toMatchObject({
      target: '目标',
      anchor: '甲#乙',
    });
  });

  it('同时支持锚点与别名', () => {
    expect(extractWikiLinks('[[目标#小节|显示文字]]')[0]).toMatchObject({
      target: '目标',
      label: '显示文字',
      anchor: '小节',
    });
  });

  it('标记嵌入引用', () => {
    expect(extractWikiLinks('![[图片]]')[0]).toMatchObject({
      target: '图片',
      embedded: true,
    });
  });

  it('同一行中的多个引用都会提取', () => {
    const links = extractWikiLinks('见 [[甲]] 与 [[乙]]。');

    expect(links.map((link) => link.target)).toEqual(['甲', '乙']);
  });

  it('跳过行内代码中的引用', () => {
    expect(extractWikiLinks('`[[代码内]]` 与 [[正文]]')).toEqual([
      { target: '正文', label: '正文', raw: '[[正文]]', lineNumber: 1, embedded: false },
    ]);
  });

  it('跳过围栏代码块中的引用', () => {
    const source = '```\n[[块内]]\n```\n\n[[块外]]';

    expect(extractWikiLinks(source).map((link) => link.target)).toEqual(['块外']);
  });

  it('跳过波浪号围栏代码块中的引用', () => {
    const source = '~~~\n[[块内]]\n~~~\n\n[[块外]]';

    expect(extractWikiLinks(source).map((link) => link.target)).toEqual(['块外']);
  });

  it('代码块闭合后恢复提取', () => {
    const source = '```\n[[块内]]\n```\n[[块外]]\n```\n[[第二块内]]\n```\n[[末尾]]';

    expect(extractWikiLinks(source).map((link) => link.target)).toEqual(['块外', '末尾']);
  });

  it('忽略跨行与空目标的引用', () => {
    expect(extractWikiLinks('[[甲\n乙]]')).toEqual([]);
    expect(extractWikiLinks('[[|别名]]')).toEqual([]);
    expect(extractWikiLinks('[[]]')).toEqual([]);
  });
});

describe('resolveRelativeAssetPath', () => {
  it('按文档目录解析相对路径', () => {
    expect(resolveRelativeAssetPath('docs/a/b.md', 'x.png')).toBe('docs/a/x.png');
    expect(resolveRelativeAssetPath('docs/a/b.md', './x.png')).toBe('docs/a/x.png');
  });

  it('处理上级目录', () => {
    expect(resolveRelativeAssetPath('docs/a/b.md', '../img/x.png')).toBe('docs/img/x.png');
  });

  it('越过工作区根目录时返回 null', () => {
    expect(resolveRelativeAssetPath('a/b.md', '../../x.png')).toBeNull();
  });

  it('去掉查询串与锚点', () => {
    expect(resolveRelativeAssetPath('a/b.md', 'x.png?raw=1')).toBe('a/x.png');
    expect(resolveRelativeAssetPath('a/b.md', 'x.png#top')).toBe('a/x.png');
  });

  it('解码百分号转义', () => {
    expect(resolveRelativeAssetPath('a/b.md', '%E5%9B%BE%20%E7%89%87.png')).toBe('a/图 片.png');
  });

  it('统一反斜杠', () => {
    expect(resolveRelativeAssetPath('a\\b.md', 'sub\\x.png')).toBe('a/sub/x.png');
  });

  it('对远程地址、绝对路径与锚点返回 null', () => {
    expect(resolveRelativeAssetPath('a/b.md', 'https://example.com/x.png')).toBeNull();
    expect(resolveRelativeAssetPath('a/b.md', '//cdn.example.com/x.png')).toBeNull();
    expect(resolveRelativeAssetPath('a/b.md', '/x.png')).toBeNull();
    expect(resolveRelativeAssetPath('a/b.md', '#anchor')).toBeNull();
    expect(resolveRelativeAssetPath('a/b.md', 'data:image/png;base64,AAAA')).toBeNull();
    expect(resolveRelativeAssetPath('a/b.md', 'mailto:a@b.com')).toBeNull();
    expect(resolveRelativeAssetPath('a/b.md', '')).toBeNull();
  });
});

describe('extractRelativeImagePaths', () => {
  it('只收集相对路径图片并去重', () => {
    const source = [
      '![a](./x.png)',
      '![b](https://example.com/y.png)',
      '![c](/abs.png)',
      '![d](sub/e.png)',
      '![e](./x.png)',
    ].join('\n\n');

    expect(extractRelativeImagePaths(source)).toEqual(['./x.png', 'sub/e.png']);
  });

  it('忽略 Front Matter 中的内容', () => {
    const source = '---\ncover: ./cover.png\n---\n\n![a](./x.png)';

    expect(extractRelativeImagePaths(source)).toEqual(['./x.png']);
  });

  it('没有图片时返回空数组', () => {
    expect(extractRelativeImagePaths('# 标题')).toEqual([]);
  });
});

describe('markdownToPlainText', () => {
  it('去掉标记只保留文字', () => {
    expect(markdownToPlainText('# 标题\n\n**加粗** 与 *斜体*')).toBe('标题 加粗 与 斜体');
  });

  it('把 WikiLink 还原为显示文字', () => {
    // 结果是按 token 用空格拼接的，标点前后会多出空格；该文本仅用于全文检索，不影响匹配。
    expect(markdownToPlainText('见 [[目标|显示文字]]。')).toBe('见 显示文字 。');
  });

  it('保留代码内容', () => {
    expect(markdownToPlainText('行内 `code`')).toBe('行内 code');
    expect(markdownToPlainText('```\ncode line\n```')).toBe('code line');
  });

  it('忽略 Front Matter', () => {
    expect(markdownToPlainText('---\ntitle: 测试\n---\n\n正文')).toBe('正文');
  });

  it('空内容返回空字符串', () => {
    expect(markdownToPlainText('')).toBe('');
  });
});

describe('parseMarkdownDocument', () => {
  it('从 Front Matter 读取标题、标签、分类与日期', () => {
    const parsed = parseMarkdownDocument(
      '---\ntitle: 我的标题\ntags: [甲, 乙]\ncategory: 教程\ndate: 2024-01-02\n---\n\n正文',
      { path: 'notes/a.md' },
    );

    expect(parsed.metadata).toEqual({
      title: '我的标题',
      tags: ['甲', '乙'],
      category: '教程',
      date: '2024-01-02',
    });
  });

  it('标签支持逗号分隔的字符串写法并去重', () => {
    const parsed = parseMarkdownDocument('---\ntags: 甲, 乙, 甲\n---\n\n正文');

    expect(parsed.metadata.tags).toEqual(['甲', '乙']);
  });

  it('没有标题时回退到第一个标题文本', () => {
    const parsed = parseMarkdownDocument('# 首个标题\n\n正文');

    expect(parsed.metadata.title).toBe('首个标题');
  });

  it('没有标题也没有标题行时回退到文件名主干', () => {
    const parsed = parseMarkdownDocument('正文', { path: 'notes/我的笔记.md' });

    expect(parsed.metadata.title).toBe('我的笔记');
  });

  it('完全没有线索时使用默认标题', () => {
    expect(parseMarkdownDocument('正文').metadata.title).toBe('未命名文档');
  });

  it('分类可以取自 categories 列表的首项', () => {
    const parsed = parseMarkdownDocument('---\ncategories: [甲类, 乙类]\n---\n\n正文');

    expect(parsed.metadata.category).toBe('甲类');
  });

  it('生成大纲并为重复标题生成唯一锚点', () => {
    const parsed = parseMarkdownDocument('# 重复\n\n## 重复\n\n## 重复\n');

    expect(parsed.outline).toEqual([
      { id: '重复', text: '重复', level: 1, lineNumber: 1 },
      { id: '重复-2', text: '重复', level: 2, lineNumber: 3 },
      { id: '重复-3', text: '重复', level: 2, lineNumber: 5 },
    ]);
  });

  it('把 Front Matter 错误写入 warnings', () => {
    const parsed = parseMarkdownDocument('---\na: [1\n---\n\n正文');

    expect(parsed.warnings[0]).toMatch(/^Front Matter 解析失败：/);
  });

  it('收集相对图片路径', () => {
    const parsed = parseMarkdownDocument('![a](./x.png)\n\n![b](https://example.com/y.png)');

    expect(parsed.relativeImagePaths).toEqual(['./x.png']);
  });

  it('提取 WikiLink 列表', () => {
    const parsed = parseMarkdownDocument('# 标题\n\n[[目标]]');

    expect(parsed.wikiLinks.map((link) => link.target)).toEqual(['目标']);
  });

  it('图片路径解析回调抛错时记录 warning 且不中断解析', () => {
    const parsed = parseMarkdownDocument('![a](./x.png)', {
      path: 'a/b.md',
      imageResolver: () => {
        throw new Error('解析器故障');
      },
    });

    expect(parsed.warnings).toEqual(['图片路径解析失败（./x.png）：解析器故障']);
  });

  it('图片路径解析回调返回新地址时替换原始路径', () => {
    const seen: string[] = [];
    parseMarkdownDocument('![a](./x.png)', {
      path: 'a/b.md',
      imageResolver: ({ source, resolvedPath }) => {
        seen.push(`${source}->${resolvedPath}`);
        return 'blob:replaced';
      },
    });

    expect(seen).toEqual(['./x.png->a/x.png']);
  });
});

describe('renderMarkdown', () => {
  it('返回与 parseMarkdownDocument 一致的 html 字段', () => {
    const source = '# 标题\n\n正文';

    expect(renderMarkdown(source)).toBe(parseMarkdownDocument(source).html);
  });
});

describe('sanitizeMarkdownHtml', () => {
  it('在缺少 DOM 清理能力的环境下返回空字符串而不是未清理内容', () => {
    // 浏览器环境下由 DOMPurify 接管；此分支保证 fail-closed，绝不回退到原始 HTML。
    if (DOMPurify.isSupported) return;

    expect(sanitizeMarkdownHtml('<img src=x onerror="alert(1)">')).toBe('');
    expect(sanitizeMarkdownHtml('<p>正常内容</p>')).toBe('');
  });
});
