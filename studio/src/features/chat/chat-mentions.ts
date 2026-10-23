import type { ChatMention, ChatMentionRequest } from './chat-types';

export function rebaseMentions(
  previous: string,
  next: string,
  mentions: ChatMention[],
): ChatMention[] {
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
  let oldEnd = previous.length;
  let newEnd = next.length;
  while (oldEnd > start && newEnd > start && previous[oldEnd - 1] === next[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  const delta = newEnd - oldEnd;
  return mentions.flatMap((mention) => {
    const end = mention.start + mention.length;
    const shifted =
      end <= start
        ? mention
        : mention.start >= oldEnd
          ? { ...mention, start: mention.start + delta }
          : null;
    return shifted &&
      next.slice(shifted.start, shifted.start + shifted.length) === '@' + shifted.nickname
      ? [shifted]
      : [];
  });
}

export function mentionQuery(
  text: string,
  caret: number,
  mentions: ChatMention[],
): { start: number; query: string } | null {
  if (caret <= 0) return null;
  const start = text.lastIndexOf('@', caret - 1);
  if (start < 0 || (start > 0 && !/\s/.test(text[start - 1]!))) return null;
  if (mentions.some((mention) => mention.start === start)) return null;
  const query = text.slice(start + 1, caret);
  if (query.length > 64 || /[\r\n@]/.test(query)) return null;
  return { start, query };
}

export function prepareMentions(
  text: string,
  mentions: ChatMention[],
): { content: string; mentions: ChatMentionRequest[] } {
  const normalized = text.replaceAll('\r\n', '\n').normalize('NFC');
  const adjusted = rebaseMentions(text, normalized, mentions);
  const leading = normalized.length - normalized.trimStart().length;
  const content = normalized.trim();
  return {
    content,
    mentions: adjusted
      .filter(
        (mention) =>
          mention.start >= leading && mention.start + mention.length <= leading + content.length,
      )
      .map(({ guestId, start, length }) => ({ guestId, start: start - leading, length })),
  };
}

export function mentionParts(
  content: string,
  mentions: ChatMention[],
): { text: string; mention?: ChatMention }[] {
  const parts: { text: string; mention?: ChatMention }[] = [];
  let cursor = 0;
  for (const mention of [...mentions].sort((a, b) => a.start - b.start)) {
    if (
      mention.start < cursor ||
      mention.start < 0 ||
      content.slice(mention.start, mention.start + mention.length) !== '@' + mention.nickname
    )
      continue;
    if (cursor < mention.start) parts.push({ text: content.slice(cursor, mention.start) });
    parts.push({ text: content.slice(mention.start, mention.start + mention.length), mention });
    cursor = mention.start + mention.length;
  }
  if (cursor < content.length) parts.push({ text: content.slice(cursor) });
  return parts;
}
