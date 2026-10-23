import { describe, expect, it } from 'vitest';
import {
  editMarkdown,
  formatMarkdown,
  indentMarkdown,
  markdownCodeAt,
  markdownEnter,
  markdownTyping,
  normalizeMarkdown,
  type MarkdownSelection,
} from './chat-markdown-input';
import { parseChatMarkdown } from './chat-markdown';
const value = (content: string, start = 0, end = content.length): MarkdownSelection => ({
  content,
  start,
  end,
  mentions: [],
});
describe('Markdown source editing', () => {
  it('inserts literal syntax and toggles it without changing selected text', () => {
    const bold = formatMarkdown(value('你好'), 'bold');
    expect(bold).toMatchObject({ content: '**你好**', start: 2, end: 4 });
    expect(formatMarkdown(bold, 'bold').content).toBe('你好');
    expect(formatMarkdown(value('**你好**'), 'bold').content).toBe('你好');
    const italic = formatMarkdown(value('abc', 1, 1), 'italic');
    expect(italic.content).toBe('a*文字*bc');
    expect(italic.content.slice(italic.start, italic.end)).toBe('文字');
  });
  it('preserves selected mention identities across wrappers and UTF-16 offsets', () => {
    const input = {
      ...value('👋 @小猫', 3),
      mentions: [{ guestId: 'cat', nickname: '小猫', start: 3, length: 3 }],
    };
    for (const action of ['bold', 'italic', 'link', 'heading2', 'bullet', 'quote'] as const) {
      const result = formatMarkdown(input, action);
      const mention = result.mentions[0]!;
      expect(result.content.slice(mention.start, mention.start + mention.length)).toBe('@小猫');
      expect(parseChatMarkdown(result.content, result.mentions).mentions[0]?.guestId).toBe('cat');
    }
    const coded = formatMarkdown(input, 'code');
    expect(parseChatMarkdown(coded.content, coded.mentions).mentions).toEqual([]);
  });
  it('removes metadata only if the mentioned token itself is edited', () => {
    const input = {
      ...value('前 @小猫 后'),
      mentions: [{ guestId: 'cat', nickname: '小猫', start: 2, length: 3 }],
    };
    expect(editMarkdown(input, [{ from: 0, to: 0, text: '开头 ' }], 0).mentions[0]!.start).toBe(5);
    expect(editMarkdown(input, [{ from: 3, to: 4, text: '大' }], 0).mentions).toEqual([]);
  });
  it('inserts link syntax and selects only the URL placeholder', () => {
    const next = formatMarkdown(value('链接文字'), 'link');
    expect(next.content).toBe('[链接文字](https://)');
    expect(next.content.slice(next.start, next.end)).toBe('https://');
  });
  it('uses longer code fences for source containing backticks', () => {
    const next = formatMarkdown(value('```\n代码'), 'fence');
    expect(next.content.startsWith('````\n')).toBe(true);
    expect(parseChatMarkdown(next.content).text).toBe('```\n代码');
  });
  it('prefixes selected lines and does not touch the next unselected line', () => {
    const next = formatMarkdown(value('甲\n乙\n丙', 0, 4), 'ordered');
    expect(next.content).toBe('1. 甲\n2. 乙\n丙');
    expect(formatMarkdown(value('## 标题'), 'heading1').content).toBe('# 标题');
    expect(formatMarkdown(value('> 引用'), 'quote').content).toBe('引用');
  });
  it('continues ordered and nested bullet lists, and exits an empty item', () => {
    expect(markdownEnter(value('9. 第一项', 6, 6))?.content).toBe('9. 第一项\n10. ');
    expect(markdownEnter(value('  - 子项', 6, 6))?.content).toBe('  - 子项\n  - ');
    expect(markdownEnter(value('甲\n- ', 4, 4))?.content).toBe('甲\n');
    expect(markdownEnter(value('普通正文', 4, 4))).toBeNull();
  });
  it('continues blockquotes, including quoted lists, and exits an empty quote', () => {
    expect(markdownEnter(value('> 引用', 4, 4))?.content).toBe('> 引用\n> ');
    expect(markdownEnter(value('> - 子项', 6, 6))?.content).toBe('> - 子项\n> - ');
    expect(markdownEnter(value('甲\n> ', 4, 4))?.content).toBe('甲\n');
  });
  it('wraps a selection when typing an inline marker', () => {
    const bold = markdownTyping(value('你好', 0, 2), '*');
    expect(bold).toMatchObject({ content: '*你好*', start: 1, end: 3 });
    expect(markdownTyping(bold!, '*')).toMatchObject({ content: '**你好**', start: 2, end: 4 });
    expect(markdownTyping(value('abc', 1, 2), '`')?.content).toBe('a`b`c');
    const link = markdownTyping(value('文档', 0, 2), '[');
    expect(link?.content).toBe('[文档]()');
    expect(link?.start).toBe(4);
    expect(markdownTyping(value('abc', 1, 2), '#')).toBeNull();
  });
  it('completes a code fence typed at the start of an empty line', () => {
    const fence = markdownTyping(value('正文\n``', 5, 5), '`');
    expect(fence?.content).toBe('正文\n```\n\n```');
    expect(fence?.start).toBe(7);
    expect(markdownTyping(value('正文 ``', 5, 5), '`')).toBeNull();
  });
  it('skips over an existing closing marker instead of duplicating it', () => {
    expect(markdownTyping(value('**粗体**', 4, 4), '*')).toMatchObject({ start: 5, end: 5 });
    expect(markdownTyping(value('`代码`', 3, 3), '`')?.start).toBe(4);
    expect(markdownTyping(value('**粗体**', 0, 0), '*')).toBeNull();
  });
  it('keeps Enter as a newline inside code, and Shift+Enter always inserts a newline', () => {
    expect(markdownEnter(value('```js\nconst a=1', 15, 15))?.content).toBe('```js\nconst a=1\n');
    expect(markdownEnter(value('正文', 2, 2), true)?.content).toBe('正文\n');
    expect(markdownCodeAt('```\n@小猫', 7)).toBe(true);
    expect(markdownCodeAt('```\n代码\n```\n正文', 14)).toBe(false);
    expect(markdownCodeAt('`@小猫` 正文', 8)).toBe(false);
    expect(markdownCodeAt('文字 `@小猫', 8)).toBe(true);
  });
  it('indents and outdents multiline source without invalidating mentions', () => {
    const input = {
      ...value('甲\n@小猫'),
      mentions: [{ guestId: 'cat', nickname: '小猫', start: 2, length: 3 }],
    };
    const indented = indentMarkdown(input);
    expect(indented.content).toBe('  甲\n  @小猫');
    expect(indented.mentions[0]!.start).toBe(6);
    expect(indentMarkdown(indented, true).content).toBe(input.content);
    expect(normalizeMarkdown(value('e\u0301\r\n')).content).toBe('é\n');
  });
});
