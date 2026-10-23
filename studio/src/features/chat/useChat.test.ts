import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { ChatMessage } from './chat-types';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  join: vi.fn(),
  logout: vi.fn(),
  history: vi.fn(),
  status: vi.fn(),
  context: vi.fn(),
  participants: vi.fn(),
  unmount: [] as Array<() => void>,
  hubs: [] as Array<{
    handlers: Record<string, (...args: never[]) => void>;
    reconnecting: () => void;
    reconnected: () => Promise<void>;
    invoke: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }>,
}));
vi.mock('vue', async (original) => ({
  ...(await original<typeof import('vue')>()),
  onBeforeUnmount: (callback: () => void) => mocks.unmount.push(callback),
}));
vi.mock('./chat-api', async (original) => ({
  ...(await original<typeof import('./chat-api')>()),
  chatApi: mocks,
}));
vi.mock('@microsoft/signalr', () => ({
  HubConnectionState: { Connected: 'Connected' },
  LogLevel: { None: 6 },
  HubConnectionBuilder: class {
    hub = {
      state: 'Connected',
      handlers: {} as Record<string, (...args: never[]) => void>,
      reconnecting: () => {},
      reconnected: async () => {},
      on: (event: string, callback: (...args: never[]) => void) => {
        this.hub.handlers[event] = callback;
      },
      onreconnecting: (callback: () => void) => {
        this.hub.reconnecting = callback;
      },
      onreconnected: (callback: () => Promise<void>) => {
        this.hub.reconnected = callback;
      },
      onclose: vi.fn(),
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      invoke: vi.fn(),
    };
    withUrl() {
      return this;
    }
    withAutomaticReconnect() {
      return this;
    }
    configureLogging() {
      return this;
    }
    build() {
      mocks.hubs.push(this.hub);
      return this.hub;
    }
  },
}));
import { useChat } from './useChat';
const session = {
  guest: { id: 'guest', nickname: '访客', avatarSeed: 'seed' },
  expiresAt: '2099-01-01',
};
function message(id: string): ChatMessage {
  return {
    id,
    clientMessageId: `client-${id}`,
    guestId: 'guest',
    nickname: '访客',
    avatarSeed: 'seed',
    content: 'text',
    createdAt: '2026-10-23T00:00:00Z',
    deleted: false,
    revision: 0,
    reply: null,
    mentions: [],
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.hubs.length = 0;
  mocks.unmount.length = 0;
  setActivePinia(createPinia());
  mocks.session.mockResolvedValue(session);
  mocks.join.mockResolvedValue(session);
  mocks.history.mockResolvedValue({ items: [message('1')], hasMore: false, nextCursor: '1' });
  mocks.status.mockResolvedValue({
    onlineUsers: 1,
    messageCleanupEnabled: false,
    retentionDays: 7,
    maxMessageChars: 500,
    maxMessageBytes: 2048,
  });
});
describe('Chat connection lifecycle', () => {
  it('reuses failed message IDs and reconciles the ack with the broadcast', async () => {
    const chat = useChat();
    await chat.initialize();
    const hub = mocks.hubs[0]!;
    hub.invoke.mockRejectedValueOnce(new Error('ack lost'));
    expect(await chat.send('hello')).toBe(false);
    const id = hub.invoke.mock.calls[0]![1];
    hub.invoke.mockResolvedValueOnce({
      id: '2',
      clientMessageId: id,
      createdAt: '2026-10-23T00:00:00Z',
    });
    chat.store.merge([{ ...message('2'), clientMessageId: id }]);
    expect(await chat.send('hello')).toBe(true);
    expect(hub.invoke.mock.calls[1]![1]).toBe(id);
    expect(chat.store.messages.map((item) => item.id)).toEqual(['1', '2']);
    expect(chat.store.pendingMessages).toEqual({});
  });
  it('uses the cursor captured before reconnect and catches up through every page', async () => {
    const chat = useChat();
    await chat.initialize();
    const hub = mocks.hubs[0]!;
    hub.reconnecting();
    chat.store.merge([message('5')]);
    mocks.history
      .mockResolvedValueOnce({
        items: [message('2'), message('3')],
        hasMore: true,
        nextCursor: '3',
      })
      .mockResolvedValueOnce({
        items: [message('4'), message('5')],
        hasMore: false,
        nextCursor: '5',
      });
    mocks.history.mockResolvedValueOnce({ items: [message('1')], hasMore: false, nextCursor: '1' });
    mocks.history.mockResolvedValueOnce({
      items: [message('2'), message('3'), message('4'), message('5')],
      hasMore: false,
      nextCursor: '5',
    });
    await hub.reconnected();
    expect(mocks.history.mock.calls[1]![1]).toEqual({ afterId: '1' });
    expect(mocks.history.mock.calls[2]![1]).toEqual({ afterId: '3' });
    expect(chat.store.messages.map((item) => item.id)).toEqual(['1', '2', '3', '4', '5']);
  });
  it('ignores HTTP completion and late events after route unmount', async () => {
    const chat = useChat();
    await chat.initialize();
    const hub = mocks.hubs[0]!;
    mocks.unmount.forEach((callback) => callback());
    expect(hub.stop).toHaveBeenCalledOnce();
    expect(chat.store.messages).toEqual([]);
    const late = hub.handlers['message.created'] as unknown as (message: ChatMessage) => void;
    late(message('99'));
    expect(chat.store.messages).toEqual([]);
  });
  it('stops an initial failed connection and permits manual restart', async () => {
    mocks.history.mockRejectedValueOnce(new Error('unavailable'));
    const chat = useChat();
    await chat.initialize();
    expect(chat.store.connectionStatus).toBe('disconnected');
    expect(mocks.hubs[0]!.stop).toHaveBeenCalledOnce();
    await chat.connect();
    expect(chat.store.connectionStatus).toBe('connected');
    expect(mocks.hubs).toHaveLength(2);
  });
  it('refreshes a deletion missed while disconnected', async () => {
    const chat = useChat();
    await chat.initialize();
    const hub = mocks.hubs[0]!;
    hub.reconnecting();
    mocks.history
      .mockResolvedValueOnce({ items: [], hasMore: false, nextCursor: null })
      .mockResolvedValueOnce({
        items: [{ ...message('1'), content: '', deleted: true }],
        hasMore: false,
        nextCursor: '1',
      });
    await hub.reconnected();
    expect(chat.store.messages[0]).toMatchObject({ deleted: true, content: '' });
  });
  it('removes physically deleted messages missed offline and ignores stale history', async () => {
    const chat = useChat();
    await chat.initialize();
    const hub = mocks.hubs[0]!;
    hub.reconnecting();
    mocks.history.mockResolvedValueOnce({ items: [], hasMore: false, nextCursor: null });
    mocks.history.mockResolvedValueOnce({ items: [], hasMore: false, nextCursor: null });
    await hub.reconnected();
    expect(chat.store.messages).toEqual([]);
    chat.store.merge([message('1')]);
    expect(chat.store.messages).toEqual([]);
  });
  it('distinguishes live permanent deletion from marked deletion', async () => {
    const chat = useChat();
    await chat.initialize();
    const deleted = mocks.hubs[0]!.handlers['message.deleted'] as unknown as (event: {
      id: string;
      permanent: boolean;
      revision: number;
    }) => void;
    deleted({ id: '1', permanent: false, revision: 1 });
    expect(chat.store.messages[0]).toMatchObject({ content: '', deleted: true });
    deleted({ id: '1', permanent: true, revision: 1 });
    expect(chat.store.messages).toEqual([]);
    chat.store.merge([message('1')]);
    expect(chat.store.messages).toEqual([]);
  });
  it('restores text with a new revision and ignores stale deletion events and history', async () => {
    const chat = useChat();
    await chat.initialize();
    const handlers = mocks.hubs[0]!.handlers;
    const deleted = handlers['message.deleted'] as unknown as (event: {
      id: string;
      permanent: boolean;
      revision: number;
    }) => void;
    const restored = handlers['message.restored'] as unknown as (message: ChatMessage) => void;
    deleted({ id: '1', permanent: false, revision: 1 });
    restored({ ...message('1'), revision: 2 });
    deleted({ id: '1', permanent: false, revision: 1 });
    chat.store.merge([{ ...message('1'), content: '', deleted: true, revision: 1 }]);
    expect(chat.store.messages[0]).toMatchObject({ content: 'text', deleted: false, revision: 2 });
    deleted({ id: '1', permanent: false, revision: 3 });
    restored({ ...message('1'), revision: 2 });
    expect(chat.store.messages[0]).toMatchObject({ content: '', deleted: true, revision: 3 });
  });
  it('locates older messages without merging live messages across a history gap', async () => {
    const chat = useChat();
    await chat.initialize();
    mocks.context.mockResolvedValueOnce({
      items: [message('10'), message('11')],
      hasMoreBefore: true,
      hasMoreAfter: true,
    });
    expect(await chat.focus('10')).toBe(true);
    expect(chat.store.messages.map((item) => item.id)).toEqual(['10', '11']);
    const created = mocks.hubs[0]!.handlers['message.created'] as unknown as (
      item: ChatMessage,
    ) => void;
    created(message('100'));
    expect(chat.store.messages.map((item) => item.id)).toEqual(['10', '11']);
    mocks.history.mockResolvedValueOnce({
      items: [message('98'), message('99')],
      hasMore: true,
      nextCursor: '98',
    });
    expect(await chat.latest()).toBe(true);
    expect(chat.store.messages.map((item) => item.id)).toEqual(['98', '99', '100']);
    expect(chat.store.hasNewerHistory).toBe(false);
  });
  it('keeps the selected quote attached when retrying a lost acknowledgement', async () => {
    const chat = useChat();
    await chat.initialize();
    const hub = mocks.hubs[0]!;
    hub.invoke.mockRejectedValueOnce(new Error('ack lost'));
    expect(await chat.send('reply', '1')).toBe(false);
    const clientId = hub.invoke.mock.calls[0]![1];
    const reply = {
      id: '1',
      nickname: '访客',
      content: 'text',
      deleted: false,
      unavailable: false,
      revision: 0,
    };
    hub.invoke.mockResolvedValueOnce({
      id: '2',
      clientMessageId: clientId,
      createdAt: '2026-10-23T00:00:00Z',
      reply,
    });
    expect(await chat.send('reply', '1')).toBe(true);
    expect(hub.invoke.mock.calls[1]).toEqual(['SendMessage', clientId, 'reply', '1', []]);
    expect(chat.store.messages.at(-1)?.reply).toEqual(reply);
  });
  it('notifies only the selected guest for new mentions, deduplicates, and clears deleted alerts', async () => {
    const chat = useChat();
    await chat.initialize();
    const created = mocks.hubs[0]!.handlers['message.created'] as unknown as (
      item: ChatMessage,
    ) => void;
    const deleted = mocks.hubs[0]!.handlers['message.deleted'] as unknown as (item: {
      id: string;
      permanent: boolean;
      revision: number;
    }) => void;
    const incoming = {
      ...message('2'),
      guestId: 'other',
      content: '@访客',
      mentions: [{ guestId: 'guest', nickname: '访客', start: 0, length: 3 }],
    };
    created(incoming);
    created(incoming);
    created({
      ...incoming,
      id: '3',
      mentions: [{ ...incoming.mentions[0]!, guestId: 'same-name-other' }],
    });
    expect(chat.mentionIds.value).toEqual(['2']);
    chat.mentionIds.value = [];
    created(incoming);
    expect(chat.mentionIds.value).toEqual([]);
    deleted({ id: '2', permanent: false, revision: 1 });
    expect(chat.mentionIds.value).toEqual([]);
    expect(chat.store.messages.find((item) => item.id === '2')!.mentions).toEqual([]);
  });
  it('preserves selected mention identities across lost acknowledgements', async () => {
    const chat = useChat();
    await chat.initialize();
    const hub = mocks.hubs[0]!;
    const selection = [{ guestId: 'other', start: 0, length: 3 }];
    hub.invoke.mockRejectedValueOnce(new Error('ack lost'));
    expect(await chat.send('@小猫', null, selection)).toBe(false);
    const id = hub.invoke.mock.calls[0]![1];
    hub.invoke.mockResolvedValueOnce({
      id: '2',
      clientMessageId: id,
      createdAt: '2026-10-23',
      reply: null,
      mentions: [{ ...selection[0]!, nickname: '小猫' }],
    });
    expect(await chat.send('@小猫', null, selection)).toBe(true);
    expect(hub.invoke.mock.calls[1]).toEqual(['SendMessage', id, '@小猫', null, selection]);
    expect(chat.store.messages.at(-1)!.mentions[0]!.guestId).toBe('other');
  });
  it('loads the initial history again after a failed initial request despite a newer broadcast', async () => {
    mocks.history.mockRejectedValueOnce(new Error('unavailable'));
    const chat = useChat();
    await chat.initialize();
    chat.store.merge([message('5')]);
    mocks.history.mockResolvedValueOnce({
      items: [message('1'), message('2'), message('3'), message('4'), message('5')],
      hasMore: false,
      nextCursor: '1',
    });
    await chat.connect();
    expect(mocks.history.mock.calls[1]![1]).toBeUndefined();
    expect(chat.store.messages.map((item) => item.id)).toEqual(['1', '2', '3', '4', '5']);
  });
});
