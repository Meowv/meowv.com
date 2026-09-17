import { describe, expect, it } from 'vitest';
import { NOTE_TEXT_ACTIONS, type NoteTextStyleAction } from './text-style';

function action(title: string): NoteTextStyleAction {
  const found = NOTE_TEXT_ACTIONS.find((item) => item.title === title);
  if (!found) throw new Error(`未找到文本样式操作：${title}`);
  return found;
}

describe('NOTE_TEXT_ACTIONS 元数据', () => {
  it('按顺序暴露全部文本样式操作', () => {
    expect(NOTE_TEXT_ACTIONS.map((item) => item.title)).toEqual([
      '加粗',
      '斜体',
      '删除线',
      '行内代码',
      '一级标题',
      '二级标题',
      '无序列表',
      '有序列表',
      '引用',
      '分隔线',
    ]);
  });

  it('为常用样式声明快捷键', () => {
    expect(action('加粗').shortcut).toEqual({ key: 'b' });
    expect(action('斜体').shortcut).toEqual({ key: 'i' });
    expect(action('删除线').shortcut).toEqual({ key: 'x', shift: true });
  });

  it('行内代码与块级样式不声明快捷键', () => {
    expect(action('行内代码').shortcut).toBeUndefined();
    expect(action('一级标题').shortcut).toBeUndefined();
    expect(action('分隔线').shortcut).toBeUndefined();
  });

  it('每个操作都有按钮文案', () => {
    expect(NOTE_TEXT_ACTIONS.every((item) => item.label.length > 0)).toBe(true);
  });
});

describe('包裹类样式', () => {
  it('为选中文字加上标记', () => {
    expect(action('加粗').apply('hello', 0, 5)).toEqual({
      text: '**hello**',
      selectionStart: 2,
      selectionEnd: 7,
    });
  });

  it('光标未选中文字时插入占位文案并保持选区折叠', () => {
    expect(action('加粗').apply('', 0, 0)).toEqual({
      text: '**文本**',
      selectionStart: 2,
      selectionEnd: 2,
    });
  });

  it('选区位于文本中间时只包裹选中部分', () => {
    expect(action('斜体').apply('ab cd', 3, 5)).toEqual({
      text: 'ab *cd*',
      selectionStart: 4,
      selectionEnd: 6,
    });
  });

  it('再次执行时去掉已有标记', () => {
    expect(action('加粗').apply('**hello**', 0, 9)).toEqual({
      text: 'hello',
      selectionStart: 0,
      selectionEnd: 5,
    });
  });

  it('删除线使用双波浪号', () => {
    expect(action('删除线').apply('x', 0, 1)).toEqual({
      text: '~~x~~',
      selectionStart: 2,
      selectionEnd: 3,
    });
  });

  it('行内代码使用反引号', () => {
    expect(action('行内代码').apply('x', 0, 1)).toEqual({
      text: '`x`',
      selectionStart: 1,
      selectionEnd: 2,
    });
  });

  it('选区刚好等于一对标记时继续叠加而不误判为已包裹', () => {
    expect(action('加粗').apply('**', 0, 2)).toEqual({
      text: '******',
      selectionStart: 2,
      selectionEnd: 4,
    });
  });
});

describe('行前缀类样式', () => {
  it('为光标所在行加上标题前缀', () => {
    expect(action('一级标题').apply('a\nb', 0, 0)).toEqual({
      text: '# a\nb',
      selectionStart: 0,
      selectionEnd: 3,
    });
  });

  it('跨行选区为每一行都加上前缀', () => {
    expect(action('二级标题').apply('a\nb', 0, 3)).toEqual({
      text: '## a\n## b',
      selectionStart: 0,
      selectionEnd: 9,
    });
  });

  it('再次执行时去掉行前缀', () => {
    expect(action('一级标题').apply('# a\n# b', 0, 7)).toEqual({
      text: 'a\nb',
      selectionStart: 0,
      selectionEnd: 3,
    });
  });

  it('只有部分行带前缀时统一补全而不是去除', () => {
    expect(action('一级标题').apply('# a\nb', 0, 5)).toEqual({
      text: '# # a\n# b',
      selectionStart: 0,
      selectionEnd: 9,
    });
  });

  it('光标位于行中间时整行加前缀并选中整行', () => {
    expect(action('一级标题').apply('ab\ncd', 3, 3)).toEqual({
      text: 'ab\n# cd',
      selectionStart: 3,
      selectionEnd: 7,
    });
  });

  it('无序列表使用短横线前缀', () => {
    expect(action('无序列表').apply('a', 0, 1)).toEqual({
      text: '- a',
      selectionStart: 0,
      selectionEnd: 3,
    });
  });

  it('有序列表使用 1. 前缀', () => {
    expect(action('有序列表').apply('a\nb', 0, 3)).toEqual({
      text: '1. a\n1. b',
      selectionStart: 0,
      selectionEnd: 9,
    });
  });

  it('引用使用尖括号前缀', () => {
    expect(action('引用').apply('a', 0, 1)).toEqual({
      text: '> a',
      selectionStart: 0,
      selectionEnd: 3,
    });
  });
});

describe('分隔线', () => {
  it('空内容时只插入分隔线', () => {
    expect(action('分隔线').apply('', 0, 0)).toEqual({
      text: '---',
      selectionStart: 3,
      selectionEnd: 3,
    });
  });

  it('光标位于开头时在分隔线后补空行', () => {
    expect(action('分隔线').apply('a', 0, 0)).toEqual({
      text: '---\n\na',
      selectionStart: 3,
      selectionEnd: 3,
    });
  });

  it('光标位于末尾且上一行未空行时在分隔线前补空行', () => {
    expect(action('分隔线').apply('a\n', 2, 2)).toEqual({
      text: 'a\n\n\n---',
      selectionStart: 7,
      selectionEnd: 7,
    });
  });

  it('前后已有空行时不重复插入空行', () => {
    expect(action('分隔线').apply('a\n\nb', 3, 3)).toEqual({
      text: 'a\n\n---\n\nb',
      selectionStart: 6,
      selectionEnd: 6,
    });
  });

  it('选区内容会被分隔线替换', () => {
    expect(action('分隔线').apply('a', 0, 1)).toEqual({
      text: '---',
      selectionStart: 3,
      selectionEnd: 3,
    });
  });
});
