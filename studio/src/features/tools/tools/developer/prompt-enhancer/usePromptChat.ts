import { computed, reactive, ref } from 'vue';
import { ModelError, requestModel } from './api';
import {
  modelHistory,
  newConversation,
  type Conversation,
  type Message,
  type ModelConfig,
} from './types';
import { createRepository, type ChatRepository } from './storage';

export function createPromptChat(
  repository: ChatRepository = createRepository(),
  request = requestModel,
) {
  const conversations = ref<Conversation[]>([]);
  const messages = ref<Message[]>([]);
  const selectedId = ref('');
  const drafts = reactive<Record<string, string>>({});
  const error = ref('');
  const ready = ref(false);
  const working = ref(false);
  const preparing = ref(false);
  const activeId = ref('');
  const unsavedResult = ref<{ conversationId: string; content: string } | null>(null);
  const current = computed(() => conversations.value.find((row) => row.id === selectedId.value));
  const draft = computed(() => drafts[selectedId.value] ?? current.value?.draft ?? '');
  let controller: AbortController | null = null;
  let disposed = false;
  let revision = 0;
  const draftWrites = new Map<string, Promise<void>>();

  async function refresh() {
    const generation = ++revision;
    const rows = await repository.list();
    if (disposed || generation !== revision) return;
    conversations.value = rows;
    if (!rows.some((row) => row.id === selectedId.value)) selectedId.value = rows[0]?.id ?? '';
    for (const row of rows) if (!(row.id in drafts)) drafts[row.id] = row.draft;
    const id = selectedId.value;
    const history = id ? await repository.messages(id) : [];
    if (!disposed && generation === revision && selectedId.value === id) messages.value = history;
  }

  async function initialize() {
    try {
      await repository.recover();
      if (disposed) return;
      await refresh();
      if (!disposed) ready.value = true;
    } catch {
      error.value = '无法加载本地历史，请检查浏览器存储权限后重试。';
    }
  }

  async function create() {
    if (disposed || !ready.value || preparing.value) return;
    try {
      const row = newConversation();
      await repository.create(row);
      selectedId.value = row.id;
      drafts[row.id] = '';
      error.value = '';
      await refresh();
    } catch {
      error.value = '新建对话失败，请检查浏览器存储空间或权限。';
    }
  }

  async function select(id: string) {
    selectedId.value = id;
    messages.value = [];
    try {
      await refresh();
    } catch {
      error.value = '读取对话失败，请重试。';
    }
  }

  function setDraft(value: string) {
    const id = selectedId.value;
    if (!id) return;
    drafts[id] = value;
    // 每次修改均排队落盘；发送前等待该会话的草稿写入结束。
    const write = (draftWrites.get(id) ?? Promise.resolve())
      .catch(() => {})
      .then(() => repository.saveDraft(id, value));
    draftWrites.set(id, write);
    void write.catch(() => {
      if (!disposed) error.value = '草稿未能保存，请检查浏览器存储空间或权限；输入仍保留在页面中。';
    });
  }

  async function send(config: ModelConfig, retryId?: string) {
    const id = selectedId.value;
    const content = draft.value.trim();
    if (disposed || !ready.value || !id || working.value || (!retryId && !content)) return;
    working.value = true;
    preparing.value = true;
    activeId.value = id;
    error.value = '';
    const activeController = new AbortController();
    controller = activeController;
    let message: Message | undefined;
    let output: string | undefined;
    try {
      await draftWrites.get(id);
      message = await repository.prepare(id, content, retryId);
      if (!retryId) drafts[id] = '';
      preparing.value = false;
      await refresh();
      if (activeController.signal.aborted) throw new ModelError('已取消请求。');
      const history = await repository.messages(id);
      output = await request(
        { ...config },
        modelHistory(history, message.id),
        activeController.signal,
      );
      if (activeController.signal.aborted || disposed) throw new ModelError('已取消请求。');
      const saved = await repository.finish(message, 'complete', output);
      if (!saved) output = undefined;
    } catch (cause) {
      if (!message) {
        error.value = '消息未能保存，尚未发送；请检查本地存储后重试。';
      } else if (output !== undefined && !activeController.signal.aborted) {
        unsavedResult.value = { conversationId: id, content: output };
        error.value = '结果已返回，但本地保存失败。请先复制下方未保存的结果。';
        try {
          await repository.finish(message, 'failed', undefined, '结果未能保存，请先复制结果。');
        } catch {
          /* 保留未保存的结果。 */
        }
      } else {
        const reason = activeController.signal.aborted
          ? '已取消请求。'
          : cause instanceof ModelError
            ? cause.message
            : '操作失败，请检查本地存储后重试。';
        try {
          await repository.finish(
            message,
            activeController.signal.aborted ? 'cancelled' : 'failed',
            undefined,
            reason,
          );
        } catch {
          error.value = '请求已结束，但状态保存失败；下次打开可手动重试。';
        }
      }
    } finally {
      if (controller === activeController) controller = null;
      working.value = false;
      preparing.value = false;
      activeId.value = '';
      if (!disposed) {
        try {
          await refresh();
        } catch {
          error.value ||= '刷新本地记录失败，请重新打开工具。';
        }
      }
    }
  }

  async function remove(id: string) {
    if (activeId.value === id) controller?.abort();
    try {
      await repository.remove(id);
      delete drafts[id];
      if (unsavedResult.value?.conversationId === id) unsavedResult.value = null;
      error.value = '';
      await refresh();
    } catch {
      error.value = '删除失败，本地记录未确认删除，请重试。';
    }
  }

  function dispose() {
    disposed = true;
    revision++;
    controller?.abort();
  }

  return {
    conversations,
    messages,
    selectedId,
    current,
    draft,
    error,
    ready,
    working,
    preparing,
    activeId,
    unsavedResult,
    initialize,
    create,
    select,
    setDraft,
    send,
    remove,
    cancel: () => controller?.abort(),
    dispose,
  };
}
