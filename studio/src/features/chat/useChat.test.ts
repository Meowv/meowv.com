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
    closed: () => Promise<void>;
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
      closed: async () => {},
      onclose: (callback: () => Promise<void>) => {
        this.hub.closed = callback;
      },
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
import { ChatApiError } from './chat-api';
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

describe('Chat bounded history and recovery', () => {
  const range = (first: number, count: number) =>
    Array.from({ length: count }, (_, i) => message(String(first + i)));
  it('keeps disconnected status after close while REST still succeeds', async () => {
    const chat = useChat();
    await chat.initialize();
    await mocks.hubs[0]!.closed();
    expect(chat.store.connectionStatus).toBe('disconnected');
    expect(chat.store.session).toEqual(session);
    expect(chat.store.error).toBe('');
  });
  it.each([500, 502, 503, 504])('marks initial HTTP %i as unavailable', async (status) => {
    mocks.session.mockRejectedValueOnce(new ChatApiError(status, 'unavailable', 'unavailable'));
    const chat = useChat();
    await chat.initialize();
    expect(chat.store.unavailable).toBe(true);
  });
  it('keeps retry initialization pending until service availability is known', async () => {
    mocks.session.mockRejectedValueOnce(new ChatApiError(502, 'unavailable', 'unavailable'));
    const chat = useChat();
    await chat.initialize();
    let reject!: (error: Error) => void;
    mocks.session.mockReturnValueOnce(new Promise((_, fail) => (reject = fail)));
    const retry = chat.initialize();
    expect(chat.initializing.value).toBe(true);
    reject(new ChatApiError(503, 'unavailable', 'unavailable'));
    await retry;
    expect(chat.initializing.value).toBe(false);
    expect(chat.store.unavailable).toBe(true);
  });
  it('clears a mention target only on 404 and preserves transient failures', async () => {
    const chat = useChat();
    await chat.initialize();
    chat.mentionIds.value = ['100', '101'];
    mocks.context.mockRejectedValueOnce(new ChatApiError(502, 'unavailable', 'retry'));
    expect(await chat.focus('100')).toBe(false);
    expect(chat.mentionIds.value).toEqual(['100', '101']);
    mocks.context.mockRejectedValueOnce(new ChatApiError(404, 'not_found', 'missing'));
    expect(await chat.focus('100')).toBe(false);
    expect(chat.mentionIds.value).toEqual(['101']);
  });
  it('pages backward and forward through a bounded continuous window', async () => {
    const chat = useChat();
    await chat.initialize();
    chat.store.messages = range(101, 500);
    chat.store.hasMoreHistory = true;
    chat.store.historyCursor = '101';
    mocks.history.mockResolvedValueOnce({ items: range(1, 100), hasMore: false, nextCursor: '1' });
    await chat.older();
    expect(chat.store.messages.map((item) => item.id)).toEqual(
      range(1, 500).map((item) => item.id),
    );
    expect(chat.store.hasNewerHistory).toBe(true);
    mocks.history.mockResolvedValueOnce({
      items: range(501, 100),
      hasMore: false,
      nextCursor: '600',
    });
    await chat.newer();
    expect(chat.store.messages.map((item) => item.id)).toEqual(
      range(101, 500).map((item) => item.id),
    );
    expect(chat.store.hasMoreHistory).toBe(true);
    expect(chat.store.historyCursor).toBe('101');
    expect(chat.store.hasNewerHistory).toBe(false);
  });
  it('recovers overflowing deferred broadcasts through every server page', async () => {
    const chat = useChat();
    await chat.initialize();
    chat.store.hasNewerHistory = true;
    const created = mocks.hubs[0]!.handlers['message.created'] as unknown as (
      item: ChatMessage,
    ) => void;
    for (const item of range(2, 700)) created(item);
    mocks.history.mockResolvedValueOnce({ items: [message('2')], hasMore: false, nextCursor: '2' });
    mocks.history.mockResolvedValueOnce({ items: range(3, 400), hasMore: true, nextCursor: '402' });
    mocks.history.mockResolvedValueOnce({
      items: range(403, 299),
      hasMore: false,
      nextCursor: '701',
    });
    await chat.newer();
    expect(mocks.history.mock.calls.slice(-2).map((call) => call[1])).toEqual([
      { afterId: '2' },
      { afterId: '402' },
    ]);
    expect(chat.store.messages.map((item) => item.id)).toEqual(
      range(202, 500).map((item) => item.id),
    );
  });
  it('deduplicates deferred IDs and preserves the focused target', async () => {
    const chat = useChat();
    await chat.initialize();
    chat.store.hasNewerHistory = true;
    const created = mocks.hubs[0]!.handlers['message.created'] as unknown as (
      item: ChatMessage,
    ) => void;
    for (let i = 0; i < 800; i++) created(message('999'));
    mocks.context.mockResolvedValueOnce({
      items: [message('10')],
      hasMoreBefore: true,
      hasMoreAfter: false,
    });
    expect(await chat.focus('10')).toBe(true);
    expect(chat.store.messages.map((item) => item.id)).toEqual(['10']);
    expect(chat.store.hasNewerHistory).toBe(true);
    mocks.history.mockResolvedValueOnce({
      items: [message('998')],
      hasMore: false,
      nextCursor: '998',
    });
    await chat.newer();
    expect(chat.store.messages.map((item) => item.id)).toEqual(['10', '998', '999']);
    expect(mocks.history).toHaveBeenCalledTimes(2);
  });
  it('retains pagination after a failed older request', async () => {
    const chat = useChat();
    await chat.initialize();
    chat.store.hasMoreHistory = true;
    chat.store.historyCursor = '1';
    mocks.history.mockRejectedValueOnce(new Error('offline'));
    await chat.older();
    expect(chat.store.messages.map((item) => item.id)).toEqual(['1']);
    expect(chat.store.historyCursor).toBe('1');
    expect(chat.store.hasMoreHistory).toBe(true);
    expect(chat.store.loadingHistory).toBe(false);
  });
});

describe('Chat pagination races', () => {
  it('defers live messages during older pagination without opening a gap or duplicating the tail', async () => {
    const chat = useChat();
    await chat.initialize();
    chat.store.messages = Array.from({ length: 500 }, (_, i) => message(String(i + 101)));
    chat.store.hasMoreHistory = true;
    chat.store.historyCursor = '101';
    let complete!: (value: unknown) => void;
    mocks.history.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const loading = chat.older();
    const created = mocks.hubs[0]!.handlers['message.created'] as unknown as (
      item: ChatMessage,
    ) => void;
    created(message('601'));
    expect(chat.store.messages[0]!.id).toBe('101');
    expect(chat.store.messages.at(-1)!.id).toBe('600');
    complete({
      items: Array.from({ length: 100 }, (_, i) => message(String(i + 1))),
      hasMore: false,
      nextCursor: '1',
    });
    await loading;
    expect(chat.store.messages.map((item) => item.id)).toEqual(
      Array.from({ length: 500 }, (_, i) => String(i + 1)),
    );
    expect(chat.store.hasNewerHistory).toBe(true);
    mocks.history.mockResolvedValueOnce({
      items: Array.from({ length: 101 }, (_, i) => message(String(i + 501))),
      hasMore: false,
      nextCursor: '601',
    });
    await chat.newer();
    expect(chat.store.messages.map((item) => item.id)).toEqual(
      Array.from({ length: 500 }, (_, i) => String(i + 102)),
    );
  });
});

describe('Chat deferred recovery cancellation', () => {
  async function overflowingChat() {
    const chat = useChat();
    await chat.initialize();
    chat.store.hasNewerHistory = true;
    const created = mocks.hubs[0]!.handlers['message.created'] as unknown as (
      item: ChatMessage,
    ) => void;
    for (let i = 2; i <= 502; i++) created(message(String(i)));
    return chat;
  }
  it('stops recovering when the server no longer contains the highest broadcast ID', async () => {
    const chat = await overflowingChat();
    mocks.history.mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
    await chat.newer();
    expect(mocks.history).toHaveBeenCalledTimes(3);
    expect(chat.store.hasNewerHistory).toBe(false);
  });
  it('does not restore a history flag or error after logout during overflow recovery', async () => {
    const chat = await overflowingChat();
    mocks.history.mockResolvedValueOnce({ items: [], hasMore: false, nextCursor: null });
    let fail!: (error: Error) => void;
    mocks.history.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    );
    const loading = chat.newer();
    await vi.waitFor(() => expect(fail).toBeDefined());
    mocks.logout.mockResolvedValueOnce(undefined);
    await chat.logout();
    fail(new Error('late failure'));
    await loading;
    expect(chat.store.session).toBeNull();
    expect(chat.store.hasNewerHistory).toBe(false);
    expect(chat.store.error).toBe('');
  });
  it('ignores a recovery failure superseded by a newer latest view', async () => {
    const chat = await overflowingChat();
    mocks.history.mockResolvedValueOnce({ items: [], hasMore: false, nextCursor: null });
    let fail!: (error: Error) => void;
    mocks.history.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    );
    const loading = chat.newer();
    await vi.waitFor(() => expect(fail).toBeDefined());
    mocks.history.mockResolvedValue({
      items: [message('1000')],
      hasMore: false,
      nextCursor: '1000',
    });
    expect(await chat.latest()).toBe(true);
    fail(new Error('old view failure'));
    await loading;
    expect(chat.store.messages.map((item) => item.id)).toEqual(['1000']);
    expect(chat.store.hasNewerHistory).toBe(false);
    expect(chat.store.error).toBe('');
  });
});

describe('Chat busy feedback', () => {
  it('preserves the server busy message for a rejected send', async () => {
    const chat = useChat();
    await chat.initialize();
    mocks.hubs[0]!.invoke.mockRejectedValueOnce(
      new Error(
        'An unexpected error occurred invoking SendMessage. HubException: chat_busy: 聊天室繁忙，请稍后重试。',
      ),
    );
    expect(await chat.send('hello')).toBe(false);
    expect(chat.store.error).toBe('聊天室繁忙，请稍后重试。');
  });
});
