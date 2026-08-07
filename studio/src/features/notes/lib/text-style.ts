export interface NoteTextStyleAction {
  label: string;
  title: string;
  shortcut?: { key: string; shift?: boolean };
  apply(
    text: string,
    selectionStart: number,
    selectionEnd: number,
  ): { text: string; selectionStart: number; selectionEnd: number };
}

const wrap = (
  text: string,
  start: number,
  end: number,
  before: string,
  after: string,
): { text: string; selectionStart: number; selectionEnd: number } => {
  const prefix = text.slice(0, start);
  const selected = text.slice(start, end);
  const suffix = text.slice(end);
  const isWrapped = selected.startsWith(before) && selected.endsWith(after);
  if (isWrapped && selected.length >= before.length + after.length) {
    const inner = selected.slice(before.length, -after.length);
    return {
      text: `${prefix}${inner}${suffix}`,
      selectionStart: start,
      selectionEnd: start + inner.length,
    };
  }
  return {
    text: `${prefix}${before}${selected || '文本'}${after}${suffix}`,
    selectionStart: start + before.length,
    selectionEnd: start + before.length + (selected ? selected.length : 0),
  };
};

const prefixLine = (
  text: string,
  start: number,
  end: number,
  prefix: string,
  replacePrefix: string,
): { text: string; selectionStart: number; selectionEnd: number } => {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = text.indexOf('\n', end);
  const lineEndResolved = lineEnd === -1 ? text.length : lineEnd;
  const lines = text.slice(lineStart, lineEndResolved).split('\n');
  const wasMarked = lines.every((line) => line.startsWith(replacePrefix));
  const nextLines = wasMarked
    ? lines.map((line) => line.slice(replacePrefix.length))
    : lines.map((line) => `${prefix}${line}`);
  return {
    text: `${text.slice(0, lineStart)}${nextLines.join('\n')}${text.slice(lineEndResolved)}`,
    selectionStart: lineStart,
    selectionEnd: lineStart + nextLines.join('\n').length,
  };
};

export const NOTE_TEXT_ACTIONS: NoteTextStyleAction[] = [
  {
    label: 'B',
    title: '加粗',
    shortcut: { key: 'b' },
    apply: (text, start, end) => wrap(text, start, end, '**', '**'),
  },
  {
    label: 'I',
    title: '斜体',
    shortcut: { key: 'i' },
    apply: (text, start, end) => wrap(text, start, end, '*', '*'),
  },
  {
    label: 'S',
    title: '删除线',
    shortcut: { key: 'x', shift: true },
    apply: (text, start, end) => wrap(text, start, end, '~~', '~~'),
  },
  {
    label: '`',
    title: '行内代码',
    apply: (text, start, end) => wrap(text, start, end, '`', '`'),
  },
  {
    label: 'H1',
    title: '一级标题',
    apply: (text, start, end) => prefixLine(text, start, end, '# ', '# '),
  },
  {
    label: 'H2',
    title: '二级标题',
    apply: (text, start, end) => prefixLine(text, start, end, '## ', '## '),
  },
  {
    label: '•',
    title: '无序列表',
    apply: (text, start, end) => prefixLine(text, start, end, '- ', '- '),
  },
  {
    label: '1.',
    title: '有序列表',
    apply: (text, start, end) => prefixLine(text, start, end, '1. ', '1. '),
  },
  {
    label: '❝',
    title: '引用',
    apply: (text, start, end) => prefixLine(text, start, end, '> ', '> '),
  },
  {
    label: '—',
    title: '分隔线',
    apply: (text, start, end) => {
      const before = text.slice(0, start);
      const suffix = text.slice(end);
      const needsLeading = before.length > 0 && !before.endsWith('\n\n');
      const needsTrailing = suffix.length > 0 && !suffix.startsWith('\n\n');
      return {
        text: `${before}${needsLeading ? '\n\n' : ''}---${needsTrailing ? '\n\n' : ''}${suffix}`,
        selectionStart: start + (needsLeading ? 2 : 0) + 3,
        selectionEnd: start + (needsLeading ? 2 : 0) + 3,
      };
    },
  },
];
