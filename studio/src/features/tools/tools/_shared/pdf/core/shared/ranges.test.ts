import { describe, expect, it } from 'vitest';
import { chunkPages, pagesByParity, parsePageRanges } from './ranges';

describe('parsePageRanges（segments 模式）', () => {
  it('解析单个页码并生成对应标签', () => {
    expect(parsePageRanges('3', 10)).toEqual({
      valid: true,
      groups: [{ label: 'page-3', pages: [3] }],
      error: '',
    });
  });

  it('解析区间并展开为页码列表', () => {
    expect(parsePageRanges('1-3', 10)).toEqual({
      valid: true,
      groups: [{ label: 'pages-1-3', pages: [1, 2, 3] }],
      error: '',
    });
  });

  it('起点等于终点时按单页处理', () => {
    expect(parsePageRanges('2-2', 10).groups).toEqual([{ label: 'page-2', pages: [2] }]);
  });

  it('解析多个逗号分隔的片段', () => {
    expect(parsePageRanges('1-2, 5, 8-9', 10).groups).toEqual([
      { label: 'pages-1-2', pages: [1, 2] },
      { label: 'page-5', pages: [5] },
      { label: 'pages-8-9', pages: [8, 9] },
    ]);
  });

  it('忽略输入中的所有空白', () => {
    expect(parsePageRanges(' 1 - 3 ,\t5 ', 10).groups).toEqual([
      { label: 'pages-1-3', pages: [1, 2, 3] },
      { label: 'page-5', pages: [5] },
    ]);
  });

  it('空输入返回提示', () => {
    expect(parsePageRanges('   ', 10)).toEqual({
      valid: false,
      groups: [],
      error: '请输入页码范围',
    });
  });

  it('拒绝非数字片段', () => {
    expect(parsePageRanges('a', 10)).toEqual({
      valid: false,
      groups: [],
      error: '“a”不是有效页码',
    });
  });

  it('拒绝不完整的区间写法', () => {
    expect(parsePageRanges('1-', 10).valid).toBe(false);
    expect(parsePageRanges('-3', 10).valid).toBe(false);
  });

  it('拒绝超出文档页数的页码', () => {
    expect(parsePageRanges('11', 10)).toEqual({
      valid: false,
      groups: [],
      error: '页码必须在 1 到 10 之间',
    });
    expect(parsePageRanges('0', 10).error).toBe('页码必须在 1 到 10 之间');
  });

  it('拒绝起始页大于结束页的区间', () => {
    expect(parsePageRanges('5-3', 10)).toEqual({
      valid: false,
      groups: [],
      error: '起始页 5 不能大于结束页 3',
    });
  });

  it('解析失败时不返回部分结果', () => {
    expect(parsePageRanges('1, x', 10)).toEqual({
      valid: false,
      groups: [],
      error: '“x”不是有效页码',
    });
  });
});

describe('parsePageRanges（groups 模式）', () => {
  it('按分号拆分为多个分组', () => {
    expect(parsePageRanges('1-2;3,4', 10, 'groups')).toEqual({
      valid: true,
      groups: [
        { label: 'group-1', pages: [1, 2] },
        { label: 'group-2', pages: [3, 4] },
      ],
      error: '',
    });
  });

  it('组内重复页码只保留一次', () => {
    expect(parsePageRanges('1,1,2', 10, 'groups').groups).toEqual([
      { label: 'group-1', pages: [1, 2] },
    ]);
  });

  it('跨组不去重，保持各组的原始内容', () => {
    expect(parsePageRanges('1;1', 10, 'groups').groups).toEqual([
      { label: 'group-1', pages: [1] },
      { label: 'group-2', pages: [1] },
    ]);
  });

  it('空分组给出定位到组号的错误', () => {
    expect(parsePageRanges('1;', 10, 'groups')).toEqual({
      valid: false,
      groups: [],
      error: '第 2 组为空',
    });
  });

  it('组内页码越界时整组解析失败', () => {
    expect(parsePageRanges('1;20', 10, 'groups').error).toBe('页码必须在 1 到 10 之间');
  });
});

describe('pagesByParity', () => {
  it('返回奇数页', () => {
    expect(pagesByParity(5, 'odd')).toEqual([1, 3, 5]);
  });

  it('返回偶数页', () => {
    expect(pagesByParity(6, 'even')).toEqual([2, 4, 6]);
  });

  it('页数为零时返回空数组', () => {
    expect(pagesByParity(0, 'odd')).toEqual([]);
  });

  it('只有一页时偶数页为空', () => {
    expect(pagesByParity(1, 'even')).toEqual([]);
  });
});

describe('chunkPages', () => {
  it('按固定大小切分并标记首尾页', () => {
    expect(chunkPages(5, 2)).toEqual([
      { label: 'pages-1-2', pages: [1, 2] },
      { label: 'pages-3-4', pages: [3, 4] },
      { label: 'page-5', pages: [5] },
    ]);
  });

  it('刚好整除时不产生多余分组', () => {
    expect(chunkPages(4, 2)).toEqual([
      { label: 'pages-1-2', pages: [1, 2] },
      { label: 'pages-3-4', pages: [3, 4] },
    ]);
  });

  it('块大小等于总页数时只有一组', () => {
    expect(chunkPages(3, 3)).toEqual([{ label: 'pages-1-3', pages: [1, 2, 3] }]);
  });

  it('页数为零时返回空数组', () => {
    expect(chunkPages(0, 2)).toEqual([]);
  });

  it('非法块大小返回空数组', () => {
    expect(chunkPages(5, 0)).toEqual([]);
    expect(chunkPages(5, -1)).toEqual([]);
    expect(chunkPages(5, 1.5)).toEqual([]);
    expect(chunkPages(5, Number.NaN)).toEqual([]);
  });
});
