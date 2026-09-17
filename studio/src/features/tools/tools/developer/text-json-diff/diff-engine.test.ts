import { describe, expect, it } from 'vitest';
import {
  alignJsonPresentations,
  compareJson,
  compareText,
  describeJsonValue,
  presentJson,
  type IgnoreRules,
} from './diff-engine';

const noRules: IgnoreRules = { case: false, whitespace: false, blankLines: false };

function diff(
  original: string,
  modified: string,
  granularity: 'line' | 'word' | 'character' = 'line',
  rules: Partial<IgnoreRules> = {},
) {
  return compareText(original, modified, granularity, { ...noRules, ...rules });
}

describe('compareText 行粒度', () => {
  it('内容相同时没有差异', () => {
    expect(diff('a\nb\nc', 'a\nb\nc')).toEqual([]);
  });

  it('标记被修改的行', () => {
    expect(diff('a\nb\nc', 'a\nX\nc')).toEqual([{ originalLine: 2, modifiedLine: 2 }]);
  });

  it('标记开头插入的行', () => {
    expect(diff('a\nb', 'new\na\nb')).toEqual([{ originalLine: 1, modifiedLine: 1 }]);
  });

  it('标记中间删除的行', () => {
    expect(diff('a\nb\nc', 'a\nc')).toEqual([{ originalLine: 2, modifiedLine: 2 }]);
  });

  it('标记末尾新增的行', () => {
    expect(diff('a', 'a\nb')).toEqual([{ originalLine: 1, modifiedLine: 2 }]);
  });

  it('空内容与有内容的差异落在第一行', () => {
    expect(diff('', 'a')).toEqual([{ originalLine: 1, modifiedLine: 1 }]);
  });

  it('把不相邻的差异拆成多段', () => {
    expect(diff('a\nb\nc', 'X\nb\nY')).toEqual([
      { originalLine: 1, modifiedLine: 1 },
      { originalLine: 3, modifiedLine: 3 },
    ]);
  });

  it('插入一行不会把后续内容级联标记为差异', () => {
    const lines = Array.from({ length: 20 }, (_, index) => `line-${index + 1}`);
    const original = lines.join('\n');
    const modified = ['inserted', ...lines].join('\n');

    expect(diff(original, modified)).toEqual([{ originalLine: 1, modifiedLine: 1 }]);
  });
});

describe('compareText 词与字符粒度', () => {
  it('词粒度定位到所在行', () => {
    expect(diff('a b c', 'a X c', 'word')).toEqual([{ originalLine: 1, modifiedLine: 1 }]);
  });

  it('字符粒度定位到所在行', () => {
    expect(diff('abc', 'axc', 'character')).toEqual([{ originalLine: 1, modifiedLine: 1 }]);
  });

  it('词粒度默认把空白也算作 token', () => {
    expect(diff('a b', 'a  b', 'word')).toEqual([{ originalLine: 1, modifiedLine: 1 }]);
  });

  it('字符粒度内容相同时没有差异', () => {
    expect(diff('abc', 'abc', 'character')).toEqual([]);
  });

  it('多行内容的差异行号按行累计', () => {
    expect(diff('aaa\nbbb\nccc', 'aaa\nbXb\nccc', 'character')).toEqual([
      { originalLine: 2, modifiedLine: 2 },
    ]);
  });
});

describe('compareText 忽略规则', () => {
  it('忽略大小写', () => {
    expect(diff('ABC', 'abc', 'line', { case: true })).toEqual([]);
    expect(diff('ABC', 'abc')).toEqual([{ originalLine: 1, modifiedLine: 1 }]);
  });

  it('忽略空白差异', () => {
    expect(diff('  a  ', 'a', 'line', { whitespace: true })).toEqual([]);
    expect(diff('  a  ', 'a')).toEqual([{ originalLine: 1, modifiedLine: 1 }]);
  });

  it('忽略空行差异', () => {
    expect(diff('a\n\nb', 'a\nb', 'line', { blankLines: true })).toEqual([]);
    expect(diff('a\n\nb', 'a\nb')).toEqual([{ originalLine: 2, modifiedLine: 2 }]);
  });

  it('忽略空行后仍能定位真实差异', () => {
    const original = 'a\n\n\nb\n\nc';
    const modified = 'a\n\n\nb\n\nX';

    expect(diff(original, modified, 'line', { blankLines: true })).toEqual([
      { originalLine: 6, modifiedLine: 6 },
    ]);
  });
});

describe('compareText 超大文本回退', () => {
  it('行数超过 LCS 上限时仍能定位到唯一差异行', () => {
    const lines = Array.from({ length: 800 }, (_, index) => `line-${index + 1}`);
    const original = lines.join('\n');
    const modified = lines.map((line, index) => (index === 399 ? 'CHANGED' : line)).join('\n');

    expect(diff(original, modified)).toEqual([{ originalLine: 400, modifiedLine: 400 }]);
  });

  it('超长单行在词粒度下退化为整行标记，不产生海量差异段', () => {
    const words = Array.from({ length: 900 }, (_, index) => `w${index}`);
    const original = words.join(' ');
    const modified = original.replace('w400', 'X');

    const result = diff(original, modified, 'word');

    expect(result).toEqual([{ originalLine: 1, modifiedLine: 1 }]);
  });
});

describe('presentJson', () => {
  it('按两空格缩进渲染并记录每个指针的行号', () => {
    const presentation = presentJson('{"b":1,"a":{"c":[1,2]}}');

    expect(presentation.text).toBe(
      '{\n  "b": 1,\n  "a": {\n    "c": [\n      1,\n      2\n    ]\n  }\n}',
    );
    expect([...presentation.locations]).toEqual([
      ['', 1],
      ['/b', 2],
      ['/a', 3],
      ['/a/c', 4],
      ['/a/c/0', 5],
      ['/a/c/1', 6],
    ]);
  });

  it('保留原始值的引用', () => {
    expect(presentJson('{"a":[1,2]}').value).toEqual({ a: [1, 2] });
  });

  it('非法 JSON 抛出解析错误', () => {
    expect(() => presentJson('{')).toThrow();
  });
});

describe('alignJsonPresentations', () => {
  it('把原文键顺序对齐到修改后文档的顺序', () => {
    const original = presentJson('{"a":1,"b":2,"c":3}');
    const modified = presentJson('{"c":3,"a":1}');

    alignJsonPresentations(original, modified);

    expect(modified.text).toBe('{\n  "c": 3,\n  "a": 1\n}');
    expect(original.text).toBe('{\n  "c": 3,\n  "a": 1,\n  "b": 2\n}');
  });

  it('对齐后同步刷新两侧的行号索引', () => {
    const original = presentJson('{"a":1,"b":2}');
    const modified = presentJson('{"b":2,"a":1}');

    alignJsonPresentations(original, modified);

    expect(original.locations.get('/b')).toBe(2);
    expect(original.locations.get('/a')).toBe(3);
    expect(modified.locations.get('/b')).toBe(2);
  });
});

describe('compareJson', () => {
  it('内容相同时没有差异', () => {
    expect(compareJson(presentJson('{"a":1,"b":2}'), presentJson('{"a":1,"b":2}'))).toEqual([]);
  });

  it('标记被修改的字段', () => {
    expect(compareJson(presentJson('{"a":1}'), presentJson('{"a":2}'))).toEqual([
      {
        kind: 'modified',
        pointer: '/a',
        originalLine: 2,
        modifiedLine: 2,
        originalValue: 1,
        modifiedValue: 2,
      },
    ]);
  });

  it('标记新增字段', () => {
    expect(compareJson(presentJson('{"a":1}'), presentJson('{"a":1,"b":2}'))).toEqual([
      {
        kind: 'added',
        pointer: '/b',
        originalLine: 1,
        modifiedLine: 3,
        modifiedValue: 2,
      },
    ]);
  });

  it('标记删除字段', () => {
    expect(compareJson(presentJson('{"a":1,"b":2}'), presentJson('{"a":1}'))).toEqual([
      {
        kind: 'removed',
        pointer: '/b',
        originalLine: 3,
        modifiedLine: 1,
        originalValue: 2,
      },
    ]);
  });

  it('标记类型变化', () => {
    expect(compareJson(presentJson('{"a":1}'), presentJson('{"a":"1"}'))).toEqual([
      {
        kind: 'type-changed',
        pointer: '/a',
        originalLine: 2,
        modifiedLine: 2,
        originalValue: 1,
        modifiedValue: '1',
      },
    ]);
  });

  it('根节点类型变化时指针为空', () => {
    const result = compareJson(presentJson('{"a":1}'), presentJson('[1]'));

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'type-changed', pointer: '' });
  });

  it('递归比较嵌套对象与数组', () => {
    const result = compareJson(
      presentJson('{"a":{"b":[1,2,3]}}'),
      presentJson('{"a":{"b":[1,9,3,4]}}'),
    );

    expect(result.map((item) => [item.kind, item.pointer])).toEqual([
      ['modified', '/a/b/1'],
      ['added', '/a/b/3'],
    ]);
  });

  it('数组尾部新增元素', () => {
    expect(compareJson(presentJson('[1,2,3]'), presentJson('[1,2,3,4]'))).toEqual([
      { kind: 'added', pointer: '/3', originalLine: 1, modifiedLine: 5, modifiedValue: 4 },
    ]);
  });

  it('转义指针中的斜杠与波浪号', () => {
    const result = compareJson(presentJson('{"a/b":1,"c~d":2}'), presentJson('{"a/b":3,"c~d":4}'));

    expect(result.map((item) => item.pointer)).toEqual(['/a~1b', '/c~0d']);
  });

  it('区分 null 与缺失字段', () => {
    const result = compareJson(presentJson('{"a":null}'), presentJson('{"a":1}'));

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'type-changed', pointer: '/a' });
  });

  it('数组元素被删除时标记 removed', () => {
    expect(
      compareJson(presentJson('[1,2,3]'), presentJson('[1,3]')).map((item) => item.kind),
    ).toEqual(['modified', 'removed']);
  });
});

describe('describeJsonValue', () => {
  it('把值序列化为可读文本', () => {
    expect(describeJsonValue('a')).toBe('"a"');
    expect(describeJsonValue(123)).toBe('123');
    expect(describeJsonValue(null)).toBe('null');
    expect(describeJsonValue({ a: 1 })).toBe('{"a":1}');
  });

  it('无法序列化的值返回 undefined 文案', () => {
    expect(describeJsonValue(undefined)).toBe('undefined');
  });

  it('超长内容截断并追加省略号', () => {
    const described = describeJsonValue('x'.repeat(100));

    expect(described).toHaveLength(70);
    expect(described.endsWith('…')).toBe(true);
  });

  it('未超过长度上限时不做截断', () => {
    expect(describeJsonValue('x'.repeat(70))).toBe(`"${'x'.repeat(70)}"`);
  });
});
