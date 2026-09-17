import { describe, expect, it } from 'vitest';
import type { MindElixirData, NodeObj } from 'mind-elixir';
import { markdownToMind, mindToMarkdown, textOutlineToMind } from './conversion';

interface OutlineShape {
  topic: string;
  children: OutlineShape[];
}

/** 节点 id 由 crypto.randomUUID 生成，比较结构时只保留主题与层级。 */
function shapeOf(node: NodeObj): OutlineShape {
  return {
    topic: node.topic,
    children: (node.children ?? []).map(shapeOf),
  };
}

function outlineOf(data: MindElixirData): OutlineShape {
  return shapeOf(data.nodeData);
}

describe('markdownToMind', () => {
  it('把标题层级映射为导图层级', () => {
    const data = markdownToMind('# 根\n\n## 甲\n\n### 甲一\n\n## 乙\n', '兜底');

    expect(outlineOf(data)).toEqual({
      topic: '根',
      children: [
        { topic: '甲', children: [{ topic: '甲一', children: [] }] },
        { topic: '乙', children: [] },
      ],
    });
  });

  it('把顶级列表挂到最近的标题下，而不是提升为同级节点', () => {
    const data = markdownToMind('# 根\n\n## 甲\n\n- 一\n- 二\n\n## 乙\n\n- 三\n', '兜底');

    expect(outlineOf(data)).toEqual({
      topic: '根',
      children: [
        {
          topic: '甲',
          children: [
            { topic: '一', children: [] },
            { topic: '二', children: [] },
          ],
        },
        { topic: '乙', children: [{ topic: '三', children: [] }] },
      ],
    });
  });

  it('按缩进层级嵌套列表，并支持有序列表标记', () => {
    const data = markdownToMind('- 一\n  - 一甲\n    - 一甲子\n1. 二\n', '兜底');

    expect(outlineOf(data)).toEqual({
      topic: '兜底',
      children: [
        {
          topic: '一',
          children: [{ topic: '一甲', children: [{ topic: '一甲子', children: [] }] }],
        },
        { topic: '二', children: [] },
      ],
    });
  });

  it('单个一级标题直接作为根节点，不再套一层', () => {
    const data = markdownToMind('# 唯一标题\n\n- 子项\n', '兜底');

    expect(outlineOf(data)).toEqual({
      topic: '唯一标题',
      children: [{ topic: '子项', children: [] }],
    });
  });

  it('存在多个一级标题时保留兜底标题作为根', () => {
    const data = markdownToMind('# 甲\n\n# 乙\n', '兜底');

    expect(outlineOf(data)).toEqual({
      topic: '兜底',
      children: [
        { topic: '甲', children: [] },
        { topic: '乙', children: [] },
      ],
    });
  });

  it('没有标题时使用兜底标题作为根节点', () => {
    expect(outlineOf(markdownToMind('- 一\n- 二\n', '兜底'))).toEqual({
      topic: '兜底',
      children: [
        { topic: '一', children: [] },
        { topic: '二', children: [] },
      ],
    });
  });

  it('兜底标题为空时回退到默认文案', () => {
    expect(outlineOf(markdownToMind('- 一\n', '')).topic).toBe('未命名思维导图');
  });

  it('清洗行内标记，保留链接文字并去掉强调符号', () => {
    const data = markdownToMind(
      '# **加粗** 与 `代码` 与 [链接](https://example.com) 与 ~~删除~~\n',
      '兜底',
    );

    expect(outlineOf(data).topic).toBe('加粗 与 代码 与 链接 与 删除');
  });

  it('把图片语法还原为替代文字', () => {
    const data = markdownToMind('# 标题 ![示意图](./a.png)\n', '兜底');

    expect(outlineOf(data).topic).toBe('标题 示意图');
  });

  it('忽略空行与普通正文段落', () => {
    const data = markdownToMind('# 根\n\n这是正文，不是节点。\n\n- 一\n', '兜底');

    expect(outlineOf(data)).toEqual({
      topic: '根',
      children: [{ topic: '一', children: [] }],
    });
  });
});

describe('mindToMarkdown', () => {
  it('把导图层级还原为标题与嵌套列表', () => {
    const data = markdownToMind('# 根\n\n## 甲\n\n- 一\n- 二\n\n## 乙\n', '兜底');

    expect(mindToMarkdown(data)).toBe('# 根\n- 甲\n  - 一\n  - 二\n- 乙');
  });

  it('把超链接渲染为 Markdown 链接', () => {
    const data: MindElixirData = {
      nodeData: {
        id: 'root',
        topic: '根',
        hyperLink: 'https://example.com',
        children: [],
      },
    } as unknown as MindElixirData;

    expect(mindToMarkdown(data)).toBe('# [根](https://example.com)');
  });

  it('子节点的超链接同样渲染为 Markdown 链接', () => {
    const data: MindElixirData = {
      nodeData: {
        id: 'root',
        topic: '根',
        children: [{ id: 'child', topic: '子', hyperLink: 'https://example.com/a', children: [] }],
      },
    } as unknown as MindElixirData;

    expect(mindToMarkdown(data)).toBe('# 根\n- [子](https://example.com/a)');
  });

  it('把空主题回退为默认节点名', () => {
    const data: MindElixirData = {
      nodeData: { id: 'root', topic: '   ', children: [] },
    } as unknown as MindElixirData;

    expect(mindToMarkdown(data)).toBe('# 未命名节点');
  });

  it('空导图只输出根节点一行', () => {
    const data: MindElixirData = {
      nodeData: { id: 'root', topic: '根', children: [] },
    } as unknown as MindElixirData;

    expect(mindToMarkdown(data)).toBe('# 根');
  });
});

describe('markdownToMind 与 mindToMarkdown 往返', () => {
  it('保留标题与列表结构', () => {
    const source = '# 根\n\n## 甲\n\n- 一\n- 二\n\n## 乙\n';
    const roundTrip = mindToMarkdown(markdownToMind(source, '兜底'));

    expect(mindToMarkdown(markdownToMind(roundTrip, '兜底'))).toBe(roundTrip);
    expect(roundTrip).toBe('# 根\n- 甲\n  - 一\n  - 二\n- 乙');
  });
});

describe('textOutlineToMind', () => {
  it('把缩进文本大纲转换为导图层级', () => {
    const data = textOutlineToMind('甲\n  乙\n    丙\n丁', '兜底');

    expect(outlineOf(data)).toEqual({
      topic: '兜底',
      children: [
        {
          topic: '甲',
          children: [{ topic: '乙', children: [{ topic: '丙', children: [] }] }],
        },
        { topic: '丁', children: [] },
      ],
    });
  });

  it('忽略空白行并按制表符计算缩进', () => {
    const data = textOutlineToMind('甲\n\n\t乙\n\n', '兜底');

    expect(outlineOf(data)).toEqual({
      topic: '兜底',
      children: [{ topic: '甲', children: [{ topic: '乙', children: [] }] }],
    });
  });

  it('内容为空时只返回兜底根节点', () => {
    expect(outlineOf(textOutlineToMind('\n\n  \n', '兜底'))).toEqual({
      topic: '兜底',
      children: [],
    });
  });
});
