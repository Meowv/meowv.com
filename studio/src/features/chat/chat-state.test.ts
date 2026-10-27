import { beforeEach, describe, expect, it } from 'vitest';
import {
  characterCount,
  compareMessageIds,
  mergeMessages,
  limitChatInput,
  validContent,
  validNickname,
} from './chat-state';
import { createPinia, setActivePinia } from 'pinia';
import { useChatStore, quoteMessage } from './chat-state';
import type { ChatMessage } from './chat-types';

function message(id: string, deleted = false): ChatMessage {
  return {
    id,
    clientMessageId: `client-${id}`,
    guestId: 'guest',
    nickname: '访客',
    avatarSeed: 'seed',
    content: 'text',
    createdAt: '2026-10-23T00:00:00Z',
    deleted,
    revision: 0,
    reply: null,
    mentions: [],
  };
}
describe('Chat messages', () => {
  it('sorts decimal IDs beyond JavaScript integer precision and removes duplicate broadcasts', () => {
    expect(compareMessageIds('9007199254740993', '9007199254740992')).toBe(1);
    expect(
      mergeMessages(
        [message('9007199254740993')],
        [message('9007199254740992'), message('9007199254740993')],
      ).map((item) => item.id),
    ).toEqual(['9007199254740992', '9007199254740993']);
  });
  it('never resurrects deleted text from an older history response', () => {
    expect(mergeMessages([message('1', true)], [message('1')])[0]).toMatchObject({
      deleted: true,
      content: '',
    });
    expect(mergeMessages([], [message('1')], { '1': 1 })[0]).toMatchObject({
      deleted: true,
      content: '',
    });
  });
});
describe('Chat input rules', () => {
  it('counts user-visible characters, normalizes combining marks and enforces UTF-8 limits', () => {
    expect(characterCount('👩‍💻e\u0301')).toBe(2);
    expect(validNickname('  访客👩‍💻  ')).toBe(true);
    expect(validNickname('a')).toBe(false);
    expect(validNickname('hello\nworld')).toBe(false);
    expect(validNickname('👨‍👩‍👧‍👦'.repeat(3))).toBe(false);
    expect(validContent('e\u0301'.repeat(500), 500, 2048)).toBe(true);
    expect(validContent('👨‍👩‍👧‍👦'.repeat(100), 500, 2048)).toBe(false);
    expect(validContent('a'.repeat(501), 500, 2048)).toBe(false);
    expect(validContent(' \n ', 500, 2048)).toBe(false);
    expect(validContent('hello\nworld', 500, 2048)).toBe(true);
    expect(validContent('hello\u0000world', 500, 2048)).toBe(false);
  });
  it('caps typed and pasted content without splitting visible Unicode characters', () => {
    expect(limitChatInput('a'.repeat(501), 500, 2048)).toBe('a'.repeat(500));
    expect(limitChatInput('你'.repeat(501), 500, 2048)).toBe('你'.repeat(500));
    expect(limitChatInput('👩‍💻'.repeat(3), 2, 2048)).toBe('👩‍💻'.repeat(2));
    expect(limitChatInput('e\u0301'.repeat(501), 500, 2048)).toBe('é'.repeat(500));
    expect(limitChatInput('👨‍👩‍👧‍👦'.repeat(100), 500, 2048)).toBe('👨‍👩‍👧‍👦'.repeat(81));
    expect(limitChatInput('a'.repeat(499) + '\nX', 500, 2048)).toBe('a'.repeat(499) + '\n');
  });
});

describe('Chat reply previews', () => {
  beforeEach(() => setActivePinia(createPinia()));
  it('hides and restores quoted content even when the original is outside the window', () => {
    const store = useChatStore();
    const original = message('1');
    const reply = { ...message('50'), reply: quoteMessage(original) };
    store.merge([reply]);
    store.remove('1', false, 1);
    expect(store.messages[0]!.reply).toMatchObject({ deleted: true, content: '' });
    store.restore({ ...original, revision: 2 });
    expect(store.messages.map((item) => item.id)).toEqual(['50']);
    expect(store.messages[0]!.reply).toMatchObject({
      deleted: false,
      content: 'text',
      revision: 2,
    });
    store.merge([{ ...reply, reply: { ...reply.reply, content: '', deleted: true, revision: 1 } }]);
    expect(store.messages[0]!.reply?.content).toBe('text');
    store.remove('1', true);
    store.merge([reply]);
    expect(store.messages[0]!.reply).toMatchObject({ unavailable: true, content: '' });
  });
});

describe('Chat window retention', () => {
  beforeEach(() => setActivePinia(createPinia()));
  it('bounds live messages and keeps earlier history reachable', () => {
    const store = useChatStore();
    store.merge(Array.from({ length: 501 }, (_, i) => message(String(i + 1))));
    expect(store.messages).toHaveLength(500);
    expect(store.messages[0]!.id).toBe('2');
    expect(store.historyCursor).toBe('2');
    expect(store.hasMoreHistory).toBe(true);
  });
  it('preserves untouched references and cached quote summaries', () => {
    const first = message('1');
    const second = message('2');
    expect(mergeMessages([first], [second])[0]).toBe(first);
    expect(quoteMessage(first)).toBe(quoteMessage(first));
    const store = useChatStore();
    store.merge([first, { ...second, reply: quoteMessage(first) }]);
    const saved = store.messages[1];
    store.merge([message('3')]);
    expect(store.messages[1]).toBe(saved);
  });
});
