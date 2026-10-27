import { defineStore } from 'pinia';
import { markdownSummary } from './chat-markdown';
import type { ChatMessage, ChatReply, ChatSession, ConnectionStatus } from './chat-types';

export function compareMessageIds(a: string, b: string): number {
  const first = BigInt(a);
  const second = BigInt(b);
  return first < second ? -1 : first > second ? 1 : 0;
}
export function mergeMessages(
  current: ChatMessage[],
  incoming: ChatMessage[],
  deletedIds: Record<string, number> = {},
): ChatMessage[] {
  const merged = new Map<string, ChatMessage>();
  const existing = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const previous = merged.get(message.id) ?? existing.get(message.id);
    if (previous && previous.revision > message.revision) {
      merged.set(message.id, previous);
      continue;
    }
    const deleted =
      (deletedIds[message.id] ?? -1) >= message.revision ||
      (previous?.revision === message.revision && previous.deleted) ||
      message.deleted;
    let reply = message.reply;
    if (
      reply &&
      previous?.reply?.id === reply.id &&
      (previous.reply.unavailable ||
        (!reply.unavailable && previous.reply.revision > reply.revision))
    )
      reply = previous.reply;
    merged.set(message.id, {
      ...message,
      deleted: !!deleted,
      content: deleted ? '' : message.content,
      mentions: deleted ? [] : message.mentions,
      reply: deleted ? null : reply,
    });
  }
  const batch = [...merged.values()].sort((a, b) => compareMessageIds(a.id, b.id));
  const result: ChatMessage[] = [];
  let left = 0;
  let right = 0;
  while (left < current.length && right < batch.length) {
    const comparison = compareMessageIds(current[left]!.id, batch[right]!.id);
    if (comparison < 0) result.push(current[left++]!);
    else {
      result.push(batch[right++]!);
      if (comparison === 0) left++;
    }
  }
  return result.concat(current.slice(left), batch.slice(right));
}
const quoteCache = new WeakMap<ChatMessage, ChatReply>();
export const CHAT_WINDOW_LIMIT = 500;
export function quoteMessage(message: ChatMessage): ChatReply {
  const cached = quoteCache.get(message);
  if (cached) return cached;
  const reply: ChatReply = {
    id: message.id,
    nickname: message.nickname,
    content: message.deleted ? '' : markdownSummary(message.content),
    deleted: message.deleted,
    unavailable: false,
    revision: message.revision,
  };
  quoteCache.set(message, reply);
  return reply;
}
export function characterCount(value: string): number {
  return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)].length;
}
export function limitChatInput(value: string, maxChars: number, maxBytes: number): string {
  const normalized = value.replaceAll('\r\n', '\n').normalize('NFC');
  const encoder = new TextEncoder();
  let result = '';
  let count = 0;
  let bytes = 0;
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
    normalized,
  )) {
    const size = encoder.encode(segment).length;
    if (count >= maxChars || bytes + size > maxBytes) break;
    result += segment;
    count++;
    bytes += size;
  }
  return result;
}

export function validNickname(value: string): boolean {
  const name = value.normalize('NFC').trim();
  const count = characterCount(name);
  return (
    count >= 2 &&
    count <= 20 &&
    new TextEncoder().encode(name).length <= 64 &&
    !/[\p{Cc}]/u.test(value)
  );
}
export function validContent(value: string, chars: number, bytes: number): boolean {
  const content = value.replaceAll('\r\n', '\n').normalize('NFC').trim();
  return (
    !!content &&
    characterCount(content) <= chars &&
    new TextEncoder().encode(content).length <= bytes &&
    ![...content].some((char) => /[\p{Cc}]/u.test(char) && char !== '\n' && char !== '\t')
  );
}
export const useChatStore = defineStore('chat', {
  state: () => ({
    session: null as ChatSession | null,
    connectionStatus: 'idle' as ConnectionStatus,
    messages: [] as ChatMessage[],
    deletedIds: {} as Record<string, number>,
    purgedIds: {} as Record<string, boolean>,
    pendingMessages: {} as Record<string, 'pending' | 'failed'>,
    onlineUsers: 0,
    messageCleanupEnabled: false,
    retentionDays: 7,
    maxMessageChars: 500,
    maxMessageBytes: 2048,
    hasMoreHistory: false,
    historyCursor: null as string | null,
    loadingHistory: false,
    hasNewerHistory: false,
    error: '',
    unavailable: false,
  }),
  actions: {
    merge(messages: ChatMessage[], direction: 'older' | 'newer' = 'newer') {
      this.messages = mergeMessages(
        this.messages,
        messages.filter((message) => !this.purgedIds[message.id]),
        this.deletedIds,
      );
      if (this.messages.length > CHAT_WINDOW_LIMIT) {
        if (direction === 'older') {
          this.messages = this.messages.slice(0, CHAT_WINDOW_LIMIT);
          this.hasNewerHistory = true;
        } else {
          this.messages = this.messages.slice(-CHAT_WINDOW_LIMIT);
          this.hasMoreHistory = true;
          this.historyCursor = this.messages[0]!.id;
        }
      }
      this.syncReplies();
    },
    syncReplies() {
      const byId = new Map(this.messages.map((message) => [message.id, message]));
      this.messages = this.messages.map((message) => {
        if (!message.reply || message.deleted)
          return message.deleted && message.reply ? { ...message, reply: null } : message;
        let reply = message.reply;
        const original = byId.get(reply.id);
        if (this.purgedIds[reply.id])
          reply = { ...reply, content: '', nickname: '', unavailable: true };
        else if ((this.deletedIds[reply.id] ?? -1) > reply.revision)
          reply = { ...reply, content: '', deleted: true, revision: this.deletedIds[reply.id]! };
        else if (original && original.revision >= reply.revision) reply = quoteMessage(original);
        if (
          reply.id === message.reply.id &&
          reply.content === message.reply.content &&
          reply.nickname === message.reply.nickname &&
          reply.deleted === message.reply.deleted &&
          reply.unavailable === message.reply.unavailable &&
          reply.revision === message.reply.revision
        )
          return message;
        return { ...message, reply };
      });
    },
    restore(message: ChatMessage) {
      if (this.purgedIds[message.id] || (this.deletedIds[message.id] ?? -1) >= message.revision)
        return;
      delete this.deletedIds[message.id];
      if (this.messages.some((item) => item.id === message.id)) this.merge([message]);
      // 原消息可能不在当前窗口，仍需更新已加载回复中的摘要。
      this.messages = this.messages.map((item) =>
        item.reply?.id === message.id && item.reply.revision <= message.revision
          ? { ...item, reply: quoteMessage(message) }
          : item,
      );
    },
    remove(id: string, permanent = false, revision = 1) {
      if (permanent) {
        this.purgedIds[id] = true;
        this.messages = this.messages.filter((message) => message.id !== id);
        this.syncReplies();
        return;
      }
      if (
        (this.messages.find((message) => message.id === id)?.revision ?? -1) > revision ||
        (this.deletedIds[id] ?? -1) > revision
      )
        return;
      this.deletedIds[id] = revision;
      this.messages = this.messages.map((message) =>
        message.id === id
          ? { ...message, content: '', mentions: [], deleted: true, revision }
          : message,
      );
      this.syncReplies();
    },
  },
});
