<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  IconArrowDown,
  IconArrowUp,
  IconLogout,
  IconBrandWechat,
  IconRefresh,
  IconSend,
  IconShieldLock,
  IconX,
  IconCornerUpLeft,
  IconTrash,
  IconTrashX,
  IconAt,
} from '@tabler/icons-vue';
import { characterCount, quoteMessage, validContent, validNickname } from './chat-state';
import { useChat } from './useChat';
import ChatMarkdownInput from './ChatMarkdownInput.vue';
import type { ChatDraft } from './chat-markdown-input';
import { renderedChat } from './chat-markdown';
import { generateChatNickname } from './chat-nickname';
import ThemeToggle from '@/components/ThemeToggle.vue';
import ToolsBackgroundShortcut from '@/features/tools/components/ToolsBackgroundShortcut.vue';
import ChatAdminDialogs from './ChatAdminDialogs.vue';
import { useChatAdmin } from './useChatAdmin';
import type { ChatMessage, ChatReply, ChatMention, ChatParticipant } from './chat-types';
import './chat.css';

const chat = useChat();
const admin = useChatAdmin();
const { active: adminActive } = admin;
const adminDialogs = ref<InstanceType<typeof ChatAdminDialogs> | null>(null);
function openAdmin() {
  if (adminActive.value) {
    admin.clear();
  } else void adminDialogs.value?.openLogin();
}
function manageMessage(message: ChatMessage, permanent = false) {
  void adminDialogs.value?.openDelete(message, permanent);
}
const { store, initializing, joining, sending, leaving } = chat;
const identityMenu = ref<HTMLDetailsElement | null>(null);
function dismissIdentityMenu(event: PointerEvent | FocusEvent) {
  if (event.target instanceof Node && !identityMenu.value?.contains(event.target)) {
    if (identityMenu.value) identityMenu.value.open = false;
  }
}
function closeIdentityMenu() {
  if (!identityMenu.value?.open) return;
  identityMenu.value.open = false;
  identityMenu.value.querySelector('summary')?.focus();
}
const selectedReply = ref<ChatMessage | null>(null);
const replyPreview = computed<ChatReply | null>(() => {
  if (!selectedReply.value) return null;
  const id = selectedReply.value.id;
  const message = store.messages.find((item) => item.id === id) ?? selectedReply.value;
  const reply = quoteMessage(message);
  if (store.purgedIds[id]) return { ...reply, content: '', nickname: '', unavailable: true };
  if ((store.deletedIds[id] ?? -1) >= reply.revision)
    return { ...reply, content: '', deleted: true };
  return reply;
});
const highlightedId = ref<string | null>(null);
let highlightTimer: ReturnType<typeof setTimeout> | undefined;
function replyTo(message: ChatMessage) {
  if (message.guestId === store.session?.guest.id) return;
  selectedReply.value = message;
  composer.value?.focus();
}
async function locateReply(reply: ChatReply) {
  if (reply.unavailable || store.loadingHistory) return false;
  restoringScroll = true;
  try {
    if (!(await chat.focus(reply.id))) return false;
    await nextTick();
    const element = list.value?.querySelector<HTMLElement>(`[data-message-id="${reply.id}"]`);
    if (!element) return false;
    element.scrollIntoView({ block: 'center', behavior: 'instant' });
    highlightedId.value = reply.id;
    nearBottom.value = false;
    clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => {
      highlightedId.value = null;
    }, 2000);
    return true;
  } finally {
    restoringScroll = false;
  }
}
async function loadNewer() {
  const anchor = captureScrollAnchor();
  restoringScroll = true;
  try {
    await chat.newer();
    await nextTick();
    if (mounted) restoreScrollAnchor(anchor);
  } finally {
    restoringScroll = false;
  }
}
async function backToLatest() {
  restoringScroll = true;
  try {
    if (await chat.latest()) await bottom();
  } finally {
    restoringScroll = false;
  }
}
const quoteLabel = (reply: ChatReply) =>
  reply.unavailable ? '原消息已不可用' : reply.deleted ? '此消息已被移除' : reply.content;
const nickname = ref(generateChatNickname());
const draft = ref('');
const draftVersion = ref(0);
const list = ref<HTMLElement | null>(null);
const composer = ref<InstanceType<typeof ChatMarkdownInput> | null>(null);
const draftMentions = ref<ChatMention[]>([]);
const participants = computed(() => {
  const guests = new Map<string, ChatParticipant>();
  for (const guest of chat.participants.value) guests.set(guest.id, guest);
  for (const message of [...store.messages].reverse())
    if (!message.deleted && !guests.has(message.guestId))
      guests.set(message.guestId, {
        id: message.guestId,
        nickname: message.nickname,
        avatarSeed: message.avatarSeed,
        online: false,
      });
  return [...guests.values()];
});
function updateDraft(value: ChatDraft) {
  draftVersion.value++;
  draft.value = value.content;
  draftMentions.value = value.mentions;
}
function setDraft(value: string) {
  if (!value) composer.value?.clear();
  draft.value = value;
  if (!value) draftMentions.value = [];
}
function insertMention(participant: ChatParticipant) {
  composer.value?.insertMention(participant);
}
function insertAt() {
  composer.value?.insertAt();
}
const isMentioned = (message: ChatMessage) =>
  !message.deleted &&
  message.guestId !== store.session?.guest.id &&
  renderedChat(message.content, message.mentions).mentions.some(
    (mention) => mention.guestId === store.session?.guest.id,
  );

function acknowledgeMentions() {
  if (document.visibilityState !== 'visible' || !list.value) return;
  const area = list.value.getBoundingClientRect();
  chat.mentionIds.value = chat.mentionIds.value.filter((id) => {
    const element = list.value?.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
    if (!element) return true;
    const bounds = element.getBoundingClientRect();
    return bounds.bottom <= area.top || bounds.top >= area.bottom;
  });
}
watch(
  () => chat.mentionIds.value.join(','),
  async () => {
    await nextTick();
    acknowledgeMentions();
  },
);
async function jumpToMention() {
  const id = chat.mentionIds.value[0];
  if (!id) return;
  const located = await locateReply({
    id,
    nickname: '',
    content: '',
    deleted: false,
    unavailable: false,
    revision: 0,
  });
  if (located) acknowledgeMentions();
}
const joinDialog = ref<HTMLDialogElement | null>(null);
const nicknameInput = ref<HTMLInputElement | null>(null);
const nearBottom = ref(true);
const newMessages = ref(0);
const viewportHeight = ref('100dvh');
let restoringScroll = false;
let mounted = true;
const statusText = computed(
  () =>
    ({
      idle: '尚未加入',
      connecting: '正在连接',
      connected: '实时连接',
      reconnecting: '正在重连',
      disconnected: '连接已断开',
    })[store.connectionStatus],
);
const count = computed(() => characterCount(draft.value.normalize('NFC')));
const contentValid = computed(() =>
  validContent(draft.value, store.maxMessageChars, store.maxMessageBytes),
);
const canSend = computed(
  () =>
    contentValid.value &&
    store.connectionStatus === 'connected' &&
    !sending.value &&
    !replyPreview.value?.deleted &&
    !replyPreview.value?.unavailable,
);
const failed = computed(() => Object.values(store.pendingMessages).includes('failed'));
const unavailable = computed(() => !store.session && store.unavailable);
const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(new Date(value));
const timeLabel = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
function avatarColor(seed: string) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(hash) % 360} 38% 43%)`;
}
async function bottom() {
  await nextTick();
  if (!mounted || !list.value) return;
  list.value.scrollTop = list.value.scrollHeight;
  nearBottom.value = true;
  newMessages.value = 0;
  acknowledgeMentions();
}
async function loadOlder() {
  const element = list.value;
  if (!element || store.loadingHistory || !store.hasMoreHistory) return;
  const height = element.scrollHeight;
  const top = element.scrollTop;
  const anchor = captureScrollAnchor();
  restoringScroll = true;
  try {
    await chat.older();
    await nextTick();
    if (mounted && list.value === element && !restoreScrollAnchor(anchor))
      element.scrollTop = top + element.scrollHeight - height;
  } finally {
    restoringScroll = false;
  }
}
function captureScrollAnchor() {
  const area = list.value?.getBoundingClientRect();
  const element = [...(list.value?.querySelectorAll<HTMLElement>('[data-message-id]') ?? [])].find(
    (item) => area && item.getBoundingClientRect().bottom > area.top,
  );
  return element && area
    ? { id: element.dataset.messageId!, offset: element.getBoundingClientRect().top - area.top }
    : null;
}
function restoreScrollAnchor(anchor: ReturnType<typeof captureScrollAnchor>) {
  if (!anchor || !list.value) return false;
  const element = list.value.querySelector<HTMLElement>(`[data-message-id="${anchor.id}"]`);
  if (!element) return false;
  list.value.scrollTop +=
    element.getBoundingClientRect().top - list.value.getBoundingClientRect().top - anchor.offset;
  return true;
}
watch(
  () => store.messages[0]?.id,
  () => {
    if (nearBottom.value || restoringScroll) return;
    const anchor = captureScrollAnchor();
    void nextTick(() => restoreScrollAnchor(anchor));
  },
);
function scroll() {
  const element = list.value;
  if (!element || restoringScroll) return;
  nearBottom.value = element.scrollHeight - element.scrollTop - element.clientHeight < 96;
  if (nearBottom.value) newMessages.value = 0;
  acknowledgeMentions();
  if (element.scrollTop < 40) void loadOlder();
}
watch(
  () => store.messages.at(-1)?.id,
  (id, previous) => {
    if (!id || id === previous || restoringScroll) return;
    if (nearBottom.value && !restoringScroll) void bottom();
    else newMessages.value++;
  },
);
watch([initializing, () => store.session, unavailable], async () => {
  await nextTick();
  if (!mounted) return;
  if (!initializing.value && !store.session && !unavailable.value) {
    if (!joinDialog.value?.open) joinDialog.value?.showModal();
    nicknameInput.value?.focus();
    nicknameInput.value?.select();
  } else joinDialog.value?.close();
});
watch(
  () => !!replyPreview.value,
  () => {
    if (nearBottom.value) void bottom();
  },
);
function shuffleNickname() {
  nickname.value = generateChatNickname(nickname.value);
  nicknameInput.value?.focus();
  nicknameInput.value?.select();
}
async function join() {
  if (!validNickname(nickname.value)) return;
  await chat.join(nickname.value);
  if (store.session) {
    await bottom();
    composer.value?.focus();
  }
}
async function send() {
  if (!canSend.value) return;
  const content = draft.value;
  const reply = selectedReply.value;
  const version = draftVersion.value;
  const prepared = {
    content,
    mentions: draftMentions.value.map(({ guestId, start, length }) => ({ guestId, start, length })),
  };
  if (await chat.send(prepared.content, reply?.id ?? null, prepared.mentions)) {
    if (selectedReply.value === reply) selectedReply.value = null;
    if (draftVersion.value === version) setDraft('');
    await bottom();
    composer.value?.focus();
  }
}
async function logout() {
  closeIdentityMenu();
  admin.clear();
  await chat.logout();
  if (!store.session) {
    setDraft('');
    selectedReply.value = null;
    sending.value = false;
    newMessages.value = 0;
  }
}
function resizeViewport() {
  viewportHeight.value = window.visualViewport ? `${window.visualViewport.height}px` : '100dvh';
  if (nearBottom.value) void bottom();
}
onMounted(async () => {
  resizeViewport();
  document.addEventListener('visibilitychange', acknowledgeMentions);
  document.addEventListener('pointerdown', dismissIdentityMenu);
  document.addEventListener('focusin', dismissIdentityMenu);
  window.visualViewport?.addEventListener('resize', resizeViewport);
  await chat.initialize();
  if (store.session) await bottom();
});
onBeforeUnmount(() => {
  mounted = false;
  clearTimeout(highlightTimer);
  document.removeEventListener('visibilitychange', acknowledgeMentions);
  document.removeEventListener('pointerdown', dismissIdentityMenu);
  document.removeEventListener('focusin', dismissIdentityMenu);
  window.visualViewport?.removeEventListener('resize', resizeViewport);
  joinDialog.value?.close();
});
</script>

<template>
  <section
    class="chat-page"
    :style="{ '--chat-viewport-height': viewportHeight }"
    aria-label="公共聊天室"
  >
    <div class="chat-room">
      <header class="chat-header">
        <span class="chat-room-icon"><IconBrandWechat :size="24" /></span>
        <div class="chat-heading">
          <h1>Meowv Chat</h1>
          <p>偶然相遇，随心聊聊。</p>
        </div>
        <div class="chat-presence">
          <span
            class="chat-status-dot"
            role="img"
            :aria-label="statusText"
            :title="statusText"
            :class="{ 'is-online': store.connectionStatus === 'connected' }"
          ></span>
          <span class="chat-connection-label" role="status">{{ statusText }}</span>
        </div>
        <div class="chat-header-actions">
          <button
            class="chat-icon-button"
            :class="{ 'is-admin': adminActive }"
            type="button"
            :title="adminActive ? '退出管理模式' : '管理员操作'"
            :aria-label="adminActive ? '退出管理模式' : '管理员操作'"
            :aria-pressed="adminActive"
            @click="openAdmin"
          >
            <IconShieldLock :size="19" />
          </button>
          <ThemeToggle class="chat-icon-button" />
          <ToolsBackgroundShortcut class="chat-background-shortcut" />
        </div>
      </header>

      <div v-if="store.error" class="chat-banner chat-error" role="alert">
        <span>{{ store.error }}</span
        ><button
          v-if="unavailable"
          @click="
            store.error = '';
            chat.initialize();
          "
        >
          <IconRefresh :size="15" />重试
        </button>
      </div>
      <div
        v-if="store.session && store.connectionStatus === 'disconnected'"
        class="chat-banner"
        role="status"
      >
        <span>连接已断开，消息和草稿已保留。</span>
        <button type="button" @click="chat.connect"><IconRefresh :size="15" />重新连接</button>
      </div>
      <div v-if="store.connectionStatus === 'reconnecting'" class="chat-banner" role="status">
        连接暂时中断，正在重新连接。消息和草稿已保留。
      </div>

      <div class="chat-timeline">
        <div
          ref="list"
          class="chat-messages"
          aria-label="聊天消息"
          :aria-busy="store.loadingHistory"
          @scroll.passive="scroll"
        >
          <div v-if="initializing" class="chat-empty" role="status">
            <IconBrandWechat :size="36" />
            <p>正在打开匿名聊天室…</p>
          </div>
          <template v-else-if="store.session">
            <div class="chat-history-marker">
              <button
                v-if="store.hasMoreHistory"
                :disabled="store.loadingHistory"
                @click="loadOlder"
              >
                <IconArrowUp :size="14" />{{
                  store.loadingHistory ? '正在加载…' : '加载更早消息'
                }}</button
              ><span v-else
                >没有更早的消息了<span v-if="store.messageCleanupEnabled">
                  · 消息保留 {{ store.retentionDays }} 天</span
                ></span
              >
            </div>
            <div v-if="!store.messages.length" class="chat-empty">
              <IconBrandWechat :size="40" />
              <h2>从一句「你好」开始</h2>
              <p>这里还很安静，来开启今天的对话吧。</p>
            </div>
            <template v-for="(message, index) in store.messages" :key="message.id">
              <div
                v-if="
                  index === 0 ||
                  dateLabel(store.messages[index - 1]!.createdAt) !== dateLabel(message.createdAt)
                "
                class="chat-date"
              >
                <span>{{ dateLabel(message.createdAt) }}</span>
              </div>
              <article
                class="chat-message"
                :class="{
                  'is-own': message.guestId === store.session.guest.id,
                  'is-highlighted': highlightedId === message.id,
                  'is-mentioned': isMentioned(message),
                }"
                :data-message-id="message.id"
              >
                <span
                  class="chat-avatar"
                  :style="{ backgroundColor: avatarColor(message.avatarSeed) }"
                  aria-hidden="true"
                  >{{ [...message.nickname][0] }}</span
                >
                <div class="chat-message-body">
                  <div class="chat-message-meta">
                    <button
                      v-if="message.guestId !== store.session.guest.id"
                      class="chat-author-button"
                      type="button"
                      :aria-label="`提及 ${message.nickname}`"
                      @click="
                        insertMention({
                          id: message.guestId,
                          nickname: message.nickname,
                          avatarSeed: message.avatarSeed,
                          online: false,
                        })
                      "
                    >
                      <strong>{{ message.nickname }}</strong>
                    </button>
                    <strong v-else>{{ message.nickname }}</strong
                    ><span v-if="message.guestId === store.session.guest.id" class="chat-self"
                      >你</span
                    ><time
                      :datetime="message.createdAt"
                      :title="new Date(message.createdAt).toLocaleString()"
                      >{{ timeLabel(message.createdAt) }}</time
                    >
                    <span v-if="isMentioned(message)" class="chat-mentioned-badge">提到了你</span>
                  </div>
                  <div
                    class="chat-message-content"
                    :tabindex="
                      (!message.deleted && message.guestId !== store.session.guest.id) ||
                      adminActive
                        ? 0
                        : undefined
                    "
                    :aria-label="`${message.nickname} 的消息`"
                  >
                    <button
                      v-if="message.reply && !message.deleted"
                      class="chat-quote"
                      type="button"
                      :disabled="message.reply.unavailable"
                      :aria-label="`定位引用消息：${message.reply.nickname || '原消息已不可用'}`"
                      @click="locateReply(message.reply)"
                    >
                      <strong v-if="!message.reply.unavailable">{{
                        message.reply.nickname
                      }}</strong>
                      <span>{{ quoteLabel(message.reply) }}</span>
                    </button>
                    <p v-if="message.deleted" class="chat-deleted">此消息已被移除</p>
                    <!-- Chat 专用解析器禁用 HTML，并经过 DOMPurify 清理。 -->
                    <!-- eslint-disable vue/no-v-html -->
                    <div
                      v-else
                      class="chat-markdown"
                      v-html="
                        renderedChat(message.content, message.mentions, store.session.guest.id).html
                      "
                    ></div>
                    <!-- eslint-enable vue/no-v-html -->
                    <div
                      v-if="
                        (!message.deleted && message.guestId !== store.session.guest.id) ||
                        adminActive
                      "
                      class="chat-hover-actions"
                      role="toolbar"
                      aria-label="消息操作"
                    >
                      <button
                        v-if="!message.deleted && message.guestId !== store.session.guest.id"
                        type="button"
                        :aria-label="`回复 ${message.nickname} 的消息`"
                        @click="replyTo(message)"
                      >
                        <IconCornerUpLeft :size="15" />回复
                      </button>
                      <template v-if="adminActive">
                        <button
                          v-if="message.deleted"
                          type="button"
                          :disabled="admin.busy.value"
                          @click="adminDialogs?.openRestore(message)"
                        >
                          恢复
                        </button>
                        <button v-else type="button" @click="manageMessage(message)">
                          <IconTrash :size="15" aria-hidden="true" />标记删除
                        </button>
                        <button type="button" @click="manageMessage(message, true)">
                          <IconTrashX :size="15" aria-hidden="true" />永久删除
                        </button>
                      </template>
                    </div>
                  </div>
                </div>
              </article>
            </template>
            <button
              v-if="store.hasNewerHistory"
              class="chat-load-newer"
              :disabled="store.loadingHistory"
              @click="loadNewer"
            >
              {{ store.loadingHistory ? '正在加载…' : '加载较新消息' }}
            </button>
          </template>
          <div v-else class="chat-empty">
            <IconBrandWechat :size="40" />
            <h2>{{ unavailable ? '聊天室暂不可用' : '一个自由交流的角落' }}</h2>
            <p>
              {{
                unavailable
                  ? '请稍后重试，其他 Studio 应用仍可正常使用。'
                  : '取一个昵称，加入大家的对话。'
              }}
            </p>
          </div>
        </div>
        <button
          v-if="chat.mentionIds.value.length"
          class="chat-mention-alert"
          :class="{ 'with-new-messages': newMessages || store.hasNewerHistory }"
          @click="jumpToMention"
        >
          <IconAt :size="16" />有人提到你 · {{ chat.mentionIds.value.length }}
        </button>
        <button
          v-if="newMessages || store.hasNewerHistory"
          class="chat-new-messages"
          @click="store.hasNewerHistory ? backToLatest() : bottom()"
        >
          <IconArrowDown :size="16" />{{
            store.hasNewerHistory ? '回到最新消息' : '有新消息 · 回到最新'
          }}
        </button>
      </div>

      <form class="chat-composer" @submit.prevent="send">
        <details
          v-if="store.session"
          ref="identityMenu"
          class="chat-composer-identity"
          @keydown.esc.prevent.stop="closeIdentityMenu"
        >
          <summary aria-label="匿名身份菜单">
            <span
              class="chat-identity-avatar"
              :style="{ backgroundColor: avatarColor(store.session.guest.avatarSeed) }"
              aria-hidden="true"
              >{{ store.session.guest.nickname.slice(0, 1) }}</span
            >
            <span>{{ store.session.guest.nickname }}</span>
          </summary>
          <div class="chat-identity-menu">
            <button type="button" aria-label="退出匿名会话" :disabled="leaving" @click="logout">
              <IconLogout :size="16" />{{ leaving ? '正在退出…' : '退出匿名会话' }}
            </button>
          </div>
        </details>
        <div v-if="replyPreview" class="chat-reply-draft">
          <div>
            <strong>回复 {{ replyPreview.nickname }}</strong
            ><span>{{ quoteLabel(replyPreview) }}</span>
          </div>
          <button
            class="chat-icon-button"
            type="button"
            aria-label="取消引用"
            @click="selectedReply = null"
          >
            <IconX :size="16" />
          </button>
        </div>
        <ChatMarkdownInput
          ref="composer"
          :disabled="!store.session"
          :self-id="store.session?.guest.id"
          :max-chars="store.maxMessageChars"
          :max-bytes="store.maxMessageBytes"
          :participants="participants"
          :participants-loading="chat.participantsLoading.value"
          :participants-error="chat.participantsError.value"
          @change="updateDraft"
          @send="send"
          @participants="chat.loadParticipants(true)"
        />
        <div class="chat-composer-bottom">
          <span id="chat-input-help"
            ><span v-if="failed || sending">{{
              failed ? '发送未确认，草稿已保留，请稍后重试。' : sending ? '正在发送…' : ''
            }}</span
            ><template v-else
              ><span class="chat-keyboard-help">Enter 发送 · Shift+Enter 换行</span
              ><span class="chat-touch-help">点击发送 · 回车换行</span></template
            ></span
          ><button
            type="button"
            class="chat-icon-button chat-insert-at"
            aria-label="提及访客"
            :disabled="!store.session"
            @click="insertAt"
          >
            <IconAt :size="18" /></button
          ><span :class="{ 'chat-over-limit': !!draft && !contentValid }"
            >{{ count }}/{{ store.maxMessageChars }}</span
          ><button class="chat-send" type="submit" :disabled="!canSend">
            <IconSend :size="17" />{{ sending ? '发送中' : failed ? '重试发送' : '发送' }}
          </button>
        </div>
      </form>
    </div>

    <dialog ref="joinDialog" class="chat-dialog" aria-labelledby="chat-join-title" @cancel.prevent>
      <form @submit.prevent="join">
        <div class="chat-join-heading">
          <span class="chat-room-icon"><IconBrandWechat :size="24" /></span>
          <div class="chat-heading">
            <h2 id="chat-join-title">Meowv Chat</h2>
            <p>偶然相遇，随心聊聊。</p>
          </div>
        </div>
        <span
          class="chat-avatar chat-preview-avatar"
          :style="{ backgroundColor: avatarColor(nickname) }"
          >{{ [...nickname.trim()][0] || '客' }}</span
        ><label for="chat-nickname">你的昵称</label>
        <div class="chat-nickname-field">
          <input
            id="chat-nickname"
            ref="nicknameInput"
            v-model="nickname"
            autocomplete="nickname"
            :disabled="joining"
            aria-describedby="chat-nickname-help"
          />
          <button
            class="chat-shuffle-nickname"
            type="button"
            :disabled="joining"
            aria-label="换一个昵称"
            title="换一个昵称"
            @click="shuffleNickname"
          >
            <IconRefresh :size="16" />换一个
          </button>
        </div>
        <p id="chat-nickname-help" class="chat-input-hint">2–20 个字符，加入后暂不支持修改。</p>
        <p v-if="store.error" class="chat-error" role="alert">{{ store.error }}</p>
        <button
          class="chat-join-button"
          :disabled="joining || !validNickname(nickname)"
          type="submit"
        >
          {{ joining ? '正在加入…' : '进入聊天室'
          }}<IconArrowUp class="chat-join-arrow" :size="18" />
        </button>
      </form>
    </dialog>
    <ChatAdminDialogs
      ref="adminDialogs"
      :admin="admin"
      @removed="store.remove"
      @restored="store.restore"
    />
  </section>
</template>
