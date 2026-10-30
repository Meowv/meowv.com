<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  IconCheck,
  IconCopy,
  IconHistory,
  IconMessagePlus,
  IconPrompt,
  IconSettings,
  IconSquare,
  IconTrash,
  IconX,
} from '@tabler/icons-vue';
import { loadConfig } from './api';
import { renderMessage } from './markdown';
import ModelSettings from './ModelSettings.vue';
import { createPromptChat } from './usePromptChat';
import type { ModelConfig } from './types';
import './prompt-enhancer.css';

const chat = createPromptChat();
const {
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
} = chat;
const config = ref<ModelConfig | null>(null);
const settings = ref<HTMLDialogElement | null>(null);
const settingsOpen = ref(false);
const deleteDialog = ref<HTMLDialogElement | null>(null);
const deletingId = ref('');
const drawerOpen = ref(false);
const list = ref<HTMLElement | null>(null);
const input = ref<HTMLTextAreaElement | null>(null);
const copiedId = ref('');
let copiedTimer: ReturnType<typeof setTimeout> | undefined;
const composing = ref(false);
let releaseLock: (() => void) | undefined;
const lockController = new AbortController();
let unmounted = false;

const lastMessageId = computed(() => messages.value.at(-1)?.id);
const renderedMessages = computed(() =>
  messages.value.map((message) => ({
    ...message,
    html: message.role === 'assistant' ? renderMessage(message.content) : '',
  })),
);
const currentUnsaved = computed(() =>
  unsavedResult.value?.conversationId === selectedId.value ? unsavedResult.value : null,
);

async function openSettings() {
  if (working.value) return;
  settingsOpen.value = true;
  await nextTick();
  settings.value?.showModal();
}
function saved(value: ModelConfig) {
  config.value = value;
  settings.value?.close();
}
async function send(retryId?: string) {
  if (!config.value) {
    openSettings();
    return;
  }
  await chat.send(config.value, retryId);
}
async function create() {
  await chat.create();
  drawerOpen.value = false;
  await nextTick();
  input.value?.focus();
}
async function select(id: string) {
  await chat.select(id);
  drawerOpen.value = false;
}
function keydown(event: KeyboardEvent) {
  if (
    event.key !== 'Enter' ||
    event.shiftKey ||
    event.isComposing ||
    composing.value ||
    event.keyCode === 229
  )
    return;
  if (window.matchMedia('(pointer: coarse)').matches) return;
  event.preventDefault();
  void send();
}
async function copy(id: string, content: string) {
  try {
    await navigator.clipboard.writeText(content);
    copiedId.value = id;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      copiedId.value = '';
    }, 1600);
  } catch {
    error.value = '复制失败，请手动选择消息内容复制。';
  }
}
function confirmDelete(id: string) {
  deletingId.value = id;
  deleteDialog.value?.showModal();
}
async function remove() {
  await chat.remove(deletingId.value);
  deleteDialog.value?.close();
}

watch([messages, selectedId], async () => {
  await nextTick();
  list.value?.scrollTo({ top: list.value.scrollHeight });
});

onMounted(async () => {
  try {
    config.value = loadConfig();
  } catch {
    /* 本地存储不可用时允许重新设置。 */
  }
  const initialize = async () => {
    await chat.initialize();
    if (unmounted) return;
    if (ready.value && !conversations.value.length) await chat.create();
    if (navigator.storage?.persist) void navigator.storage.persist().catch(() => {});
  };
  // 同源多标签页共用数据库，防止第二页将仍在运行的请求误恢复为中断。
  if (navigator.locks) {
    void navigator.locks
      .request('meowv-studio-prompt-enhancer', { signal: lockController.signal }, async (lock) => {
        if (unmounted) return;
        if (!lock) return;
        await new Promise<void>((resolve) => {
          releaseLock = resolve;
          void initialize().finally(() => {
            if (unmounted) resolve();
          });
        });
      })
      .catch(() => {
        if (!unmounted) error.value = '无法取得本地记录访问权限，请重新打开工具。';
      });
  } else await initialize();
});

onBeforeUnmount(() => {
  unmounted = true;
  chat.dispose();
  lockController.abort();
  releaseLock?.();
  clearTimeout(copiedTimer);
});
</script>

<template>
  <section class="pe-workspace" aria-label="增强提示词聊天工作区">
    <button
      v-if="drawerOpen"
      class="pe-drawer-backdrop"
      aria-label="关闭会话列表"
      @click="drawerOpen = false"
    />
    <aside class="pe-sidebar" :class="{ 'is-open': drawerOpen }" aria-label="对话历史">
      <div class="pe-sidebar__heading">
        <strong>对话记录</strong
        ><button class="pe-mobile" aria-label="关闭会话列表" @click="drawerOpen = false">
          <IconX :size="18" />
        </button>
      </div>
      <button class="pe-new" :disabled="!ready || preparing" @click="create">
        <IconMessagePlus :size="18" />新建对话
      </button>
      <div class="pe-conversations">
        <div
          v-for="conversation in conversations"
          :key="conversation.id"
          class="pe-conversation"
          :class="{ 'is-active': selectedId === conversation.id }"
        >
          <button
            class="pe-conversation__select"
            :aria-current="selectedId === conversation.id ? 'true' : undefined"
            @click="select(conversation.id)"
          >
            <span>{{ conversation.title }}</span
            ><small>{{
              activeId === conversation.id
                ? '正在增强…'
                : new Date(conversation.updatedAt).toLocaleDateString('zh-CN')
            }}</small>
          </button>
          <button
            class="pe-conversation__delete"
            :aria-label="`删除对话：${conversation.title}`"
            :disabled="preparing"
            @click="confirmDelete(conversation.id)"
          >
            <IconTrash :size="16" />
          </button>
        </div>
      </div>
    </aside>

    <div class="pe-chat">
      <header class="pe-chat__header">
        <button
          class="pe-mobile"
          aria-label="打开会话列表"
          :aria-expanded="drawerOpen"
          @click="drawerOpen = true"
        >
          <IconHistory :size="20" />
        </button>
        <div>
          <strong>{{ current?.title ?? '增强提示词' }}</strong
          ><small>{{ config?.model || '配置模型后开始增强' }}</small>
        </div>
        <button aria-label="模型设置" :disabled="working" @click="openSettings">
          <IconSettings :size="19" /><span>设置</span>
        </button>
      </header>
      <div v-if="error" class="pe-error" role="alert">{{ error }}</div>
      <p v-else-if="!ready" class="pe-status" role="status">
        正在打开本地记录；如已在其他标签页打开，请先关闭该页面。
      </p>
      <div ref="list" class="pe-messages" aria-label="当前对话消息" tabindex="0">
        <div v-if="!messages.length" class="pe-empty">
          <IconPrompt :size="32" />
          <h2>把想法变成清晰的提示词</h2>
          <p>
            输入你的需求，获得可直接复制使用的提示词。<br />继续对话，可以调整长度、语气和约束。
          </p>
        </div>
        <article
          v-for="message in renderedMessages"
          :key="message.id"
          class="pe-message"
          :class="`pe-message--${message.role}`"
          :aria-label="message.role === 'user' ? '你的需求' : '增强结果'"
        >
          <div class="pe-message__label">
            <strong>{{ message.role === 'user' ? '你' : '增强结果' }}</strong>
            <button
              v-if="message.role === 'assistant'"
              :aria-label="copiedId === message.id ? '已复制' : '复制增强结果'"
              @click="copy(message.id, message.content)"
            >
              <IconCheck v-if="copiedId === message.id" :size="15" /><IconCopy
                v-else
                :size="15"
              />{{ copiedId === message.id ? '已复制' : '复制' }}
            </button>
          </div>
          <!-- Markdown 已禁用 HTML、图片，并通过 DOMPurify 清理。 -->
          <!-- eslint-disable vue/no-v-html -->
          <div
            v-if="message.role === 'assistant' && message.html"
            class="pe-markdown"
            v-html="message.html"
          />
          <!-- eslint-enable vue/no-v-html -->
          <div v-else class="pe-plain">{{ message.content }}</div>
          <p v-if="message.status === 'pending'" class="pe-message__status" role="status">
            {{ activeId === message.conversationId ? '正在增强…' : '请求尚未结束' }}
          </p>
          <div v-else-if="message.status !== 'complete'" class="pe-message__status">
            <span>{{ message.error || '请求未完成。' }}</span
            ><button
              v-if="message.id === lastMessageId"
              :disabled="working"
              @click="send(message.id)"
            >
              重试
            </button>
          </div>
        </article>
        <article v-if="currentUnsaved" class="pe-message pe-message--unsaved">
          <strong>未保存的增强结果</strong>
          <div class="pe-plain">{{ currentUnsaved.content }}</div>
          <button @click="copy('unsaved', currentUnsaved.content)">
            {{ copiedId === 'unsaved' ? '已复制' : '复制结果' }}
          </button>
        </article>
      </div>
      <form class="pe-composer" @submit.prevent="send()">
        <label class="sr-only" for="pe-input">输入需求或调整要求</label>
        <div class="pe-composer__field">
          <textarea
            id="pe-input"
            ref="input"
            :value="draft"
            :disabled="!ready || !current || preparing"
            placeholder="在发送之前，把想法变成更清晰、更完整、可执行的提示词。"
            rows="2"
            @input="chat.setDraft(($event.target as HTMLTextAreaElement).value)"
            @keydown="keydown"
            @compositionstart="composing = true"
            @compositionend="composing = false"
          />
          <div class="pe-composer__actions">
            <small v-if="working" role="status">{{
              activeId === selectedId ? '正在增强，可取消请求' : '另一个对话正在增强'
            }}</small>
            <button v-if="working" type="button" @click="chat.cancel()">
              <IconSquare :size="15" />取消
            </button>
            <button
              v-else
              class="pe-primary"
              type="submit"
              :disabled="!ready || !current || !draft.trim()"
            >
              <IconPrompt :size="17" />增强
            </button>
          </div>
        </div>
      </form>
    </div>

    <dialog
      ref="settings"
      class="pe-dialog"
      aria-labelledby="pe-settings-title"
      @close="settingsOpen = false"
      @click="
        (event) => {
          if (event.target === settings) settings?.close();
        }
      "
    >
      <ModelSettings
        v-if="settingsOpen"
        :config="config"
        @saved="saved"
        @close="settings?.close()"
      />
    </dialog>
    <dialog ref="deleteDialog" class="pe-dialog pe-delete-dialog" aria-labelledby="pe-delete-title">
      <h2 id="pe-delete-title">删除此对话？</h2>
      <p>此对话及全部消息将从当前浏览器删除，无法恢复。</p>
      <div class="pe-settings__actions">
        <button autofocus @click="deleteDialog?.close()">取消</button
        ><button class="pe-danger" @click="remove">删除对话</button>
      </div>
    </dialog>
  </section>
</template>
