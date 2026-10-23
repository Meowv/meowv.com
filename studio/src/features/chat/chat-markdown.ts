import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import type Token from 'markdown-it/lib/token.mjs';
import type { ChatMention } from './chat-types';

export interface ParsedChatMarkdown {
  html: string;
  text: string;
  mentions: ChatMention[];
  tokens: Token[];
}
export const chatMarkdown = new MarkdownIt('zero', { html: false, breaks: true }).enable([
  'paragraph',
  'newline',
  'escape',
  'entity',
  'backticks',
  'emphasis',
  'link',
  'autolink',
  'heading',
  'list',
  'blockquote',
  'fence',
  'code',
  'text',
]);
chatMarkdown.validateLink = (url) =>
  /^https?:\/\//i.test(url) && ![...url].some((char) => char.charCodeAt(0) <= 32);
chatMarkdown.renderer.rules.link_open = (tokens, index, options, _env, renderer) => {
  tokens[index]!.attrSet('target', '_blank');
  tokens[index]!.attrSet('rel', 'noopener noreferrer');
  return renderer.renderToken(tokens, index, options);
};
chatMarkdown.inline.ruler.at('text', (state, silent) => {
  const rest = state.src.slice(state.pos, state.posMax);
  const stop = rest.search(/[\n!#$%&*+\-:<=>@[\\\]^_`{}~\ue000]/);
  const length = stop < 0 ? rest.length : stop;
  if (!length) return false;
  if (!silent) state.pending += rest.slice(0, length);
  state.pos += length;
  return true;
});
chatMarkdown.inline.ruler.before('text', 'chat_mention', (state, silent) => {
  const env = state.env as { markers?: Map<string, ChatMention>; eligible?: ChatMention[] };
  if (!env.markers || state.src.charAt(state.pos) !== '\ue000') return false;
  const key = state.src.slice(state.pos).match(/^\ue000\d+\ue001/)?.[0];
  const mention = key && env.markers.get(key);
  if (!key || !mention) return false;
  if (!silent) {
    const token = state.push('chat_mention', '', 0);
    token.content = '@' + mention.nickname;
    token.meta = mention;
    env.eligible?.push(mention);
  }
  state.pos += key.length;
  return true;
});
chatMarkdown.renderer.rules.chat_mention = (tokens, index, _options, env) => {
  const mention = tokens[index]!.meta as ChatMention;
  return `<span class="chat-mention-token${mention.guestId === env.selfGuestId ? ' is-self' : ''}" data-chat-guest-id="${chatMarkdown.utils.escapeHtml(mention.guestId)}">${chatMarkdown.utils.escapeHtml(tokens[index]!.content)}</span>`;
};
function plain(tokens: Token[]): string {
  return tokens
    .map((token) => {
      if (token.children) return plain(token.children);
      if (['text', 'code_inline', 'chat_mention'].includes(token.type)) return token.content;
      if (['fence', 'code_block'].includes(token.type)) return token.content.trimEnd() + '\n';
      if (
        token.type === 'softbreak' ||
        token.type === 'hardbreak' ||
        (token.block && token.nesting === -1)
      )
        return '\n';
      return '';
    })
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
export function parseChatMarkdown(
  content: string,
  mentions: ChatMention[] = [],
  selfGuestId?: string,
): ParsedChatMarkdown {
  const markers = new Map<string, ChatMention>();
  let source = content;
  // 原文带有保留分隔符时不替换，避免用户文本伪造内部提及标记。
  if (!/[\ue000\ue001]/.test(content)) {
    let end = 0;
    const pieces: string[] = [];
    for (const mention of [...mentions].sort((a, b) => a.start - b.start)) {
      if (
        mention.start < end ||
        mention.start < 0 ||
        mention.length !== ('@' + mention.nickname).length ||
        content.slice(mention.start, mention.start + mention.length) !== '@' + mention.nickname
      )
        continue;
      const escaped = content.slice(0, mention.start).match(/\\+$/)?.[0].length ?? 0;
      if (escaped % 2) continue;
      const key = `\ue000${markers.size}\ue001`;
      pieces.push(content.slice(end, mention.start), key);
      markers.set(key, mention);
      end = mention.start + mention.length;
    }
    pieces.push(content.slice(end));
    source = pieces.join('');
  }
  const env = { markers, eligible: [] as ChatMention[], selfGuestId };
  const tokens = chatMarkdown.parse(source, env);
  function restore(value: string): string {
    return value.replace(/\ue000\d+\ue001/g, (key) => {
      const mention = markers.get(key);
      return mention ? '@' + mention.nickname : key;
    });
  }
  function visit(items: Token[]) {
    for (const token of items) {
      token.content = restore(token.content);
      if (token.attrs)
        token.attrs = token.attrs.map(([name, value]) => [name, restore(String(value))]);
      if (token.type === 'link_open' && !chatMarkdown.validateLink(token.attrGet('href') ?? ''))
        token.attrSet('href', '');
      if (token.type === 'heading_open' || token.type === 'heading_close') {
        if (Number(token.tag.slice(1)) > 3) token.tag = 'h3';
      }
      if (token.children) visit(token.children);
    }
  }
  visit(tokens);
  const unsafeHtml = chatMarkdown.renderer.render(tokens, chatMarkdown.options, env);
  return {
    html: DOMPurify.isSupported
      ? DOMPurify.sanitize(unsafeHtml, {
          ALLOWED_TAGS: [
            'p',
            'br',
            'strong',
            'em',
            'a',
            'h1',
            'h2',
            'h3',
            'ul',
            'ol',
            'li',
            'blockquote',
            'pre',
            'code',
            'span',
          ],
          ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'data-chat-guest-id', 'start'],
          ALLOW_DATA_ATTR: false,
        })
      : '',
    text: plain(tokens),
    mentions: env.eligible,
    tokens,
  };
}
const cache = new Map<string, ParsedChatMarkdown>();
export function renderedChat(
  content: string,
  mentions: ChatMention[] = [],
  selfGuestId?: string,
): ParsedChatMarkdown {
  const key = JSON.stringify([content, mentions, selfGuestId]);
  let result = cache.get(key);
  if (!result) {
    result = parseChatMarkdown(content, mentions, selfGuestId);
    cache.set(key, result);
    if (cache.size > 250) cache.delete(cache.keys().next().value!);
  }
  return result;
}
export function markdownSummary(content: string): string {
  const text = parseChatMarkdown(content).text;
  const parts = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)];
  return (
    parts
      .slice(0, 120)
      .map((part) => part.segment)
      .join('') + (parts.length > 120 ? '…' : '')
  );
}
