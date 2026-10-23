import { rebaseMentions } from './chat-mentions';
import type { ChatMention } from './chat-types';

export interface ChatDraft {
  content: string;
  mentions: ChatMention[];
}
export interface MarkdownSelection extends ChatDraft {
  start: number;
  end: number;
}
export interface TextEdit {
  from: number;
  to: number;
  text: string;
}
export type MarkdownAction =
  | 'bold'
  | 'italic'
  | 'code'
  | 'link'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bullet'
  | 'ordered'
  | 'quote'
  | 'fence';

export function editMarkdown(
  value: MarkdownSelection,
  edits: TextEdit[],
  start: number,
  end = start,
): MarkdownSelection {
  const ordered = [...edits].sort((a, b) => a.from - b.from);
  let cursor = 0;
  let content = '';
  for (const edit of ordered) {
    if (edit.from < cursor || edit.to < edit.from || edit.to > value.content.length)
      throw new Error('Invalid Markdown edit range');
    content += value.content.slice(cursor, edit.from) + edit.text;
    cursor = edit.to;
  }
  content += value.content.slice(cursor);
  const mentions = value.mentions.flatMap((mention) => {
    const end = mention.start + mention.length;
    if (
      ordered.some(
        (edit) =>
          (edit.from < end && edit.to > mention.start) ||
          (edit.from === edit.to && edit.from > mention.start && edit.from < end),
      )
    )
      return [];
    const shift = ordered
      .filter((edit) => edit.to <= mention.start)
      .reduce((total, edit) => total + edit.text.length - (edit.to - edit.from), 0);
    return [{ ...mention, start: mention.start + shift }];
  });
  return { content, mentions, start, end };
}
export function normalizeMarkdown(value: MarkdownSelection): MarkdownSelection {
  const normalize = (text: string) => text.replaceAll('\r\n', '\n').normalize('NFC');
  const content = normalize(value.content);
  return {
    content,
    mentions: rebaseMentions(value.content, content, value.mentions),
    start: normalize(value.content.slice(0, value.start)).length,
    end: normalize(value.content.slice(0, value.end)).length,
  };
}
function blockLines(value: MarkdownSelection, action: MarkdownAction): MarkdownSelection {
  const from = value.start > 0 ? value.content.lastIndexOf('\n', value.start - 1) + 1 : 0;
  const last =
    value.end > value.start && value.content[value.end - 1] === '\n' ? value.end - 1 : value.end;
  const next = value.content.indexOf('\n', last);
  const to = next < 0 ? value.content.length : next;
  const lines = value.content.slice(from, to).split('\n');
  const edits: TextEdit[] = [];
  let offset = from;
  const quoteOff = action === 'quote' && lines.every((line) => /^\s*> /.test(line));
  for (const [index, line] of lines.entries()) {
    const indent = line.match(/^[\t ]*/)?.[0] ?? '';
    if (action === 'quote') {
      edits.push({
        from: offset + indent.length,
        to: offset + indent.length + (quoteOff ? 2 : 0),
        text: quoteOff ? '' : '> ',
      });
    } else {
      const existing = line.slice(indent.length).match(/^(?:#{1,6} |[-+*] |\d+[.)] )/)?.[0] ?? '';
      const prefix =
        action === 'bullet'
          ? '- '
          : action === 'ordered'
            ? `${index + 1}. `
            : '#'.repeat(Number(action.slice(-1))) + ' ';
      const remove = existing === prefix && lines.length === 1;
      edits.push({
        from: offset + indent.length,
        to: offset + indent.length + existing.length,
        text: remove ? '' : prefix,
      });
    }
    offset += line.length + 1;
  }
  const size = edits.reduce((total, edit) => total + edit.text.length - edit.to + edit.from, 0);
  return editMarkdown(value, edits, from, to + size);
}
export function formatMarkdown(
  value: MarkdownSelection,
  action: MarkdownAction,
): MarkdownSelection {
  if (['heading1', 'heading2', 'heading3', 'bullet', 'ordered', 'quote'].includes(action))
    return blockLines(value, action);
  const selected = value.content.slice(value.start, value.end);
  if (action === 'fence') {
    const width = Math.max(3, ...(selected.match(/`+/g) ?? []).map((run) => run.length + 1));
    const fence = '`'.repeat(width);
    const prefix =
      (value.start && value.content[value.start - 1] !== '\n' ? '\n' : '') + fence + '\n';
    const suffix =
      '\n' + fence + (value.content[value.end] && value.content[value.end] !== '\n' ? '\n' : '');
    if (!selected)
      return editMarkdown(
        value,
        [{ from: value.start, to: value.end, text: prefix + '代码' + suffix }],
        value.start + prefix.length,
        value.start + prefix.length + 2,
      );
    return editMarkdown(
      value,
      [
        { from: value.start, to: value.start, text: prefix },
        { from: value.end, to: value.end, text: suffix },
      ],
      value.start + prefix.length,
      value.end + prefix.length,
    );
  }
  if (action === 'link') {
    const label = selected || '链接文字';
    const suffix = '](https://)';
    const edits = selected
      ? [
          { from: value.start, to: value.start, text: '[' },
          { from: value.end, to: value.end, text: suffix },
        ]
      : [{ from: value.start, to: value.end, text: '[' + label + suffix }];
    const url = value.start + 1 + label.length + 2;
    return editMarkdown(value, edits, url, url + 'https://'.length);
  }
  const marker =
    action === 'bold'
      ? '**'
      : action === 'italic'
        ? '*'
        : '`'.repeat(Math.max(1, ...(selected.match(/`+/g) ?? []).map((run) => run.length + 1)));
  const padding =
    action === 'code' && (/^`|`$/.test(selected) || /^ .* $/.test(selected)) ? ' ' : '';
  const open = marker + padding;
  const close = padding + marker;
  if (
    value.start >= open.length &&
    value.content.slice(value.start - open.length, value.start) === open &&
    value.content.slice(value.end, value.end + close.length) === close
  )
    return editMarkdown(
      value,
      [
        { from: value.start - open.length, to: value.start, text: '' },
        { from: value.end, to: value.end + close.length, text: '' },
      ],
      value.start - open.length,
      value.end - open.length,
    );
  if (
    selected.startsWith(open) &&
    selected.endsWith(close) &&
    selected.length > open.length + close.length
  )
    return editMarkdown(
      value,
      [
        { from: value.start, to: value.start + open.length, text: '' },
        { from: value.end - close.length, to: value.end, text: '' },
      ],
      value.start,
      value.end - open.length - close.length,
    );
  if (!selected) {
    const placeholder = action === 'code' ? '代码' : '文字';
    return editMarkdown(
      value,
      [{ from: value.start, to: value.end, text: open + placeholder + close }],
      value.start + open.length,
      value.start + open.length + placeholder.length,
    );
  }
  return editMarkdown(
    value,
    [
      { from: value.start, to: value.start, text: open },
      { from: value.end, to: value.end, text: close },
    ],
    value.start + open.length,
    value.end + open.length,
  );
}
export function markdownCodeAt(content: string, caret: number): boolean {
  const lines = content.slice(0, caret).split('\n');
  let fence = '';
  let inline = '';
  for (const line of lines) {
    const block = line.match(/^\s{0,3}(`{3,}|~{3,})/)?.[1];
    if (block) {
      if (!fence) fence = block;
      else if (
        block[0] === fence[0] &&
        block.length >= fence.length &&
        /^\s*$/.test(line.slice(line.indexOf(block) + block.length))
      )
        fence = '';
      inline = '';
      continue;
    }
    if (fence) continue;
    if (!line.trim()) inline = '';
    for (let index = 0; index < line.length; index++) {
      if (line[index] === '\\') {
        index++;
        continue;
      }
      if (line[index] !== '`') continue;
      const run = line.slice(index).match(/^`+/)![0];
      if (!inline) inline = run;
      else if (inline === run) inline = '';
      index += run.length - 1;
    }
  }
  return !!fence || !!inline;
}
export function markdownEnter(value: MarkdownSelection, soft = false): MarkdownSelection | null {
  if (soft || markdownCodeAt(value.content, value.start)) {
    return editMarkdown(value, [{ from: value.start, to: value.end, text: '\n' }], value.start + 1);
  }
  const from = value.start > 0 ? value.content.lastIndexOf('\n', value.start - 1) + 1 : 0;
  const before = value.content.slice(from, value.start);
  const indent = before.match(/^[\t ]*/)![0];
  const quote = before.slice(indent.length).match(/^(?:> ?)+/)?.[0] ?? '';
  const body = before.slice(indent.length + quote.length);
  const empty =
    value.start === value.end &&
    (value.content[value.end] === '\n' || value.end === value.content.length);
  const list = body.match(/^([\t ]*)([-+*]|(\d+)([.)])) (.*)$/);
  if (list) {
    const marker = indent.length + quote.length;
    if (!list[5]!.trim() && empty)
      return editMarkdown(
        value,
        [{ from: from + marker, to: value.start, text: '' }],
        from + marker,
      );
    const prefix =
      indent + quote + list[1]! + (list[3] ? `${Number(list[3]) + 1}${list[4]}` : list[2]) + ' ';
    return editMarkdown(
      value,
      [{ from: value.start, to: value.end, text: '\n' + prefix }],
      value.start + prefix.length + 1,
    );
  }
  if (quote) {
    if (!body.trim() && empty)
      return editMarkdown(
        value,
        [{ from: from + indent.length, to: value.start, text: '' }],
        from + indent.length,
      );
    const prefix = indent + quote;
    return editMarkdown(
      value,
      [{ from: value.start, to: value.end, text: '\n' + prefix }],
      value.start + prefix.length + 1,
    );
  }
  return null;
}
const closingPairs: Record<string, string> = { '*': '*', _: '_', '`': '`', ']': '[', ')': '(' };
const wrappingPairs: Record<string, string> = { '*': '*', _: '_', '`': '`', '[': ']' };
/**
 * 把一次单字符输入解释成 Markdown 编辑：空行输入三个反引号补全围栏、选中文字后输入
 * `*` / `_` / `` ` `` / `[` 直接包裹、光标停在闭合标记前输入同一字符时跳过。
 * 返回 null 表示按普通字符插入。
 */
export function markdownTyping(value: MarkdownSelection, text: string): MarkdownSelection | null {
  if (text.length !== 1) return null;
  const { content, start, end } = value;
  const lineStart = start > 0 ? content.lastIndexOf('\n', start - 1) + 1 : 0;
  if (text === '`' && start === end) {
    const prefix = content.slice(lineStart, start);
    const lineEnd = content.indexOf('\n', start);
    const rest = content.slice(start, lineEnd < 0 ? content.length : lineEnd);
    if (/^[\t ]*``$/.test(prefix) && !rest.trim() && !markdownCodeAt(content, lineStart))
      return editMarkdown(value, [{ from: start, to: start, text: '`\n\n```' }], start + 2);
  }
  if (start === end) {
    const opener = closingPairs[text];
    if (opener && content[start] === text && content.slice(lineStart, start).includes(opener))
      return { ...value, start: start + 1, end: start + 1 };
    return null;
  }
  const close = wrappingPairs[text];
  if (!close) return null;
  if (text === '[')
    return editMarkdown(
      value,
      [
        { from: start, to: start, text: '[' },
        { from: end, to: end, text: ']()' },
      ],
      end + 2,
    );
  return editMarkdown(
    value,
    [
      { from: start, to: start, text },
      { from: end, to: end, text: close },
    ],
    start + 1,
    end + 1,
  );
}
export function indentMarkdown(value: MarkdownSelection, outdent = false): MarkdownSelection {
  const from = value.start > 0 ? value.content.lastIndexOf('\n', value.start - 1) + 1 : 0;
  const last =
    value.end > value.start && value.content[value.end - 1] === '\n' ? value.end - 1 : value.end;
  const next = value.content.indexOf('\n', last);
  const to = next < 0 ? value.content.length : next;
  let offset = from;
  const edits = value.content
    .slice(from, to)
    .split('\n')
    .map((line) => {
      const remove = outdent ? (line.match(/^(?: {1,2}|\t)/)?.[0].length ?? 0) : 0;
      const edit = { from: offset, to: offset + remove, text: outdent ? '' : '  ' };
      offset += line.length + 1;
      return edit;
    });
  const size = edits.reduce((total, edit) => total + edit.text.length - edit.to + edit.from, 0);
  return editMarkdown(value, edits, from, to + size);
}
