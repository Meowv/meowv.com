import { onBeforeUnmount, ref } from 'vue';
import {
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
  type HubConnection,
} from '@microsoft/signalr';
import { ChatApiError, chatApi } from './chat-api';
import { useChatStore } from './chat-state';
import type { ChatAck, ChatMessage, ChatMentionRequest, ChatParticipant } from './chat-types';

export function useChat() {
  const store = useChatStore();
  store.$reset();
  const initializing = ref(true);
  const joining = ref(false);
  const sending = ref(false);
  const leaving = ref(false);
  const participants = ref<ChatParticipant[]>([]);
  const participantsLoading = ref(false);
  const participantsError = ref('');
  const mentionIds = ref<string[]>([]);
  let participantsAt = 0;
  const notifiedMentions = new Set<string>();
  let controller = new AbortController();
  let connection: HubConnection | null = null;
  let generation = 0;
  let disposed = false;
  let historyView = 0;
  let deferredMessages: ChatMessage[] = [];
  let historyInitialized = false;
  let connectingGeneration: number | null = null;
  let pending: {
    id: string;
    content: string;
    replyToId: string | null;
    mentions: ChatMentionRequest[];
  } | null = null;
  const current = (id: number) => !disposed && generation === id;

  function notifyMention(message: ChatMessage) {
    const guestId = store.session?.guest.id;
    if (
      guestId &&
      message.guestId !== guestId &&
      !message.deleted &&
      message.mentions?.some((mention) => mention.guestId === guestId) &&
      !notifiedMentions.has(message.id) &&
      !mentionIds.value.includes(message.id)
    ) {
      notifiedMentions.add(message.id);
      if (notifiedMentions.size > 1000)
        notifiedMentions.delete(notifiedMentions.values().next().value!);
      mentionIds.value.push(message.id);
    }
  }
  async function loadParticipants(force = false) {
    if (participantsLoading.value || (!force && Date.now() - participantsAt < 5000)) return;
    const id = generation;
    participantsLoading.value = true;
    participantsError.value = '';
    try {
      const result = await chatApi.participants(controller.signal);
      if (current(id)) {
        participants.value = result;
        participantsAt = Date.now();
      }
    } catch {
      if (current(id)) participantsError.value = '获取访客失败，请重试。';
    } finally {
      if (current(id)) participantsLoading.value = false;
    }
  }
  async function failure(error: unknown, id: number) {
    if (!current(id) || (error instanceof DOMException && error.name === 'AbortError')) return;
    store.unavailable =
      !store.session && (!(error instanceof ChatApiError) || error.status === 503);
    const detail = error instanceof Error ? error.message : '';
    store.error =
      error instanceof ChatApiError
        ? error.message
        : (detail.match(
            /(?:session_expired|rate_limited|invalid_reply|invalid_mention|invalid_message(?:_id)?|chat_unavailable):\s*(.+)$/s,
          )?.[1] ?? '连接失败，请稍后重试。');
    if (error instanceof ChatApiError && error.status === 401) {
      store.session = null;
      store.pendingMessages = {};
      pending = null;
      sending.value = false;
      store.connectionStatus = 'idle';
      const previous = connection;
      connection = null;
      await previous?.stop();
    }
  }
  async function checkSession(id: number) {
    try {
      const session = await chatApi.session(controller.signal);
      if (current(id)) store.session = session;
    } catch (error) {
      await failure(error, id);
    }
  }
  async function synchronize(id: number, afterId?: string) {
    if (store.hasNewerHistory) return;
    const view = historyView;
    if (afterId) {
      let cursor = afterId;
      while (current(id)) {
        const page = await chatApi.history(controller.signal, { afterId: cursor });
        if (!current(id) || view !== historyView) return;
        store.merge(page.items);
        page.items.forEach(notifyMention);
        if (!page.hasMore || !page.nextCursor || page.nextCursor === cursor) break;
        cursor = page.nextCursor;
      }
    } else {
      const page = await chatApi.history(controller.signal);
      if (!current(id) || view !== historyView) return;
      store.merge(page.items);
      store.hasMoreHistory = page.hasMore;
      store.historyCursor = page.nextCursor;
      historyInitialized = true;
    }
    const status = await chatApi.status(controller.signal);
    if (current(id)) Object.assign(store, status);
  }
  async function refreshVisible(id: number) {
    const view = historyView;
    // 重连时核对已加载区间，补上离线期间的标记删除和物理删除。
    const visible = store.messages.map((message) => message.id);
    const first = visible[0];
    const last = visible.at(-1);
    if (!first || !last) return;
    const found = new Set<string>();
    const head = await chatApi.history(controller.signal, {
      beforeId: (BigInt(first) + 1n).toString(),
      limit: '1',
    });
    if (!current(id) || view !== historyView) return;
    const matchingHead = head.items.filter((message) => message.id === first);
    matchingHead.forEach((message) => found.add(message.id));
    store.merge(matchingHead);
    let cursor = first;
    while (current(id) && BigInt(cursor) < BigInt(last)) {
      const page = await chatApi.history(controller.signal, { afterId: cursor });
      if (!current(id) || view !== historyView) return;
      page.items.forEach((message) => found.add(message.id));
      store.merge(page.items.filter((message) => BigInt(message.id) <= BigInt(last)));
      if (!page.nextCursor || page.nextCursor === cursor) break;
      cursor = page.nextCursor;
    }
    if (current(id) && view === historyView)
      visible
        .filter((messageId) => !found.has(messageId))
        .forEach((messageId) => store.remove(messageId, true));
  }

  async function connect() {
    if (!store.session || disposed || connectingGeneration === generation) return;
    const id = generation;
    connectingGeneration = id;
    const lastId = historyInitialized ? store.messages.at(-1)?.id : undefined;
    const previous = connection;
    connection = null;
    await previous?.stop();
    if (!current(id)) {
      if (connectingGeneration === id) connectingGeneration = null;
      return;
    }
    store.connectionStatus = 'connecting';
    store.error = '';
    let recoveryCursor: string | undefined;
    const hub = new HubConnectionBuilder()
      .withUrl('/api/chat/hub', { withCredentials: true })
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (context) =>
          context.previousRetryCount >= 6
            ? null
            : Math.min(30000, 1000 * 2 ** context.previousRetryCount) + Math.random() * 1000,
      })
      .configureLogging(LogLevel.None)
      .build();
    connection = hub;
    const active = () => current(id) && connection === hub;
    hub.on('message.created', (message: ChatMessage) => {
      if (!active()) return;
      notifyMention(message);
      if (store.hasNewerHistory || store.loadingHistory) deferredMessages.push(message);
      if (!store.hasNewerHistory) store.merge([message]);
    });
    hub.on(
      'message.deleted',
      ({
        id: messageId,
        permanent,
        revision,
      }: {
        id: string;
        permanent: boolean;
        revision: number;
      }) => {
        if (active()) {
          store.remove(messageId, permanent, revision);
          mentionIds.value = mentionIds.value.filter((id) => id !== messageId);
        }
      },
    );
    hub.on('message.restored', (message: ChatMessage) => {
      if (active()) store.restore(message);
    });
    hub.on('presence.changed', ({ onlineUsers }: { onlineUsers: number }) => {
      if (active()) store.onlineUsers = onlineUsers;
    });
    hub.onreconnecting(() => {
      if (!active()) return;
      recoveryCursor = historyInitialized ? store.messages.at(-1)?.id : undefined;
      store.connectionStatus = 'reconnecting';
    });
    hub.onreconnected(async () => {
      if (!active()) return;
      try {
        await checkSession(id);
        if (!active() || !store.session) return;
        await synchronize(id, recoveryCursor);
        if (active()) await refreshVisible(id);
        if (active()) {
          store.connectionStatus = 'connected';
          store.error = '';
        }
      } catch (error) {
        if (active()) {
          store.connectionStatus = 'disconnected';
          await failure(error, id);
          await hub.stop();
        }
      }
    });
    hub.onclose(async () => {
      if (active()) {
        store.connectionStatus = 'disconnected';
        await checkSession(id);
      }
    });
    try {
      await hub.start();
      if (!active()) {
        await hub.stop();
        return;
      }
      await synchronize(id, lastId);
      if (active() && lastId) await refreshVisible(id);
      if (active() && hub.state === HubConnectionState.Connected)
        store.connectionStatus = 'connected';
    } catch (error) {
      if (active()) {
        store.connectionStatus = 'disconnected';
        await failure(error, id);
        await checkSession(id);
        await hub.stop();
      }
    } finally {
      if (connectingGeneration === id) connectingGeneration = null;
    }
  }
  async function initialize() {
    const id = generation;
    store.unavailable = false;
    try {
      const session = await chatApi.session(controller.signal);
      if (current(id)) {
        store.session = session;
        await connect();
      }
    } catch (error) {
      if (!(error instanceof ChatApiError && error.status === 401)) await failure(error, id);
    } finally {
      if (current(id)) initializing.value = false;
    }
  }
  async function join(nickname: string) {
    if (joining.value) return;
    const id = generation;
    joining.value = true;
    store.error = '';
    try {
      const session = await chatApi.join(nickname, controller.signal);
      if (current(id)) {
        store.session = session;
        await connect();
      }
    } catch (error) {
      await failure(error, id);
    } finally {
      if (current(id)) joining.value = false;
    }
  }
  async function logout() {
    if (leaving.value) return;
    const id = generation;
    leaving.value = true;
    try {
      await chatApi.logout(controller.signal);
      if (!current(id)) return;
      generation++;
      controller.abort();
      controller = new AbortController();
      const previous = connection;
      connection = null;
      await previous?.stop();
      pending = null;
      deferredMessages = [];
      participants.value = [];
      participantsLoading.value = false;
      participantsError.value = '';
      participantsAt = 0;
      mentionIds.value = [];
      notifiedMentions.clear();
      historyInitialized = false;
      store.$reset();
    } catch (error) {
      await failure(error, id);
    } finally {
      leaving.value = false;
    }
  }
  async function send(
    content: string,
    replyToId: string | null = null,
    mentions: ChatMentionRequest[] = [],
  ): Promise<boolean> {
    if (sending.value || store.connectionStatus !== 'connected' || !store.session || !connection)
      return false;
    const id = generation;
    const guest = store.session.guest;
    if (
      !pending ||
      pending.content !== content ||
      pending.replyToId !== replyToId ||
      JSON.stringify(pending.mentions) !== JSON.stringify(mentions)
    ) {
      store.pendingMessages = {};
      pending = {
        id: crypto.randomUUID(),
        content,
        replyToId,
        mentions: mentions.map((mention) => ({ ...mention })),
      };
    }
    const request = pending;
    store.pendingMessages[request.id] = 'pending';
    sending.value = true;
    store.error = '';
    try {
      if (store.hasNewerHistory && !(await latest())) return false;
      if (!current(id)) return false;
      const ack = await connection.invoke<ChatAck>(
        'SendMessage',
        request.id,
        content,
        request.replyToId,
        request.mentions,
      );
      if (!current(id)) return false;
      store.merge([
        {
          ...ack,
          guestId: guest.id,
          nickname: guest.nickname,
          avatarSeed: guest.avatarSeed,
          content: content.replaceAll('\r\n', '\n').normalize('NFC').trim(),
          deleted: false,
          revision: 0,
          reply: ack.reply ?? null,
          mentions: ack.mentions ?? [],
        },
      ]);
      delete store.pendingMessages[request.id];
      pending = null;
      return true;
    } catch (error) {
      if (current(id)) {
        store.pendingMessages[request.id] = 'failed';
        await failure(error, id);
        await checkSession(id);
      }
      return false;
    } finally {
      if (current(id)) sending.value = false;
    }
  }
  async function older() {
    if (store.loadingHistory || !store.hasMoreHistory || !store.historyCursor) return;
    const id = generation;
    const view = historyView;
    store.loadingHistory = true;
    try {
      const page = await chatApi.history(controller.signal, { beforeId: store.historyCursor });
      if (current(id) && view === historyView) {
        store.merge(page.items);
        store.hasMoreHistory = page.hasMore;
        store.historyCursor = page.nextCursor;
      }
    } catch (error) {
      await failure(error, id);
    } finally {
      if (current(id) && view === historyView) store.loadingHistory = false;
    }
  }
  async function focus(messageId: string): Promise<boolean> {
    if (store.loadingHistory || !store.session) return false;
    if (store.messages.some((message) => message.id === messageId)) return true;
    const id = generation;
    const view = ++historyView;
    store.loadingHistory = true;
    try {
      const context = await chatApi.context(messageId, controller.signal);
      if (!current(id) || view !== historyView) return false;
      store.messages = [];
      store.merge(context.items);
      store.hasMoreHistory = context.hasMoreBefore;
      store.hasNewerHistory = context.hasMoreAfter;
      if (!store.hasNewerHistory) {
        store.merge(
          deferredMessages.filter((message) => BigInt(message.id) >= BigInt(context.items[0]!.id)),
        );
        deferredMessages = [];
      }
      store.historyCursor = store.messages[0]?.id ?? null;
      return store.messages.some((message) => message.id === messageId);
    } catch (error) {
      if (current(id))
        store.error =
          error instanceof ChatApiError && error.status === 404
            ? '原消息已不可用。'
            : '定位消息失败，请稍后重试。';
      return false;
    } finally {
      if (current(id) && view === historyView) store.loadingHistory = false;
    }
  }
  async function newer() {
    const cursor = store.messages.at(-1)?.id;
    if (store.loadingHistory || !store.hasNewerHistory || !cursor) return;
    const id = generation;
    const view = historyView;
    store.loadingHistory = true;
    try {
      const page = await chatApi.history(controller.signal, { afterId: cursor });
      if (!current(id) || view !== historyView) return;
      store.merge(page.items);
      store.hasNewerHistory = page.hasMore;
      if (!store.hasNewerHistory) {
        store.merge(deferredMessages);
        deferredMessages = [];
      }
    } catch (error) {
      await failure(error, id);
    } finally {
      if (current(id) && view === historyView) store.loadingHistory = false;
    }
  }
  async function latest(): Promise<boolean> {
    const id = generation;
    const view = ++historyView;
    store.loadingHistory = true;
    try {
      const page = await chatApi.history(controller.signal);
      if (!current(id) || view !== historyView) return false;
      store.messages = [];
      store.merge(page.items);
      store.hasMoreHistory = page.hasMore;
      store.historyCursor = page.nextCursor;
      store.hasNewerHistory = false;
      const first = page.items[0]?.id;
      store.merge(
        deferredMessages.filter((message) => !first || BigInt(message.id) >= BigInt(first)),
      );
      deferredMessages = [];
      return true;
    } catch (error) {
      await failure(error, id);
      return false;
    } finally {
      if (current(id) && view === historyView) store.loadingHistory = false;
    }
  }
  onBeforeUnmount(() => {
    disposed = true;
    generation++;
    controller.abort();
    const previous = connection;
    connection = null;
    void previous?.stop();
    store.$reset();
  });
  return {
    store,
    initializing,
    joining,
    sending,
    leaving,
    participants,
    participantsLoading,
    participantsError,
    loadParticipants,
    mentionIds,
    initialize,
    join,
    logout,
    connect,
    send,
    older,
    newer,
    focus,
    latest,
  };
}
