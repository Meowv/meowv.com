import { defineStore } from 'pinia';
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
  const merged = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const previous = merged.get(message.id);
    if (previous && previous.revision > message.revision) continue;
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
  return [...merged.values()].sort((a, b) => compareMessageIds(a.id, b.id));
}
export function quoteMessage(message: ChatMessage): ChatReply {
  const parts = [
    ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(message.content),
  ];
  return {
    id: message.id,
    nickname: message.nickname,
    content: message.deleted
      ? ''
      : parts
          .slice(0, 120)
          .map((part) => part.segment)
          .join('') + (parts.length > 120 ? '…' : ''),
    deleted: message.deleted,
    unavailable: false,
    revision: message.revision,
  };
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
    merge(messages: ChatMessage[]) {
      this.messages = mergeMessages(
        this.messages,
        messages.filter((message) => !this.purgedIds[message.id]),
        this.deletedIds,
      );
      this.syncReplies();
    },
    syncReplies() {
      const byId = new Map(this.messages.map((message) => [message.id, message]));
      this.messages = this.messages.map((message) => {
        if (!message.reply || message.deleted)
          return message.deleted ? { ...message, reply: null } : message;
        let reply = message.reply;
        const original = byId.get(reply.id);
        if (this.purgedIds[reply.id])
          reply = { ...reply, content: '', nickname: '', unavailable: true };
        else if ((this.deletedIds[reply.id] ?? -1) > reply.revision)
          reply = { ...reply, content: '', deleted: true, revision: this.deletedIds[reply.id]! };
        else if (original && original.revision >= reply.revision) reply = quoteMessage(original);
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
