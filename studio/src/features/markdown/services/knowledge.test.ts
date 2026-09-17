import { describe, expect, it } from 'vitest';
import {
  buildBacklinks,
  buildKnowledgeGraph,
  countTags,
  documentKnowledgeId,
  resolveWikiLink,
  type KnowledgeDocument,
} from './knowledge';

function doc(path: string, title: string, content = '', tags?: string[]): KnowledgeDocument {
  return { path, title, content, ...(tags ? { tags } : {}) };
}

describe('documentKnowledgeId', () => {
  it('优先使用显式 id', () => {
    expect(documentKnowledgeId({ id: 'custom-id', path: 'a/b.md', title: '标题' })).toBe(
      'custom-id',
    );
  });

  it('忽略只有空白的 id', () => {
    expect(documentKnowledgeId({ id: '   ', path: 'a/b.md', title: '标题' })).toBe('a/b.md');
  });

  it('没有 id 时归一化工作区路径', () => {
    expect(documentKnowledgeId({ path: './a/../b/c.md', title: '标题' })).toBe('b/c.md');
    expect(documentKnowledgeId({ path: 'a//b/./c.md', title: '标题' })).toBe('a/b/c.md');
    expect(documentKnowledgeId({ path: 'a\\b\\c.md', title: '标题' })).toBe('a/b/c.md');
  });
});

describe('resolveWikiLink', () => {
  const documents = [
    doc('guide/intro.md', '入门'),
    doc('guide/setup.md', '配置'),
    doc('advanced.md', '进阶'),
    doc('a/note.md', '甲笔记'),
    doc('b/sub/x.md', '艾克斯'),
    doc('b/other.md', '其他'),
    doc('café.md', '咖啡馆'),
  ];

  it('按完整路径解析，自动补全 .md 扩展名', () => {
    expect(resolveWikiLink('guide/setup', documents)?.path).toBe('guide/setup.md');
    expect(resolveWikiLink('guide/setup.md', documents)?.path).toBe('guide/setup.md');
  });

  it('去掉前导斜杠与反斜杠差异后解析', () => {
    expect(resolveWikiLink('/guide/setup', documents)?.path).toBe('guide/setup.md');
    expect(resolveWikiLink('guide\\setup', documents)?.path).toBe('guide/setup.md');
  });

  it('按标题解析', () => {
    expect(resolveWikiLink('配置', documents)?.path).toBe('guide/setup.md');
  });

  it('按文件名主干解析', () => {
    expect(resolveWikiLink('advanced', documents)?.path).toBe('advanced.md');
  });

  it('解码百分号转义的目标', () => {
    expect(resolveWikiLink('caf%C3%A9', documents)?.path).toBe('café.md');
  });

  it('遇到非法百分号转义时保留原文而不是抛错', () => {
    expect(resolveWikiLink('a%ZZ', documents)).toBeUndefined();
  });

  it('直接匹配失败时按来源文档所在目录解析相对路径', () => {
    const source = doc('b/other.md', '其他');
    expect(resolveWikiLink('sub/x', documents, source)?.path).toBe('b/sub/x.md');
  });

  it('接受 WikiLink 对象形式的目标', () => {
    expect(resolveWikiLink({ target: 'guide/intro' }, documents)?.path).toBe('guide/intro.md');
  });

  it('空目标与无法匹配的目标返回 undefined', () => {
    expect(resolveWikiLink('   ', documents)).toBeUndefined();
    expect(resolveWikiLink('不存在的页面', documents)).toBeUndefined();
  });
});

describe('buildBacklinks', () => {
  it('为每篇文档建立索引，未被子引用的文档返回空数组', () => {
    const backlinks = buildBacklinks([doc('a.md', '甲', '见 [[b]]。'), doc('b.md', '乙')]);

    expect(Object.keys(backlinks).sort()).toEqual(['a.md', 'b.md']);
    expect(backlinks['a.md']).toEqual([]);
    expect(backlinks['b.md']).toHaveLength(1);
  });

  it('记录来源与目标的路径、标题和首次出现行号', () => {
    const backlinks = buildBacklinks([
      doc('a.md', '甲', '# 标题\n\n正文\n\n见 [[乙]]。'),
      doc('b.md', '乙'),
    ]);

    expect(backlinks['b.md']).toEqual([
      {
        sourceId: 'a.md',
        sourcePath: 'a.md',
        sourceTitle: '甲',
        targetId: 'b.md',
        targetPath: 'b.md',
        targetTitle: '乙',
        lineNumber: 5,
        mentions: [{ raw: '[[乙]]', lineNumber: 5 }],
      },
    ]);
  });

  it('把同一对文档的多次引用合并为一条记录并保留全部提及', () => {
    const backlinks = buildBacklinks([
      doc('a.md', '甲', '[[乙]]\n\n中间\n\n[[乙|别名]]'),
      doc('b.md', '乙'),
    ]);

    const entries = backlinks['b.md']!;
    expect(entries).toHaveLength(1);
    expect(entries[0]!.lineNumber).toBe(1);
    expect(entries[0]!.mentions).toEqual([
      { raw: '[[乙]]', lineNumber: 1 },
      { raw: '[[乙|别名]]', lineNumber: 5 },
    ]);
  });

  it('忽略嵌入引用与无法解析的引用', () => {
    const backlinks = buildBacklinks([
      doc('a.md', '甲', '![[乙]]\n\n[[不存在]]'),
      doc('b.md', '乙'),
    ]);

    expect(backlinks['b.md']).toEqual([]);
  });

  it('标题相同时按来源路径排序', () => {
    const backlinks = buildBacklinks([
      doc('c.md', '甲', '[[目标]]'),
      doc('a.md', '甲', '[[目标]]'),
      doc('b.md', '甲', '[[目标]]'),
      doc('target.md', '目标'),
    ]);

    expect(backlinks['target.md']!.map((entry) => entry.sourcePath)).toEqual([
      'a.md',
      'b.md',
      'c.md',
    ]);
  });

  it('按来源标题的中文拼音顺序排序', () => {
    const backlinks = buildBacklinks([
      doc('a.md', '乙', '[[目标]]'),
      doc('b.md', '甲', '[[目标]]'),
      doc('c.md', '丙', '[[目标]]'),
      doc('target.md', '目标'),
    ]);

    // 丙 bǐng < 甲 jiǎ < 乙 yǐ
    expect(backlinks['target.md']!.map((entry) => entry.sourceTitle)).toEqual(['丙', '甲', '乙']);
  });
});

describe('buildKnowledgeGraph', () => {
  const documents = [
    doc('a.md', '甲', '见 [[b]] 与 [[缺失页]]。', ['共享', '甲专属']),
    doc('b.md', '乙', '回到 [[a]]。', ['共享']),
  ];

  it('默认只生成文档节点与已解析的引用边', () => {
    const graph = buildKnowledgeGraph(documents);

    expect(graph.nodes.map((node) => node.id).sort()).toEqual(['a.md', 'b.md']);
    expect(graph.links).toEqual([
      { source: 'a.md', target: 'b.md', type: 'wiki' },
      { source: 'b.md', target: 'a.md', type: 'wiki' },
    ]);
  });

  it('includeTags 时生成标签节点与标签边', () => {
    const graph = buildKnowledgeGraph(documents, { includeTags: true });

    expect(graph.nodes.filter((node) => node.type === 'tag').map((node) => node.id)).toEqual([
      'tag:共享',
      'tag:甲专属',
    ]);
    expect(graph.links.filter((link) => link.type === 'tag')).toEqual([
      { source: 'a.md', target: 'tag:共享', type: 'tag' },
      { source: 'a.md', target: 'tag:甲专属', type: 'tag' },
      { source: 'b.md', target: 'tag:共享', type: 'tag' },
    ]);
  });

  it('同一标签在标签节点中只出现一次', () => {
    const graph = buildKnowledgeGraph(documents, { includeTags: true });
    const tagNodes = graph.nodes.filter((node) => node.type === 'tag');

    expect(tagNodes.filter((node) => node.id === 'tag:共享')).toHaveLength(1);
  });

  it('includeUnresolved 时生成缺失节点并连边', () => {
    const graph = buildKnowledgeGraph(documents, { includeUnresolved: true });

    expect(graph.nodes).toContainEqual({
      id: 'missing:缺失页',
      label: '缺失页',
      type: 'missing',
    });
    expect(graph.links).toContainEqual({
      source: 'a.md',
      target: 'missing:缺失页',
      type: 'wiki',
    });
  });

  it('includeCategories 时生成分类节点', () => {
    const graph = buildKnowledgeGraph([{ ...doc('a.md', '甲'), category: '教程' }], {
      includeCategories: true,
    });

    expect(graph.nodes).toContainEqual({ id: 'category:教程', label: '教程', type: 'category' });
    expect(graph.links).toEqual([{ source: 'a.md', target: 'category:教程', type: 'category' }]);
  });

  it('分类只有空白时跳过', () => {
    const graph = buildKnowledgeGraph([{ ...doc('a.md', '甲'), category: '   ' }], {
      includeCategories: true,
    });

    expect(graph.links).toEqual([]);
  });

  it('同一对文档之间的重复引用只保留一条边', () => {
    const graph = buildKnowledgeGraph([doc('a.md', '甲', '[[b]]\n[[b]]'), doc('b.md', '乙')]);

    expect(graph.links).toEqual([{ source: 'a.md', target: 'b.md', type: 'wiki' }]);
  });

  it('带锚点的引用把锚点写入边标签', () => {
    const graph = buildKnowledgeGraph([doc('a.md', '甲', '[[b#小节]]'), doc('b.md', '乙')]);

    expect(graph.links).toEqual([{ source: 'a.md', target: 'b.md', type: 'wiki', label: '小节' }]);
  });

  it('文档节点保留标签与分类信息', () => {
    const graph = buildKnowledgeGraph([{ ...doc('a.md', '甲', '', ['标签']), category: '教程' }]);
    const node = graph.nodes.find((item) => item.id === 'a.md');

    expect(node).toMatchObject({ label: '甲', type: 'document', path: 'a.md', tags: ['标签'] });
  });
});

describe('countTags', () => {
  it('按出现文档数统计并降序排序', () => {
    expect(
      countTags([doc('a.md', '甲', '', ['共享', '甲']), doc('b.md', '乙', '', ['共享', '乙'])]),
    ).toEqual([
      { tag: '共享', count: 2 },
      { tag: '甲', count: 1 },
      { tag: '乙', count: 1 },
    ]);
  });

  it('同一文档内的重复标签只计一次', () => {
    expect(countTags([doc('a.md', '甲', '', ['共享', '共享', '共享'])])).toEqual([
      { tag: '共享', count: 1 },
    ]);
  });

  it('忽略大小写与全角差异造成的重复', () => {
    expect(countTags([doc('a.md', '甲', '', ['Note']), doc('b.md', '乙', '', ['note'])])).toEqual([
      { tag: 'Note', count: 2 },
    ]);
  });

  it('跳过空白标签，没有标签时返回空数组', () => {
    expect(countTags([doc('a.md', '甲', '', ['  ', ''])])).toEqual([]);
    expect(countTags([doc('a.md', '甲')])).toEqual([]);
  });

  it('计数相同时按标签名排序', () => {
    expect(countTags([doc('a.md', '甲', '', ['b', 'a', 'c'])])).toEqual([
      { tag: 'a', count: 1 },
      { tag: 'b', count: 1 },
      { tag: 'c', count: 1 },
    ]);
  });
});
