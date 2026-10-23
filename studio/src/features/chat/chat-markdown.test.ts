import { describe, expect, it } from 'vitest';
import { parseChatMarkdown, markdownSummary } from './chat-markdown';
import type { ChatMention } from './chat-types';
const mention = (content: string, name = '小猫'): ChatMention => ({
  guestId: 'cat',
  nickname: name,
  start: content.indexOf('@' + name),
  length: name.length + 1,
});
describe('Chat Markdown', () => {
  it('parses supported blocks and produces a plain summary before truncating', () => {
    const parsed = parseChatMarkdown(
      '# 标题\n\n**粗体** *斜体* [链接](https://example.com)\n\n- 第一项\n- `第二项`\n\n> 引用\n\n```js\nconst a = 1\n```',
    );
    expect(parsed.text).toContain('粗体 斜体 链接');
    expect(parsed.text).toContain('const a = 1');
    expect(parsed.text).not.toContain('**');
    expect(markdownSummary('**' + '猫'.repeat(130) + '**')).toBe('猫'.repeat(120) + '…');
  });
  it('only recognizes selected visible mentions, with metadata identity preserved', () => {
    const text = '**你好 @小猫**，`@小猫`\n\n```\n@小猫\n```';
    const first = mention(text);
    const code = { ...first, start: text.indexOf('@小猫', first.start + 1) };
    const fence = { ...first, start: text.lastIndexOf('@小猫') };
    expect(parseChatMarkdown(text, [first, code, fence]).mentions).toEqual([first]);
    expect(parseChatMarkdown(text).mentions).toEqual([]);
    const weird = '你好 @星**星';
    expect(parseChatMarkdown(weird, [mention(weird, '星**星')]).text).toBe(weird);
    const url = '[链接](https://example.com/@小猫)';
    expect(parseChatMarkdown(url, [mention(url)]).mentions).toEqual([]);
  });
  it('disables images, HTML execution and unsafe links', () => {
    const text =
      '<script>alert(1)</script> ![图片](https://example.com/a.png) [危险](javascript:alert(1))';
    const parsed = parseChatMarkdown(text);
    expect(parsed.tokens.some((token) => token.type === 'html_block')).toBe(false);
    expect(parsed.text).toContain('<script>');
    // 无 DOM 的测试运行器必须安全关闭 HTML 输出。
    expect(parsed.html).not.toContain('<script>');
    expect(parsed.html).not.toContain('<img');
  });
});
