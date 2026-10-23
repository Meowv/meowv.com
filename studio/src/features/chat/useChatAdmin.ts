import { onBeforeUnmount, ref } from 'vue';
import { ChatApiError, chatRequest } from './chat-api';
import type { ChatMessage } from './chat-types';

export function useChatAdmin() {
  const active = ref(false);
  const busy = ref(false);
  const error = ref('');
  let credential = '';
  let generation = 0;
  let controller = new AbortController();

  function clear() {
    generation++;
    controller.abort();
    controller = new AbortController();
    credential = '';
    active.value = false;
    busy.value = false;
    error.value = '';
  }

  async function verify(key: string): Promise<boolean> {
    if (busy.value) return false;
    const attempt = generation;
    busy.value = true;
    error.value = '';
    try {
      await chatRequest<void>('/admin/session', controller.signal, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (attempt !== generation) return false;
      credential = key;
      active.value = true;
      return true;
    } catch (cause) {
      if (attempt === generation) {
        credential = '';
        active.value = false;
        error.value =
          cause instanceof ChatApiError && cause.status === 401
            ? '授权码无效，请重新输入。'
            : cause instanceof Error
              ? cause.message
              : '验证失败，请稍后重试。';
      }
      return false;
    } finally {
      if (attempt === generation) busy.value = false;
    }
  }

  async function removeMessage(message: ChatMessage, permanent = false): Promise<boolean> {
    if (!active.value || busy.value) return false;
    const attempt = generation;
    busy.value = true;
    error.value = '';
    const target = `/admin/messages/${encodeURIComponent(message.id)}?${new URLSearchParams({ permanent: String(permanent) })}`;
    try {
      await chatRequest<void>(target, controller.signal, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${credential}` },
      });
      return attempt === generation;
    } catch (cause) {
      if (attempt === generation) {
        if (cause instanceof ChatApiError && cause.status === 401) {
          clear();
          error.value = '管理验证已失效，请重新输入授权码。';
        } else {
          error.value =
            cause instanceof ChatApiError && cause.status === 404
              ? '消息已被处理或已过期。'
              : cause instanceof Error
                ? cause.message
                : '操作失败，请稍后重试。';
        }
      }
      return false;
    } finally {
      if (attempt === generation) busy.value = false;
    }
  }

  async function restoreMessage(message: ChatMessage): Promise<ChatMessage | null> {
    if (!active.value || busy.value) return null;
    const attempt = generation;
    busy.value = true;
    error.value = '';
    try {
      const restored = await chatRequest<ChatMessage>(
        `/admin/messages/${encodeURIComponent(message.id)}/restore`,
        controller.signal,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${credential}` },
        },
      );
      return attempt === generation ? restored : null;
    } catch (cause) {
      if (attempt === generation) {
        if (cause instanceof ChatApiError && cause.status === 401) clear();
        error.value = cause instanceof Error ? cause.message : '恢复失败，请稍后重试。';
      }
      return null;
    } finally {
      if (attempt === generation) busy.value = false;
    }
  }
  onBeforeUnmount(clear);
  return { active, busy, error, verify, removeMessage, restoreMessage, clear };
}
