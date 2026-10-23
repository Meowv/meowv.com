import { describe, expect, it } from 'vitest';
import { mentionParts, mentionQuery, prepareMentions, rebaseMentions } from './chat-mentions';
import type { ChatMention } from './chat-types';

const mention: ChatMention = { guestId: 'guest-a', nickname: '小猫', start: 3, length: 3 };
describe('Chat mentions', () => {
  it('tracks selected identities through edits and drops edited tokens', () => {
    expect(rebaseMentions('你好 @小猫 ', '早上你好 @小猫 ', [mention])[0]?.start).toBe(5);
    expect(rebaseMentions('你好 @小猫 ', '你好 @小狗 ', [mention])).toEqual([]);
    expect(rebaseMentions('你好 @小猫 ', '你好 @小猫 好的', [mention])[0]?.guestId).toBe('guest-a');
    expect(rebaseMentions('你好 @小猫 ', '你好 ', [mention])).toEqual([]);
  });
  it('uses the active caret and excludes selected mentions and email addresses', () => {
    expect(mentionQuery('@小', 2, [])).toEqual({ start: 0, query: '小' });
    expect(mentionQuery('@小', 0, [])).toBeNull();
    expect(mentionQuery('mail@example.com', 8, [])).toBeNull();
    expect(mentionQuery('你好 @小猫 ', 7, [mention])).toBeNull();
    expect(mentionQuery('@小猫\n你好', 6, [])).toBeNull();
  });
  it('adjusts offsets after trimming and preserves UTF-16 positions for emoji', () => {
    const emojiMention = { ...mention, start: 5 };
    expect(prepareMentions('  😀 @小猫  ', [emojiMention])).toEqual({
      content: '😀 @小猫',
      mentions: [{ guestId: 'guest-a', start: 3, length: 3 }],
    });
    expect(prepareMentions(' @小猫 ', [])).toEqual({ content: '@小猫', mentions: [] });
  });
  it('keeps same-name targets separate and renders plain text without HTML interpretation', () => {
    const mentions = [
      { ...mention, start: 0 },
      { ...mention, guestId: 'guest-b', start: 4 },
    ];
    const parts = mentionParts('@小猫 @小猫 <img>', mentions);
    expect(parts.filter((part) => part.mention).map((part) => part.mention?.guestId)).toEqual([
      'guest-a',
      'guest-b',
    ]);
    expect(parts.at(-1)?.text).toBe(' <img>');
    expect(mentionParts('@小猫', [{ ...mention, start: 99 }])).toEqual([{ text: '@小猫' }]);
  });
});
